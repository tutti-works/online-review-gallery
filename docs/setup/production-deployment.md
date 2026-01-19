# 本番環境デプロイガイド

このガイドでは、オンライン講評会支援ギャラリーアプリを本番環境（Firebase Hosting + Functions + Cloud Run）にデプロイする手順を説明します。

## 前提条件

- Firebase CLI (`firebase login`でログイン済み)
- Google Cloud SDK (`gcloud auth login`でログイン済み)
- Cloud Run にPDF処理サービスがデプロイ済み（[Cloud Runデプロイガイド](cloud-run-deployment.md)参照）

## デプロイフロー

```
1. Cloud Runデプロイ（processFileTask）
   ↓
2. Firebase Functionsデプロイ（その他の関数）
   ↓
3. Firebase Hostingデプロイ（Next.jsアプリ）
   ↓
4. Security Rulesデプロイ
```

## 1. Cloud Runのデプロイ

詳細は [Cloud Runデプロイガイド](cloud-run-deployment.md) を参照してください。

```bash
cd functions
gcloud builds submit --tag gcr.io/online-review-gallery/processfiletask
gcloud run deploy processfiletask --image gcr.io/<PROJECT_ID>/processfiletask --project=<PROJECT_ID> --region=asia-northeast1 --platform=managed --no-allow-unauthenticated --memory=2Gi --timeout=1800 --min-instances=0 --max-instances=20 --cpu=1 --service-account=<PROJECT_NUMBER>-compute@developer.gserviceaccount.com --set-env-vars=FUNCTION_TARGET=processFileTask,GCLOUD_PROJECT=<PROJECT_ID>
```

## 2. Firebase Functionsのデプロイ

### ステップ1: TypeScriptビルド

```bash
cd functions
npm run build
```

### ステップ2: 関数をデプロイ

```bash
firebase deploy --only functions
```

デプロイされる関数：
- `importClassroomSubmissions` - Classroomデータ取得とインポート制御
- `getImportStatus` - インポート進捗取得
- `deleteArtwork` - 作品削除
- `deleteAllData` - 全データリセット
- `deleteGalleryData` - ギャラリー別データ削除
- `cleanupTempFiles` - 一時ファイルクリーンアップ（スケジュール実行）

## 3. Firebase Hostingのデプロイ

### ステップ1: Next.jsアプリをビルド

```bash
npm run build
```

### ステップ2: Hostingにデプロイ

```bash
firebase deploy --only hosting
```

## 4. Security Rulesのデプロイ

### Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Storage Rules

```bash
firebase deploy --only storage
```

## 5. 全てをまとめてデプロイ

```bash
# Functions + Hosting + Rules を一度にデプロイ
firebase deploy --only functions,hosting,firestore:rules,storage
```

**注意:** Cloud Runは別途手動でデプロイする必要があります。

## 6. Cloud Tasksキューの作成（初回のみ）

本番環境では、Cloud Tasksキューを作成する必要があります：

```bash
gcloud tasks queues create file-processing-queue \
  --location=asia-northeast1 \
  --max-attempts=3 \
  --max-retry-duration=600s
```

## 環境変数の設定

### 開発環境 (`.env.local`)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=dev_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dev_project_id
NEXT_PUBLIC_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/dev_project_id/asia-northeast1
```

### 本番環境 (`.env.production`)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=prod_api_key
NEXT_PUBLIC_FIREBASE_PROJECT_ID=online-review-gallery
NEXT_PUBLIC_FUNCTIONS_BASE_URL=https://asia-northeast1-online-review-gallery.cloudfunctions.net
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

## GitHub Actionsによるデプロイ

本番の自動デプロイは無効化し、PRのプレビューのみGitHub Actionsで実行します。  
本番デプロイは手動で実行してください。

### ワークフロー

- `.github/workflows/firebase-hosting-pull-request.yml`  
  PRごとにPreviewチャネル（`pr-<番号>`）へデプロイ。
- `.github/workflows/firebase-hosting-deploy.yml`  
  手動実行（`workflow_dispatch`）で本番（live）へデプロイ。

### 手動デプロイの実行手順

GitHub の Actions タブから `Deploy to Firebase Hosting (manual)` を選び、`Run workflow` を実行します。

### 必要なシークレット

GitHub リポジトリの Settings > Secrets and variables > Actions に以下を設定：

- `FIREBASE_TOKEN`: Firebase CLIトークン（`firebase login:ci`で発行）

## デプロイ後の確認事項

### 1. アプリケーションの動作確認

- [ ] https://online-review-gallery.web.app にアクセス
- [ ] Google Sign-Inが正常に動作するか
- [ ] ギャラリーページが表示されるか
- [ ] インポート機能が動作するか

### 2. Cloud Runの動作確認

```bash
gcloud run services list --region=asia-northeast1
```

### 3. Functionsの動作確認

```bash
firebase functions:log --only importClassroomSubmissions
```

### 4. Security Rulesの確認

Firebase Console > Firestore > ルール で、ルールが正しくデプロイされているか確認

## ロールバック手順

### Hostingのロールバック

```bash
# デプロイ履歴を確認
firebase hosting:channel:list

# 以前のバージョンに戻す
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

### Functionsのロールバック

Firebase Consoleから手動で以前のバージョンに戻すことができます。

## トラブルシューティング

### デプロイエラー: "Permission denied"

```bash
# Firebase再認証
firebase login --reauth

# gcloud再認証
gcloud auth login
```

### Functions実行エラー

```bash
# リアルタイムログを確認
firebase functions:log

# 特定の関数のログ
firebase functions:log --only importClassroomSubmissions
```

### Cloud Runエラー

```bash
# ログを確認
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

## 参考リンク

- [Firebase Hosting ドキュメント](https://firebase.google.com/docs/hosting)
- [Firebase Functions ドキュメント](https://firebase.google.com/docs/functions)
- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
