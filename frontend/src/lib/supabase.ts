import { createClient, SupabaseClient } from '@supabase/supabase-js'

const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? '') as string
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '') as string

const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

const isConfigured = isValidUrl(rawUrl) && rawKey.length > 10 && !rawUrl.includes('placeholder') && !rawKey.includes('placeholder')

const createChainableQuery = () => {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (val: any) => any) => Promise.resolve({ data: null, error: null }).then(resolve)
      }
      if (prop === 'catch') {
        return (reject: (err: any) => any) => Promise.resolve({ data: null, error: null }).catch(reject)
      }
      return (..._args: any[]) => new Proxy(() => {}, handler)
    },
    apply(_target, _thisArg, _argArray) {
      return new Proxy(() => {}, handler)
    }
  }
  return new Proxy(() => {}, handler)
}

const createMockSupabaseClient = (): any => {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: (_callback: any) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Supabase is not configured') }),
      signUp: async () => ({ data: { user: null, session: null }, error: new Error('Supabase is not configured') }),
      signInWithOAuth: async () => ({ data: null, error: new Error('Supabase is not configured') }),
      getUserIdentities: async () => ({ data: { identities: [] }, error: null }),
      linkIdentity: async () => ({ data: null, error: new Error('Supabase is not configured') }),
      unlinkIdentity: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
    },
    from: (_table: string) => createChainableQuery(),
  }
}

if (!isConfigured) {
  console.info('Supabase environment variables not detected or invalid; using resilient mock client.')
}

export const supabase: SupabaseClient<any, any, any> = isConfigured
  ? createClient(rawUrl, rawKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : (createMockSupabaseClient() as SupabaseClient<any, any, any>)

export type SupabaseUser = any
