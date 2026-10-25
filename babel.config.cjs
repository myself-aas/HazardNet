module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    '@babel/preset-typescript',
    ['@babel/preset-react', {runtime: 'automatic'}],
  ],
  // This config is consumed by babel-jest (the backend runs natively on Node
  // ESM). preset-env transpiles to CJS, where `import.meta` is a SyntaxError
  // — the plugin rewrites import.meta.url/dirname/filename/resolve to their
  // CJS equivalents so backend modules that read import.meta.url load
  // under Jest instead of cascading through backend/server.js.
  //
  // `babel-plugin-transform-import-meta` deliberately leaves *unknown* meta
  // properties alone, so `import.meta.env` (a Vite, not TC39, property) still
  // crashes the CJS transform at parse time. The frontend reads env only via
  // `env.VITE_*` lookups with defaults, so under Jest process.env is the
  // nearest honest stand-in (unset vars fall through to the module defaults).
  // This only affects the Jest pipeline; the Vite build never sees babel.
  plugins: [
    'babel-plugin-transform-import-meta',
    function importMetaEnvToProcessEnv() {
      return {
        name: 'import-meta-env-to-process-env',
        visitor: {
          MemberExpression(path) {
            const node = path.node;
            if (
              !node.computed &&
              node.property.type === 'Identifier' &&
              node.property.name === 'env' &&
              node.object.type === 'MetaProperty' &&
              node.object.meta.name === 'import' &&
              node.object.property.name === 'meta'
            ) {
              // `import.meta.env` → `process.env` (babel-plugin-template-free)
              path.replaceWithSourceString('process.env');
            }
          },
        },
      };
    },
  ],
  overrides: [
    {
      test: ['backend/**/*.js'],
      parserOpts: {
        sourceType: 'module',
      },
    },
  ],
};
