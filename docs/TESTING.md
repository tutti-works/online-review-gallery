# テストとCI

更新: 2026-09-27。現在の [package.json](../package.json)、[Functions package](../functions/package.json)、[CI workflow](../.github/workflows/ci.yml) に照合した実行方法です。テスト件数は固定せず、実行時の結果を記録してください。

## GitHub CI（検証専用）

mainへのpushとPull RequestでNode.js 22を使い、以下を順に実行します。

```bash
npm ci
npm run typecheck
npm run lint -- --max-warnings=0
npm run test:auth-flow
npm run test:review-labels
npm run test:course-archive
npm run test:local-preview
npm run test:admin-users
npm run build
```

Firebase設定はworkflow内のダミー値を使います。Secrets・本番認証情報は不要で、Emulator・外部サービス依存テスト・Functions build/testは含みません。build時のGoogle Fonts取得には通信が必要です。

CIはデプロイも本番データへのアクセスも行いません。CI成功は実アカウントのGoogleログイン、Storage画像／CORS、Classroom import、本番UI確認の代わりにはなりません。lint警告は0件が必須です。その他の警告は [CI警告記録](ci-warnings.md) と比較します。

## ローカル自動テスト

Windowsでは `npm.cmd` を使用できます。

| コマンド | 検証対象・境界 |
|---|---|
| `npm run test:auth-flow` | ログイン遷移、admin-only、旧匿名セッション、ロール反映等の回帰チェック。実Google認証は行わない。 |
| `npm run test:review-labels` | 色別変更、合計点、ラベル候補・フィルター。 |
| `npm run test:course-archive` | 表示区分、URL／保存済み課題の選択。 |
| `npm run test:local-preview` | Read-Onlyガード・Storage API境界。 |
| `npm run test:admin-users` | 管理APIの入力・認証・プレビュー拒否等。 |
| `npm run test:admin-users:emulator` | 専用demoプロジェクトのFirestoreで本番Rules・同時更新・最終admin保護を検証。Java 21が必要。 |
| `npm run test:storage-rules` | Auth／Firestore／Storage Emulatorで認証read・admin write、Showcaseのドメイン制限、一時ファイル拒否を検証。 |
| `npm --prefix functions test` | FunctionsのTypeScript buildと `functions/test/*.test.js`。HTTP認証・提出状態等のユニットテスト。 |

管理者管理のEmulator設定は [管理者管理](features/admin-management.md#検証)、コンテナ検証は [Cloud Run](setup/cloud-run-deployment.md) を参照してください。開発用Rulesと本番Rulesを混同せず、テスト対象の設定ファイルを確認します。

## 手動確認が必要な機能

書き込みの検証はEmulator等の検証環境で行います。本番操作は承認後にユーザーが確認します。Read-Onlyプレビューは書き込み成功の検証には使いません。

- 認証: adminの入場、viewer／guest／未登録・ロール取得失敗の案内、OK後のログアウト、権限削除・リロード・直接URLアクセス。Showcaseには学内ドメイン条件もある。
- 管理者: 追加・重複・削除、自己削除確認、最後のadmin保護。Googleアカウント自体を削除しないこと。
- 講評: 複数ページ・作品移動、いいね、コメント、色別ラベルと合計点、注釈の描画・保存・ズーム・パン。
- アーカイブ: 同一授業の全課題が表示区分を切り替え、通常／アーカイブの選択履歴が混ざらないこと。
- インポート: 初回・submittedのスキップ・未提出／errorの上書きとID維持、提出単位の進捗、部分失敗・再送・作品数の整合性。入口504や強制終了は [既知の制約](implementation/import-idempotency.md) と区別する。
- Showcase: 選定・同期・概要画像・閲覧モード、Storage実画像の認証取得。

性能確認にはファイルサイズ・ページ数・環境・所要時間を併記します。旧資料の秒数や読み取り回数を現在の合否基準・実測値として流用しません。

## 過去のシナリオ

[2025年の手動テストシナリオ](archive/manual-test-scenarios-2025.md) は履歴です。古い件数更新・キャッシュ・性能の期待値を含むため、現在の実装と照合してからケースを再利用してください。
