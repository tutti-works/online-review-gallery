# ATRIA 現在の要件・仕様

更新: 2026-09-27。main `048d854`（Issue #22 / PR #23反映後）に照合した仕様の入口です。実装済みの機能と性能目標を区別します。本番反映の記録・残課題は [PLAN](../PLAN.md)、詳細資料は [文書索引](README.md) を参照してください。

## 目的

Google Classroomの設計課題等を学生単位でまとめ、PDF・画像をWebPに変換して閲覧・講評できるようにします。管理者によるフィードバックと、選定作品のShowcase展示を支援します。

## 認証と利用者

- **F-01-01**: Firebase AuthenticationのGoogleログインを使用します。入口は `/`、adminのログイン後は `/dashboard` へ遷移し、旧 `/login` は `/` へ転送します。匿名ログインは提供しません。
- **F-01-02**: `userRoles/{email}` のロールを読み、未登録・メールなし・読み取り失敗はguestとして扱います。開発Emulatorも事前のadmin登録が必要です。
- **F-01-03**: Issue #22の暫定admin-onlyにより、認証状態・ロールの確認が終わるまで待機し、admin以外にはアプリを描画しません。案内のOK後にログアウトして `/` へ戻ります。旧匿名セッション、直接URLアクセス、利用中の権限削除、Showcaseも対象です。

| 保存されるロール | 現在のアプリ利用 |
|---|---|
| admin | 閲覧、講評、インポート、アーカイブ、管理者管理等。Showcaseでは学内ドメイン条件も必要。 |
| viewer / guest | ロールは保持するが、共通入場制限で利用不可。viewer表示の確認はadminのShowcase閲覧モードで行う。 |

共通ゲートはクライアントの入場制限です。APIの認証・admin判定、Firestore／Storage Rulesは独立した境界で、viewer等の既存API／Rules権限を一律に無効化したものではありません。ロール管理は `/admin/users` と認証済みサーバーAPIから行い、最後のadminを保護します。詳細は [管理者管理](features/admin-management.md) を参照してください。

## 機能要件

### インポート（F-02）

- **F-02-01〜04**: adminが授業・課題を選び、Classroom／Driveの提出物を取得。同じ学生の複数ファイル・ページを1作品にまとめ、元ファイル情報と生成画像pathを保存します。画像はSharp、PDFはCloud Runの変換処理でWebP化します。
- **F-02-05〜06**: 入口で同期初期化後、Cloud Tasksで変換処理を進めます。開始応答を受け取ってからギャラリーへ移り、学生提出単位の進捗を監視します。初期化中の504は既知の残課題で、開始直後から安全にページを閉じられるとは保証しません。
- **F-02-07**: 再インポートは既存submitted作品を保護してスキップし、not_submitted／error作品は同じIDで上書き対象にします。学生キー・Task再送・完了集計は [提出単位の実装](implementation/import-idempotency.md) に従います。
- **F-02-08〜09**: 未提出・サポート外形式をプレースホルダーで表示します。提出処理の失敗と作品のstatusは区別します。

利用仕様は [インポート機能](features/import-feature.md)、画面遷移・監視範囲は [背景インポート](features/BACKGROUND_IMPORT.md) を参照してください。

### ギャラリー・講評（F-03、F-04）

- **F-03-01〜05**: CSS Grid一覧、作品モーダル、複数ページ、作品間移動、ズーム・パン、提出日時／学籍番号順、ラベル・未提出／エラーフィルター、授業・課題の切り替えを提供します。
- **F-04-01〜02**: adminがいいねの付与・解除とテキストコメントを投稿できます。
- **F-04-03**: 赤・青・緑の各1〜5を色ごとに0〜1個入力できます。他色を保持するtransaction更新を行います。個別ラベルのORフィルターと合計点フィルターは排他的で、合計は最大15点です。これは講評の補助であり正式な成績簿ではありません。
- **F-04-04**: adminが確認後に作品を削除できます。FirestoreとStorageをまたぐ削除の原子性は保証しておらず、部分成功は残課題です。

操作・フィルターの詳細は [ギャラリー・フィードバック](features/gallery-and-feedback.md) にまとめます。

### データ管理・授業アーカイブ（F-05）

- **F-05-01〜03**: adminによる全データリセット、課題単位のデータ削除、作品数キャッシュの同期を提供します。
- 授業アーカイブは `archivedCourses/{courseId}` の有無で判定します。現役は `/gallery`、アーカイブ済みは `/archive` に表示し、同じ講評機能を利用できます。作品・画像の移動や削除は行いません。
- 通常・アーカイブの最終閲覧課題を別々に保持します。Showcaseへの選定・同期は独立した操作です。

### 注釈（F-06）

adminがKonvaで描画・選択・移動・消去、Undo／Redoを行い、ページ単位の線データをFirestoreに保存します。ドラフト保存、表示切り替え、ズーム・パン連携、タッチ入力に対応します。詳細は [注釈機能](features/ANNOTATION_FEATURE.md) を参照してください。

### Showcase

専用ログイン・一覧・課題詳細・作品ビューを備え、選定した作品を手動同期します。共通admin-onlyに加えて `musashino-u.ac.jp` とそのサブドメインの制限があります。課題タイトル・代表作品・概要画像・選定順などの仕様は [Showcase](showcase/REQUIREMENTS.md) を参照してください。

## 非機能要件

| 項目 | 目標・制約 |
|---|---|
| 性能 | 主要コンテンツの初回描画3秒以内、約100件規模の安定した取り込みを目標とする。達成保証や最新計測値ではない。入口504・PDF早期制限はPLANに残す。 |
| UI・動作環境 | PC・タブレットを中心にレスポンシブ表示。Chrome／Safari／Firefox／Edgeを対象とし、端末ごとの操作確認と自動テストを区別する。 |
| セキュリティ | Firebase Auth、サーバーAPI、Rulesで認可する。画像は非公開Storageから認証付き取得。admin-onlyのUIゲートだけをデータ保護の根拠にしない。 |
| 信頼性 | Taskの重送・提出単位の状態管理で整合性を保つ。強制終了時の補償処理やサービス間削除には制約がある。 |
| 可用性 | Firebase／Google Cloudの提供条件を前提とする。オフライン完結や独自の稼働率保証は対象外。 |

## 構成・データ・運用

- Next.js 14、React 18、TypeScript、Tailwind CSS、Konvaを使用。Next.js 15は [移行見送り](security/README.md) で、既知リスクは残ります。
- Functions Gen2、Cloud Run、Cloud Tasks、Firestore、Firebase Storage、Firebase Authenticationを使用。Node.js 22はルート・Functions・コンテナで指定します。
- Firebase framework-aware HostingがSSR Functionを生成します。rootの `engines.node` がSSR runtimeの決定元です。ルートの `firebase-admin` は13.10.0固定、Functions側の依存とは別です。
- [データ構造](implementation/data-model.md) は実装の型・コレクション・互換フィールドへの入口です。仕様書に型定義を重複コピーしません。
- [CI](TESTING.md#github-ci検証専用) は型・lint・軽量テスト・Next buildを検証し、デプロイしません。Emulator／Functions／実アカウントの検証は別です。
- 起動は [ローカル開発](setup/local-development.md) または [Read-Onlyプレビュー](ui-preview.md)、反映は [本番デプロイ](setup/production-deployment.md) と [Cloud Run](setup/cloud-run-deployment.md) を参照してください。

## 対象外と過去計画

動画ストリーミング、学生同士の講評、リアルタイム共同編集、オフライン完結、利用統計ダッシュボードは対象外です。管理者ロールの追加・削除は実装済みですが、Googleアカウント自体の作成・削除機能ではありません。

過去の注釈拡張案・工数・実装計画は [旧ロードマップ](archive/annotation-roadmap-2025.md) へ分離しました。採用済みの現在要件ではありません。開発履歴は [changelog](changelog.md) に集約し、今後の優先順位は [PLAN](../PLAN.md) で管理します。
