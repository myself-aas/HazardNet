/**
 * `GET /api/v1/kaggle/advisories` — alias to `GET /api/v1/kaggle` for parity with
 * `serverless/v1/kaggle.js` and `backend/routes/kaggle.js`.
 */

import { onRequestGet as handleKaggleGet } from './index';

export async function onRequestGet(
  context: Parameters<typeof handleKaggleGet>[0],
): Promise<Response> {
  return handleKaggleGet(context);
}
