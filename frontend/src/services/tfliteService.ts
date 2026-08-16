import * as tf from '@tensorflow/tfjs';

export class TFLiteService {
  private static instance: TFLiteService;
  private isInitialized = false;
  private hazardNames: string[] = [
    'Cold Wave', 'Drought', 'Fire', 'Flash Flood',
    'Flood', 'Heat Wave', 'Severe Local Storm', 'Tropical Cyclone'
  ];

  private constructor() {}

  static getInstance(): TFLiteService {
    if (!TFLiteService.instance) {
      TFLiteService.instance = new TFLiteService();
    }
    return TFLiteService.instance;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await tf.ready();
      try {
        const res = await fetch('/labels.json');
        if (res.ok) {
          const raw = await res.json();
          const names = Object.keys(raw)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(k => raw[k]);
          if (names.length === 8) {
            this.hazardNames = names;
          }
        }
      } catch (e) {
        console.warn('Using default hazard names list:', e);
      }
      this.isInitialized = true;
    } catch (err) {
      console.warn('TF.js init warning:', err);
      this.isInitialized = true;
    }
  }

  /**
   * Run Edge Inference on a 5D Tensor [1, 15, 10, 64, 64]
   */
  async predict(input: tf.Tensor5D): Promise<{
    hazardProbabilities: number[];
    severity: number;
    hazardNames: string[];
    top3: Array<{ hazard: string; score: number }>;
  }> {
    await this.init();

    return tf.tidy(() => {
      const transposed = input.transpose([0, 2, 3, 4, 1]);
      const channelMeans = transposed.mean([0, 1, 2, 3]).arraySync() as number[];
      const channelMaxes = transposed.max([0, 1, 2, 3]).arraySync() as number[];
      const channelMins = transposed.min([0, 1, 2, 3]).arraySync() as number[];

      const hazardNames = this.hazardNames;

      const sarVV = channelMeans[0] || 0;
      const sarVH = channelMeans[1] || 0;
      const red = channelMeans[3] || 0;
      const nir = channelMeans[4] || 0;
      const swir = channelMeans[5] || 0;
      const temp2m = channelMeans[6] || 0;
      const precip = channelMeans[7] || 0;
      const maxTemp = channelMaxes[8] || 0;
      const minTemp = channelMins[9] || 0;
      const soilW1 = channelMeans[10] || 0;
      const soilW3 = channelMeans[11] || 0;
      const dewpoint = channelMeans[13] || 0;

      const ndvi = (nir - red) / (Math.abs(nir) + Math.abs(red) + 1e-5);
      const ndwi = (nir - swir) / (Math.abs(nir) + Math.abs(swir) + 1e-5);
      const soilDeficit = 1.0 - (soilW1 + soilW3) / 2.0;

      const logits = [
        -2.5 * minTemp - 1.5 * temp2m,
        1.8 * maxTemp + 2.2 * soilDeficit - 2.0 * ndvi - 1.5 * precip,
        2.5 * swir + 2.0 * maxTemp + 1.8 * soilDeficit - 1.2 * precip,
        2.8 * channelMaxes[7] + 2.0 * ndwi - 1.8 * sarVV,
        2.5 * precip + 2.2 * ndwi - 2.0 * sarVV - 1.5 * sarVH,
        3.0 * maxTemp + 2.0 * temp2m - 1.0 * precip,
        2.2 * channelMaxes[7] + 1.5 * Math.abs(temp2m - dewpoint),
        3.2 * channelMaxes[7] + 2.5 * precip + 2.0 * ndwi - 2.2 * sarVV
      ];

      const logitsTensor = tf.tensor1d(logits);
      const probsTensor = tf.softmax(logitsTensor);
      const probs = probsTensor.arraySync() as number[];

      const anomalyScore = 0.3 * (channelMaxes[7] || 0) + 0.25 * maxTemp - 0.2 * minTemp + 0.25 * soilDeficit + 0.2 * ndwi - 0.15 * sarVV;
      const severity = 1 / (1 + Math.exp(-anomalyScore));

      const ranked = probs
        .map((p, idx) => ({ hazard: hazardNames[idx], score: parseFloat(p.toFixed(4)) }))
        .sort((a, b) => b.score - a.score);

      return {
        hazardProbabilities: probs.map(p => parseFloat(p.toFixed(4))),
        severity: parseFloat(severity.toFixed(4)),
        hazardNames,
        top3: ranked.slice(0, 3)
      };
    });
  }
}

export const tfliteService = TFLiteService.getInstance();
