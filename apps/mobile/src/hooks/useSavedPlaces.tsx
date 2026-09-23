/**
 * useSavedPlaces — local-only CRUD store for saved places, persisted to
 * AsyncStorage. No auth / cloud sync in Phase 5 (opt-in sync lands later).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_PLACE_NOTIFICATION_PREFS,
  DEFAULT_QUIET_HOURS,
  SavedPlaceSchema,
  type SavedPlace,
  type PlaceNotificationPrefs,
} from '@hazardnet/core';

const STORAGE_KEY = 'hazardnet:saved-places:v1';

interface SavedPlacesContextValue {
  places: SavedPlace[];
  isReady: boolean;
  addPlace: (input: {
    label: string;
    kind?: SavedPlace['kind'];
    notes?: string;
    location?: { lat: number; lng: number } | null;
    districtId?: string;
    placeName?: string;
  }) => SavedPlace;
  updatePlace: (id: string, patch: Partial<SavedPlace>) => void;
  removePlace: (id: string) => void;
  seedDefaults: () => void;
}

const SavedPlacesContext = createContext<SavedPlacesContextValue | null>(null);

function genId() {
  // RFC4122-ish v4; expo-crypto isn't in deps yet and we only need client uniqueness.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizePlace(input: any): SavedPlace {
  const now = Date.now();
  const merged: any = {
    id: genId(),
    notes: '',
    kind: 'other' as const,
    location: null,
    districtId: input.districtId ?? 'bd-national',
    division: input.division,
    upazilas: [],
    notifications: { ...DEFAULT_PLACE_NOTIFICATION_PREFS },
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  if (input.placeName && !merged.notes) merged.notes = input.placeName;
  const parsed = SavedPlaceSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error('Invalid saved place: ' + parsed.error.message);
  }
  return parsed.data;
}

export function SavedPlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) { setIsReady(true); return; }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid: SavedPlace[] = [];
          for (const p of parsed) {
            const r = SavedPlaceSchema.safeParse(p);
            if (r.success) valid.push(r.data);
          }
          setPlaces(valid);
        }
      } catch { /* corrupt → start fresh */ }
      finally { setIsReady(true); }
    })();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places)).catch(() => {});
  }, [places, isReady]);

  const addPlace = useCallback((input: any) => {
    const place = normalizePlace(input);
    setPlaces((prev) => [...prev, place]);
    return place;
  }, []);

  const updatePlace = useCallback((id: string, patch: Partial<SavedPlace>) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));
  }, []);

  const removePlace = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const seedDefaults = useCallback(() => {
    setPlaces((prev) => {
      if (prev.length > 0) return prev;
      return [normalizePlace({ label: 'Home', kind: 'home' })];
    });
  }, []);

  const value = useMemo(
    () => ({ places, isReady, addPlace, updatePlace, removePlace, seedDefaults }),
    [places, isReady, addPlace, updatePlace, removePlace, seedDefaults]
  );
  return <SavedPlacesContext.Provider value={value}>{children}</SavedPlacesContext.Provider>;
}

export function useSavedPlaces() {
  const ctx = useContext(SavedPlacesContext);
  if (!ctx) throw new Error('useSavedPlaces must be used within SavedPlacesProvider');
  return ctx;
}

export type { PlaceNotificationPrefs };
