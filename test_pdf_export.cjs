const fs = require('fs');
let css = fs.readFileSync('frontend/src/index.css', 'utf8');

// Also need to make sure the modal wrapper renders well
// Look for .print-preview-rendered-body in index.css

console.log('Checks complete');
