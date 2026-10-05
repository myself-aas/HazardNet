/**
 * GIBS tile layer with a concurrency gate (Phase C, 2026-10-05).
 *
 * Stock L.TileLayer fires every tile request the moment the tile element is
 * created, so a busy view could burst dozens of requests at GIBS at once. This
 * subclass delays setting `src` until the shared ConcurrencyGate issues a slot,
 * capping the layer at GIBS_MAX_IN_FLIGHT simultaneous downloads (GEV's cap).
 * Queued tiles wait in order; pausing the gate (tab hidden, layer off) stops
 * new issues without aborting downloads already in flight. Done-callbacks are
 * passed through untouched, so Leaflet's own tileload/tileerror/load events and
 * pruning behave exactly as they do for any other TileLayer.
 */

import L from 'leaflet';
import { ConcurrencyGate } from '../../lib/gibs';

export interface GibsTileLayerOptions extends L.TileLayerOptions {
  gate: ConcurrencyGate;
}

interface QueuedTile {
  tile: HTMLImageElement;
  coords: L.Coords;
}

export class GibsTileLayer extends L.TileLayer {
  private gibsGate: ConcurrencyGate;
  private gibsQueue: QueuedTile[] = [];
  private gibsReleases = new Map<HTMLImageElement, () => void>();
  private gibsRemoved = false;

  constructor(url: string, options: GibsTileLayerOptions) {
    const { gate, ...rest } = options;
    super(url, rest as L.TileLayerOptions);
    this.gibsGate = gate;
    // Leaflet fires tileunload per tile whenever a tile leaves the DOM
    // (pruning, pan-away, removal), which is the hook for cancelling work.
    this.on('tileunload', ((event: L.TileEvent) => this.onGibsTileUnload(event.tile)) as L.LeafletEventHandlerFn);
  }

  /** How many tile requests are queued waiting for a gate slot (tests/UI). */
  get gibsQueuedCount(): number {
    return this.gibsQueue.length;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');

    L.DomEvent.on(tile, 'load', L.Util.bind(this.onGibsTileLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind(this.onGibsTileError, this, done, tile));

    if (this.options.crossOrigin || this.options.crossOrigin === '') {
      tile.crossOrigin = this.options.crossOrigin === true ? 'anonymous' : this.options.crossOrigin;
    }
    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    this.gibsQueue.push({ tile, coords });
    this.drainGibsQueue();
    return tile;
  }

  /** Stop all queued work; used when the layer leaves the map. */
  cancelGibsQueue(): void {
    this.gibsRemoved = true;
    this.gibsQueue = [];
    this.gibsGate.resume();
  }

  private drainGibsQueue(): void {
    const batch = this.gibsQueue.splice(0, this.gibsQueue.length);
    for (const item of batch) {
      this.gibsGate.acquire().then((release) => {
        const cancelled = this.gibsRemoved || (item.tile as unknown as { _gibsCancelled?: boolean })._gibsCancelled;
        if (cancelled) {
          // The tile was pruned or the layer left the map while waiting: never
          // spend a GIBS request on it. Leaflet already dropped the bookkeeping.
          release();
          return;
        }
        this.gibsReleases.set(item.tile, release);
        item.tile.src = this.getTileUrl(item.coords);
      });
    }
  }

  private releaseSlot(tile: HTMLImageElement): void {
    const release = this.gibsReleases.get(tile);
    if (release) {
      this.gibsReleases.delete(tile);
      release();
    }
  }

  private onGibsTileLoad(done: L.DoneCallback, tile: HTMLImageElement): void {
    this.releaseSlot(tile);
    done(undefined, tile);
  }

  private onGibsTileError(done: L.DoneCallback, tile: HTMLImageElement): void {
    this.releaseSlot(tile);
    done(new Error('GIBS tile failed'), tile);
  }

  private onGibsTileUnload(tile: HTMLElement): void {
    // Mark so a still-pending acquire never spends a request on this tile; if a
    // download is already running, release early (release is deduplicated and a
    // detached image finishing is harmless).
    (tile as unknown as { _gibsCancelled?: boolean })._gibsCancelled = true;
    this.releaseSlot(tile as HTMLImageElement);
  }
}

/** Convenience factory mirroring L.tileLayer's style. */
export function gibsTileLayer(url: string, options: GibsTileLayerOptions): GibsTileLayer {
  return new GibsTileLayer(url, options);
}
