import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { rtdb } from '../services/firebase';

/**
 * Custom hook that listens to the '.info/connected' path in the Firebase Realtime Database
 * using onValue and returns a boolean state indicating whether the client is currently connected.
 * Cleans up the listener on component unmount.
 *
 * @returns {boolean} True if the client is currently connected to Firebase Realtime Database, otherwise false.
 */
export function useFirebaseConnection(): boolean {
  const [isConnected, setIsConnected] = useState<boolean>(false);

  useEffect(() => {
    // Reference the special .info/connected path in Firebase Realtime Database
    const connectedRef = ref(rtdb, '.info/connected');

    // Subscribe to connection state changes using onValue
    const unsubscribe = onValue(
      connectedRef,
      (snapshot) => {
        const connected = snapshot.val() === true;
        setIsConnected(connected);
      },
      (error) => {
        console.error('Error listening to Firebase RTDB .info/connected:', error);
        setIsConnected(false);
      }
    );

    // Clean up the listener on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  return isConnected;
}

export default useFirebaseConnection;
