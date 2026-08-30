const fs = require('fs');
let css = fs.readFileSync('frontend/src/index.css', 'utf8');
css = css.replace(/\/\* display: block !important; \*\//g, 'display: block !important;');
fs.writeFileSync('frontend/src/index.css', css);
