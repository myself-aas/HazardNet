import { createContext, useContext, useEffect, useState } from 'react';
import type { User as FirebaseAuthUser, UserInfo } from 'firebase/auth';
import { auth, db } from '../services/firebase';
import {
  createUserWithEmailAndPassword,
  deleteUser as fbDeleteUser,
  fetchSignInMethodsForEmail,
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  reload as fbReload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  unlink as fbUnlink,
  updateEmail as fbUpdateEmail,
  updatePassword as fbUpdatePassword,
  updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { RESERVED_USERNAMES, seedFromIdentity } from '../lib/username';
import { AUTH_RETURN_TO_KEY, type OAuthProviderId, getProvider } from '../lib/oauthProviders';

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
  /* Extended dashboard fields. */
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

export interface LinkedIdentityView {
  provider: string;
  identityId: string;
  email: string | null;
}

export interface AuthContextType {
  user: AppUser | null;
  userProfile: UserProfileData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider, options?: { nextTo?: string }) => Promise<void>;
  linkIdentity: (provider: OAuthProvider) => Promise<void>;
  unlinkIdentity: (provider: OAuthProvider) => Promise<void>;
  getUserIdentities: () => Promise<LinkedIdentityView[]>;
  signUpWithEmail: (
    email: string,
    pass: string,
    name: string,
    initialProfile?: Partial<UserProfileData>,
  ) => Promise<'session' | 'confirmation-required'>;
  /** Send the Firebase email verification link to the current user's address. */
  sendVerificationEmail: (
    email: string,
    options?: { nextTo?: string; displayName?: string; username?: string },
  ) => Promise<void>;
  /** True when the username is free and matches the format rules. */
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  /** Change the account email (Firebase re-verifies the new address). */
  changeEmail: (email: string) => Promise<void>;
  /** Re-fetch the profiles document from Firestore. */
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

/**
 * Robust camelCase -> snake_case that handles consecutive capitals (photoURL -> photo_url).
 * 1. Insert _ between lower/digit and upper: aB -> a_B
 * 2. Insert _ between acronym and next word: URLLoader -> URL_Loader, then lowercased
 */
function toSnakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

const toProfile = (row: Record<string, unknown>, fallbackId?: string): UserProfileData => {
  // row may contain `id` (written by writeProfile) or may be missing; fallback to doc id
  const uid = (typeof row.id === 'string' && row.id) || (typeof row.uid === 'string' && row.uid) || fallbackId || '';
  return {
    uid,
    email: typeof row.email === 'string' ? row.email : '',
    displayName: typeof row.display_name === 'string' ? row.display_name : (typeof row.displayName === 'string' ? (row.displayName as string) : 'User'),
    username: typeof row.username === 'string' ? row.username : undefined,
    photoURL: typeof row.photo_url === 'string' ? row.photo_url : (typeof row.photoURL === 'string' ? (row.photoURL as string) : undefined),
    avatarPath: typeof row.avatar_path === 'string' ? row.avatar_path : (typeof row.avatarPath === 'string' ? (row.avatarPath as string) : undefined),
    role: row.role as UserProfileData['role'],
    userRole: (row.user_role as UserRolePersona) ?? (row.userRole as UserRolePersona),
    organization: (row.organization as string) ?? undefined,
    farmSizeHectares: (row.farm_size_hectares as number) ?? (row.farmSizeHectares as number) ?? undefined,
    primaryDivision: (row.primary_division as string) ?? (row.primaryDivision as string) ?? undefined,
    primaryDistrict: (row.primary_district as string) ?? (row.primaryDistrict as string) ?? undefined,
    homeDistrictId: (row.home_district_id as string) ?? (row.homeDistrictId as string) ?? undefined,
    homeDistrictName: (row.home_district_name as string) ?? (row.homeDistrictName as string) ?? undefined,
    autoDetectLocationEnabled: (row.auto_detect_location_enabled as boolean) ?? (row.autoDetectLocationEnabled as boolean) ?? undefined,
    targetCrops: (row.target_crops as string) ?? (row.targetCrops as string) ?? undefined,
    phoneNumber: (row.phone_number as string) ?? (row.phoneNumber as string) ?? undefined,
    pinpointLat: (row.pinpoint_lat as number) ?? (row.pinpointLat as number) ?? undefined,
    pinpointLng: (row.pinpoint_lng as number) ?? (row.pinpointLng as number) ?? undefined,
    firstName: (row.first_name as string) ?? (row.firstName as string) ?? undefined,
    lastName: (row.last_name as string) ?? (row.lastName as string) ?? undefined,
    bio: row.bio as string | undefined,
    website: row.website as string | undefined,
    whatsappNumber: (row.whatsapp_number as string) ?? (row.whatsappNumber as string) ?? undefined,
    dateOfBirth: (row.date_of_birth as string) ?? (row.dateOfBirth as string) ?? undefined,
    gender: row.gender as string | undefined,
    pronouns: row.pronouns as string | undefined,
    nationality: row.nationality as string | undefined,
    preferredLanguage: (row.preferred_language as string) ?? (row.preferredLanguage as string) ?? undefined,
    timezone: row.timezone as string | undefined,
    country: row.country as string | undefined,
    division: row.division as string | undefined,
    district: row.district as string | undefined,
    upazila: row.upazila as string | undefined,
    village: row.village as string | undefined,
    postalCode: (row.postal_code as string) ?? (row.postalCode as string) ?? undefined,
    address: row.address as string | undefined,
    occupation: row.occupation as string | undefined,
    farmingExperienceYears: (row.farming_experience_years as number) ?? (row.farmingExperienceYears as number) ?? undefined,
    irrigationType: (row.irrigation_type as string) ?? (row.irrigationType as string) ?? undefined,
    soilType: (row.soil_type as string) ?? (row.soilType as string) ?? undefined,
    livestock: row.livestock as string | undefined,
    annualIncomeBdt: (row.annual_income_bdt as number) ?? (row.annualIncomeBdt as number) ?? undefined,
    socialFacebook: (row.social_facebook as string) ?? (row.socialFacebook as string) ?? undefined,
    socialX: (row.social_x as string) ?? (row.socialX as string) ?? undefined,
    socialLinkedin: (row.social_linkedin as string) ?? (row.socialLinkedin as string) ?? undefined,
    socialGithub: (row.social_github as string) ?? (row.socialGithub as string) ?? undefined,
    socialYoutube: (row.social_youtube as string) ?? (row.socialYoutube as string) ?? undefined,
    socialInstagram: (row.social_instagram as string) ?? (row.socialInstagram as string) ?? undefined,
    notifyEmail: (row.notify_email as boolean) ?? (row.notifyEmail as boolean) ?? undefined,
    notifySms: (row.notify_sms as boolean) ?? (row.notifySms as boolean) ?? undefined,
    notifyPush: (row.notify_push as boolean) ?? (row.notifyPush as boolean) ?? undefined,
    notifyWeeklyDigest: (row.notify_weekly_digest as boolean) ?? (row.notifyWeeklyDigest as boolean) ?? undefined,
    notifyEmergencyAlerts: (row.notify_emergency_alerts as boolean) ?? (row.notifyEmergencyAlerts as boolean) ?? undefined,
    marketingOptIn: (row.marketing_opt_in as boolean) ?? (row.marketingOptIn as boolean) ?? undefined,
    profileVisibility: row.profile_visibility === 'private' ? 'private' : (row.profileVisibility === 'private' ? 'private' : 'public'),
    emailVerified: Boolean(row.email_verified_at) || (row.emailVerified as boolean) || undefined,
    onboardingCompleted: (row.onboarding_completed as boolean) ?? (row.onboardingCompleted as boolean) ?? undefined,
    lastLoginAt: (row.last_login_at as string) ?? (row.lastLoginAt as string) ?? undefined,
    loginCount: (row.login_count as number) ?? (row.loginCount as number) ?? undefined,
    createdAt: (row.created_at as string) ?? (row.createdAt as string) ?? undefined,
    updatedAt: (row.updated_at as string) ?? (row.updatedAt as string) ?? undefined,
  };
};

/** Resolve the Firebase Auth provider instance for a HazardNet provider id. */
function providerFor(id: OAuthProviderId) {
  switch (id) {
    case 'google': {
      const provider = new GoogleAuthProvider();
      try {
        provider.setCustomParameters({ prompt: 'select_account' });
      } catch {}
      return provider;
    }
    case 'github': {
      const provider = new GithubAuthProvider();
      try {
        provider.addScope('read:user');
        provider.addScope('user:email');
      } catch {}
      return provider;
    }
    default:
      throw new Error(`Unsupported provider: ${id}`);
  }
}

/** Ensure username is not reserved; if reserved, append a suffix. */
function ensureNonReservedUsername(username: string): string {
  let candidate = username;
  if (!RESERVED_USERNAMES.has(candidate)) return candidate;
  // Append _1, _2 etc until free (max 5 tries)
  for (let i = 1; i <= 5; i++) {
    const withSuffix = `${candidate.slice(0, 18)}_${i}`;
    if (!RESERVED_USERNAMES.has(withSuffix)) return withSuffix;
  }
  return `farmer_${candidate.slice(0, 8)}`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (authUser: FirebaseAuthUser) => {
    try {
      const docSnap = await getDoc(doc(db, 'profiles', authUser.uid));
      const data = docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
      if (data) setUserProfile(toProfile(data as Record<string, unknown>, authUser.uid));
      return data;
    } catch (e) {
      console.warn('Profile load exception:', e);
      return null;
    }
  };

  useEffect(() => {
    let mounted = true;

    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user && mounted) {
          const profile = await loadProfile(result.user);
          if (!profile) await bootstrapProfile(result.user);
          await recordLogin(result.user);
        }
      } catch (e) {
        console.warn('Redirect result handling failed:', e);
      }
    };

    const initAuth = async () => {
      try {
        await handleRedirectResult();
        const authUser = auth.currentUser;
        if (mounted) {
          setUser(toAppUser(authUser));
          if (authUser) {
            const profile = await loadProfile(authUser);
            if (!profile) await bootstrapProfile(authUser);
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
            if (!profile) return bootstrapProfile(next);
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

  /** Resolve a fresh Firebase user (force refresh, so emailVerified is current). */
  const refreshAuthUser = async (): Promise<FirebaseAuthUser> => {
    if (!auth.currentUser) throw new Error('Not authenticated.');
    await fbReload(auth.currentUser);
    if (!auth.currentUser) throw new Error('Not authenticated after reload.');
    return auth.currentUser;
  };

  /** Create or update the profiles document. Trigger source of profile state. */
  const writeProfile = async (profile: UserProfileData): Promise<void> => {
    const now = new Date().toISOString();
    const safeUsername = profile.username ? ensureNonReservedUsername(profile.username) : undefined;
    const row: Record<string, unknown> = {
      id: profile.uid,
      uid: profile.uid,
      email: profile.email,
      display_name: profile.displayName,
      role: profile.role ?? 'user',
      user_role: profile.userRole ?? 'smallholder_farmer',
      organization: profile.organization ?? '',
      farm_size_hectares: profile.farmSizeHectares ?? 1.5,
      primary_division: profile.primaryDivision ?? '',
      primary_district: profile.primaryDistrict ?? '',
      auto_detect_location_enabled: profile.autoDetectLocationEnabled ?? false,
      target_crops: profile.targetCrops ?? '',
      phone_number: profile.phoneNumber ?? '',
      photo_url: profile.photoURL ?? '',
      avatar_path: profile.avatarPath ?? '',
      profile_visibility: profile.profileVisibility ?? 'public',
      email_verified_at: profile.emailVerified ? now : null,
      created_at: profile.createdAt ?? now,
      updated_at: now,
    };
    if (safeUsername) row.username = safeUsername;
    // Use setDoc merge to ensure creation even if doc missing
    await setDoc(doc(db, 'profiles', profile.uid), row, { merge: true });
    try {
      if (auth.currentUser) await loadProfile(auth.currentUser);
    } catch (e) {
      console.warn('Post-write profile reload failed:', e);
    }
  };

  /** Build a full profile the first time a user appears (sign-up or OAuth). */
  const makeProfileSeed = (
    authUser: FirebaseAuthUser,
    name?: string,
    initialProfile?: Partial<UserProfileData>,
  ): UserProfileData => {
    const now = new Date().toISOString();
    const existing = authUser.providerData?.[0];
    const displayName =
      name?.trim() || authUser.displayName || existing?.displayName || authUser.email?.split('@')[0] || 'User';
    const avatarUrl = authUser.photoURL ?? existing?.photoURL ?? '';
    const rawUsername = initialProfile?.username ?? seedFromIdentity(displayName, authUser.email ?? '');
    return {
      uid: authUser.uid,
      email: authUser.email ?? existing?.email ?? '',
      displayName,
      username: ensureNonReservedUsername(rawUsername),
      photoURL: avatarUrl || undefined,
      avatarPath: undefined,
      role: initialProfile?.role ?? 'user',
      userRole: initialProfile?.userRole ?? 'smallholder_farmer',
      organization: initialProfile?.organization ?? '',
      farmSizeHectares: initialProfile?.farmSizeHectares ?? 1.5,
      primaryDivision: initialProfile?.primaryDivision ?? '',
      primaryDistrict: initialProfile?.primaryDistrict ?? '',
      autoDetectLocationEnabled: initialProfile?.autoDetectLocationEnabled ?? false,
      targetCrops: initialProfile?.targetCrops ?? '',
      phoneNumber: initialProfile?.phoneNumber ?? '',
      profileVisibility: initialProfile?.profileVisibility ?? 'public',
      emailVerified: Boolean(authUser.emailVerified),
      createdAt: now,
      updatedAt: now,
    };
  };

  /** First-write the profiles doc if it does not already exist. */
  const bootstrapProfile = async (authUser: FirebaseAuthUser) => {
    try {
      const docRef = doc(db, 'profiles', authUser.uid);
      const dSnap = await getDoc(docRef);
      if (!dSnap.exists()) {
        await writeProfile(makeProfileSeed(authUser));
      } else {
        await loadProfile(authUser);
      }
    } catch (e) {
      console.warn('Profile bootstrap failed:', e);
    }
  };

  /** Record a successful sign-in on the profile (login count / last login). */
  const recordLogin = async (authUser: FirebaseAuthUser) => {
    try {
      const docRef = doc(db, 'profiles', authUser.uid);
      const dSnap = await getDoc(docRef);
      const data = dSnap.exists() ? { id: dSnap.id, ...dSnap.data() } : null;
      const now = new Date().toISOString();
      const existingCount = typeof (data as Record<string, unknown> | null)?.login_count === 'number'
        ? ((data as Record<string, unknown>).login_count as number)
        : (typeof (data as Record<string, unknown> | null)?.loginCount === 'number'
            ? ((data as Record<string, unknown>).loginCount as number)
            : 0);
      // Use setDoc merge so it works even if profile doesn't exist yet
      await setDoc(docRef, {
        last_login_at: now,
        login_count: existingCount + 1,
        updated_at: now,
      }, { merge: true });
    } catch (e) {
      console.warn('Could not record login:', e);
    }
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    name: string,
    initialProfile?: Partial<UserProfileData>,
  ): Promise<'session' | 'confirmation-required'> => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (!cred.user) throw new Error('Account creation did not return a user.');
      if (name.trim()) {
        try {
          await fbUpdateProfile(cred.user, { displayName: name.trim() });
        } catch (e) {
          console.warn('Display-name update skipped:', e);
        }
      }
      // Best effort email verification — failure should not block sign-up
      try {
        const current = auth.currentUser ?? cred.user;
        if (current && !current.emailVerified) {
          await sendEmailVerification(current);
        }
      } catch (e) {
        console.warn('Verification email skipped:', e);
      }
      try {
        const current = await refreshAuthUser();
        await writeProfile(makeProfileSeed(current, name.trim(), initialProfile));
        return current.emailVerified ? 'session' : 'confirmation-required';
      } catch (profileError) {
        console.warn('Profile creation after sign-up failed, but auth succeeded:', profileError);
        // Still try to bootstrap with cred.user if refresh failed
        try {
          await writeProfile(makeProfileSeed(cred.user, name.trim(), initialProfile));
        } catch (e) {
          console.warn('Fallback profile write failed:', e);
        }
        return 'confirmation-required';
      }
    } catch (e) {
      // Re-throw with Firebase code preserved for UI
      throw e;
    }
  };

  const signIn = async (email: string, pass: string): Promise<EmailCredential> => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    // Load profile eagerly so UI has it
    try {
      const profile = await loadProfile(cred.user);
      if (!profile) await bootstrapProfile(cred.user);
    } catch (e) {
      console.warn('Post sign-in profile bootstrap failed:', e);
    }
    await recordLogin(cred.user);
    return cred;
  };

  const signInWithOAuth = async (provider: OAuthProvider, options?: { nextTo?: string }) => {
    // Resolve intended return path: explicit option > ?next= param > current path (if not auth screen) > /
    let nextFromQuery: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      const rawNext = params.get('next');
      if (rawNext && rawNext.startsWith('/')) nextFromQuery = rawNext;
    } catch {}
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const nextTo = options?.nextTo ?? nextFromQuery ?? (isAuthScreen(currentPath) ? '/' : currentPath);
    try {
      sessionStorage.setItem(AUTH_RETURN_TO_KEY, nextTo);
    } catch {
      // Best effort only.
    }
    try {
      const result = await signInWithPopup(auth, providerFor(provider));
      const profile = await loadProfile(result.user);
      if (!profile) await bootstrapProfile(result.user);
      await recordLogin(result.user);
    } catch (e: any) {
      const code = e?.code ? String(e.code) : '';
      const message = e instanceof Error ? e.message : String(e);
      const text = `${code} ${message}`.toLowerCase();

      // Handle account-exists-with-different-credential: tell user which provider to use
      if (text.includes('account-exists-with-different-credential')) {
        const email = e?.customData?.email || e?.email || '';
        if (email) {
          try {
            const methods = await fetchSignInMethodsForEmail(auth, email);
            const hint = methods.length > 0 ? ` Try signing in with ${methods.join(' or ')} first, then link ${provider} from your dashboard.` : '';
            throw Object.assign(new Error(`An account already exists with ${email} using a different sign-in method.${hint}`), { code: e.code });
          } catch (fetchErr) {
            // If fetching methods fails, fall through to original error
            if ((fetchErr as any)?.message?.includes('account already exists')) throw fetchErr;
          }
        }
      }

      // Popup blocked / closed — try redirect as fallback for better UX
      if (text.includes('popup-blocked') || text.includes('popup closed') || text.includes('popup_closed') || text.includes('blocked')) {
        try {
          // For blocked popup, attempt redirect flow which will land on /auth/callback
          await signInWithRedirect(auth, providerFor(provider));
          return; // Redirect will navigate away
        } catch (redirectErr) {
          console.warn('Redirect fallback failed:', redirectErr);
          // Fall through to throw original popup error
        }
      }

      throw e;
    }
  };

  const signInWithGoogle = () => signInWithOAuth('google');

  /** Link an additional provider identity to the signed-in account. */
  const linkIdentity = async (provider: OAuthProvider) => {
    if (!auth.currentUser) throw new Error('Must be signed in to link an account.');
    try {
      await linkWithPopup(auth.currentUser, providerFor(provider));
      await refreshProfile();
    } catch (e: any) {
      // Improve message for already linked etc.
      throw e;
    }
  };

  /** Remove a linked provider identity from the signed-in account. */
  const unlinkIdentity = async (provider: OAuthProvider) => {
    if (!auth.currentUser) throw new Error('Must be signed in to unlink an account.');
    const targetId = getProvider(provider).firebaseProviderId;
    const target = auth.currentUser.providerData.find((p) => p.providerId === targetId);
    if (!target) throw new Error(`No linked ${getProvider(provider).label} identity found.`);
    if (auth.currentUser.providerData.length <= 1) {
      throw new Error('Add another sign-in method before removing the last one.');
    }
    await fbUnlink(auth.currentUser, targetId);
    await refreshProfile();
  };

  /** List the provider identities linked to the signed-in account. */
  const getUserIdentities = async (): Promise<LinkedIdentityView[]> => {
    const data = auth.currentUser?.providerData ?? [];
    return data.map((p) => ({
      provider: p.providerId === 'google.com' ? 'google' : p.providerId === 'github.com' ? 'github' : p.providerId,
      identityId: p.uid ?? '',
      email: p.email ?? null,
    }));
  };

  const updatePassword = async (password: string) => {
    if (!auth.currentUser) throw new Error('Not authenticated.');
    await fbUpdatePassword(auth.currentUser, password);
  };

  /**
   * Send the Firebase email verification link for the given address.
   * The link verifies the address; after clicking it the user signs back in
   * and the profile reflects the verified state.
   */
  const sendVerificationEmail = async (
    email: string,
    options?: { nextTo?: string; displayName?: string; username?: string },
  ) => {
    const current = auth.currentUser;
    let actionCodeSent = false;
    if (current && current.email === email && !current.emailVerified) {
      try {
        await sendEmailVerification(current);
        actionCodeSent = true;
      } catch (e) {
        console.warn('Verification email to current user failed:', e);
        throw e;
      }
    }
    if (!actionCodeSent) {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, email);
        if (methods.length > 0) {
          throw Object.assign(new Error('Email already registered — sign in instead, or reset your password.'), {
            code: 'auth/email-already-in-use',
          });
        }
      } catch (e: any) {
        if (e?.code === 'auth/email-already-in-use') throw e;
        // If fetch fails for other reason, continue to throw no-current-user
        console.warn('fetchSignInMethods failed:', e);
      }
      throw Object.assign(new Error('Verification link is sent after sign-up; create the account first or sign in to resend.'), {
        code: 'auth/no-current-user',
      });
    }
    try {
      if (current) await loadProfile(current);
    } catch {}
    void options;
  };

  const checkUsernameAvailability = async (username: string) => {
    try {
      const trimmed = username.trim().toLowerCase();
      if (!trimmed) return false;
      // Quick reserved check
      if (RESERVED_USERNAMES.has(trimmed)) return false;
      const q = query(collection(db, 'profiles'), where('username', '==', trimmed));
      const snap = await getDocs(q);
      return snap.empty;
    } catch (e) {
      console.warn('Username availability check failed, assuming available to avoid blocking:', e);
      // Return true to avoid blocking sign-up when offline, but log warning
      return true;
    }
  };

  const changeEmail = async (email: string) => {
    if (!auth.currentUser) throw new Error('Not authenticated.');
    await fbUpdateEmail(auth.currentUser, email);
    if (user) {
      try {
        await setDoc(doc(db, 'profiles', user.uid), { email, updated_at: new Date().toISOString() }, { merge: true });
      } catch (e) {
        console.warn('Profile email update failed:', e);
      }
    }
    await refreshProfile();
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } finally {
      setUser(null);
      setUserProfile(null);
      try {
        sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
      } catch {
        try { sessionStorage.clear(); } catch {}
      }
    }
  };

  const updateUserProfile = async (data: Partial<UserProfileData>) => {
    if (!user) {
      setUserProfile((prev) => (prev ? { ...prev, ...data } : null));
      return;
    }
    const row = Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [toSnakeCase(key), value]),
    );
    // Ensure we never write photo_u_r_l etc — toSnakeCase fixes it
    await setDoc(doc(db, 'profiles', user.uid), { ...row, updated_at: new Date().toISOString() }, { merge: true });
    await loadProfile(user as unknown as FirebaseAuthUser);
  };

  const saveAssessment = async (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => {
    if (!user) throw new Error('Must be authenticated to save assessments.');
    const row: Record<string, unknown> = {
      user_id: user.uid,
      created_at: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(data)) {
      row[toSnakeCase(key)] = value;
    }
    const docRef = await addDoc(collection(db, 'assessments'), row);
    return docRef.id;
  };

  const fetchUserAssessments = async (): Promise<UserAssessment[]> => {
    if (!user) return [];
    try {
      const q = query(collection(db, 'assessments'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map((d) => {
        const row = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          userId: String(row.user_id ?? row.userId ?? ''),
          userEmail: user.email ?? '',
          districtId: String(row.district_id ?? row.districtId ?? ''),
          districtName: String(row.district_name ?? row.districtName ?? ''),
          primaryHazard: String(row.primary_hazard ?? row.primaryHazard ?? ''),
          confidence: Number(row.confidence ?? 0),
          severityScore: Number(row.severity_score ?? row.severityScore ?? 0),
          severityBin: (row.severity_bin ?? row.severityBin) as string | undefined,
          notes: row.notes as string | undefined,
          createdAt: String(row.created_at ?? row.createdAt ?? ''),
        };
      });
    } catch (e) {
      console.warn('fetchUserAssessments failed:', e);
      return [];
    }
  };

  const deleteAssessment = async (id: string) => {
    await deleteDoc(doc(db, 'assessments', id));
  };

  const refreshProfile = async () => {
    const current = auth.currentUser;
    if (current) await loadProfile(current);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signInWithGoogle,
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
          await sendPasswordResetEmail(auth, email);
        },
        resetPassword: async (email) => {
          await sendPasswordResetEmail(auth, email);
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
