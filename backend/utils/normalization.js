import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import tf from '@tensorflow/tfjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load normalization statistics once
const statsPath = path.join(__dirname, '..', '..', 'Models', 'normalization_stats.json');
const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
const bandOrder = [
  "SAR_VV", "SAR_VH", "Blue", "Red", "NIR", "SWIR", "Temp_2m",
  "Precip", "Max_Temp", "Min_Temp", "Soil_W1", "Soil_W3",
  "Soil_T1", "Dewpoint", "Solar_Rad"
];
const meanValues = bandOrder.map(b => stats[b].mean);
const stdValues = bandOrder.map(b => stats[b].std);

const means = tf.tensor1d(meanValues);
const stds = tf.tensor1d(stdValues);

/**
 * Apply per-channel z-score normalization to a 5-D tensor.
 * @param {tf.Tensor5D} tensor - Tensor of shape [1, 15, 10, 64, 64]
 * @returns {tf.Tensor5D} Normalized tensor
 */
function normalize(tensor) {
  return tf.tidy(() => {
    // Ensure float32
    let floatTensor = tensor.toFloat();
    // Replace NaN or Inf with 0
    const isInvalid = tf.logicalOr(tf.isNaN(floatTensor), tf.isInf(floatTensor));
    floatTensor = tf.where(isInvalid, tf.zerosLike(floatTensor), floatTensor);

    // Reshape means and stds for broadcasting: [15,1,1,1,1]
    const meanReshaped = means.reshape([15, 1, 1, 1, 1]);
    const stdReshaped = stds.reshape([15, 1, 1, 1, 1]).add(1e-6);

    const normalized = floatTensor.sub(meanReshaped).div(stdReshaped);
    return normalized;
  });
}

export { normalize };
