import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const ROLES = {
  ADMIN: 'admin',
  VIEWER: 'viewer',
  GUEST: 'guest',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const setUserRole = async (email: string, role: UserRole): Promise<void> => {
  try {
    await setDoc(doc(db, 'userRoles', email), {
      email,
      role,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Error setting user role:', error);
    throw error;
  }
};

export const getUserRole = async (email: string): Promise<UserRole> => {
  try {
    const roleDoc = await getDoc(doc(db, 'userRoles', email));
    if (roleDoc.exists()) {
      return roleDoc.data().role as UserRole;
    }
    return ROLES.GUEST; // Default role
  } catch (error) {
    console.error('Error fetching user role:', error);
    return ROLES.GUEST; // Default role on error
  }
};

export const isAdmin = (role: UserRole): boolean => {
  return role === ROLES.ADMIN;
};

export const isViewer = (role: UserRole): boolean => {
  return role === ROLES.VIEWER;
};

export const isGuest = (role: UserRole): boolean => {
  return role === ROLES.GUEST;
};

// Initial setup function to set default admin users
export const setupDefaultAdminUsers = async (adminEmails: string[]): Promise<void> => {
  try {
    const promises = adminEmails.map(email => setUserRole(email, ROLES.ADMIN));
    await Promise.all(promises);
    console.log('Default admin users set up successfully');
  } catch (error) {
    console.error('Error setting up default admin users:', error);
    throw error;
  }
};
