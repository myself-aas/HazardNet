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

  // Integrity: never fabricate input data. A disaster early-warning API must
  // refuse to run the model on synthetic/random tensors — a prediction from
  // noise looks identical to a real one downstream. Return 422 instead.
  if (!data) {
    return res.status(422).json({
      error: 'Tensor payload required',
      details: 'Request body must include a `tensor` array matching shape [1,15,10,64,64].',
    });
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
