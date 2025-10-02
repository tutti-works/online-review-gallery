# セットアップガイド

## 前提条件

- Node.js 20以上
- Firebase CLI (`npm install -g firebase-tools`)
- Googleアカウント（Google Classroom APIアクセス用）

## 1. 環境変数の設定

`.env.local`ファイルをプロジェクトルートに作成し、以下の環境変数を設定してください：

```bash
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Firebase Functions Base URL
# Development: Firebase Emulator
NEXT_PUBLIC_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/your-project-id/asia-northeast1
```

## 2. 依存関係のインストール

### フロントエンド

```bash
npm install
```

### Firebase Functions

```bash
cd functions
npm install
cd ..
```

## 3. Firebase Emulatorの起動

開発環境では、Firebase Emulatorを使用します。

```bash
firebase emulators:start
```

以下のサービスが起動します：
- **Authentication**: `http://localhost:9099`
- **Firestore**: `http://localhost:8080`
- **Storage**: `http://localhost:9199`
- **Functions**: `http://localhost:5001`
- **Emulator UI**: `http://localhost:4000`

## 4. 開発サーバーの起動

別のターミナルで以下を実行：

```bash
npm run dev
```

アプリケーションが `http://localhost:3000` で起動します。

## 5. 初期ユーザーの作成

開発環境では、初回ログイン時に自動的に`admin`ロールが付与されます。

1. `http://localhost:3000` にアクセス
2. Googleアカウントでサインイン
3. 自動的に管理者権限が付与されます

## 6. Cloud Tasksキューの作成（本番環境のみ）

本番環境では、Cloud Tasksキューを作成する必要があります：

```bash
gcloud tasks queues create file-processing-queue \
  --location=asia-northeast1 \
  --max-attempts=3 \
  --max-retry-duration=600s
```

## 7. Cloud Runへのデプロイ（processFileTask）

PDF処理機能（`processFileTask`）はGraphicsMagickが必要なため、Cloud Runにデプロイします。

**重要:** デプロイは手動で実行してください。

### ステップ1: TypeScriptをビルド

```bash
cd functions
npm run build
```

### ステップ2: Dockerイメージをビルド（Cloud Build使用）

**functionsディレクトリから実行：**

```bash
cd functions
gcloud builds submit --tag gcr.io/online-review-gallery/processfiletask --project=online-review-gallery
```

### ステップ3: Cloud Runにデプロイ

**1行コマンドで実行（改行なし）：**

```bash
gcloud run deploy processfiletask --image gcr.io/online-review-gallery/processfiletask --project=online-review-gallery --region=asia-northeast1 --platform=managed --no-allow-unauthenticated --memory=2Gi --timeout=1800 --min-instances=0 --max-instances=20 --cpu=1 --service-account=816131605069-compute@developer.gserviceaccount.com --set-env-vars=FUNCTION_TARGET=processFileTask,GCLOUD_PROJECT=online-review-gallery
```

詳細は [CLOUD_RUN_DEPLOYMENT.md](CLOUD_RUN_DEPLOYMENT.md) を参照してください。

## 8. Firebase Functionsのデプロイ（その他の関数）

```bash
# Functionsのビルド
cd functions
npm run build

# デプロイ
firebase deploy --only functions
```

## 9. Firestore Security Rulesのデプロイ

```bash
firebase deploy --only firestore:rules
```

## 10. Storage Rulesのデプロイ

```bash
firebase deploy --only storage
```

## トラブルシューティング

### Firebase Emulatorが起動しない

- ポートが既に使用されていないか確認してください
- `firebase emulators:start --project=your-project-id` で明示的にプロジェクトIDを指定してください

### Google Classroom APIのアクセスエラー

- Google Cloud Consoleで以下のAPIが有効になっているか確認：
  - Google Classroom API
  - Google Drive API
- OAuth同意画面が正しく設定されているか確認

### Firestoreのアクセス権限エラー

- Firestore Security Rulesが正しくデプロイされているか確認
- ユーザーロールが`userRoles`コレクションに登録されているか確認

## 主な機能

1. **認証機能**: Google Sign-In
2. **データインポート**: Google Classroomの課題提出物を自動取得
3. **ギャラリー表示**: Masonryレイアウトで作品を表示
4. **いいね機能**: 管理者が作品にいいねを付与
5. **コメント機能**: 管理者が作品にコメントを投稿

## ディレクトリ構造

```
.
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # Reactコンポーネント
│   ├── context/          # React Context (認証など)
│   ├── lib/              # Firebase設定
│   ├── types/            # TypeScript型定義
│   └── utils/            # ユーティリティ関数
├── functions/            # Firebase Functions
│   └── src/
│       ├── index.ts
│       ├── importController.ts
│       └── fileProcessor.ts
├── firestore.rules       # Firestore Security Rules
├── firebase.json         # Firebase設定
└── package.json
```