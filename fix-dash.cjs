const fs = require('fs');
let content = fs.readFileSync('frontend/src/pages/Dashboard.tsx', 'utf8');

// The end of the file should just be ONE extra closing div for the new wrapper.
content = content.replace(/    <\/div>\n      \{\/\* Dashboard container closer \*\/}\n      <\/div>\n    <\/div>\n  \);\n};\n\nexport default Dashboard;/m, 
  `    </div>\n      {/* Dashboard container closer */}\n    </div>\n  );\n};\n\nexport default Dashboard;`
);

fs.writeFileSync('frontend/src/pages/Dashboard.tsx', content);
