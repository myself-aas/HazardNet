import fs from 'fs';
import path from 'path';
import { getTf } from '../tfjs.js';

// Load normalization statistics once (cwd-relative so the same code runs in
// Node ESM and in jest's CJS transform — no import.meta needed).
const statsPath = path.join(process.cwd(), 'Models', 'normalization_stats.json');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
const bandOrder = [
  "SAR_VV", "SAR_VH", "Blue", "Red", "NIR", "SWIR", "Temp_2m",
  "Precip", "Max_Temp", "Min_Temp", "Soil_W1", "Soil_W3",
  "Soil_T1", "Dewpoint", "Solar_Rad"
];
const meanValues = bandOrder.map(b => stats[b].mean);
const stdValues = bandOrder.map(b => stats[b].std);

let statTensors = null;

async function getStatTensors() {
  if (!statTensors) {
    const tf = await getTf();
    statTensors = { tf, means: tf.tensor1d(meanValues), stds: tf.tensor1d(stdValues) };
  }
  return statTensors;
}

/**
 * Apply per-channel z-score normalization to a 5-D tensor.
 * @param {tf.Tensor5D} tensor - Tensor of shape [1, 15, 10, 64, 64]
 * @returns {Promise<tf.Tensor5D>} Normalized tensor
 */
async function normalize(tensor) {
  const { tf, means, stds } = await getStatTensors();
  return tf.tidy(() => {
    // Ensure float32
    let floatTensor = tensor.toFloat();
    // Replace NaN or Inf with 0
    const isInvalid = tf.logicalOr(tf.isNaN(floatTensor), tf.isInf(floatTensor));
    floatTensor = tf.where(isInvalid, tf.zerosLike(floatTensor), floatTensor);

    // BUG FIX (ML-04): the tensor is NCDHW — the channel axis is dim 1, so the
    // per-channel stats must broadcast from [1,15,1,1,1]. The previous
    // [15,1,1,1,1] reshape produced a 15x15 outer product (batch dim collided
    // with channels), silently corrupting every downstream channel feature
    // (NDVI/NDWI/precip became grandMean - stat instead of the z-score).
    const meanReshaped = means.reshape([1, 15, 1, 1, 1]);
    const stdReshaped = stds.reshape([1, 15, 1, 1, 1]).add(1e-6);

    const normalized = floatTensor.sub(meanReshaped).div(stdReshaped);
    return normalized;
  });
}

export { normalize };
