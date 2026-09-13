module.exports = {
  presets: [
    ['@babel/preset-env', {targets: {node: 'current'}}],
    '@babel/preset-typescript',
    ['@babel/preset-react', {runtime: 'automatic'}],
  ],
  // This config is consumed by babel-jest (the backend runs natively on Node
  // ESM). preset-env transpiles to CJS, where `import.meta` is a SyntaxError
  // — the plugin rewrites import.meta.url/dirname/filename/resolve to their
  // CJS equivalents so rag_pipeline/* (import.meta.url for RAG_DIR) loads
  // under Jest instead of cascading through backend/server.js (22 red tests).
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
