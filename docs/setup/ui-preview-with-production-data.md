# 本番データを利用したローカルUIプレビュー手順（Read-Only Mode）

本ドキュメントでは、本番Firebaseプロジェクト（Authentication / Firestore / Storage）の実際のアカウントおよび実データを使用しながら、ローカル開発サーバー（Next.js）上でUIの確認やデザイン更新を安全に行う手順を説明します。

---

## 1. 概要・システム構成

本構成では、ローカル開発サーバーから直接本番Firebaseへ接続します。

- **UIコード**: ローカル開発サーバー (`http://localhost:3000`)
- **Firebase Authentication**: 本番
- **Firestore**: 本番
- **Firebase Storage**: 本番
- **本番データ保護**: **Read-Only Mode（読み取り専用保護モード）**

誤操作やUI確認操作によって本番データが変更・削除されることを防止するため、**Read-Only Mode** が導入されています。

---

## 2. 環境変数の設定 (`.env.local`)

プロジェクトルートの `.env.local` に以下を設定します（`.env.local` は Git 管理対象外です）。

```bash
# ========================================
# Firebase Configuration（本番プロジェクト設定）
# ========================================
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAd8mAUHsMbHIn_-WdHflDcIJH2LQf9A60
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=online-review-gallery.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=online-review-gallery
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=online-review-gallery.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=816131605069
NEXT_PUBLIC_FIREBASE_APP_ID=1:816131605069:web:7e7c4071893a9cfc23d204
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-Z0GDWHZBPQ

# ========================================
# Firebase Functions Base URL
# ========================================
NEXT_PUBLIC_FUNCTIONS_BASE_URL=https://asia-northeast1-online-review-gallery.cloudfunctions.net

# ========================================
# Emulator Settings（本番接続のためすべて false）
# ========================================
NEXT_PUBLIC_USE_AUTH_EMULATOR=false
NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=false

# ========================================
# 本番データ保護（Read-Only Mode）
# ========================================
# true に設定することで、Firestoreへの書き込みや破壊的Functions呼び出しが安全にブロックされます
NEXT_PUBLIC_READ_ONLY_MODE=true
```

---

## 3. 本番データ保護（Read-Only Mode）の仕組み

`NEXT_PUBLIC_READ_ONLY_MODE=true` が設定されている場合、アプリは「本番データ保護モード」として動作します。

### ブロック・保護される操作一覧
1. **Firestoreへの書き込み・更新・削除**:
   - 作品への「いいね」追加・解除
   - 講評コメントの投稿
   - 評価ラベル（赤・青・緑・黄・紫）のトグル更新
   - 画面注釈（ペン描画アノテーション）の保存・更新・削除
   - 授業アーカイブ状態の変更（アーカイブ / アーカイブ解除）
   - 新規ギャラリー作成
2. **Firebase Functions呼び出し**:
   - `/deleteArtwork`（作品削除）
   - `/deleteGalleryData`（課題データ削除）
   - `/deleteAllData`（全システムデータリセット）
   - `/syncGalleryArtworkCount`（作品数同期）
   - `/importClassroomSubmissions`（Google Classroomインポート）

### UI上の表示
- ヘッダーおよびログイン画面に `[ 🔒 READ-ONLY MODE ]` バッジが表示されます。
- 万が一操作ボタンをクリックした場合でも、本番APIは一切呼び出されず、画面下部にトースト通知（「【本番データ保護】プレビューモードのため〜は無効化されています」）が表示されます。

---

## 4. 起動手順

1. 依存関係のインストール（初回のみ）:
   ```bash
   npm install
   ```

2. ローカル開発サーバーの起動:
   ```bash
   npm run dev
   ```

3. ブラウザでアクセス:
   ```
   http://localhost:3000
   ```

4. 実際の本番Googleアカウント、または「ゲストとして閲覧」からログインしてUIを確認します。

---

## 5. Firebase Storage CORS設定に関する注意事項

本番 Firebase Storage の画像を `localhost` から読み込む際、ブラウザのセキュリティ仕様により CORS（Cross-Origin Resource Sharing）設定が影響する場合があります。

### 現状の設定 (`cors.json`)
リポジトリ内の `cors.json` では以下のオリジンが許可されています：
- `https://online-review-gallery--pr-1-zay8pa1p.web.app`
- `https://*.web.app`
- `https://*.firebaseapp.com`
- `https://online-review-gallery.vercel.app`
- `https://*.vercel.app`

### localhost からの読み取りについて
- 通常の `<img>` タグによるサムネイル・画像表示は GET リクエストで表示可能です。
- ただし、Canvas（注釈描画テクスチャ）や `fetch` / `getBlob` を使用する箇所でオリジン間リクエストが必要な場合、`http://localhost:3000` が未許可のためブラウザコンソールに CORS エラーが出る可能性があります。

### 必要な対応（本番設定変更が必要な場合）
Storage バケットに対して `http://localhost:3000` を許可する場合は、Google Cloud CLI (`gcloud` / `gsutil`) で以下の更新を行います：

1. `cors.json` に `"http://localhost:3000"` を追加
2. コマンド実行（要 GCP 権限）:
   ```bash
   gsutil cors set cors.json gs://online-review-gallery.firebasestorage.app
   ```
※ 本番設定の変更となるため、管理者（プロジェクトオーナー）の確認後に実施してください。
