# ドキュメント索引

更新: 2026-09-27。ATRIAの現在仕様・運用手順と、過去の調査根拠を分けて案内します。mainの実装と本番反映の記録は区別してください。

## 読み始める場所

- 初めて読む: [プロジェクトREADME](../README.md) → [現在の要件・仕様](requirements.md) → [ローカル開発](setup/local-development.md)
- 現在状態・次の作業を確認する: [PLAN](../PLAN.md)
- 過去の判断根拠を確認する: [変更履歴](changelog.md) → [調査・履歴](#調査履歴)

## 要件・仕様

| 資料 | 役割 |
|---|---|
| [requirements](requirements.md) | 現在の機能・非機能要件、構成、対象範囲 |
| [データ構造](implementation/data-model.md) | コレクションの対応と型・実装への入口 |
| [用語集](GLOSSARY.md) | 用語・命名・日付表記 |

## 機能仕様

- [ギャラリー・フィードバック](features/gallery-and-feedback.md): 評価ラベル、個別／合計点フィルター、授業アーカイブ、削除・同期
- [Classroom import](features/import-feature.md): 再インポート、スキップ・上書き、未提出・エラー
- [背景インポート](features/BACKGROUND_IMPORT.md): 同期初期化とTask処理、進捗復元の範囲
- [アノテーション](features/ANNOTATION_FEATURE.md): 描画・保存・操作と開発経緯

## 認証・管理者管理

- [管理者管理](features/admin-management.md): admin-only、ロール管理API、最後の管理者の保護、API／Rulesとの境界
- [認証要件](requirements.md#認証と利用者): `/`・旧 `/login`・匿名ログイン廃止・Showcase共通制限

## セットアップ・デプロイ

- [ローカル開発](setup/local-development.md): Node.js 22、Emulator、事前のadmin登録
- [UIプレビュー](ui-preview.md): 本番接続情報を使うRead-Only確認
- [本番デプロイ](setup/production-deployment.md): 承認後の手動反映と対象の切り分け
- [Cloud Runデプロイ](setup/cloud-run-deployment.md): PDF・画像変換コンテナ

## テスト・CI

- [TESTING](TESTING.md): 検証専用GitHub CI、ローカルテスト、手動検証の範囲
- [CI警告記録](ci-warnings.md): Issue #17で解消したHooks警告と、当時残した警告の判断

## セキュリティ・依存監査

- [セキュリティ索引](security/README.md): 現在の判断と各調査の対象・日付
- [Issue #19依存監査](security/dependency-audit-issue19.md): 限定更新・残存リスク。JSONは同資料から辿る詳細証跡
- [Next.js 15移行調査](security/next15-hosting-issue20.md) / [生成SSR sharp調査](security/generated-ssr-sharp-issue20.md): 未mergeの検証結果と再検討条件

## 実装詳細

- [提出単位の状態・冪等化](implementation/import-idempotency.md): Issue #8、現在のインポート制約
- [インポート実装の旧解説](implementation/import-implementation.md): 2025年の実装例（最新ロジックは上記参照）
- [Hosting生成SSR Node.js 22](implementation/hosting-ssr-node22.md): runtimeの決定元・移行記録
- [Storage非公開化](implementation/storage-privacy-migration.md): Issue #6の移行記録・手順
- [users.jsonのGit履歴](implementation/users-json-history.md): Issue #7の判断が必要な事項

## Showcase

- [Showcase仕様](showcase/REQUIREMENTS.md): 学内ドメイン制限、展示画面、手動同期・作品選定。共通admin-only制限も適用

## 調査・履歴

以下の数値・性能・未対応事項は各資料の記録時点のものです。現在の優先順位は [PLAN](../PLAN.md) を正とします。

- [主要変更履歴](changelog.md): 2026-09を含むmainの変更。デプロイ台帳とは別
- [2026-09-22再監査](audit-2026-09-22.md): 当時のコード・本番確認・判断
- [2026-02-08インポート障害分析](implementation/import-timeout-analysis-2026-02-08.md): 504の調査根拠
- [データマイグレーションの旧設計](implementation/data-migration.md): 2025年のstatus導入と参考スクリプト
- [コスト・パフォーマンス分析](COST_AND_PERFORMANCE.md) / [PDF処理分析](PDF_PROCESSING_GUIDE.md): 当時の条件での試算・処理設計
- [archive索引](archive/README.md): 注釈の過去計画、画像設定変更、旧ツール資料、バックアップの復元元

## 文書の更新方針

現在仕様は実装・設定・テストと照合し、詳細を同じ文書へ重複転記しないでください。歴史的資料は記録日と対象を保持し、現在仕様へのリンクを添えます。テスト数・監査件数・本番確認結果を更新するときは、実際に検証した対象と日付を明記します。
