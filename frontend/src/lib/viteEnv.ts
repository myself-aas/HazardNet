/**
 * Vite build flags, isolated in their own module.
 *
 * `import.meta.env` only exists under Vite. Under Jest the source is transpiled to CommonJS,
 * where a bare `import.meta` is a syntax error — which is why any module that reads a build
 * flag directly (`src/lib/config.ts` is the existing example) cannot be imported by a test at
 * all. Keeping the read in one two-line file means every other module stays testable: a suite
 * mocks *this* module with a factory, and the real file is never parsed.
 */
export const envFlag = (key: string): boolean =>
  (import.meta as unknown as { env?: Record<string, unknown> } | undefined)?.env?.[key] === 'true';
