const ELEMENTS = 15 * 10 * 64 * 64;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

export function validateTensorValues(values: ArrayLike<number>): Float32Array {
  if (values.length !== ELEMENTS) throw new Error(`Expected ${ELEMENTS} values in NCDHW [1,15,10,64,64] order.`);
  const tensor = Float32Array.from(values);
  if (tensor.some((value) => !Number.isFinite(value))) throw new Error('Tensor contains missing, NaN or infinite values.');
  return tensor;
}

/** No resampling, band guessing, synthetic time steps, or nodata substitution. */
export async function readTensorUpload(file: File): Promise<ArrayBuffer> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Upload exceeds 32 MiB.');
  let tensor: Float32Array;
  if (/\.json$/i.test(file.name)) {
    const payload = JSON.parse(await file.text());
    const values = Array.isArray(payload) ? payload : payload.tensor;
    if (!Array.isArray(values)) throw new Error('JSON must contain a tensor array.');
    const flat = values.flat(Infinity);
    if (flat.some((value: unknown) => typeof value !== 'number')) throw new Error('Tensor values must be numbers.');
    tensor = validateTensorValues(flat);
  } else if (/\.(tiff?|geotiff)$/i.test(file.name)) {
    const { fromArrayBuffer } = await import('geotiff');
    const tiff = await fromArrayBuffer(await file.arrayBuffer());
    if (await tiff.getImageCount() !== 10) throw new Error('TIFF must have 10 time-ordered images, each 64×64 with 15 bands.');
    tensor = new Float32Array(ELEMENTS);
    for (let time = 0; time < 10; time++) {
      const image = await tiff.getImage(time);
      if (image.getWidth() !== 64 || image.getHeight() !== 64 || image.getSamplesPerPixel() !== 15) {
        throw new Error('Each TIFF image must be 64×64 with the 15 documented bands in order.');
      }
      const nodata = image.getGDALNoData();
      const bands = await image.readRasters({ interleave: false });
      for (let channel = 0; channel < 15; channel++) {
        const band = bands[channel] as ArrayLike<number>;
        for (let pixel = 0; pixel < 4096; pixel++) {
          const value = Number(band[pixel]);
          if (!Number.isFinite(value) || (nodata !== null && value === nodata)) throw new Error('TIFF contains nodata or non-finite pixels.');
          tensor[channel * 10 * 4096 + time * 4096 + pixel] = value;
        }
      }
    }
    tensor = validateTensorValues(tensor);
  } else {
    throw new Error('Use a tensor .json or a time-stacked .tif/.tiff/.geotiff. Model weights are server-managed.');
  }
  // Binary avoids Vercel's JSON request-size ceiling for 614400 float values.
  const buffer = new ArrayBuffer(ELEMENTS * 4);
  const view = new DataView(buffer);
  tensor.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return buffer;
}
