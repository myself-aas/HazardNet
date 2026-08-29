import { createContext, useContext, useEffect, useState } from 'react';
import type { User as SupabaseAuthUser, UserResponse } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { seedFromIdentity } from '../lib/username';
import {
  AUTH_RETURN_TO_KEY,
  OAuthProviderId,
  buildOAuthRedirectTo,
  getProvider,
  mapProviderUserMetadata,
} from '../lib/oauthProviders';

/** Auth screens themselves are never a useful post-login destination. */
const isAuthScreen = (path: string) =>
  /^\/(login|signup|forgot-password|update-password|set-password|auth|u)(\/|$)/.test(path);

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
  username?: string;
  photoURL?: string;
  avatarPath?: string;
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
  /* Extended dashboard fields (scripts/db/003_user_dashboard.sql). */
  firstName?: string;
  lastName?: string;
  bio?: string;
  website?: string;
  whatsappNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  pronouns?: string;
  nationality?: string;
  preferredLanguage?: string;
  timezone?: string;
  country?: string;
  division?: string;
  district?: string;
  upazila?: string;
  village?: string;
  postalCode?: string;
  address?: string;
  occupation?: string;
  farmingExperienceYears?: number;
  irrigationType?: string;
  soilType?: string;
  livestock?: string;
  annualIncomeBdt?: number;
  socialFacebook?: string;
  socialX?: string;
  socialLinkedin?: string;
  socialGithub?: string;
  socialYoutube?: string;
  socialInstagram?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  notifyWeeklyDigest?: boolean;
  notifyEmergencyAlerts?: boolean;
  marketingOptIn?: boolean;
  profileVisibility?: 'public' | 'private';
  emailVerified?: boolean;
  onboardingCompleted?: boolean;
  lastLoginAt?: string;
  loginCount?: number;
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
  /**
   * Passwordless email verification: sends a verification link (magic link)
   * to `email`, creating the account when it doesn't exist yet. The link
   * lands on /auth/callback, which forwards to /set-password so the user
   * can choose their password. `displayName`/`username` travel as signup
   * user-metadata so the profile trigger can claim them.
   */
  sendVerificationEmail: (
    email: string,
    options?: { nextTo?: string; displayName?: string; username?: string },
  ) => Promise<void>;
  /** True when the username is free and matches the format rules. */
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  /** Change the account email (Supabase re-verifies the new address). */
  changeEmail: (email: string) => Promise<void>;
  /** Re-fetch the profiles row from Supabase. */
  refreshProfile: () => Promise<void>;
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
  username: (row.username as string | undefined) ?? undefined,
  photoURL: (row.photo_url as string | undefined) || undefined,
  avatarPath: (row.avatar_path as string | undefined) ?? undefined,
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
  firstName: (row.first_name as string | undefined) ?? undefined,
  lastName: (row.last_name as string | undefined) ?? undefined,
  bio: (row.bio as string | undefined) ?? undefined,
  website: (row.website as string | undefined) ?? undefined,
  whatsappNumber: (row.whatsapp_number as string | undefined) ?? undefined,
  dateOfBirth: (row.date_of_birth as string | undefined) ?? undefined,
  gender: (row.gender as string | undefined) ?? undefined,
  pronouns: (row.pronouns as string | undefined) ?? undefined,
  nationality: (row.nationality as string | undefined) ?? undefined,
  preferredLanguage: (row.preferred_language as string | undefined) ?? undefined,
  timezone: (row.timezone as string | undefined) ?? undefined,
  country: (row.country as string | undefined) ?? undefined,
  division: (row.division as string | undefined) ?? undefined,
  district: (row.district as string | undefined) ?? undefined,
  upazila: (row.upazila as string | undefined) ?? undefined,
  village: (row.village as string | undefined) ?? undefined,
  postalCode: (row.postal_code as string | undefined) ?? undefined,
  address: (row.address as string | undefined) ?? undefined,
  occupation: (row.occupation as string | undefined) ?? undefined,
  farmingExperienceYears: (row.farming_experience_years as number | undefined) ?? undefined,
  irrigationType: (row.irrigation_type as string | undefined) ?? undefined,
  soilType: (row.soil_type as string | undefined) ?? undefined,
  livestock: (row.livestock as string | undefined) ?? undefined,
  annualIncomeBdt: (row.annual_income_bdt as number | undefined) ?? undefined,
  socialFacebook: (row.social_facebook as string | undefined) ?? undefined,
  socialX: (row.social_x as string | undefined) ?? undefined,
  socialLinkedin: (row.social_linkedin as string | undefined) ?? undefined,
  socialGithub: (row.social_github as string | undefined) ?? undefined,
  socialYoutube: (row.social_youtube as string | undefined) ?? undefined,
  socialInstagram: (row.social_instagram as string | undefined) ?? undefined,
  notifyEmail: (row.notify_email as boolean | undefined) ?? undefined,
  notifySms: (row.notify_sms as boolean | undefined) ?? undefined,
  notifyPush: (row.notify_push as boolean | undefined) ?? undefined,
  notifyWeeklyDigest: (row.notify_weekly_digest as boolean | undefined) ?? undefined,
  notifyEmergencyAlerts: (row.notify_emergency_alerts as boolean | undefined) ?? undefined,
  marketingOptIn: (row.marketing_opt_in as boolean | undefined) ?? undefined,
  profileVisibility: row.profile_visibility === 'private' ? 'private' : 'public',
  emailVerified: Boolean(row.email_verified_at) || undefined,
  onboardingCompleted: (row.onboarding_completed as boolean | undefined) ?? undefined,
  lastLoginAt: (row.last_login_at as string | undefined) ?? undefined,
  loginCount: (row.login_count as number | undefined) ?? undefined,
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
      username: seedFromIdentity(seed.displayName, authUser.email ?? seed.email),
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
    // Best-effort login telemetry (last_login_at / login_count).
    if (isSupabaseConfigured) {
      try {
        await supabase.rpc('record_login');
      } catch {
        // Non-fatal.
      }
    }
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
  const sendVerificationEmail = async (email: string, options?: { nextTo?: string; displayName?: string; username?: string }) => {
    // Passwordless verification: the emailed link both verifies the address
    // and opens a session that allows choosing a password on /set-password.
    const nextTo = options?.nextTo ?? '/set-password';
    const metadata: Record<string, string> = {};
    if (options?.displayName) metadata.display_name = options.displayName;
    if (options?.username) metadata.username = options.username;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        ...(Object.keys(metadata).length > 0 ? { data: metadata } : {}),
        emailRedirectTo:
          import.meta.env.VITE_SUPABASE_REDIRECT_URL ??
          buildOAuthRedirectTo(window.location.origin, nextTo),
      },
    });
    if (error) throw error;
  };
  const checkUsernameAvailability = async (username: string) => {
    if (!isSupabaseConfigured) return true; // dev mock — everything is free
    // Escape LIKE wildcards so names like `ashif_ahmed` match exactly.
    const pattern = username.replace(/[_%]/g, (character) => `\\${character}`);
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', pattern)
      .maybeSingle();
    if (error) throw error;
    return !data;
  };
  const changeEmail = async (email: string) => {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw error;
    if (isSupabaseConfigured && user) {
      // Keep the pending address visible on the profile row immediately.
      await supabase.from('profiles').update({ email }).eq('id', user.id);
    }
  };
  const refreshProfile = async () => {
    if (user) await loadProfile(user);
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
        sendVerificationEmail,
        checkUsernameAvailability,
        changeEmail,
        refreshProfile,
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
