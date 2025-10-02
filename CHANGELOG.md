# 変更履歴

## 2025-10-02: Cloud Run移行とPDF処理の最適化

### 実装した機能

#### 1. Cloud Run移行（processFileTask） ✅
- PDF処理機能をFirebase FunctionsからCloud Runに移行
- GraphicsMagickとGhostscriptをDockerイメージに組み込み
- Cloud Buildを使用したイメージビルドプロセスを確立
- Cloud Tasks経由でのHTTPエンドポイント呼び出しを実装

#### 2. PDF処理の最適化 ✅
- pdf2picの出力形式（path vs buffer）の問題を解決
- PDF出力サイズを2400x1697px（A3比率）に最適化
- サムネイルを420x297pxに設定し、アスペクト比を維持（fit: 'inside'）
- Firestoreへの`undefined`値保存エラーを修正

#### 3. データリセット機能 ✅
- 管理者向けにすべてのデータを削除する機能を追加
- Firebase Functionsの認証方式をIDトークンからリクエストボディのメール検証に変更
- galleriesコレクションを完全削除する処理に変更

#### 4. artworksデータ構造の改善 ✅
- トップレベルに`thumbnailUrl`フィールドを追加（最初のページのサムネイル）
- 空の`images`配列によるエラーを修正

#### 5. インポート進捗表示の修正 ✅
- ギャラリーページで進捗が正しく更新されない問題を修正
- 404エラー時にlocalStorageをクリアする処理を追加
- デバッグログを追加して進捗追跡を改善

### ファイル変更一覧

```
変更:
- functions/src/cloudrun.ts (Cloud Runエントリーポイント、storageBucket設定追加)
- functions/src/processFileTaskHttp.ts (HTTP形式のペイロード処理)
- functions/src/fileProcessor.ts (PDF処理最適化、undefined値修正)
- functions/src/index.ts (deleteAllData機能追加)
- functions/Dockerfile (必要なファイルのみコピー、lib/index.js除外)
- functions/package.json (@google-cloud/functions-framework追加)
- src/app/gallery/page.tsx (進捗表示修正、空images配列対応)
- src/app/dashboard/page.tsx (deleteAllData呼び出し方法変更)
- CLOUD_RUN_DEPLOYMENT.md (Cloud Build手順を追加)
- SETUP.md (Cloud Runデプロイ手順を追加)
- docs/PDF_PROCESSING_GUIDE.md (現在の設定を反映)

新規作成:
- functions/.env.online-review-gallery (Cloud Run URL設定)
```

### 解決した問題

#### PDF処理関連
- ❌ "Request body is missing data" → ✅ lib/index.jsをDockerイメージから除外
- ❌ "Bucket name not specified" → ✅ cloudrun.tsでstorageBucket設定
- ❌ "Page has no buffer" → ✅ page.pathから読み込みに変更
- ❌ "Cannot use undefined as Firestore value" → ✅ thumbnailUrlを条件付きで追加
- ❌ PDF出力が正方形（3400x3400） → ✅ width/heightを明示的に指定
- ❌ サムネイルがクロップされる → ✅ fit: 'cover' → 'inside'に変更

#### その他
- ❌ インポート進捗が「インポート進行中」で止まる → ✅ 404ハンドリング追加
- ❌ images配列が空でエラー → ✅ nullチェック追加

### デプロイ手順

```bash
# 1. TypeScriptビルド
cd functions
npm run build

# 2. Cloud Buildでイメージビルド
gcloud builds submit --tag gcr.io/online-review-gallery/processfiletask --project=online-review-gallery

# 3. Cloud Runにデプロイ
gcloud run deploy processfiletask \
  --image gcr.io/online-review-gallery/processfiletask \
  --project=online-review-gallery \
  --region=asia-northeast1 \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=2Gi \
  --timeout=1800 \
  --min-instances=0 \
  --max-instances=20 \
  --cpu=1 \
  --service-account=816131605069-compute@developer.gserviceaccount.com \
  --set-env-vars=FUNCTION_TARGET=processFileTask,GCLOUD_PROJECT=online-review-gallery

# 4. Firebase Functionsデプロイ
firebase deploy --only functions
```

---

## 2025-09-30: 主要機能の実装完了

### 実装した機能

#### 1. ギャラリー表示のFirestore連携 ✅
- Firestoreから作品データを取得する処理を実装
- 作成日時順にソートして表示
- Timestamp型からDate型への変換処理を追加

#### 2. いいね機能のFirestore保存処理 ✅
- いいねの追加・削除機能を実装
- `likes`コレクションに保存
- トグル機能（いいね済みの場合は解除）
- 楽観的UI更新でスムーズな操作感を実現

#### 3. コメント機能のFirestore保存処理 ✅
- コメントの投稿機能を実装
- `artworks`コレクションのcommentsフィールドに保存
- 投稿者情報とタイムスタンプを記録

#### 4. Firestore Security Rules設定 ✅
- 役割ベースのアクセス制御を実装
- 管理者（admin）と閲覧者（viewer）の権限を分離
- 各コレクションごとに適切なアクセス権限を設定

#### 5. 環境変数の設定 ✅
- Firebase Functions URLをasia-northeast1リージョンに修正
- `.env.local`と`.env.example`を更新
- 開発環境と本番環境の設定を明確化

#### 6. 型エラーの修正 ✅
- sharpのimportをデフォルトインポートに修正
- corsのimportをデフォルトインポートに修正
- OAuth2Clientの型定義を修正
- エラーハンドリングの型安全性を向上

#### 7. ドキュメント作成 ✅
- `SETUP.md`: セットアップガイドの作成
- `CHANGELOG.md`: 変更履歴の記録

### ファイル変更一覧

```
変更:
- src/app/gallery/page.tsx (ギャラリー表示・いいね・コメント機能の実装)
- firestore.rules (セキュリティルールの設定)
- .env.local (Functions URLの修正)
- .env.example (テンプレートの更新)
- functions/src/fileProcessor.ts (sharpのimport修正)
- functions/src/index.ts (corsのimport修正)
- functions/src/importController.ts (OAuth2Clientの型修正)
- src/app/admin/import/page.tsx (エラーハンドリングの型修正)

新規作成:
- SETUP.md (セットアップガイド)
- CHANGELOG.md (変更履歴)
```

### 動作確認項目

#### ビルド確認 ✅
```bash
npm run typecheck  # 型チェック: 成功
npm run build      # ビルド: 成功
```

### 既知の問題

#### 軽微な警告
- `src/app/dashboard/page.tsx:31`: `<img>`タグを`<Image />`コンポーネントに置き換えることを推奨

### 次のステップ

#### テスト項目
1. Firebase Emulatorでの動作確認
2. Google Classroomからのインポート機能のテスト
3. いいね・コメント機能の動作テスト
4. 認証・権限管理のテスト

#### 本番デプロイ前の準備
1. Cloud Tasksキューの作成
2. Firestore Security Rulesのデプロイ
3. Firebase Functionsのデプロイ
4. 環境変数の本番用設定

#### 追加機能（オプション）
1. ギャラリーの絞り込み・検索機能
2. ページネーションまたは無限スクロール
3. コメント削除機能
4. 管理者ダッシュボードの拡張