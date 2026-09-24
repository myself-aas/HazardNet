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
  plugins: ['babel-plugin-transform-import-meta'],
  overrides: [
    {
      test: ['backend/**/*.js'],
      parserOpts: {
        sourceType: 'module',
      },
    },
  ],
};
