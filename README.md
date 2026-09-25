# オンライン講評会支援ギャラリーアプリ

Google Classroomの課題提出物を自動取得し、レスポンシブCSS Gridのギャラリーで表示するWebアプリケーションです。

## 📚 ドキュメント

詳細なドキュメントは [docs/](docs/) ディレクトリを参照してください。

- **[docs/README.md](docs/README.md)** - ドキュメント索引
- **[docs/requirements.md](docs/requirements.md)** - 要件定義書
- **[docs/setup/local-development.md](docs/setup/local-development.md)** - ローカル開発環境セットアップ
- **[docs/setup/cloud-run-deployment.md](docs/setup/cloud-run-deployment.md)** - Cloud Runデプロイガイド
- **[docs/setup/production-deployment.md](docs/setup/production-deployment.md)** - 本番環境デプロイガイド
- **[docs/changelog.md](docs/changelog.md)** - 変更履歴
- **[PLAN.md](PLAN.md)** - 現在の残課題と完了済みIssue
- **[docs/audit-2026-09-22.md](docs/audit-2026-09-22.md)** - 2026-09-22時点の再監査記録

## 🚀 クイックスタート

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd online-review-gallery
```

### 2. 依存関係をインストール

```bash
npm install
cd functions && npm install && cd ..
```

### 3. 環境変数を設定

`.env.local`ファイルを作成し、Firebase設定を追加します。

詳細は [docs/setup/local-development.md](docs/setup/local-development.md) を参照してください。

### 4. Firebase Emulatorを起動

```bash
firebase emulators:start
```

### 5. 開発サーバーを起動

別のターミナルで：

```bash
npm run dev
```

アプリケーションが `http://localhost:3000` で起動します。

## 🛠 技術スタック

- **フロントエンド**: Next.js 14, React, TypeScript, Tailwind CSS
- **バックエンド**: Firebase Functions (Gen2), Cloud Run
- **データベース**: Cloud Firestore
- **ストレージ**: Firebase Storage
- **認証**: Firebase Authentication (Google Sign-In)
- **ホスティング**: Firebase Hosting
- **外部API**: Google Classroom API, Google Drive API

## 📦 主な機能

- ✅ Google Classroomからの自動データインポート
- ✅ レスポンシブCSS Gridギャラリー表示
- ✅ PDF・画像ファイルのWebP変換（高品質・軽量化）
- ✅ 複数ファイル提出の統合処理
- ✅ いいね・コメント機能
- ✅ ラベル機能（個別・合計フィルタリング対応予定）
- ✅ 作品の拡大表示・ズーム・パン機能
- ✅ ギャラリー別データ管理
- ✅ 授業単位のアーカイブ表示切り替え

## 📄 ライセンス

このプロジェクトは教育目的で開発されています。

## 🙋 サポート

質問や問題がある場合は、[Issues](https://github.com/tutti-works/online-review-gallery/issues)で報告してください。
