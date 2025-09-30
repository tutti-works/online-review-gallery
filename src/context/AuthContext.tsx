'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '@/lib/firebase';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
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

  const getUserRole = async (email: string): Promise<'admin' | 'viewer'> => {
    try {
      const roleDoc = await getDoc(doc(db, 'userRoles', email));
      if (roleDoc.exists()) {
        return roleDoc.data().role as 'admin' | 'viewer';
      }

      // 開発環境：ユーザーロールが存在しない場合、自動的にadminとして登録
      if (process.env.NODE_ENV === 'development') {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'userRoles', email), {
          role: 'admin',
          createdAt: new Date()
        });
        console.log(`Auto-created admin role for ${email} in development mode`);
        return 'admin';
      }

      return 'viewer'; // Default role
    } catch (error) {
      console.error('Error fetching user role:', error);
      return 'viewer'; // Default role on error
    }
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      const firebaseUser = result.user;

      if (firebaseUser.email) {
        const role = await getUserRole(firebaseUser.email);

        // トークンをsessionStorageに保存
        if (token) {
          sessionStorage.setItem('googleAccessToken', token);
        }

        const userData: User = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || '',
          photoURL: firebaseUser.photoURL || undefined,
          role,
          googleAccessToken: token,
        };

        setUser(userData);
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser && firebaseUser.email) {
        const role = await getUserRole(firebaseUser.email);

        // sessionStorageからトークンを取得
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
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};