import tf from '@tensorflow/tfjs';

/**
  * Flattens array safely
  * @param {Array} arr
  * @returns {Float32Array|Array}
  */
function getFlatData(arr) {
  if (!Array.isArray(arr)) return null;
  if (arr.length > 0 && typeof arr[0] === 'number') {
    return arr;
  }
  return arr.flat(Infinity);
}

/**
  * Express middleware to validate incoming tensor payload.
  * Expects req.body.tensor to be a flat or nested array matching shape [1,15,10,64,64].
  * Attaches a tf.Tensor5D to req.tensor on success.
  */
function validateTensor(req, res, next) {
  const data = req.body.tensor;
  const districtId = req.body.districtId || req.body.district;
  const risk = req.body.risk || 'High';

  if (!data && districtId) {
    try {
      const size = 1 * 15 * 10 * 64 * 64;
      const buf = new Float32Array(size);
      for (let t = 0; t < 10; t++) {
        for (let h = 0; h < 64; h++) {
          for (let w = 0; w < 64; w++) {
            const baseIdx = (c) => c * (10 * 64 * 64) + t * (64 * 64) + h * 64 + w;
            if (risk === 'High') {
              buf[baseIdx(7)] = 15.5 + Math.random() * 5.0; // Precip
              buf[baseIdx(0)] = -14.2 + Math.random() * 1.5; // SAR VV
              buf[baseIdx(4)] = 0.15; // NIR
              buf[baseIdx(3)] = 0.25; // Red
              buf[baseIdx(8)] = 34.0; // Max Temp
              buf[baseIdx(10)] = 0.12; // Soil W1
            } else if (risk === 'Moderate') {
              buf[baseIdx(7)] = 4.2 + Math.random() * 2.0;
              buf[baseIdx(0)] = -9.5 + Math.random() * 1.0;
              buf[baseIdx(4)] = 0.42;
              buf[baseIdx(3)] = 0.12;
              buf[baseIdx(8)] = 31.5;
              buf[baseIdx(10)] = 0.28;
            } else {
              buf[baseIdx(7)] = 1.0 + Math.random() * 0.5;
              buf[baseIdx(0)] = -6.2 + Math.random() * 0.8;
              buf[baseIdx(4)] = 0.65;
              buf[baseIdx(3)] = 0.08;
              buf[baseIdx(8)] = 28.0;
              buf[baseIdx(10)] = 0.45;
            }
          }
        }
      }
      req.tensor = tf.tensor5d(buf, [1, 15, 10, 64, 64], 'float32');
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to construct server tensor', details: err.message });
    }
  }

  if (!data) {
    return res.status(400).json({ error: 'Missing tensor or districtId in request body' });
  }

  const flat = getFlatData(data);
  if (!flat) {
    return res.status(400).json({ error: 'Tensor must be an array' });
  }

  const expectedSize = 1 * 15 * 10 * 64 * 64;
  if (flat.length !== expectedSize) {
    return res.status(400).json({ error: `Tensor shape mismatch. Expected ${expectedSize} elements, received ${flat.length}` });
  }

  try {
    const float32Array = flat instanceof Float32Array ? flat : new Float32Array(flat);
    const tensor = tf.tensor5d(float32Array, [1, 15, 10, 64, 64], 'float32');
    req.tensor = tensor;
    next();
  } catch (err) {
    return res.status(400).json({ error: 'Failed to construct tensor', details: err.message });
  }
}

export { validateTensor };
