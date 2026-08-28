/**
 * TensorFlow backend resolver (ML-01).
 *
 * Prefers @tensorflow/tfjs-node (native, SIMD — measured ~10x faster on
 * tensor reductions, see scripts/bench-predict.mjs) and transparently falls
 * back to the browser @tensorflow/tfjs CPU build when the native package is
 * not installed. One shared instance for the whole backend so tensors always
 * come from a single engine.
 *
 * To enable the native path in production:  npm i @tensorflow/tfjs-node
 * Then re-run scripts/bench-predict.mjs for the after-number.
 */
let cached = null;

export async function getTf() {
  if (cached) return cached;
  try {
    const mod = await import('@tensorflow/tfjs-node');
    cached = mod.default ?? mod;
    console.log('[tfjs] backend: @tensorflow/tfjs-node (native)');
  } catch {
    const mod = await import('@tensorflow/tfjs');
    cached = mod.default ?? mod;
    console.log('[tfjs] backend: @tensorflow/tfjs (CPU fallback — install @tensorflow/tfjs-node for native speed)');
  }
  return cached;
}
