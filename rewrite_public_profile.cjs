const { readFileSync, writeFileSync } = require('fs');
let code = readFileSync('frontend/src/pages/PublicProfilePage.tsx', 'utf8');

code = code.replace("import { supabase, isSupabaseConfigured } from '../lib/supabase';", "import { db } from '../services/firebase';\nimport { collection, query, getDocs, where, getDoc, doc } from 'firebase/firestore';\nconst isSupabaseConfigured = true;");
code = code.replace(/const \{ data, error \} = await supabase\s*\.from\('profiles'\)\s*\.select\('\*'\)\s*\.eq\('username', username\)\s*\.maybeSingle\(\);/g, "let data: any = null; let error = null;\n        try {\n          const q = query(collection(db, 'profiles'), where('username', '==', username));\n          const snap = await getDocs(q);\n          if(!snap.empty) data = { id: snap.docs[0].id, ...snap.docs[0].data() };\n        } catch(e) { error = e; }");

writeFileSync('frontend/src/pages/PublicProfilePage.tsx', code);
