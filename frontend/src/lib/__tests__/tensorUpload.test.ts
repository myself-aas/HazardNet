import { readTensorUpload, validateTensorValues } from '../tensorUpload';
test('rejects wrong size and nonfinite float32 input', () => {
  expect(() => validateTensorValues([0])).toThrow('614400');
  expect(() => validateTensorValues(new Float32Array(614400).fill(NaN))).toThrow('NaN');
  expect(() => validateTensorValues(Array(614400).fill(1e100))).toThrow('infinite');
});
test('JSON contents become little-endian binary, not a filename request', async () => {
  const file = { name: 'input.json', size: 100, text: async () => JSON.stringify({ tensor: Array(614400).fill(3.5) }) } as File;
  const result = await readTensorUpload(file);
  expect(result.byteLength).toBe(2457600);
  expect(new DataView(result).getFloat32(0, true)).toBe(3.5);
});
test('rejects unsupported/model files instead of inventing a forecast', async () => {
  await expect(readTensorUpload({ name: 'weights.tflite', size: 50 } as File)).rejects.toThrow('server-managed');
});
test('rejects coercible non-numeric values in JSON', async () => {
  const file = { name: 'input.json', size: 5, text: async () => '{"tensor":[null]}' } as File;
  await expect(readTensorUpload(file)).rejects.toThrow('numbers');
});
