# データマイグレーションガイド

📝 **対象**: Artwork.status フィールドの追加
📅 **実施日**: 2025-11-06
✅ **ステータス**: 完了

---

## 1. 概要

このドキュメントは、インポート機能（F-02-07, F-02-08, F-02-09）実装に伴うデータモデル変更のマイグレーション手順を記載します。

**主な変更**:
- `Artwork` インターフェースに `status` フィールドを追加
- `Artwork` インターフェースに `errorReason` フィールドを追加（オプション）
- `ImportJob` インターフェースに `overwrittenCount` フィールドを追加（2025-11-20）

---

## 2. データモデル変更

### 2.1. Artwork型の拡張

**変更前**:
```typescript
export interface Artwork {
  id: string;
  title: string;
  galleryId: string;
  files: SubmittedFile[];
  images: ArtworkImage[];
  studentName: string;
  studentEmail: string;
  studentId?: string;
  submittedAt: Date;
  // ...
}
```

**変更後**:
```typescript
export interface Artwork {
  id: string;
  title: string;
  galleryId: string;

  // ✅ 新規追加フィールド
  status: 'submitted' | 'not_submitted' | 'error';
  errorReason?: 'unsupported_format' | 'processing_error';

  files: SubmittedFile[];
  images: ArtworkImage[];
  studentName: string;
  studentEmail: string;
  studentId?: string;
  submittedAt: Date | null;  // ✅ null許可に変更
  // ...
}
```

### 2.2. ImportJob型の拡張

**変更前**:
```typescript
export interface ImportJob {
  id: string;
  galleryId: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  skippedCount?: number;  // ✅ 既存（2025-11-06追加）
  // ...
}
```

**変更後**:
```typescript
export interface ImportJob {
  id: string;
  galleryId: string;
  status: string;
  totalFiles: number;
  processedFiles: number;
  skippedCount?: number;
  overwrittenCount?: number;  // ✅ 新規追加（2025-11-20）
  // ...
}
```

---

## 3. マイグレーション戦略

### 3.1. 後方互換性の確保

既存のArtworkドキュメントには `status` フィールドが存在しないため、以下の方針で対応：

#### 3.1.1. フロントエンド側のデフォルト値

```typescript
// src/app/gallery/page.tsx

useEffect(() => {
  const unsubscribe = onSnapshot(
    query(collection(db, 'artworks'), where('galleryId', '==', galleryId)),
    (snapshot) => {
      const artworks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        status: doc.data().status ?? 'submitted',  // ✅ デフォルト値
      }));
      setArtworks(artworks);
    }
  );

  return () => unsubscribe();
}, [galleryId]);
```

#### 3.1.2. バックエンド側のデフォルト値

```typescript
// functions/src/importController.ts

const existingArtwork = existingArtworksByEmail.get(normalizedEmail);
if (existingArtwork) {
  const status = existingArtwork.status || 'submitted';  // ✅ デフォルト値

  if (status === 'submitted') {
    // スキップ処理
  }
}
```

---

## 4. Firestore Security Rules

### 4.1. status フィールドのバリデーション

```javascript
// firestore.rules

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // artworks コレクション
    match /artworks/{artworkId} {
      // 全員が読み取り可能
      allow read: if true;

      // 管理者のみ作成可能
      allow create: if request.auth != null
        && get(/databases/$(database)/documents/userRoles/$(request.auth.token.email)).data.role == 'admin'
        && request.resource.data.status in ['submitted', 'not_submitted', 'error']  // ✅ バリデーション
        && (request.resource.data.status == 'submitted'
            ? request.resource.data.images.size() > 0  // ✅ submitted は画像必須
            : request.resource.data.images.size() == 0);  // ✅ not_submitted/error は画像なし

      // 管理者のみ更新・削除可能
      allow update, delete: if request.auth != null
        && get(/databases/$(database)/documents/userRoles/$(request.auth.token.email)).data.role == 'admin';
    }
  }
}
```

---

## 5. マイグレーションスクリプト

### 5.1. 既存データの一括更新（オプション）

既存の全作品に `status: 'submitted'` を追加するスクリプト（必要に応じて実行）：

```typescript
// scripts/migrateArtworkStatus.ts

import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function migrateArtworkStatus() {
  console.log('Starting Artwork.status migration...');

  const artworksSnapshot = await db.collection('artworks').get();
  console.log(`Found ${artworksSnapshot.size} artworks`);

  let updatedCount = 0;
  let skippedCount = 0;
  const batch = db.batch();
  let batchCount = 0;

  for (const doc of artworksSnapshot.docs) {
    const data = doc.data();

    if (!data.status) {
      // statusフィールドが存在しない場合のみ追加
      batch.update(doc.ref, { status: 'submitted' });
      updatedCount++;
      batchCount++;
    } else {
      skippedCount++;
    }

    // バッチサイズ制限（500件ごとにコミット）
    if (batchCount >= 500) {
      await batch.commit();
      console.log(`Committed batch: ${updatedCount} updated, ${skippedCount} skipped`);
      batchCount = 0;
    }
  }

  // 残りのバッチをコミット
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log('Migration complete!');
  console.log(`Total updated: ${updatedCount} artworks`);
  console.log(`Total skipped: ${skippedCount} artworks`);
}

migrateArtworkStatus()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
```

### 5.2. スクリプト実行手順

```bash
# 1. スクリプトをプロジェクトルートに配置
cd functions
mkdir -p scripts
# migrateArtworkStatus.ts を scripts/ に配置

# 2. TypeScriptをコンパイル
npx tsc scripts/migrateArtworkStatus.ts --outDir scripts/dist

# 3. 本番環境で実行
NODE_ENV=production node scripts/dist/migrateArtworkStatus.js

# 4. エミュレーター環境で実行（テスト）
FIRESTORE_EMULATOR_HOST="localhost:8080" node scripts/dist/migrateArtworkStatus.js
```

---

## 6. マイグレーション実施タイミング

### 6.1. 実施済み（2025-11-06）

- ✅ フロントエンド: デフォルト値処理を実装
- ✅ バックエンド: デフォルト値処理を実装
- ✅ Firestore Security Rules: バリデーションルールを追加
- ✅ 既存データのマイグレーションスクリプト: 作成（実行は不要と判断）

### 6.2. マイグレーションスクリプト実行不要の理由

既存データに `status` フィールドがない場合でも、以下の理由でマイグレーションスクリプト実行は不要：

1. **デフォルト値処理**: フロントエンド・バックエンドで `status ?? 'submitted'` により自動的にデフォルト値が設定される
2. **新規作品は自動的にstatusを持つ**: 2025-11-06以降のインポートでは全作品に `status` が設定される
3. **既存作品の再インポート**: 再インポート時に `status` が追加される
4. **影響範囲**: 既存作品は全て正常提出作品のため、`submitted` として扱われることに問題なし

**結論**: マイグレーションスクリプトは保険として保持するが、実行は不要

---

## 7. ロールバック手順

万が一問題が発生した場合のロールバック手順：

### 7.1. コードのロールバック

```bash
# 1. Git で前のバージョンに戻す
git checkout <previous-commit-hash>

# 2. デプロイ
firebase deploy --only functions,firestore:rules
```

### 7.2. データのロールバック

```typescript
// scripts/rollbackArtworkStatus.ts

async function rollbackArtworkStatus() {
  const artworksSnapshot = await db.collection('artworks').get();
  const batch = db.batch();
  let count = 0;

  for (const doc of artworksSnapshot.docs) {
    const data = doc.data();

    if (data.status) {
      // statusフィールドを削除
      batch.update(doc.ref, {
        status: admin.firestore.FieldValue.delete(),
        errorReason: admin.firestore.FieldValue.delete(),
      });
      count++;
    }

    if (count % 500 === 0) {
      await batch.commit();
    }
  }

  await batch.commit();
  console.log(`Rollback complete: ${count} artworks`);
}
```

---

## 8. モニタリングとバリデーション

### 8.1. マイグレーション後の確認事項

```typescript
// scripts/validateMigration.ts

async function validateMigration() {
  const artworksSnapshot = await db.collection('artworks').get();

  let withStatus = 0;
  let withoutStatus = 0;
  let invalidStatus = 0;

  for (const doc of artworksSnapshot.docs) {
    const data = doc.data();

    if (data.status) {
      withStatus++;
      if (!['submitted', 'not_submitted', 'error'].includes(data.status)) {
        invalidStatus++;
        console.warn(`Invalid status: ${doc.id} has status "${data.status}"`);
      }
    } else {
      withoutStatus++;
    }
  }

  console.log('Migration validation results:');
  console.log(`- With status: ${withStatus}`);
  console.log(`- Without status: ${withoutStatus}`);
  console.log(`- Invalid status: ${invalidStatus}`);

  if (invalidStatus > 0) {
    throw new Error(`Found ${invalidStatus} artworks with invalid status`);
  }
}
```

---

## 9. 関連ドキュメント

- [インポート機能仕様](../features/import-feature.md) - 機能仕様書
- [インポート実装詳細](import-implementation.md) - 実装詳細
- [テストシナリオ](../TESTING.md) - マイグレーション後のテストケース

---

**ドキュメントバージョン**: 1.0
**作成日**: 2025-11-06
**最終更新**: 2025-11-20
