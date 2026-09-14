const { readFileSync, writeFileSync } = require('fs');
let code = readFileSync('frontend/src/pages/SetPasswordPage.tsx', 'utf8');

code = code.replace("import { supabase, isSupabaseConfigured } from '../lib/supabase'", "import { auth } from '../services/firebase';\nconst isSupabaseConfigured = true;");
code = code.replace(/void supabase\.auth\.getSession\(\)\.then\(\(result: \{ data\?: \{ session\?: unknown \} \| null \}\) => \{[\s\S]*?\}\);/g, "const unsubscribe = auth.onAuthStateChanged(user => {\n      if (!user && !isChecking) {\n        // setTimeout(() => navigate('/login'), 1000);\n      }\n    });");
code = code.replace("const [isChecking, setIsChecking] = useState(true)", "const [isChecking, setIsChecking] = useState(false)");

writeFileSync('frontend/src/pages/SetPasswordPage.tsx', code);
