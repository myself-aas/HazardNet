#!/usr/bin/env node
/**
 * Build the HazardNet brand assets from ONE geometry (scripts/lib/infinity-geometry.mjs).
 *
 *   node scripts/build-brand-assets.mjs            write everything
 *   node scripts/build-brand-assets.mjs --check    verify the committed files match (no writes; used by the test suite)
 *   node scripts/build-brand-assets.mjs --no-png   skip the PNG app icons (they need `npm install --no-save sharp`)
 *
 * Writes
 *   frontend/public/hazardnet-mark.svg         the mark, brand gradient (≥ 3:1 on white AND on ink-950)
 *   frontend/public/hazardnet-mark-mono.svg    the mark in `currentColor` (print, emboss, single-colour use)
 *   frontend/public/hazardnet-loader.svg       the mark as a loading animation — pure SVG + CSS, works as an <img>
 *   frontend/public/hazardnet-logo.svg         lockup (mark + outlined "HazardNet") for light surfaces
 *   frontend/public/hazardnet-logo-primary.svg identical to the lockup (the long-standing og/JSON-LD URL)
 *   frontend/public/hazardnet-logo-light.svg   lockup for dark surfaces
 *   frontend/public/{apple-touch-icon,pwa-192x192,pwa-512x512,pwa-maskable-512x512}.png
 *   frontend/src/design-system/brand/infinity.generated.ts   the same paths, for the React components
 *
 * The wordmark is OUTLINED (scripts/data/wordmark-figtree-700.json: Figtree 700, SIL OFL 1.1, shaped with HarfBuzz),
 * so the lockups render identically as an <img>, in an e-mail, or in a PDF — no font has to load.
 * No <text> and no <title> anywhere: the files show no words of their own.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEOMETRY as G, GRADIENT, LOOP } from './lib/infinity-geometry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'frontend', 'public');
const GENERATED_TS = join(ROOT, 'frontend', 'src', 'design-system', 'brand', 'infinity.generated.ts');
const WORDMARK = JSON.parse(readFileSync(join(ROOT, 'scripts', 'data', 'wordmark-figtree-700.json'), 'utf8'));

const INK = '#0F1B26';
const SIGNAL = '#0064E0';
const SIGNAL_ON_DARK = '#3D93FA';
const f = (v) => Math.round(v * 1000) / 1000;

/* ───────────────────────────── the mark ───────────────────────────── */

const gradient = (id) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${-G.halfW}" y1="0" x2="${G.halfW}" y2="0">${GRADIENT.map(
    ([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`,
  ).join('')}</linearGradient>`;

const cutMask = (id) =>
  `<mask id="${id}" maskUnits="userSpaceOnUse" x="${-G.halfW - 4}" y="${-G.halfH - 4}" width="${2 * (G.halfW + 4)}" height="${2 * (G.halfH + 4)}"><rect x="${-G.halfW - 4}" y="${-G.halfH - 4}" width="${2 * (G.halfW + 4)}" height="${2 * (G.halfH + 4)}" fill="#fff"/><rect x="${G.cut.x}" y="${G.cut.y}" width="${G.cut.width}" height="${G.cut.height}" fill="#000" transform="rotate(${G.cut.rotate})"/></mask>`;

/** The woven loop. `stroke` is a paint (a url(#gradient) or currentColor). */
const loopPaths = (stroke, maskId) =>
  `<g fill="none" stroke="${stroke}" stroke-width="${G.SW}" stroke-linecap="round" stroke-linejoin="round"><path d="${G.under}" mask="url(#${maskId})"/><path d="${G.over}"/></g>`;

function markSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${G.viewBox}" width="240" height="120" fill="none" aria-hidden="true" focusable="false">
<defs>${gradient('hn-g')}${cutMask('hn-cut')}</defs>
${loopPaths('url(#hn-g)', 'hn-cut')}
</svg>
`;
}

function monoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${G.viewBox}" width="240" height="120" fill="none" aria-hidden="true" focusable="false">
<defs>${cutMask('hn-cut')}</defs>
${loopPaths('currentColor', 'hn-cut')}
</svg>
`;
}

function lockupSvg({ dark }) {
  const pad = 4;
  const markH = 2 * G.halfH;
  const capTarget = markH * 0.52; // wordmark cap height as a share of the mark's height
  const k = f(capTarget / WORDMARK.capHeight);
  const gap = 15;
  const markX = pad + G.halfW;
  const markY = pad + G.halfH;
  const textX = markX + G.halfW + gap;
  const baseline = f(markY + capTarget / 2);
  const width = Math.ceil(textX + WORDMARK.advance * k + pad);
  const height = 2 * (G.halfH + pad);
  const hazard = dark ? '#FFFFFF' : INK;
  const net = dark ? SIGNAL_ON_DARK : SIGNAL;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}" fill="none" aria-hidden="true" focusable="false">
<defs>${gradient('hn-g')}${cutMask('hn-cut')}</defs>
<g transform="translate(${markX} ${markY})">${loopPaths('url(#hn-g)', 'hn-cut')}</g>
<g transform="translate(${f(textX)} ${baseline}) scale(${k})"><path fill="${hazard}" d="${WORDMARK.hazard}"/><path fill="${net}" d="${WORDMARK.net}"/></g>
</svg>
`;
}

/* ───────────────────────────── the loader ───────────────────────────── */

/** Animation delays that line the three dashes' HEADS up (tail longest, head shortest), plus the second comet. */
function layerDelay(layer, comet) {
  const max = Math.max(...LOOP.LAYERS.map((l) => l.len));
  const base = (LOOP.LAP * (max - layer.len)) / 100;
  return -f(base + (comet === 'b' ? LOOP.LAP / 2 : 0));
}

/** Node pulse: both apex nodes flash twice a lap, as a comet head passes (the heads sit at `max`% when t = 0). */
function nodeTiming() {
  const half = LOOP.LAP / 2;
  const max = Math.max(...LOOP.LAYERS.map((l) => l.len));
  const hit = ((G.fraction.rightApex - max + 100) % 50) / 100; // fraction of a lap until the first head reaches the right apex
  const peakAt = 0.12; // the keyframes peak 12% into a pulse
  return { duration: f(half), delay: -f((half - ((hit * LOOP.LAP) % half) + peakAt * half) % half) };
}

function loaderSvg() {
  const { duration, delay } = nodeTiming();
  const dash = (l) => `${l.len} ${100 - l.len}`;
  const staticOffset = (l) => -(Math.max(...LOOP.LAYERS.map((x) => x.len)) - l.len);
  const layers = (comet) =>
    LOOP.LAYERS.map(
      (l) =>
        `<path class="c" pathLength="100" d="${G.full}" stroke="${l.color}" stroke-opacity="${l.opacity}" stroke-width="${l.width}" stroke-dasharray="${dash(l)}" style="animation-delay:${layerDelay(l, comet)}s"/>`,
    ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${G.loaderViewBox}" width="256" height="144" fill="none" aria-hidden="true" focusable="false">
<defs>${gradient('hn-g')}</defs>
<style>
.t{stroke:url(#hn-g);stroke-width:${G.SW};stroke-linejoin:round;opacity:.16}
.c{stroke-linecap:round;stroke-linejoin:round;animation:hn-run ${LOOP.LAP}s linear infinite}
.n{fill:#fff;stroke:#1A7BF5;stroke-width:2;transform-box:fill-box;transform-origin:center;animation:hn-node ${duration}s ease-out infinite;animation-delay:${delay}s}
@keyframes hn-run{to{stroke-dashoffset:-100}}
@keyframes hn-node{0%{transform:scale(1);opacity:.6}12%{transform:scale(1.5);opacity:1}45%{transform:scale(1);opacity:.75}100%{transform:scale(1);opacity:.6}}
@media (prefers-reduced-motion:reduce){.c,.n{animation:none}.n{opacity:.9}${LOOP.LAYERS.map((l, i) => `.k1 .c:nth-child(${i + 1}){stroke-dashoffset:${staticOffset(l)}}.k2 .c:nth-child(${i + 1}){stroke-dashoffset:${staticOffset(l) - 50}}`).join('')}}
</style>
<path class="t" d="${G.full}"/>
<g style="filter:drop-shadow(0 0 2.5px rgba(26,123,245,.75))">
<g class="k1">${layers('a')}</g>
<g class="k2">${layers('b')}</g>
</g>
<circle class="n" cx="${G.apex.left[0]}" cy="0" r="3.3"/>
<circle class="n" cx="${G.apex.right[0]}" cy="0" r="3.3"/>
</svg>
`;
}

/* ───────────────────────────── React module ───────────────────────────── */

function generatedTs() {
  return `/**
 * GENERATED by scripts/build-brand-assets.mjs — do not edit. Re-run the script; \`--check\` (and the test suite)
 * fail if this file drifts from scripts/lib/infinity-geometry.mjs.
 */
export const INFINITY = {
  viewBox: '${G.viewBox}',
  loaderViewBox: '${G.loaderViewBox}',
  strokeWidth: ${G.SW},
  halfWidth: ${G.halfW},
  full: '${G.full}',
  under: '${G.under}',
  over: '${G.over}',
  cut: { x: ${G.cut.x}, y: ${G.cut.y}, width: ${G.cut.width}, height: ${G.cut.height}, rotate: ${G.cut.rotate} },
  apex: { left: [${G.apex.left.join(', ')}], right: [${G.apex.right.join(', ')}] },
  gradient: ${JSON.stringify(GRADIENT)},
  lap: ${LOOP.LAP},
} as const;
`;
}

/* ───────────────────────────── app icons ───────────────────────────── */

function tileSvg({ size, markShare }) {
  const k = f((size * markShare) / (2 * G.halfW));
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>${gradient('hn-g')}${cutMask('hn-cut')}<radialGradient id="hn-glow" cx="50%" cy="50%" r="55%"><stop offset="0" stop-color="#0064E0" stop-opacity=".42"/><stop offset="1" stop-color="#0064E0" stop-opacity="0"/></radialGradient></defs>
<rect width="${size}" height="${size}" fill="${INK}"/>
<rect width="${size}" height="${size}" fill="url(#hn-glow)"/>
<g transform="translate(${c} ${c}) scale(${k})">${loopPaths('url(#hn-g)', 'hn-cut')}</g>
</svg>`;
}

/* ───────────────────────────── main ───────────────────────────── */

const files = {
  'hazardnet-mark.svg': markSvg(),
  'hazardnet-mark-mono.svg': monoSvg(),
  'hazardnet-loader.svg': loaderSvg(),
  'hazardnet-logo.svg': lockupSvg({ dark: false }),
  'hazardnet-logo-primary.svg': lockupSvg({ dark: false }),
  'hazardnet-logo-light.svg': lockupSvg({ dark: true }),
};

const args = new Set(process.argv.slice(2));

if (args.has('--check')) {
  const stale = [];
  for (const [name, text] of Object.entries(files)) {
    const path = join(PUBLIC, name);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) stale.push(`frontend/public/${name}`);
  }
  if (!existsSync(GENERATED_TS) || readFileSync(GENERATED_TS, 'utf8') !== generatedTs()) stale.push('frontend/src/design-system/brand/infinity.generated.ts');
  if (stale.length) {
    console.error(`[brand] out of date — run \`node scripts/build-brand-assets.mjs\`:\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log('[brand] all brand assets match the geometry');
} else {
  mkdirSync(PUBLIC, { recursive: true });
  mkdirSync(dirname(GENERATED_TS), { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(PUBLIC, name), text);
    console.log(`[brand] ${name.padEnd(28)} ${text.length} bytes`);
  }
  writeFileSync(GENERATED_TS, generatedTs());
  console.log('[brand] infinity.generated.ts');

  if (!args.has('--no-png')) {
    let sharp;
    try {
      sharp = createRequire(import.meta.url)('sharp');
    } catch {
      console.warn('[brand] sharp not installed — PNG icons skipped (npm install --no-save sharp)');
    }
    if (sharp) {
      const icons = [
        ['apple-touch-icon.png', 180, 0.64],
        ['pwa-192x192.png', 192, 0.64],
        ['pwa-512x512.png', 512, 0.64],
        ['pwa-maskable-512x512.png', 512, 0.5], // maskable: the mark must live inside the 80% safe zone
      ];
      for (const [name, size, share] of icons) {
        await sharp(Buffer.from(tileSvg({ size, markShare: share }))).png({ compressionLevel: 9 }).toFile(join(PUBLIC, name));
        console.log(`[brand] ${name}`);
      }
    }
  }
}
