# ドキュメント索引

このディレクトリには、オンライン講評会支援ギャラリーアプリの各種ドキュメントが格納されています。

## 📋 目次

### 要件定義・仕様
- [requirements.md](requirements.md) - システム要件定義書（機能要件・非機能要件・データ構造）

### セットアップガイド
- [setup/local-development.md](setup/local-development.md) - ローカル開発環境のセットアップ
- [setup/cloud-run-deployment.md](setup/cloud-run-deployment.md) - Cloud Run（PDF処理）のデプロイ手順
- [setup/production-deployment.md](setup/production-deployment.md) - 本番環境デプロイガイド

### 変更履歴
- [changelog.md](changelog.md) - 詳細な開発履歴と変更ログ

## 🚀 クイックスタート

初めて開発を始める方は、以下の順番でドキュメントをお読みください:

1. [requirements.md](requirements.md) - システム全体の理解
2. [setup/local-development.md](setup/local-development.md) - 開発環境構築
3. [setup/cloud-run-deployment.md](setup/cloud-run-deployment.md) - PDF処理機能のデプロイ（必要に応じて）

## 📦 プロジェクト構成

```
online-review-gallery/
├── docs/                      # このディレクトリ
├── src/                       # フロントエンドソースコード
├── functions/                 # バックエンド（Firebase Functions + Cloud Run）
├── firestore.rules            # Firestoreセキュリティルール
├── storage.rules              # Storageセキュリティルール
└── firebase.json              # Firebase設定
```

## 🔗 関連リンク

- [Firebase Console](https://console.firebase.google.com/project/online-review-gallery)
- [Google Cloud Console](https://console.cloud.google.com/home/dashboard?project=online-review-gallery)
- [本番アプリケーション](https://online-review-gallery.web.app)
