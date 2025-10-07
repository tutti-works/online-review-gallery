import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'test-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'test-project.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'test-project-id',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'test-project.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:test-app-id',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-TEST123'
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// エミュレーター接続（開発環境のみ）
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  try {
    if (process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === 'true') {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('🔧 Connected to Auth Emulator');
    }

    if (process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === 'true') {
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectStorageEmulator(storage, 'localhost', 9199);
      console.log('🔧 Connected to Firestore & Storage Emulators');
    }
  } catch (error) {
    console.log('Emulator connection already established');
  }
}

const BASE_GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;
export const CLASSROOM_INCREMENTAL_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/classroom.profile.photos',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

type GoogleProviderOptions = {
  prompt?: string;
  includeGrantedScopes?: boolean;
  loginHint?: string;
};

export const createGoogleProvider = (
  additionalScopes: string[] = [],
  options: GoogleProviderOptions = {}
) => {
  const provider = new GoogleAuthProvider();
  const {
    prompt = 'select_account',
    includeGrantedScopes = false,
    loginHint,
  } = options;

  const params: Record<string, string> = { prompt };
  if (includeGrantedScopes) {
    params.include_granted_scopes = 'true';
  }
  if (loginHint) {
    params.login_hint = loginHint;
  }

  provider.setCustomParameters(params);
  BASE_GOOGLE_SCOPES.forEach((scope) => provider.addScope(scope));
  additionalScopes.forEach((scope) => provider.addScope(scope));
  return provider;
};

const googleProvider = createGoogleProvider();

export { auth, db, storage, googleProvider };
