import { createContext, useContext, useEffect, useState } from 'react'
import type { User as SupabaseAuthUser, UserResponse } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserRolePersona = 'smallholder_farmer' | 'ngo_coordinator' | 'govt_official' | 'academic_researcher' | 'commercial_agribusiness'

export type AppUser = SupabaseAuthUser & { uid: string; displayName: string; photoURL?: string; providerData: Array<{ providerId: string; email?: string | null }> }

export interface UserProfileData {
  uid: string; email: string; displayName: string; photoURL?: string; role?: 'user' | 'admin'; userRole?: UserRolePersona
  organization?: string; farmSizeHectares?: number; primaryDivision?: string; primaryDistrict?: string; homeDistrictId?: string
  homeDistrictName?: string; autoDetectLocationEnabled?: boolean; targetCrops?: string; phoneNumber?: string
  pinpointLat?: number; pinpointLng?: number; createdAt?: string; updatedAt?: string
}

export interface UserAssessment {
  id: string; userId: string; userEmail: string; districtId: string; districtName: string; primaryHazard: string
  confidence: number; severityScore: number; severityBin?: string; notes?: string; createdAt: string
}

type EmailCredential = UserResponse
export interface AuthContextType {
  user: AppUser | null; userProfile: UserProfileData | null; loading: boolean; signInWithGoogle: () => Promise<void>
  signUpWithEmail: (email: string, pass: string, name: string, initialProfile?: Partial<UserProfileData>) => Promise<void>
  signInWithEmailAndPassword: (email: string, pass: string) => Promise<EmailCredential>; signInWithEmail: (email: string, pass: string) => Promise<EmailCredential>
  signOut: () => Promise<void>; signOutUser: () => Promise<void>; sendPasswordResetEmail: (email: string) => Promise<void>; resetPassword: (email: string) => Promise<void>
  updateUserProfile: (data: Partial<UserProfileData>) => Promise<void>; saveAssessment: (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => Promise<string>
  fetchUserAssessments: () => Promise<UserAssessment[]>; deleteAssessment: (id: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const toAppUser = (user: SupabaseAuthUser | null): AppUser | null => user ? { ...user, uid: user.id, displayName: user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? 'User', photoURL: user.user_metadata?.avatar_url, providerData: user.identities?.map(identity => ({ providerId: identity.provider, email: identity.identity_data?.email })) ?? [] } : null
const toProfile = (row: Record<string, unknown>): UserProfileData => ({ uid: row.id as string, email: row.email as string, displayName: row.display_name as string, photoURL: row.photo_url as string | undefined, role: row.role as UserProfileData['role'], userRole: row.user_role as UserRolePersona, organization: row.organization as string | undefined, farmSizeHectares: row.farm_size_hectares as number | undefined, primaryDivision: row.primary_division as string | undefined, primaryDistrict: row.primary_district as string | undefined, homeDistrictId: row.home_district_id as string | undefined, homeDistrictName: row.home_district_name as string | undefined, autoDetectLocationEnabled: row.auto_detect_location_enabled as boolean | undefined, targetCrops: row.target_crops as string | undefined, phoneNumber: row.phone_number as string | undefined, pinpointLat: row.pinpoint_lat as number | undefined, pinpointLng: row.pinpoint_lng as number | undefined, createdAt: row.created_at as string | undefined, updatedAt: row.updated_at as string | undefined })

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null); const [userProfile, setUserProfile] = useState<UserProfileData | null>(null); const [loading, setLoading] = useState(true)
  const loadProfile = async (authUser: SupabaseAuthUser) => { const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle(); if (data) setUserProfile(toProfile(data)); return data }
  useEffect(() => { let mounted = true; supabase.auth.getUser().then(({ data }) => { if (mounted) { setUser(toAppUser(data.user)); if (data.user) loadProfile(data.user).finally(() => setLoading(false)); else setLoading(false) } }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (!mounted) return; const next = session?.user ?? null; setUser(toAppUser(next)); if (next) loadProfile(next); else setUserProfile(null); setLoading(false) }); return () => { mounted = false; listener.subscription.unsubscribe() } }, [])
  const signUpWithEmail = async (email: string, pass: string, name: string, initialProfile?: Partial<UserProfileData>) => { const { data, error } = await supabase.auth.signUp({ email, password: pass, options: { emailRedirectTo: import.meta.env.VITE_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`, data: { display_name: name } } }); if (error) throw error; if (data.user && data.session) await saveProfile(data.user, name, initialProfile) }
  const saveProfile = async (authUser: SupabaseAuthUser, name = 'User', data: Partial<UserProfileData> = {}) => { const row = { id: authUser.id, email: authUser.email ?? '', display_name: name, role: data.role ?? 'user', user_role: data.userRole ?? 'smallholder_farmer', organization: data.organization ?? '', farm_size_hectares: data.farmSizeHectares ?? 1.5, primary_division: data.primaryDivision ?? 'Rangpur', primary_district: data.primaryDistrict ?? '', target_crops: data.targetCrops ?? 'Boro Paddy, Aman Rice', phone_number: data.phoneNumber ?? '', updated_at: new Date().toISOString() }; const { error } = await supabase.from('profiles').upsert(row); if (error) throw error; await loadProfile(authUser) }
  const signIn = async (email: string, pass: string) => { const result = await supabase.auth.signInWithPassword({ email, password: pass }); if (result.error) throw result.error; return result }
  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; setUser(null); setUserProfile(null); sessionStorage.clear() }
  const updateUserProfile = async (data: Partial<UserProfileData>) => { if (!user) { setUserProfile(prev => prev ? { ...prev, ...data } : null); return } const row = Object.fromEntries(Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`), value])); const { error } = await supabase.from('profiles').update({ ...row, updated_at: new Date().toISOString() }).eq('id', user.id); if (error) throw error; await loadProfile(user) }
  const saveAssessment = async (data: Omit<UserAssessment, 'id' | 'userId' | 'userEmail' | 'createdAt'>) => { if (!user) throw new Error('Must be authenticated to save assessments.'); const { data: row, error } = await supabase.from('assessments').insert({ user_id: user.id, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`), value])) }).select('id').single(); if (error) throw error; return row.id }
  const fetchUserAssessments = async () => { if (!user) return []; const { data, error } = await supabase.from('assessments').select('*').eq('user_id', user.id).order('created_at', { ascending: false }); if (error) throw error; return (data ?? []).map(row => ({ id: row.id, userId: row.user_id, userEmail: user.email ?? '', districtId: row.district_id, districtName: row.district_name, primaryHazard: row.primary_hazard, confidence: row.confidence, severityScore: row.severity_score, severityBin: row.severity_bin, notes: row.notes, createdAt: row.created_at })) }
  const deleteAssessment = async (id: string) => { const { error } = await supabase.from('assessments').delete().eq('id', id).eq('user_id', user?.id); if (error) throw error }
  return <AuthContext.Provider value={{ user, userProfile, loading, signInWithGoogle: async () => { const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } }); if (error) throw error }, signUpWithEmail, signInWithEmailAndPassword: signIn, signInWithEmail: signIn, signOut, signOutUser: signOut, sendPasswordResetEmail: async email => { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback` }); if (error) throw error }, resetPassword: async email => { const { error } = await supabase.auth.resetPasswordForEmail(email); if (error) throw error }, updateUserProfile, saveAssessment, fetchUserAssessments, deleteAssessment }}>{children}</AuthContext.Provider>
}
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within an AuthProvider'); return context }
