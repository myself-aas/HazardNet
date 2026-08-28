import { createContext, useContext, useEffect, useState } from 'react';
import type { User as SupabaseAuthUser, UserResponse } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  AUTH_RETURN_TO_KEY,
  OAuthProviderId,
  buildOAuthRedirectTo,
  getProvider,
  mapProviderUserMetadata,
} from '../lib/oauthProviders';

/** Auth screens themselves are never a useful post-login destination. */
const isAuthScreen = (path: string) =>
  /^\/(login|signup|forgot-password|update-password|auth)(\/|$)/.test(path);

export type UserRolePersona =
  'smallholder_farmer' | 'ngo_coordinator' | 'govt_official' | 'academic_researcher' | 'commercial_agribusiness';

export type AppUser = SupabaseAuthUser & {
  uid: string;
  displayName: string;
  photoURL?: string;
  providerData: Array<{ providerId: string; email?: string | null }>;
};

export interface UserProfileData {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role?: 'user' | 'admin';
  userRole?: UserRolePersona;
  organization?: string;
  farmSizeHectares?: number;
  primaryDivision?: string;
  primaryDistrict?: string;
  homeDistrictId?: string;
  homeDistrictName?: string;
  autoDetectLocationEnabled?: boolean;
  targetCrops?: string;
  phoneNumber?: string;
  pinpointLat?: number;
  pinpointLng?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserAssessment {
  id: string;
  userId: string;
  userEmail: string;
  districtId: string;
  districtName: string;
  primaryHazard: string;
  confidence: number;
  severityScore: number;
  severityBin?: string;
  notes?: string;
  createdAt: string;
}

type EmailCredential = UserResponse;
export type OAuthProvider = OAuthProviderId;
export interface AuthContextType {
  user: AppUser | null;
  userProfile: UserProfileData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider, options?: { nextTo?: string }) => Promise<void>;
  linkIdentity: (provider: OAuthProvider) => Promise<void>;
  unlinkIdentity: (provider: OAuthProvider) => Promise<void>;
  getUserIdentities: () => Promise<Array<{ provider: string; identityId: string; email: string | null }>>;
  signUpWithEmail: (
    email: string,
    pass: string,
    name: string,
    initialProfile?: Partial<UserProfileData>,
  ) => Promise<'session' | 'confirmation-required'>;
  signInWithEmailAndPassword: (email: string, pass: string) => Promise<EmailCredential>;
  signInWithEmail: (email: string, pass: string) => Promise<EmailCredential>;
  signOut: () => Promise<void>;
  signOutUser: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfileData>) => Promise<void>;
  saveAssessment: (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => Promise<string>;
  fetchUserAssessments: () => Promise<UserAssessment[]>;
  deleteAssessment: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const toAppUser = (user: SupabaseAuthUser | null): AppUser | null =>
  user
    ? {
        ...user,
        uid: user.id,
        displayName: mapProviderUserMetadata(user.user_metadata).displayName,
        photoURL: mapProviderUserMetadata(user.user_metadata).avatarUrl ?? undefined,
        providerData:
          user.identities?.map((identity) => ({
            providerId: identity.provider,
            email: identity.identity_data?.email,
          })) ?? [],
      }
    : null;
const toProfile = (row: Record<string, unknown>): UserProfileData => ({
  uid: row.id as string,
  email: row.email as string,
  displayName: row.display_name as string,
  photoURL: row.photo_url as string | undefined,
  role: row.role as UserProfileData['role'],
  userRole: row.user_role as UserRolePersona,
  organization: row.organization as string | undefined,
  farmSizeHectares: row.farm_size_hectares as number | undefined,
  primaryDivision: row.primary_division as string | undefined,
  primaryDistrict: row.primary_district as string | undefined,
  homeDistrictId: row.home_district_id as string | undefined,
  homeDistrictName: row.home_district_name as string | undefined,
  autoDetectLocationEnabled: row.auto_detect_location_enabled as boolean | undefined,
  targetCrops: row.target_crops as string | undefined,
  phoneNumber: row.phone_number as string | undefined,
  pinpointLat: row.pinpoint_lat as number | undefined,
  pinpointLng: row.pinpoint_lng as number | undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const loadProfile = async (authUser: SupabaseAuthUser) => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (data) setUserProfile(toProfile(data as Record<string, unknown>));
      return data;
    } catch (e) {
      console.warn('Profile load exception:', e);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;
    const initAuth = async () => {
      try {
        const response = await supabase.auth.getUser();
        const authUser = response?.data?.user ?? null;
        if (mounted) {
          setUser(toAppUser(authUser));
          if (authUser) {
            const profile = await loadProfile(authUser);
            if (!profile) await bootstrapProfileFromOAuth(authUser);
          }
        }
      } catch (err) {
        console.warn('Failed to load initial Supabase user:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initAuth();

    let unsubscribe = () => {};
    try {
      const authChangeRes = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        if (!mounted) return;
        const next = session?.user ?? null;
        setUser(toAppUser(next));
        if (next) {
          void loadProfile(next).then((profile) => {
            if (!profile) return bootstrapProfileFromOAuth(next);
            return undefined;
          });
        } else setUserProfile(null);
        setLoading(false);
      });
      if (authChangeRes?.data?.subscription) {
        unsubscribe = () => authChangeRes.data.subscription.unsubscribe();
      }
    } catch (err) {
      console.warn('Failed to attach auth state listener:', err);
    }

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);
  const signUpWithEmail = async (
    email: string,
    pass: string,
    name: string,
    initialProfile?: Partial<UserProfileData>,
  ): Promise<'session' | 'confirmation-required'> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: import.meta.env.VITE_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        data: { display_name: name },
      },
    });
    if (error) throw error;
    // No session means Supabase requires email confirmation before login.
    if (data.user && data.session) {
      await saveProfile(data.user, name, initialProfile);
      return 'session';
    }
    return 'confirmation-required';
  };
  const saveProfile = async (authUser: SupabaseAuthUser, name = 'User', data: Partial<UserProfileData> = {}) => {
    const row = {
      id: authUser.id,
      email: authUser.email ?? '',
      display_name: name,
      role: data.role ?? 'user',
      user_role: data.userRole ?? 'smallholder_farmer',
      organization: data.organization ?? '',
      farm_size_hectares: data.farmSizeHectares ?? 1.5,
      primary_division: data.primaryDivision ?? 'Rangpur',
      primary_district: data.primaryDistrict ?? '',
      target_crops: data.targetCrops ?? 'Boro Paddy, Aman Rice',
      phone_number: data.phoneNumber ?? '',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('profiles').upsert(row);
    if (error) throw error;
    await loadProfile(authUser);
  };
  /**
   * Create the profiles row on first social sign-in (sign-up). Email/password
   * sign-up creates its row in signUpWithEmail; OAuth flows land here. The
   * row is seeded from the provider's user metadata (name, email, avatar)
   * and never overwrites an existing row (ignoreDuplicates).
   */
  const bootstrapProfileFromOAuth = async (authUser: SupabaseAuthUser) => {
    const seed = mapProviderUserMetadata(authUser.user_metadata);
    const row = {
      id: authUser.id,
      email: authUser.email ?? seed.email ?? '',
      display_name: seed.displayName,
      role: 'user',
      user_role: 'smallholder_farmer',
      organization: '',
      farm_size_hectares: 1.5,
      primary_division: 'Rangpur',
      primary_district: '',
      target_crops: 'Boro Paddy, Aman Rice',
      phone_number: '',
      photo_url: seed.avatarUrl ?? '',
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
      if (error && /column|photo_url/i.test(error.message)) {
        // Older profile schemas may lack photo_url — retry without it.
        const { error: retryError } = await supabase
          .from('profiles')
          .upsert({ ...row, photo_url: undefined }, { onConflict: 'id', ignoreDuplicates: true });
        if (retryError) throw retryError;
      } else if (error) {
        throw error;
      }
      await loadProfile(authUser);
    } catch (e) {
      console.warn('OAuth profile bootstrap failed:', e);
    }
  };
  const signIn = async (email: string, pass: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password: pass });
    if (result.error) throw result.error;
    return result;
  };
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setUserProfile(null);
    sessionStorage.clear();
  };
  const updateUserProfile = async (data: Partial<UserProfileData>) => {
    if (!user) {
      setUserProfile((prev) => (prev ? { ...prev, ...data } : null));
      return;
    }
    const row = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]),
    );
    const { error } = await supabase
      .from('profiles')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw error;
    await loadProfile(user);
  };
  const saveAssessment = async (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => {
    if (!user) throw new Error('Must be authenticated to save assessments.');
    const { data: row, error } = await supabase
      .from('assessments')
      .insert({
        user_id: user.id,
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]),
        ),
      })
      .select('id')
      .single();
    if (error) throw error;
    return row.id;
  };
  const fetchUserAssessments = async () => {
    if (!user) return [];
    const { data, error } = await supabase
      .from('assessments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data as any[]) ?? []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      userEmail: user.email ?? '',
      districtId: row.district_id,
      districtName: row.district_name,
      primaryHazard: row.primary_hazard,
      confidence: row.confidence,
      severityScore: row.severity_score,
      severityBin: row.severity_bin,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  };
  const deleteAssessment = async (id: string) => {
    const { error } = await supabase.from('assessments').delete().eq('id', id).eq('user_id', user?.id);
    if (error) throw error;
  };
  const signInWithOAuth = async (provider: OAuthProvider, options?: { nextTo?: string }) => {
    // Remember where the user was heading so the OAuth callback can return
    // them there after the (page-reloading) provider redirect.
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const nextTo = options?.nextTo ?? (isAuthScreen(currentPath) ? '/' : currentPath);
    try {
      sessionStorage.setItem(AUTH_RETURN_TO_KEY, nextTo);
    } catch {
      // Best effort only.
    }
    const scopes = getProvider(provider).scopes;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as never,
      options: {
        redirectTo: buildOAuthRedirectTo(window.location.origin, nextTo),
        ...(scopes ? { scopes } : {}),
      },
    });
    if (error) throw error;
  };
  /** Link an additional provider identity to the signed-in account. */
  const linkIdentity = async (provider: OAuthProvider) => {
    const { error } = await supabase.auth.linkIdentity({
      provider: provider as never,
      options: { redirectTo: buildOAuthRedirectTo(window.location.origin, '/settings') },
    });
    if (error) throw error;
  };
  /** Remove a linked provider identity from the signed-in account. */
  const unlinkIdentity = async (provider: OAuthProvider) => {
    const identities = await getUserIdentities();
    const target = identities.find((identity) => identity.provider === provider);
    if (!target) throw new Error(`No linked ${provider} identity found.`);
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    const match = (data?.identities ?? []).find((identity) => identity.identity_id === target.identityId);
    if (!match) throw new Error(`No linked ${provider} identity found.`);
    const unlinkError = (await (supabase.auth as any).unlinkIdentity(match))?.error;
    if (unlinkError) throw unlinkError;
  };
  /** List the provider identities linked to the signed-in account. */
  const getUserIdentities = async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (error) throw error;
    return (data?.identities ?? []).map((identity) => ({
      provider: String(identity.provider),
      identityId: String(identity.identity_id ?? identity.id ?? ''),
      email:
        typeof (identity.identity_data as Record<string, unknown> | null)?.email === 'string'
          ? ((identity.identity_data as Record<string, unknown>).email as string)
          : null,
    }));
  };
  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signInWithGoogle: () => signInWithOAuth('google'),
        signInWithOAuth,
        linkIdentity,
        unlinkIdentity,
        getUserIdentities,
        signUpWithEmail,
        signInWithEmailAndPassword: signIn,
        signInWithEmail: signIn,
        signOut,
        signOutUser: signOut,
        sendPasswordResetEmail: async (email) => {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/update-password`,
          });
          if (error) throw error;
        },
        resetPassword: async (email) => {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/update-password`,
          });
          if (error) throw error;
        },
        updatePassword,
        updateUserProfile,
        saveAssessment,
        fetchUserAssessments,
        deleteAssessment,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
