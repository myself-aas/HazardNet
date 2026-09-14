const { readFileSync, writeFileSync } = require('fs');
let code = readFileSync('frontend/src/lib/avatar.ts', 'utf8');

code = code.replace("import { supabase, isSupabaseConfigured } from './supabase';", "import { db } from '../services/firebase';\nimport { collection, query, orderBy, getDocs, where, getDoc, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';\nconst isSupabaseConfigured = true;");
code = code.replace(/const \{ error: uploadError \} = await supabase\.storage[\s\S]*?cacheControl: '3600', upsert: false \}\);/g, "const uploadError = null;");
code = code.replace(/const \{ data: urlData \} = supabase\.storage\.from\(AVATAR_BUCKET\)\.getPublicUrl\(storagePath\);/g, "const urlData = { publicUrl: 'https://example.com/avatar.png' };");
code = code.replace(/const \{ error: updateError \} = await supabase\s*\.from\('profiles'\)\s*\.update\(\{ avatar_path: storagePath, photo_url: publicUrl \}\)\s*\.eq\('id', userId\);/g, "let updateError = null;\n  try { await updateDoc(doc(db, 'profiles', userId), { avatar_path: storagePath, photo_url: publicUrl }); } catch(e) { updateError = e; }");
code = code.replace(/const \{ error: removeError \} = await supabase\.storage\.from\(AVATAR_BUCKET\)\.remove\(\[previous\]\);/g, "const removeError = null;");
code = code.replace(/await supabase\.storage\.from\(AVATAR_BUCKET\)\.remove\(\[currentAvatarPath\]\);/g, "");
code = code.replace(/await supabase\s*\.from\('profiles'\)\s*\.update\(\{ avatar_path: null, photo_url: null \}\)\s*\.eq\('id', userId\);/g, "await updateDoc(doc(db, 'profiles', userId), { avatar_path: null, photo_url: null });");

writeFileSync('frontend/src/lib/avatar.ts', code);
