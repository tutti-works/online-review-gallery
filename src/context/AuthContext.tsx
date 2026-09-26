'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from '@/lib/previewFirestore';
import { auth, googleProvider, db, createGoogleProvider } from '@/lib/firebase';
import { User } from '@/types';
import { ROLES, type UserRole } from '@/utils/roles';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  requestAdditionalScopes: (scopes: string[]) => Promise<string | null>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const scopeRequestRef = useRef<Promise<string | null> | null>(null);

  const getUserRole = async (email?: string | null): Promise<UserRole> => {
    if (!email) {
      return ROLES.GUEST;
    }

    try {
      const roleDoc = await getDoc(doc(db, 'userRoles', email));
      if (roleDoc.exists()) {
        const role = roleDoc.data().role;
        return role === ROLES.ADMIN || role === ROLES.VIEWER ? role : ROLES.GUEST;
      }

      if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === 'true') {
        const { setDoc } = await import('@/lib/previewFirestore');
        await setDoc(doc(db, 'userRoles', email), {
          role: ROLES.ADMIN,
          createdAt: new Date()
        });
        console.log(`Auto-created admin role for ${email} in development mode`);
        return ROLES.ADMIN;
      }

      console.warn(`No role found for ${email}. Defaulting to guest.`);
      return ROLES.GUEST;
    } catch (error) {
      console.error('Error fetching user role:', error);
      return ROLES.GUEST;
    }
  };

  const refreshRole = async () => {
    const current = auth.currentUser;
    const role = await getUserRole(current?.email);
    setUser((previous) => previous && previous.uid === current?.uid ? { ...previous, role } : previous);
  };

  // Observe only the current user's readable role, including changes made by another admin.
  useEffect(() => {
    if (!user?.email) return;
    const email = user.email;
    const update = (role: UserRole) => setUser((previous) =>
      previous?.email === email ? { ...previous, role } : previous);
    return onSnapshot(doc(db, 'userRoles', email), (snapshot) => {
      const role = snapshot.data()?.role;
      update(role === ROLES.ADMIN || role === ROLES.VIEWER ? role : ROLES.GUEST);
    }, () => update(ROLES.GUEST));
  }, [user?.email]);

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (token) {
        sessionStorage.setItem('googleAccessToken', token);
      }

      if (!result.user.email) {
        console.warn('Signed in with Google but email was missing. Treating as guest.');
      }
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('googleAccessToken');
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const requestAdditionalScopes = async (scopes: string[]) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      throw new Error('No authenticated user to extend scopes');
    }

    if (scopeRequestRef.current) {
      return scopeRequestRef.current;
    }

    const pending = (async () => {
      try {
        const provider = createGoogleProvider(scopes, {
          prompt: 'consent select_account',
          includeGrantedScopes: true,
          loginHint: currentUser.email ?? undefined,
        });
        const result = await reauthenticateWithPopup(currentUser, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken ?? null;

        if (token) {
          sessionStorage.setItem('googleAccessToken', token);
        } else {
          sessionStorage.removeItem('googleAccessToken');
        }

        const firebaseUser = auth.currentUser;
        let resolvedRole = user?.role;

        if (!resolvedRole) {
          resolvedRole = firebaseUser?.email ? await getUserRole(firebaseUser.email) : ROLES.GUEST;
        }

        setUser((prev) => {
          if (prev) {
            return {
              ...prev,
              googleAccessToken: token ?? prev.googleAccessToken,
            };
          }

          if (!firebaseUser || !firebaseUser.email) {
            return prev;
          }

          return {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || undefined,
            role: resolvedRole ?? ROLES.GUEST,
            googleAccessToken: token ?? undefined,
          };
        });

        return token;
      } catch (error) {
        console.error('Error requesting additional scopes:', error);
        throw error;
      }
    })();

    scopeRequestRef.current = pending;

    try {
      return await pending;
    } finally {
      scopeRequestRef.current = null;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      // Retired anonymous sessions must not become application guest users.
      if (firebaseUser?.isAnonymous) {
        setUser(null);
        sessionStorage.removeItem('googleAccessToken');
        try {
          await signOut(auth);
        } catch (error) {
          console.error('Error clearing retired anonymous session:', error);
        }
        setLoading(false);
        return;
      }
      if (firebaseUser && firebaseUser.email) {
        const role = await getUserRole(firebaseUser.email);
        const token = sessionStorage.getItem('googleAccessToken') || undefined;

        const userData: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || undefined,
          role,
          googleAccessToken: token
        };

        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    signInWithGoogle,
    logout,
    requestAdditionalScopes,
    refreshRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
