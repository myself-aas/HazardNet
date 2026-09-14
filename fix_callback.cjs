const { readFileSync, writeFileSync } = require('fs');

let code = readFileSync('frontend/src/pages/AuthCallbackPage.tsx', 'utf8');

const regex = /void auth\.authStateReady\(\)\.then\(\(\) => \{\n\s*if \(auth\.currentUser\) finish\(auth\.currentUser\)\n\s*\}\) => \{[\s\S]*?\)\n\s*\}/g;

code = code.replace(regex, "void auth.authStateReady().then(() => {\n      if (auth.currentUser) finish(auth.currentUser)\n    })\n    try {\n      unsubscribe = onAuthStateChanged(auth, (user) => {\n        if (user) finish(user)\n      })\n    } catch(e) {}");

writeFileSync('frontend/src/pages/AuthCallbackPage.tsx', code);
