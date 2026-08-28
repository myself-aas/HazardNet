import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.warn('Supabase env vars missing. Using mock client.');
    return new Proxy({} as any, { 
      get: (target, prop) => {
        if (prop === 'auth') {
          return {
            getUser: () => Promise.resolve({ data: { user: null }, error: null }),
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
            signOut: () => Promise.resolve({ error: null }),
          };
        }
        return new Proxy(() => {}, { 
          get: () => () => Promise.resolve({ data: null, error: null }) 
        });
      } 
    });
  }
  return createBrowserClient(url, key)
}
