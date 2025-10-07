'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db, createGoogleProvider } from '@/lib/firebase';
import { User } from '@/types';
import { ROLES, type UserRole } from '@/utils/roles';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
  requestAdditionalScopes: (scopes: string[]) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const buildGuestUser = (firebaseUser: FirebaseUser): User => {
  return {
    uid: firebaseUser.uid,
    email: `guest_${firebaseUser.uid}@anonymous.local`,
    displayName: '\u30b2\u30b9\u30c8\u30e6\u30fc\u30b6\u30fc',
    photoURL: firebaseUser.photoURL || undefined,
    role: ROLES.GUEST,
  };
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
        return roleDoc.data().role as UserRole;
      }

      if (process.env.NODE_ENV === 'development') {
        const { setDoc } = await import('firebase/firestore');
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

  const signInAsGuest = async () => {
    try {
      sessionStorage.removeItem('googleAccessToken');
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Error signing in as guest:', error);
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
    if (!currentUser) {
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
      } else if (firebaseUser) {
        setUser(buildGuestUser(firebaseUser));
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
    signInAsGuest,
    logout,
    requestAdditionalScopes,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
