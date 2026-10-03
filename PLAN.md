# 現在の状態と残課題

更新: 2026-10-03。2026-09-27のmain（`048d854`、Issue #22 / PR #23反映後）を基礎に、入口504対策の実装と本番反映を追記しています。履歴は [変更履歴](docs/changelog.md)、仕様・運用は [文書索引](docs/README.md) を参照してください。デプロイ状態確認とユーザーの実授業インポート確認は区別します。

## 現在の実装・運用方針

| 項目 | 状態・参照先 |
|---|---|
| 認証・管理者 | Googleログインは `/`、adminは `/dashboard` へ。匿名ログインなし。Issue #22の共通入場制限によりShowcaseを含めadminのみ利用可能。非adminは案内のOK後にログアウト。[管理者管理](docs/features/admin-management.md)で追加・削除・最終admin保護とAPI／Rulesの境界を説明。 |
| 講評・アーカイブ | Issue #10の赤・青・緑ラベル、個別／合計点フィルター、Issue #11の授業単位アーカイブを実装。[機能仕様](docs/features/gallery-and-feedback.md)。 |
| インポート | Issue #4の管理API認証、#8の提出単位の状態・安定ID・冪等化を実装。#8は2026-09-23本番反映とユーザーのインポート確認を記録。[実装と制約](docs/implementation/import-idempotency.md)。入口504対策は2026-10-03にFunctions／専用queue／Hosting・生成SSRへ本番反映済み。認証付きTask配送と稼働状態を確認し、実授業インポートはユーザー確認待ち。[初期化Task化](docs/implementation/import-initialization.md)。 |
| 実行環境 | Issue #5・#9でFunctions／Cloud Run／Hosting生成SSRをNode.js 22へ移行。SSRの決定元はルート `package.json` の `engines.node`。[SSR記録](docs/implementation/hosting-ssr-node22.md)。 |
| CI | Issue #17で検証専用CIを導入、Hooks lint警告を解消。main push／PRで型・lint（警告0）・軽量テスト・Next buildを検証。Functions・Emulator・本番確認は含まない。[テスト範囲](docs/TESTING.md)。自動デプロイなし。 |
| 依存更新 | Issue #19で限定的なpatch/minor更新。ルート `firebase-admin` はSSR互換性のため13.10.0固定。[監査資料](docs/security/README.md)の件数は調査時点の値。 |
| Next.js移行 | Issue #20 / PR #21は**移行見送り**。生成SSRに旧sharpを導入するadapter制約が残り、PRは未mergeで終了。main／本番のNext.js 14系を維持し、脆弱性は未解消。[再検討条件](docs/security/generated-ssr-sharp-issue20.md)。 |
| Storage・Git履歴 | Issue #6のStorage非公開化、#7の `users.json` 追跡停止は対応済み。未参照objectと旧Git履歴の判断は下記に残す。 |

## 未対応課題

| ID | 優先度 | 残っている作業 |
|---|---|---|
| IMP-TIMEOUT-01 | 本番確認待ち | 開始APIをジョブ登録・Task投入へ変更し、初期化を背景化。名簿プロフィール再利用・経過時間ログを含め、2026-10-03に本番反映済み。認証付き配送・無認証拒否・配信ファイルを確認。実授業での開始応答時間・完了・再インポートの確認が残る。[変更と制約](docs/implementation/import-initialization.md)。 |
| IMP-PDF-01 | Medium | PDFの50ページ上限・20MB制限を、重い変換・downloadより前に判定する。 |
| TEST-CI-01 | High | 導入済みのフロント検証CIに、Functions build/testとRulesのEmulatorテストをどう組み込むか整理し、提出進捗・再送・部分失敗の検証を拡充する。 |
| DEPLOY-BUILD-01 | Medium | Functionsのpredeploy/buildを必須にし、未生成・古い `lib` の手動配布を防ぐ。現状 `functions` のdeployスクリプトはbuildするが、直接のFirebase CLI実行を強制保護していない。 |
| DATA-DELETE-01 | Medium | Gallery/Artwork削除の部分成功、Showcase文書・画像・選定IDの削除漏れを解消する。 |
| DATA-LIKE-01 | Medium | like文書と `likeCount` の更新をトランザクション化する。 |
| CFG-INDEX-01 | Medium | `galleryId + createdAt` 複合indexの本番状態を確認し、必要な定義を構成管理する。 |
| API-DEAD-01 | Medium | 未使用のClassroom course/assignment APIとmock応答の利用実績を確認し、削除または分離する。 |
| SEC-DEPS-01 | High | Next／生成SSRの残存依存リスクを追跡。公式adapterが修正版sharpを許容する等の条件が満たされたら、その時点のmainから新Issueで再検討する。#20のCloseを修正完了と扱わない。 |
| PRIV-REPO-01 | High・要判断 | `users.json` の旧Git履歴に残る情報の実データ性・履歴除去・対象者対応の要否を判断。[調査記録](docs/implementation/users-json-history.md)。履歴rewrite／force pushは別承認。 |
| SEC-STORAGE-ORPHAN | 要判断 | Issue #6の本番dry-runで未参照とされた26 objectは保持した記録がある。用途・復旧可能性・現在の参照状態を再確認し、削除は別承認。[移行記録](docs/implementation/storage-privacy-migration.md)。 |

Issue #24で文書の入口・要件・背景インポート説明を整理したため、旧DOC-DRIFT-01はこの一覧から外しました。旧QA-01のHooks警告はIssue #17で対応済みです。新しいずれは個別に記録します。

## 検証・運用上の制約

- mainへの反映と本番デプロイは別です。Issue #19の依存更新については、mainの実装だけで本番反映済みとは扱いません。
- Issue #22 / PR #23の入場制限は、2026-09-27にHosting / 生成SSRへ本番反映済みで、ユーザーによる本番動作確認も完了しています（ユーザー報告）。
- Issue #8の本番インポート確認は、強制終了・Task再送・部分失敗の全条件を実地検証した記録ではありません。強制終了時はメモリ内の生成pathによる補償削除が走らないため、停止ジョブ・孤立objectの確認が必要です。
- 依存監査はroot・Functions・生成SSRを分けて扱います。古い監査件数は現在値として転載せず、[セキュリティ索引](docs/security/README.md)から対象と日付を確認します。
- 70〜100人規模の仮想化、Showcase集約キャッシュ、コメント・注釈のサブコレクション化は、実測上の問題が出るまで優先しません。旧見積もりは [技術分析](docs/COST_AND_PERFORMANCE.md) に残します。
