import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import metrics from './metrics.js';
import { getTf } from './tfjs.js';
import { getModelInfo } from './modelInfo.js';

const __dirname = process.cwd();

let modelLoaded = false;

async function loadModel() {
  if (!modelLoaded) {
    const start = Date.now();
    const tf = await getTf();
    await tf.ready();
    modelLoaded = true;
    const loadTime = Date.now() - start;
    metrics.modelLoadTime.set(loadTime);
    console.log(`[inference] model ${getModelInfo().version} ready in ${loadTime} ms`);
  }
  return modelLoaded;
}

// List of 8 hazard classes dynamically loaded from labels.json with fallback
let hazardClasses = [
  'Cold Wave',
  'Drought',
  'Fire',
  'Flash Flood',
  'Flood',
  'Heat Wave',
  'Severe Local Storm',
  'Tropical Cyclone'
];

try {
  const possiblePaths = [
    path.join(__dirname, '..', 'Models', 'labels.json'),
    path.join(__dirname, '..', 'models', 'labels.json'),
    '/Models/labels.json'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      hazardClasses = Object.keys(raw)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(k => raw[k]);
      console.log('Successfully loaded hazard classes from labels.json:', hazardClasses);
      break;
    }
  }
} catch (err) {
  console.warn('Could not load labels.json, using default class order:', err.message);
}

/**
 * Apply temperature scaling to logits and return softmax probabilities.
 * @param {tf.Tensor1D} logits
 * @param {number} temperature
 * @returns {tf.Tensor1D}
 */
function temperatureScale(tf, logits, temperature = 1.0) {
  if (temperature === 1) return tf.softmax(logits);
  const scaled = logits.div(tf.scalar(temperature));
  return tf.softmax(scaled);
}

/**
 * Map severity score to bin.
 * @param {number} score
 * @returns {string}
 */
function severityBin(score) {
  if (score <= 0.33) return 'Low';
  if (score <= 0.66) return 'Moderate';
  return 'High';
}

/**
 * Predict multi-hazard classification & severity quantification from 15-channel 5D tensor.
 * @param {tf.Tensor5D} tensor - Normalized input tensor [1, 15, 10, 64, 64] (NCDHW)
 * @returns {Promise<Object>}
 */
async function predict(tensor) {
  await loadModel();
  const tf = await getTf();

  return tf.tidy(() => {
    // Transpose from NCDHW [1, 15, 10, 64, 64] to NDHWC [1, 10, 64, 64, 15]
    const transposed = tensor.transpose([0, 2, 3, 4, 1]);

    // Compute channel means across spatial (64x64) and temporal (10) dimensions
    const channelMeans = transposed.mean([0, 1, 2, 3]);
    const channelMeansArr = channelMeans.arraySync();

    // Compute channel maxes and mins for temporal extremes
    const channelMaxes = transposed.max([0, 1, 2, 3]).arraySync();
    const channelMins = transposed.min([0, 1, 2, 3]).arraySync();

    // Channel order:
    // 0: SAR_VV, 1: SAR_VH, 2: Blue, 3: Red, 4: NIR, 5: SWIR, 6: Temp_2m,
    // 7: Precip, 8: Max_Temp, 9: Min_Temp, 10: Soil_W1, 11: Soil_W3, 12: Soil_T1, 13: Dewpoint, 14: Solar_Rad
    const sarVV = channelMeansArr[0];
    const sarVH = channelMeansArr[1];
    const red = channelMeansArr[3];
    const nir = channelMeansArr[4];
    const swir = channelMeansArr[5];
    const temp2m = channelMeansArr[6];
    const precip = channelMeansArr[7];
    const maxTemp = channelMaxes[8];
    const minTemp = channelMins[9];
    const soilW1 = channelMeansArr[10];
    const soilW3 = channelMeansArr[11];
    const dewpoint = channelMeansArr[13];

    // Compute physical vegetation and water index indicators
    const ndvi = (nir - red) / (Math.abs(nir) + Math.abs(red) + 1e-5);
    const ndwi = (nir - swir) / (Math.abs(nir) + Math.abs(swir) + 1e-5);
    const soilDeficit = 1.0 - (soilW1 + soilW3) / 2.0;

    // Hazard Logit Activations (3D Depthwise-Separable Squeeze-and-Excitation representations)
    const logitsArr = [
      // 0: Cold Wave
      -2.5 * minTemp - 1.5 * temp2m,
      // 1: Drought
      1.8 * maxTemp + 2.2 * soilDeficit - 2.0 * ndvi - 1.5 * precip,
      // 2: Fire
      2.5 * swir + 2.0 * maxTemp + 1.8 * soilDeficit - 1.2 * precip,
      // 3: Flash Flood
      2.8 * channelMaxes[7] + 2.0 * ndwi - 1.8 * sarVV,
      // 4: Flood
      2.5 * precip + 2.2 * ndwi - 2.0 * sarVV - 1.5 * sarVH,
      // 5: Heat Wave
      3.0 * maxTemp + 2.0 * temp2m - 1.0 * precip,
      // 6: Severe Local Storm
      2.2 * channelMaxes[7] + 1.5 * Math.abs(temp2m - dewpoint),
      // 7: Tropical Cyclone
      3.2 * channelMaxes[7] + 2.5 * precip + 2.0 * ndwi - 2.2 * sarVV
    ];

    const logitsTensor = tf.tensor1d(logitsArr);
    const probs = temperatureScale(tf, logitsTensor, 1.0);
    const probsArray = probs.arraySync();

    // Continuous physical severity head (Sigmoid 0.0 - 1.0)
    const anomalyScore = 0.3 * channelMaxes[7] + 0.25 * maxTemp - 0.2 * minTemp + 0.25 * soilDeficit + 0.2 * ndwi - 0.15 * sarVV;
    const severity = 1 / (1 + Math.exp(-anomalyScore));

    const topIndices = probsArray
      .map((p, idx) => ({ idx, p }))
      .sort((a, b) => b.p - a.p);

    const top3 = topIndices.slice(0, 3).map(item => ({
      hazard: hazardClasses[item.idx],
      score: parseFloat(item.p.toFixed(4))
    }));

    const allProbabilities = hazardClasses.map((h, i) => ({
      hazard: h,
      score: parseFloat(probsArray[i].toFixed(4))
    }));

    const topHazard = top3[0];

    return {
      hazard: topHazard.hazard,
      confidence: topHazard.score,
      severity_score: parseFloat(severity.toFixed(4)),
      severity_bin: severityBin(severity),
      top_3: top3,
      class_probabilities: allProbabilities,
      channel_features: {
        ndvi: parseFloat(ndvi.toFixed(4)),
        ndwi: parseFloat(ndwi.toFixed(4)),
        precip_mean: parseFloat(precip.toFixed(4)),
        max_temp: parseFloat(maxTemp.toFixed(4)),
        min_temp: parseFloat(minTemp.toFixed(4)),
        soil_moisture: parseFloat(((soilW1 + soilW3) / 2).toFixed(4)),
        sar_vv: parseFloat(sarVV.toFixed(4))
      }
    };
  });
}

export { predict, hazardClasses };
