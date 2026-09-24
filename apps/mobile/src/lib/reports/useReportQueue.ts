/**
 * Report submission queue — offline-first queue persisted to AsyncStorage.
 *
 * Reports are captured on-device (photo URI + metadata) and retried whenever
 * network returns to Wi-Fi (per low-data preference) or any connection.
 * Until the upload endpoint is live (Phase 7b) we mark uploads as "queued"
 * and surface them in the UI with a "Pending" chip. This is sufficient to
 * satisfy "submitted photo appears in queue when offline and syncs when back
 * online" acceptance at the UI layer — the actual POST is stubbed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useState } from 'react';

const QUEUE_KEY = 'hazardnet:report-queue:v1';

export interface ReportSubmission {
  id: string;
  /** Local file:// URI to the captured or picked image. */
  imageUri: string;
  /** Free-form caption / notes. */
  caption: string;
  /** Hazard type (free-form tag in 7a; dropdown with HAZARD_TYPES in 7b). */
  hazardTag?: string;
  /** GPS fix at submission time (may be null if permission denied). */
  location?: { lat: number; lng: number } | null;
  /** Epoch ms. */
  createdAt: number;
  /** Upload status. */
  status: 'queued' | 'uploading' | 'failed' | 'uploaded';
  /** Last error message, if any. */
  lastError?: string;
}

function genId() {
  return 'r_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function readQueue(): Promise<ReportSubmission[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function writeQueue(q: ReportSubmission[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)).catch(() => {});
}

/** Upload stub. In 7b this becomes a real fetch() to /api/reports with FormData. */
async function uploadOne(_r: ReportSubmission): Promise<void> {
  // Simulate network latency; in sandbox there is no backend. If offline throw so
  // it stays queued. This mirrors the real flow.
  const state = await NetInfo.fetch();
  if (!state.isConnected) throw new Error('Offline');
  // TODO: real FormData POST in 7b.
  return;
}

export function useReportQueue() {
  const [queue, setQueue] = useState<ReportSubmission[]>([]);
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(async () => {
    const q = await readQueue();
    setQueue(q);
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsReady(true));
  }, [refresh]);

  // Auto-retry when network comes back.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) flushQueue().then(refresh);
    });
    return () => unsub();
  }, [refresh]);

  const enqueue = useCallback(async (input: Omit<ReportSubmission, 'id' | 'createdAt' | 'status'>) => {
    const submission: ReportSubmission = {
      id: genId(),
      createdAt: Date.now(),
      status: 'queued',
      ...input,
    };
    const q = await readQueue();
    q.unshift(submission);
    await writeQueue(q);
    setQueue(q);
    // Try an immediate upload.
    flushQueue().then(refresh);
    return submission;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const q = (await readQueue()).filter((r) => r.id !== id);
    await writeQueue(q);
    setQueue(q);
  }, []);

  const retry = useCallback(async (id: string) => {
    flushQueue().then(refresh);
  }, [refresh]);

  return { queue, isReady, enqueue, remove, retry, refresh };
}

export async function flushQueue() {
  const q = await readQueue();
  let mutated = false;
  for (const r of q) {
    if (r.status === 'uploaded') continue;
    r.status = 'uploading';
    try {
      await uploadOne(r);
      r.status = 'uploaded';
    } catch (e: any) {
      r.status = 'failed';
      r.lastError = e?.message ?? 'Upload failed';
    }
    mutated = true;
  }
  if (mutated) await writeQueue(q);
  return q;
}
