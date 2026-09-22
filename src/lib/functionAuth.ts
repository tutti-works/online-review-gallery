import { auth } from '@/lib/firebase';

export async function getFunctionAuthorizationHeader(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Firebase authentication is required');
  }

  return `Bearer ${await currentUser.getIdToken()}`;
}
