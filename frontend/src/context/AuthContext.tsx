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
import { seedFromIdentity } from '../lib/username';
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

const toProfile = (row: Record<string, unknown>): UserProfileData => ({
  uid: row.id as string,
  email: typeof row.email === 'string' ? row.email : '',
  displayName: typeof row.display_name === 'string' ? row.display_name : 'User',
  username: typeof row.username === 'string' ? row.username : undefined,
  photoURL: typeof row.photo_url === 'string' ? row.photo_url : undefined,
  avatarPath: typeof row.avatar_path === 'string' ? row.avatar_path : undefined,
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
  firstName: row.first_name as string | undefined,
  lastName: row.last_name as string | undefined,
  bio: row.bio as string | undefined,
  website: row.website as string | undefined,
  whatsappNumber: row.whatsapp_number as string | undefined,
  dateOfBirth: row.date_of_birth as string | undefined,
  gender: row.gender as string | undefined,
  pronouns: row.pronouns as string | undefined,
  nationality: row.nationality as string | undefined,
  preferredLanguage: row.preferred_language as string | undefined,
  timezone: row.timezone as string | undefined,
  country: row.country as string | undefined,
  division: row.division as string | undefined,
  district: row.district as string | undefined,
  upazila: row.upazila as string | undefined,
  village: row.village as string | undefined,
  postalCode: row.postal_code as string | undefined,
  address: row.address as string | undefined,
  occupation: row.occupation as string | undefined,
  farmingExperienceYears: row.farming_experience_years as number | undefined,
  irrigationType: row.irrigation_type as string | undefined,
  soilType: row.soil_type as string | undefined,
  livestock: row.livestock as string | undefined,
  annualIncomeBdt: row.annual_income_bdt as number | undefined,
  socialFacebook: row.social_facebook as string | undefined,
  socialX: row.social_x as string | undefined,
  socialLinkedin: row.social_linkedin as string | undefined,
  socialGithub: row.social_github as string | undefined,
  socialYoutube: row.social_youtube as string | undefined,
  socialInstagram: row.social_instagram as string | undefined,
  notifyEmail: row.notify_email as boolean | undefined,
  notifySms: row.notify_sms as boolean | undefined,
  notifyPush: row.notify_push as boolean | undefined,
  notifyWeeklyDigest: row.notify_weekly_digest as boolean | undefined,
  notifyEmergencyAlerts: row.notify_emergency_alerts as boolean | undefined,
  marketingOptIn: row.marketing_opt_in as boolean | undefined,
  profileVisibility: row.profile_visibility === 'private' ? 'private' : 'public',
  emailVerified: Boolean(row.email_verified_at) || undefined,
  onboardingCompleted: row.onboarding_completed as boolean | undefined,
  lastLoginAt: row.last_login_at as string | undefined,
  loginCount: row.login_count as number | undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

/** Resolve the Firebase Auth provider instance for a HazardNet provider id. */
function providerFor(id: OAuthProviderId) {
  switch (id) {
    case 'google':
      return new GoogleAuthProvider();
    case 'github': {
      const provider = new GithubAuthProvider();
      provider.addScope('read:user');
      provider.addScope('user:email');
      return provider;
    }
    default:
      throw new Error(`Unsupported provider: ${id}`);
  }
}

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
    return auth.currentUser;
  };

  /** Create or update the profiles document. Trigger source of profile state. */
  const writeProfile = async (profile: UserProfileData): Promise<void> => {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      id: profile.uid,
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
      profile_visibility: profile.profileVisibility ?? 'public',
      email_verified_at: profile.emailVerified ? now : null,
      created_at: profile.createdAt ?? now,
      updated_at: now,
    };
    if (profile.username) row.username = profile.username;
    await setDoc(doc(db, 'profiles', profile.uid), row, { merge: true });
    await loadProfile(auth.currentUser!);
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
    return {
      uid: authUser.uid,
      email: authUser.email ?? existing?.email ?? '',
      displayName,
      username: initialProfile?.username ?? seedFromIdentity(displayName, authUser.email ?? ''),
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
      const dSnap = await getDoc(doc(db, 'profiles', authUser.uid));
      const data = dSnap.exists() ? { id: dSnap.id, ...dSnap.data() } : null;
      const now = new Date().toISOString();
      const existingCount = typeof (data as Record<string, unknown> | null)?.login_count === 'number'
        ? ((data as Record<string, unknown>).login_count as number)
        : 0;
      await updateDoc(doc(db, 'profiles', authUser.uid), {
        last_login_at: now,
        login_count: existingCount + 1,
        updated_at: now,
      });
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
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    if (cred.user) {
      if (name.trim()) {
        try {
          await fbUpdateProfile(cred.user, { displayName: name.trim() });
        } catch (e) {
          console.warn('Display-name update skipped:', e);
        }
      }
      const current = await refreshAuthUser();
      if (!current.emailVerified) {
        try {
          await sendEmailVerification(current);
        } catch (e) {
          console.warn('Verification email skipped:', e);
        }
      }
      await writeProfile(makeProfileSeed(current, name.trim(), initialProfile));
      return current.emailVerified ? 'session' : 'confirmation-required';
    }
    return 'confirmation-required';
  };

  const signIn = async (email: string, pass: string): Promise<EmailCredential> => {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await recordLogin(cred.user);
    return cred;
  };

  const signInWithOAuth = async (provider: OAuthProvider, options?: { nextTo?: string }) => {
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const nextTo = options?.nextTo ?? (isAuthScreen(currentPath) ? '/' : currentPath);
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const text = msg.toLowerCase();
      if (text.includes('popup') && text.includes('already') === false) {
        // Re-throw as-is; UI translates popup-blocked/closed messages.
      }
      throw e;
    }
  };

  const signInWithGoogle = () => signInWithOAuth('google');

  /** Link an additional provider identity to the signed-in account. */
  const linkIdentity = async (provider: OAuthProvider) => {
    if (!auth.currentUser) throw new Error('Must be signed in to link an account.');
    await linkWithPopup(auth.currentUser, providerFor(provider));
    await refreshProfile();
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
      }
    }
    if (!actionCodeSent) {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.length > 0) {
        throw Object.assign(new Error('Email already registered'), {
          code: 'auth/email-already-in-use',
        });
      }
      throw Object.assign(new Error('Verification link is sent after sign-up; create the account first.'), {
        code: 'auth/no-current-user',
      });
    }
    await loadProfile(current!);
    void options;
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
    if (!auth.currentUser) throw new Error('Not authenticated.');
    await fbUpdateEmail(auth.currentUser, email);
    if (user) {
      await updateDoc(doc(db, 'profiles', user.uid), { email });
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
        sessionStorage.clear();
      } catch {
        // Best effort only.
      }
    }
  };

  const updateUserProfile = async (data: Partial<UserProfileData>) => {
    if (!user) {
      setUserProfile((prev) => (prev ? { ...prev, ...data } : null));
      return;
    }
    const row = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]),
    );
    await updateDoc(doc(db, 'profiles', user.uid), { ...row, updated_at: new Date().toISOString() });
    await loadProfile(user);
  };

  const saveAssessment = async (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => {
    if (!user) throw new Error('Must be authenticated to save assessments.');
    const docRef = await addDoc(collection(db, 'assessments'), {
      user_id: user.uid,
      ...Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]),
      ),
      created_at: new Date().toISOString(),
    });
    return docRef.id;
  };

  const fetchUserAssessments = async (): Promise<UserAssessment[]> => {
    if (!user) return [];
    const q = query(collection(db, 'assessments'), where('user_id', '==', user.uid), orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const row = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        userId: String(row.user_id ?? ''),
        userEmail: user.email ?? '',
        districtId: String(row.district_id ?? ''),
        districtName: String(row.district_name ?? ''),
        primaryHazard: String(row.primary_hazard ?? ''),
        confidence: Number(row.confidence ?? 0),
        severityScore: Number(row.severity_score ?? 0),
        severityBin: row.severity_bin as string | undefined,
        notes: row.notes as string | undefined,
        createdAt: String(row.created_at ?? ''),
      };
    });
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
