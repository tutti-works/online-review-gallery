# ローカル開発環境セットアップガイド

このガイドでは、オンライン講評会支援ギャラリーアプリをローカル環境で開発するためのセットアップ手順を説明します。

## 前提条件

- **Node.js 20以上**
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Googleアカウント**（Google Classroom APIアクセス用）

## 1. 環境変数の設定

プロジェクトルートに`.env.local`ファイルを作成し、以下の環境変数を設定してください：

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

## トラブルシューティング

### Firebase Emulatorが起動しない

- ポートが既に使用されていないか確認してください
- `firebase emulators:start --project=your-project-id` で明示的にプロジェクトIDを指定してください
- `Cannot emulate a web framework...` というエラーが出る場合、以下のコマンドで実験的機能を有効にしてください：
```bash
firebase experiments:enable webframeworks
```

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

## 次のステップ

- [Cloud Runデプロイガイド](cloud-run-deployment.md) - PDF処理機能のデプロイ（本番環境のみ）
- [本番デプロイガイド](production-deployment.md) - Firebase Hosting、Functionsのデプロイ
