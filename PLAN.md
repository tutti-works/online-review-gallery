# 現在の残課題と改善計画

更新: 2026-09-23。この文書を**現在の状態と今後の作業**の入口とする。調査時点の根拠・旧優先順位は[2026-09-22再監査](docs/audit-2026-09-22.md)、実装・移行の詳細は[インポート](docs/implementation/import-idempotency.md)、[Storage非公開化](docs/implementation/storage-privacy-migration.md)、[Git履歴](docs/implementation/users-json-history.md)を参照。監査記録の「次に実施」などは当時の判断であり、この一覧を更新しない。

## 完了済み Issue

| Issue | 現在の状態 |
|---|---|
| #4 | HTTP管理APIのFirebase ID token / admin認証、status応答制限、機密ログ除去を本番反映。管理者ログイン・Classroomインポート確認済み。 |
| #5 | `functions/` のFirebase FunctionsとCloud RunをNode.js 22へ更新。依存整理、Docker build、画像・PDF変換とHTTP待受のsmoke test、本番反映済み。Hosting生成のSSR Functionは対象外。 |
| #6 | Storage非公開化を本番移行。Firestore path 1,193件補完、Rules・ACL・download token対応後のdry-runで未対応・欠損0件。未参照26 objectは保持。 |
| #7 | `users.json` の追跡停止をcommit・push済み。旧Git履歴への対応判断は未了。 |
| #8 | 学生提出単位の進捗、安定ID、Task冪等化、生成画像の補償削除を実装。2026-09-23にCloud Run → Firebase Functions → Hostingの順で本番反映し、ユーザーが本番インポートを確認。IssueはClose済み。 |

Issue #8の本番インポート確認は、強制終了・Task再送・部分失敗の全ケースを実地検証したことを意味しない。これらの制約は[実装詳細](docs/implementation/import-idempotency.md)に記す。

## 未対応課題

| ID | 優先度 | 次に行うこと |
|---|---|---|
| IMP-TIMEOUT-01 | High | インポート入口の同期Drive取得・既知504を解消。N+1と所要時間を計測し、必要なら初期化を非同期化する。 |
| IMP-PDF-01 | Medium | PDFの50ページ上限と20MB制限を重い変換・downloadより前に判定する。 |
| TEST-CI-01 | High | 認証・Rules・進捗・重送のテストを拡充し、Functions build/testをCIに組み込む。 |
| DEPLOY-BUILD-01 | Medium | Functionsのpredeploy/buildを必須にし、未生成・古い`lib`の手動配布を防ぐ。 |
| DATA-DELETE-01 | Medium | Gallery/Artwork削除の部分成功、Showcase文書・画像・選定IDの削除漏れを解消する。 |
| DATA-LIKE-01 | Medium | like文書と`likeCount`の更新をトランザクション化する。 |
| CFG-INDEX-01 | Medium | `galleryId + createdAt`複合indexの本番状態を確認し、必要な定義を構成管理する。 |
| API-DEAD-01 | Medium | 未使用のClassroom course/assignment APIとmock応答の利用実績を確認し、削除または分離する。 |
| DOC-DRIFT-01 | Medium | Background Importなど、現在の認証・同期初期化とずれる機能説明を修正する。 |
| QA-01 | Low | Hooks依存配列のlint警告4件を通常保守で解消する。 |
| SSR-NODE-01 | Medium | 現在のFirebase Hosting + Next.js構成で、Hosting生成SSR FunctionをNode.js 22へ上げる方法を調査する。現状は`functions/`側のFunctions / Cloud RunがNode.js 22、Hosting生成SSR FunctionがNode.js 20で、デプロイ時にサポート期限の警告が出る。実変更やApp Hosting移行の判断は別作業。 |
| PRIV-REPO-01 | High・要判断 | `users.json`は現行Git追跡から除外済み。旧Git履歴に残る2ユーザー分の情報について、実データ性、履歴除去・対象者対応の要否を判断する。履歴rewrite / force pushは別承認。 |
| SEC-STORAGE-ORPHAN | 要判断 | 本番dry-runで未参照と判定されたStorage object 26件を保持中。用途・復旧可能性を確認し、削除は別承認とする。 |

## 運用上の既知事項

- Issue #8のプロセス強制終了時はメモリ内の補償削除が走らない。停止ジョブ・孤立objectを監視し、Task再送の制約を[インポート実装詳細](docs/implementation/import-idempotency.md)で確認する。
- Issue #5後もproduction依存のaudit警告はroot 3件、Functions 4件残る。上流の修正版と互換性を確認してから更新する（[再監査](docs/audit-2026-09-22.md)）。
- 70〜100人規模では、ギャラリー仮想化、Showcase集約キャッシュ、コメント・注釈の即時サブコレクション化、全面的な構成変更は実測問題が出るまで優先しない。

優先順は、入口504とPDF負荷、CI・安全な配布、削除・集計整合性、文書と通常保守を基本とする。個人情報の旧履歴と未参照objectは、技術実装より先に所有者の判断が必要。
