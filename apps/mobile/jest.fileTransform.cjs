/**
 * Transform .md files to plain string modules (default export) for Jest.
 * Mirrors what Metro does for .md assets when resolver.sourceExts includes md.
 */
const fs = require('fs');
module.exports = {
  process(src, filename) {
    const content = fs.readFileSync(filename, 'utf8').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return { code: 'module.exports = { default: `' + content + '` };' };
  },
};
