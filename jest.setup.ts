import '@testing-library/jest-dom';

// jsdom (jest-environment-jsdom 30) does not expose Node's TextEncoder /
// TextDecoder globals, but jspdf's dependency chain (iobuffer → fast-png)
// requires them at import time. Polyfill from node:util so PDF-related
// component suites can load under jsdom.
import { TextDecoder, TextEncoder } from 'node:util';

if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}
