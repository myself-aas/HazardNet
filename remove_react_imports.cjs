const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('frontend/src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    // Remove default React import alone: "import React from 'react';"
    content = content.replace(/^import\s+React\s+from\s+['"]react['"];?\r?\n/gm, '');
    // Replace "import React, { ... } from 'react';" with "import { ... } from 'react';"
    content = content.replace(/^import\s+React\s*,\s*\{\s*/gm, 'import { ');
    // Handle cases like "import * as React from 'react';"
    content = content.replace(/^import\s+\*\s+as\s+React\s+from\s+['"]react['"];?\r?\n/gm, '');
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  }
});
