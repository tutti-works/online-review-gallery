# ドキュメント索引

このディレクトリには、オンライン講評会支援ギャラリーアプリの各種ドキュメントが格納されています。

## 📋 目次

### コアドキュメント
- [requirements.md](requirements.md) - システム要件定義書
- [changelog.md](changelog.md) - 開発履歴と変更ログ
- [GLOSSARY.md](GLOSSARY.md) - 用語集・命名規則
- [TESTING.md](TESTING.md) - テストシナリオ

### 機能仕様
- [features/import-feature.md](features/import-feature.md) - インポート機能（F-02-07, 08, 09）
- [features/gallery-and-feedback.md](features/gallery-and-feedback.md) - ギャラリー・フィードバック（F-03, 04, 05）
- [features/ANNOTATION_FEATURE.md](features/ANNOTATION_FEATURE.md) - アノテーション機能（F-06）
- [features/BACKGROUND_IMPORT.md](features/BACKGROUND_IMPORT.md) - 背景インポート処理フロー

### 技術分析
- [COST_AND_PERFORMANCE.md](COST_AND_PERFORMANCE.md) - コスト・パフォーマンス分析
- [PDF_PROCESSING_GUIDE.md](PDF_PROCESSING_GUIDE.md) - PDF処理最適化ガイド

### 実装詳細
- [implementation/import-implementation.md](implementation/import-implementation.md) - インポート実装
- [implementation/data-migration.md](implementation/data-migration.md) - データマイグレーション

### セットアップガイド
- [setup/local-development.md](setup/local-development.md) - ローカル開発環境
- [setup/cloud-run-deployment.md](setup/cloud-run-deployment.md) - Cloud Runデプロイ
- [setup/production-deployment.md](setup/production-deployment.md) - 本番環境デプロイ

### アーカイブ
- [archive/](archive/) - 履歴ドキュメント・参考資料

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
