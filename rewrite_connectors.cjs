const { readFileSync, writeFileSync } = require('fs');
let code = readFileSync('frontend/src/lib/connectors.ts', 'utf8');

code = code.replace("import { supabase, isSupabaseConfigured } from './supabase';", "import { db } from '../services/firebase';\nimport { collection, query, orderBy, getDocs, where, getDoc, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';\nconst isSupabaseConfigured = true;");
code = code.replace(/const \{ data, error \} = await supabase\s*\.from\('user_connectors'\)\s*\.select\('\*'\)\s*\.eq\('user_id', userId\);/g, "let data: any[] = []; let error = null;\n    try {\n      const q = query(collection(db, 'user_connectors'), where('user_id', '==', userId));\n      const snap = await getDocs(q);\n      data = snap.docs.map(d => ({ id: d.id, ...d.data() }));\n    } catch(e) { error = e; }");
code = code.replace(/const \{ error \} = await supabase\.from\('user_connectors'\)\.upsert\([\s\S]*?\}\);/g, "let error = null;\n  try {\n    await setDoc(doc(db, 'user_connectors', userId + '_' + config.provider), {\n      user_id: userId,\n      provider: config.provider,\n      auth_data: config.authData,\n      metadata: config.metadata,\n      status: config.status,\n      last_sync_at: config.lastSyncAt,\n      created_at: new Date().toISOString(),\n      updated_at: new Date().toISOString(),\n    }, { merge: true });\n  } catch(e) { error = e; }");

writeFileSync('frontend/src/lib/connectors.ts', code);
