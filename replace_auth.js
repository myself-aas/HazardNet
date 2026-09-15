import fs from 'node:fs';
let code = fs.readFileSync('frontend/src/context/AuthContext.tsx', 'utf8');

code = code.replace("import type { User as SupabaseAuthUser, UserResponse } from '@supabase/supabase-js';", "import type { User as SupabaseAuthUser } from 'firebase/auth';\nimport { auth, db } from '../services/firebase';\nimport { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail, updatePassword as fbUpdatePassword, updateEmail as fbUpdateEmail, linkWithPopup, OAuthProvider as FbOAuthProvider, signInWithPopup } from 'firebase/auth';\nimport { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, deleteDoc } from 'firebase/firestore';");
code = code.replace("import { supabase, isSupabaseConfigured } from '../lib/supabase';", "");
code = code.replace("type EmailCredential = UserResponse;", "type EmailCredential = any;");
code = code.replace("const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();", "const docSnap = await getDoc(doc(db, 'profiles', authUser.uid));\nconst data = docSnap.exists() ? docSnap.data() : null;");
code = code.replace(/authUser\.id/g, "authUser.uid");
code = code.replace(/user\.id/g, "user.uid");
code = code.replace("const response = await supabase.auth.getUser();\n        const authUser = response?.data?.user ?? null;", "const authUser = auth.currentUser;");
code = code.replace("const authChangeRes = supabase.auth.onAuthStateChange((_event: any, session: any) => {\n        if (!mounted) return;\n        const next = session?.user ?? null;", "const unsubscribe = onAuthStateChanged(auth, (next) => {\n        if (!mounted) return;");
code = code.replace("if (authChangeRes?.data?.subscription) {\n        unsubscribe = () => authChangeRes.data.subscription.unsubscribe();\n      }", "");

// More replacements needed for all supabase calls...

fs.writeFileSync('frontend/src/context/AuthContext.tsx', code);
