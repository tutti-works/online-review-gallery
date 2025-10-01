// Cloud Run用のエントリーポイント
// Dockerfileから直接呼び出される

import * as admin from 'firebase-admin';
import { processFileTaskHttp } from './processFileTaskHttp';

// エミュレーター環境の設定（initializeApp前に設定）
if (process.env.FUNCTIONS_EMULATOR === 'true') {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9199';
}

// Firebase Admin SDKの初期化（冪等性を保つ）
if (!admin.apps.length) {
  admin.initializeApp();
}

// Cloud Tasks からのリクエストを処理
export const processFileTask = processFileTaskHttp;
