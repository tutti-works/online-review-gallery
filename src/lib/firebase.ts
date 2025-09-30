import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

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
    // Auth エミュレーター（環境変数で制御）
    if (process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === 'true') {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('🔧 Connected to Auth Emulator');
    } else {
      console.log('✅ Using Production Auth (Google Sign-In)');
    }

    // Firestore & Storage エミュレーター（環境変数で制御）
    if (process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === 'true') {
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectStorageEmulator(storage, 'localhost', 9199);
      console.log('🔧 Connected to Firestore & Storage Emulators');
    } else {
      console.log('✅ Using Production Firestore & Storage');
    }
  } catch (error) {
    // エミュレーターへの接続は一度しかできないため、エラーを無視
    console.log('Emulator connection already established');
  }
}

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// データインポート機能で必要なAPIスコープを追加
googleProvider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.coursework.students.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.student-submissions.students.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.rosters.readonly'); // 学生名を取得するために必要
googleProvider.addScope('https://www.googleapis.com/auth/classroom.profile.emails');
googleProvider.addScope('https://www.googleapis.com/auth/classroom.profile.photos');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');


export { auth, db, storage, googleProvider };
