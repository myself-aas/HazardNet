// Portable JS tensor normalization on both Node/Vercel. Trained model execution
// is exclusively LiteRT (model_service), not the former native TFJS heuristic.
let pending;
export async function getTf() {
  pending ??= import('@tensorflow/tfjs').then((mod) => mod.default ?? mod);
  return pending;
}
