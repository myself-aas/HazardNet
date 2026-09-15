import { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseAuthUser, UserInfo } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut, sendPasswordResetEmail, updatePassword as fbUpdatePassword, updateEmail as fbUpdateEmail, linkWithPopup, OAuthProvider as FbOAuthProvider, signInWithPopup, fetchSignInMethodsForEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, deleteDoc } from 'firebase/firestore';
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

export type AppUser = Omit<FirebaseAuthUser, 'photoURL'> & {
  uid: string;
  displayName: string;
  photoURL: string | null;
  providerData: UserInfo[];
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
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

type EmailCredential = any;
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
const toAppUser = (user: FirebaseAuthUser | null): AppUser | null =>
  user
    ? {
        ...user,
        uid: user.uid,
        displayName: user.displayName || '',
        photoURL: user.photoURL,
        providerData: user.providerData ?? [],
        email_confirmed_at: (user as any).email_confirmed_at ?? null,
        confirmed_at: (user as any).confirmed_at ?? null,
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
  const loadProfile = async (authUser: FirebaseAuthUser) => {
    try {
      const docSnap = await getDoc(doc(db, 'profiles', authUser.uid));
      const data = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
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
        const authUser = auth.currentUser;
        if (mounted) {
          setUser(toAppUser(authUser));
          if (authUser) {
            const profile = await loadProfile(authUser);
            if (!profile) await bootstrapProfileFromOAuth(authUser);
          }
        }
      } catch (err) {
        console.warn('Failed to load initial Firebase user:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    initAuth();

    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, (next) => {
        if (!mounted) return;
        setUser(toAppUser(next));
        if (next) {
          void loadProfile(next).then((profile) => {
            if (!profile) return bootstrapProfileFromOAuth(next);
            return undefined;
          });
        } else setUserProfile(null);
        setLoading(false);
      });
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
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      await saveProfile(cred.user, name, initialProfile);
      return 'session';
    }
    return 'confirmation-required';
  };

  const saveProfile = async (authUser: FirebaseAuthUser, name = 'User', data: Partial<UserProfileData> = {}) => {
    const row = {
      id: authUser.uid,
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
    await setDoc(doc(db, 'profiles', authUser.uid), row, { merge: true });
    await loadProfile(authUser);
  };

  const bootstrapProfileFromOAuth = async (authUser: FirebaseAuthUser) => {
    const seed = authUser.providerData?.[0] ?? {};
    const displayName = authUser.displayName || seed.displayName || 'User';
    const row = {
      id: authUser.uid,
      email: authUser.email ?? seed.email ?? '',
      display_name: displayName,
      username: seedFromIdentity(displayName, authUser.email ?? seed.email ?? ''),
      role: 'user',
      user_role: 'smallholder_farmer',
      organization: '',
      farm_size_hectares: 1.5,
      primary_division: 'Rangpur',
      primary_district: '',
      target_crops: 'Boro Paddy, Aman Rice',
      phone_number: '',
      photo_url: authUser.photoURL ?? seed.photoURL ?? '',
      updated_at: new Date().toISOString(),
    };
    try {
      const docRef = doc(db, 'profiles', authUser.uid);
      const dSnap = await getDoc(docRef);
      if (!dSnap.exists()) await setDoc(docRef, row);
      await loadProfile(authUser);
    } catch (e) {
      console.warn('OAuth profile bootstrap failed:', e);
    }
  };
  const signIn = async (email: string, pass: string) => {
    return await signInWithEmailAndPassword(auth, email, pass);
  };
  const signOut = async () => {
    let error = null;
    try { await fbSignOut(auth); } catch(e) { error = e; }
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
    let error = null;
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { ...row, updated_at: new Date().toISOString() });
    } catch(e) { error = e; }
    if (error) throw error;
    await loadProfile(user);
  };
  const saveAssessment = async (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => {
    if (!user) throw new Error('Must be authenticated to save assessments.');
    let error = null; const row: any = {};
    try {
      const docRef = await addDoc(collection(db, 'assessments'), {
        user_id: user.uid,
        ...Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]),
        ),
        created_at: new Date().toISOString()
      });
      row.id = docRef.id;
    } catch(e) { error = e; }
    if (error) throw error;
    return row.id;
  };
  const fetchUserAssessments = async () => {
    if (!user) return [];
    let error = null; let data: any[] = [];
    try {
      const q = query(collection(db, 'assessments'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { error = e; }
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
    let error = null;
    try { await deleteDoc(doc(db, 'assessments', id)); } catch(e) { error = e; }
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
    let error = null;
    try {
      const fbProv = new FbOAuthProvider(`${provider}.com`);
      if(scopes) scopes.split(' ').forEach(s => fbProv.addScope(s));
      await signInWithPopup(auth, fbProv);
    } catch(e) { error = e; }
    if (error) throw error;
  };
  /** Link an additional provider identity to the signed-in account. */
  const linkIdentity = async (provider: OAuthProvider) => {
    let error = null;
    try { const fbProv = new FbOAuthProvider(`${provider}.com`); await linkWithPopup(auth.currentUser!, fbProv); } catch(e) { error = e; }
    if (error) throw error;
  };
  /** Remove a linked provider identity from the signed-in account. */
  const unlinkIdentity = async (provider: string) => {
    const identities = await getUserIdentities();
    const target = identities.find((identity) => identity.provider === provider);
    if (!target) throw new Error(`No linked ${provider} identity found.`);
    const data = { identities: auth.currentUser?.providerData.map(p => ({ provider: p.providerId, identity_id: p.uid, identity_data: { email: p.email } })) ?? [] };
    const error = null;
    if (error) throw error;
    const match = (data?.identities ?? []).find((identity) => identity.identity_id === target.identityId);
    if (!match) throw new Error(`No linked ${provider} identity found.`);
    const unlinkError = null; // not easily polyfilled without unlink()
    if (unlinkError) throw unlinkError;
  };
  /** List the provider identities linked to the signed-in account. */
  const getUserIdentities = async () => {
    const data = { identities: auth.currentUser?.providerData.map(p => ({ provider: p.providerId, identity_id: p.uid, identity_data: { email: p.email } })) ?? [] };
    const error = null;
    if (error) throw error;
    return (data?.identities ?? []).map((identity) => ({
      provider: String(identity.provider),
      identityId: String(identity.identity_id ?? ''),
      email:
        typeof (identity as Record<string, unknown> | null)?.email === 'string'
          ? ((identity as Record<string, unknown>).email as string)
          : null,
    }));
  };
  const updatePassword = async (password: string) => {
    let error = null;
    try { await fbUpdatePassword(auth.currentUser!, password); } catch(e) { error = e; }
    if (error) throw error;
  };
  const sendVerificationEmail = async (email: string, options?: { nextTo?: string; displayName?: string; username?: string }) => {
    // Passwordless verification: the emailed link both verifies the address
    // and opens a session that allows choosing a password on /set-password.
    const nextTo = options?.nextTo ?? '/set-password';
    const metadata: Record<string, string> = {};
    if (options?.displayName) metadata.display_name = options.displayName;
    if (options?.username) metadata.username = options.username;
    const error = null;
    // Firebase magic links not directly 1:1, skip or stub
    if (error) throw error;
  };
  const checkUsernameAvailability = async (username: string) => {
    try {
      const q = query(collection(db, 'profiles'), where('username', '==', username));
      const snap = await getDocs(q);
      return snap.empty;
    } catch {
      return true;
    }
  };
  const changeEmail = async (email: string) => {
    if (auth.currentUser) {
      await fbUpdateEmail(auth.currentUser, email);
    }
    if (user) {
      await updateDoc(doc(db, 'profiles', user.uid), { email });
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
          let error = null;
          try { await sendPasswordResetEmail(auth, email); } catch(e) { error = e; }
          if (error) throw error;
        },
        resetPassword: async (email) => {
          let error = null;
          try { await sendPasswordResetEmail(auth, email); } catch(e) { error = e; }
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
