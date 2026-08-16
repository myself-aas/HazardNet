import { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail,
  User, 
  UserCredential 
} from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, query, collection, where, deleteDoc } from 'firebase/firestore';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  handleFirestoreError, 
  OperationType 
} from '../services/firebase';

export type UserRolePersona = 
  | 'smallholder_farmer' 
  | 'ngo_coordinator' 
  | 'govt_official' 
  | 'academic_researcher' 
  | 'commercial_agribusiness';

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

export interface AuthContextType {
  user: User | null;
  userProfile: UserProfileData | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string, initialProfile?: Partial<UserProfileData>) => Promise<void>;
  signInWithEmailAndPassword: (email: string, pass: string) => Promise<UserCredential>;
  signInWithEmail: (email: string, pass: string) => Promise<UserCredential>;
  signOut: () => Promise<void>;
  signOutUser: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfileData>) => Promise<void>;
  saveAssessment: (data: {
    districtId: string;
    districtName: string;
    primaryHazard: string;
    confidence: number;
    severityScore: number;
    severityBin?: string;
    notes?: string;
  }) => Promise<string>;
  fetchUserAssessments: () => Promise<UserAssessment[]>;
  deleteAssessment: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserProfile = async (uid: string): Promise<UserProfileData | null> => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data() as UserProfileData;
        setUserProfile(data);
        if (data.homeDistrictId) {
          try {
            localStorage.setItem('hazardnet_home_district', data.homeDistrictId);
          } catch (e) {}
        }
        if (data.autoDetectLocationEnabled !== undefined) {
          try {
            localStorage.setItem('hazardnet_auto_detect_location', String(data.autoDetectLocationEnabled));
          } catch (e) {}
        }
        return data;
      }
    } catch (err) {
      console.warn('Failed to load user profile from Firestore:', err);
    }
    return null;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Attempt to fetch existing Firestore profile
        const existingProfile = await loadUserProfile(currentUser.uid);
        
        // Sync baseline profile in Firestore
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const baseData: Partial<UserProfileData> = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || existingProfile?.displayName || 'User',
            photoURL: currentUser.photoURL || existingProfile?.photoURL || '',
            role: existingProfile?.role || 'user',
            userRole: existingProfile?.userRole || 'smallholder_farmer',
            updatedAt: new Date().toISOString()
          };
          
          if (!existingProfile?.createdAt) {
            baseData.createdAt = new Date().toISOString();
          }

          await setDoc(userRef, baseData, { merge: true });
          await loadUserProfile(currentUser.uid);
        } catch (err) {
          console.warn('Could not sync user profile to Firestore:', err);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignInWithGoogle = async () => {
    await loginWithGoogle();
  };

  const handleSignUpWithEmail = async (
    email: string, 
    pass: string, 
    name: string, 
    initialProfile?: Partial<UserProfileData>
  ) => {
    try {
      const res = await createUserWithEmailAndPassword(auth, email, pass);
      if (res.user && name) {
        await updateProfile(res.user, { displayName: name });
      }
      const newUser = res.user;
      if (newUser) {
        const userRef = doc(db, 'users', newUser.uid);
        const payload: UserProfileData = {
          uid: newUser.uid,
          email: newUser.email || email,
          displayName: name || 'User',
          role: 'user',
          userRole: initialProfile?.userRole || 'smallholder_farmer',
          organization: initialProfile?.organization || '',
          farmSizeHectares: initialProfile?.farmSizeHectares || 1.5,
          primaryDivision: initialProfile?.primaryDivision || 'Rangpur',
          primaryDistrict: initialProfile?.primaryDistrict || '',
          targetCrops: initialProfile?.targetCrops || 'Boro Paddy, Aman Rice',
          phoneNumber: initialProfile?.phoneNumber || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await setDoc(userRef, payload, { merge: true });
        setUserProfile(payload);
      }
    } catch (error) {
      console.error('Firebase Auth createUserWithEmailAndPassword error:', error);
      throw error;
    }
  };

  const handleSignInWithEmailAndPassword = async (email: string, pass: string): Promise<UserCredential> => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      return userCredential;
    } catch (error) {
      console.error('Firebase Auth signInWithEmailAndPassword error:', error);
      throw error;
    }
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      
      // Clear sensitive local storage keys and cache
      try {
        localStorage.removeItem('hazardnet_home_district');
        localStorage.removeItem('hazardnet_auto_detect_location');
        localStorage.removeItem('shonchay_saved_districts');
      } catch (storageErr) {
        console.warn('Could not clear local storage on signOut:', storageErr);
      }

      // Clear session storage
      try {
        sessionStorage.clear();
      } catch (sessionErr) {
        console.warn('Could not clear session storage on signOut:', sessionErr);
      }
    } catch (error) {
      console.error('Firebase Auth signOut error:', error);
      throw error;
    }
  };

  const handleSendPasswordResetEmail = async (email: string): Promise<void> => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Firebase Auth sendPasswordResetEmail error:', error);
      throw error;
    }
  };

  const updateUserProfile = async (data: Partial<UserProfileData>): Promise<void> => {
    if (data.homeDistrictId) {
      try {
        localStorage.setItem('hazardnet_home_district', data.homeDistrictId);
      } catch (e) {}
    }
    if (data.autoDetectLocationEnabled !== undefined) {
      try {
        localStorage.setItem('hazardnet_auto_detect_location', String(data.autoDetectLocationEnabled));
      } catch (e) {}
    }
    if (!user) {
      // If guest/unauthenticated user, update local storage and temporary state
      setUserProfile((prev) => prev ? { ...prev, ...data } : {
        uid: 'guest',
        email: '',
        displayName: 'Guest',
        ...data,
      });
      return;
    }
    const path = `users/${user.uid}`;
    try {
      const userRef = doc(db, 'users', user.uid);
      const updatedPayload = {
        uid: user.uid,
        email: user.email || '',
        ...data,
        updatedAt: new Date().toISOString()
      };
      await setDoc(userRef, updatedPayload, { merge: true });
      await loadUserProfile(user.uid);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  const saveAssessment = async (data: {
    districtId: string;
    districtName: string;
    primaryHazard: string;
    confidence: number;
    severityScore: number;
    severityBin?: string;
    notes?: string;
  }): Promise<string> => {
    if (!user) throw new Error('Must be authenticated to save assessments.');
    const path = 'assessments';
    const assessmentId = `asm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const assessmentRef = doc(db, path, assessmentId);
    
    const payload = {
      id: assessmentId,
      userId: user.uid,
      userEmail: user.email || '',
      districtId: data.districtId,
      districtName: data.districtName,
      primaryHazard: data.primaryHazard,
      confidence: data.confidence,
      severityScore: data.severityScore,
      severityBin: data.severityBin || 'Moderate',
      notes: data.notes || '',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(assessmentRef, payload);
      return assessmentId;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  const fetchUserAssessments = async (): Promise<UserAssessment[]> => {
    if (!user) return [];
    const path = 'assessments';
    try {
      const q = query(collection(db, path), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      const results: UserAssessment[] = [];
      snapshot.forEach((docSnap) => {
        results.push(docSnap.data() as UserAssessment);
      });
      return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  };

  const deleteAssessment = async (id: string): Promise<void> => {
    if (!user) return;
    const path = `assessments/${id}`;
    try {
      await deleteDoc(doc(db, 'assessments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      loading,
      signInWithGoogle: handleSignInWithGoogle,
      signUpWithEmail: handleSignUpWithEmail,
      signInWithEmailAndPassword: handleSignInWithEmailAndPassword,
      signInWithEmail: handleSignInWithEmailAndPassword,
      signOut: handleSignOut,
      signOutUser: handleSignOut,
      sendPasswordResetEmail: handleSendPasswordResetEmail,
      resetPassword: handleSendPasswordResetEmail,
      updateUserProfile,
      saveAssessment,
      fetchUserAssessments,
      deleteAssessment
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
