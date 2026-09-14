const { readFileSync, writeFileSync } = require('fs');

let code = readFileSync('frontend/src/lib/blogArticles.ts', 'utf8');
code = code.replace(/const \{ data, error \} = await supabase[\s\S]*?\.order\('published_at', \{ ascending: false, nullsFirst: false \}\);/g, "let data: any[] = []; let error = null;\n  try {\n    const q = query(collection(db, TABLE), where('status', '==', 'published'), orderBy('published_at', 'desc'));\n    const snap = await getDocs(q);\n    data = snap.docs.map(d => ({ id: d.id, ...d.data() }));\n  } catch(e) { error = e; }");
writeFileSync('frontend/src/lib/blogArticles.ts', code);

code = readFileSync('frontend/src/lib/connectors.ts', 'utf8');
code = code.replace(/const \{ data, error \} = await supabase[\s\S]*?\.eq\('provider', provider\);/g, "let data: any[] = []; let error = null;\n  try {\n    const q = query(collection(db, 'user_connectors'), where('user_id', '==', userId), where('provider', '==', provider));\n    const snap = await getDocs(q);\n    data = snap.docs.map(d => ({ id: d.id, ...d.data() }));\n  } catch(e) { error = e; }");
code = code.replace(/const \{ error \} = await supabase\.from\('user_connectors'\)\.upsert\([\s\S]*?\}\);/g, "let error = null;\n  try {\n    await setDoc(doc(db, 'user_connectors', userId + '_' + config.provider), {\n      user_id: userId,\n      provider: config.provider,\n      auth_data: config.authData,\n      metadata: config.metadata,\n      status: config.status,\n      last_sync_at: config.lastSyncAt,\n      created_at: new Date().toISOString(),\n      updated_at: new Date().toISOString(),\n    }, { merge: true });\n  } catch(e) { error = e; }");
writeFileSync('frontend/src/lib/connectors.ts', code);

code = readFileSync('frontend/src/lib/avatar.ts', 'utf8');
code = code.replace(/const \{ error: updateError \} = await supabase[\s\S]*?\.eq\('id', userId\);/g, "let updateError = null;\n  try { await updateDoc(doc(db, 'profiles', userId), { avatar_path: storagePath, photo_url: publicUrl }); } catch(e) { updateError = e; }");
code = code.replace(/await supabase[\s\S]*?\.eq\('id', userId\);/g, "await updateDoc(doc(db, 'profiles', userId), { avatar_path: null, photo_url: null });");
writeFileSync('frontend/src/lib/avatar.ts', code);

code = readFileSync('frontend/src/pages/PublicProfilePage.tsx', 'utf8');
code = code.replace(/const \{ data, error \} = await supabase[\s\S]*?\.maybeSingle\(\);/g, "let data: any = null; let error = null;\n        try {\n          const q = query(collection(db, 'profiles'), where('username', '==', username));\n          const snap = await getDocs(q);\n          if(!snap.empty) data = { id: snap.docs[0].id, ...snap.docs[0].data() };\n        } catch(e) { error = e; }");
writeFileSync('frontend/src/pages/PublicProfilePage.tsx', code);

code = readFileSync('frontend/src/pages/SetPasswordPage.tsx', 'utf8');
code = code.replace(/void supabase\.auth\.getSession\(\)\.then\(\(result: \{ data\?: \{ session\?: unknown \} \| null \}\) => \{[\s\S]*?\}\);/g, "const unsubscribe = auth.onAuthStateChanged(user => {\n      if (!user && !isChecking) {\n        // setTimeout(() => navigate('/login'), 1000);\n      }\n    });");
writeFileSync('frontend/src/pages/SetPasswordPage.tsx', code);

code = readFileSync('frontend/src/pages/AuthCallbackPage.tsx', 'utf8');
code = code.replace(/\/\/ The supabase-js singleton exchanges the \?code during initialization[\s\S]*?\}\);/g, "const unsubscribe = onAuthStateChanged(auth, (user) => {\n      if(user) navigate(returnTo, { replace: true });\n      else setError('Authentication failed');\n    });");
code = code.replace(/void supabase\.auth\.getSession\(\)\.then\(\(result[\s\S]*?\}\);/g, "");
code = code.replace(/const \{ data \} = supabase\.auth\.onAuthStateChange\([\s\S]*?\}\);/g, "");
writeFileSync('frontend/src/pages/AuthCallbackPage.tsx', code);

code = readFileSync('frontend/src/context/AuthContext.tsx', 'utf8');
code = code.replace(/const \{ error \} = await supabase\.from\('assessments'\)\.delete\(\)\.eq\('id', id\)\.eq\('user_id', user\?\.id\);/g, "let error = null;\n    try { await deleteDoc(doc(db, 'assessments', id)); } catch(e) { error = e; }");
writeFileSync('frontend/src/context/AuthContext.tsx', code);

