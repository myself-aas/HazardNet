/**
 * Main exports for @hazardnet/design-system (token-only entry point).
 *
 * React is OPTIONAL for this package. Consumers that only need colors,
 * spacing, type scale, severity tokens, and alert levels can import from
 * this entry point without pulling React into their bundle.
 *
 * Consumers that want the React `useTokens`/`useM3ExpressiveTokens` hooks
 * import from `@hazardnet/design-system/use-tokens`.
 */

export * from './tokens';
export * from './material3Expressive';
