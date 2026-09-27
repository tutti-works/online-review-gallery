# ATRIA — オンライン講評会支援ギャラリー

Google Classroomの提出物を取り込み、PDF・画像をWebPへ変換して作品を閲覧・講評するWebアプリです。

## 現在の状態

2026-09-27のmain（Issue #22 / PR #23反映後）を基準とします。本番の反映状況をこの文書更新で再検証したものではありません。

- Googleログインの入口は `/`、adminは `/dashboard` へ進みます。旧 `/login` は `/` に転送します。匿名ログインは提供しません。
- **暫定admin-only運用**です。viewer・guest・ロール未登録・ロール取得失敗時は利用制限案内を表示し、OK後にログアウトします。Showcaseにも適用します。API・Rulesの権限とアプリの入場制限は別です。
- Next.js 14 / React 18 / Node.js 22を使用します。Next.js 15移行はHosting adapterの依存制約で見送り、既知の依存リスクは残っています。
- GitHub Actionsは検証専用です。mainへのpushで本番デプロイは行いません。

残課題と判断事項は [PLAN](PLAN.md)、機能・運用・履歴の入口は [ドキュメント索引](docs/README.md) を参照してください。

## 開発を始める

Node.js 22を用意し、依存をインストールします（Windowsでは `npm.cmd` を使用できます）。

```bash
git clone https://github.com/tutti-works/online-review-gallery.git
cd online-review-gallery
npm ci
npm --prefix functions ci
```

続いて [ローカル開発ガイド](docs/setup/local-development.md) に従い、環境変数・Emulator・検証用adminを設定します。Emulatorでもadminの自動登録はしません。

```bash
npm run emulators
# 別ターミナル
npm run dev
```

本番接続情報を使って画面を確認する場合は、書き込みを停止する [UIプレビュー](docs/ui-preview.md) を使用してください。通常の開発起動はRead-Onlyではありません。

## 主な機能

- Classroom import、学生単位の複数ファイル統合、再インポート時のスキップ・上書き、未提出・エラー表示
- CSS Gridによる作品一覧、複数ページ表示、ズーム・パン、並び替え
- いいね・コメント・注釈、赤・青・緑の評価ラベルと個別／合計点フィルター
- 授業単位のアーカイブと専用 `/archive` 画面
- 管理者の追加・削除、最後の管理者の保護
- Showcaseの作品選定・手動同期・展示表示（学内ドメイン制限あり）

詳しくは [現在の要件・仕様](docs/requirements.md) と [管理者管理](docs/features/admin-management.md) を参照してください。

## 構成と運用

フロントエンドはNext.js・TypeScript・Tailwind CSS・Konva、バックエンドはFirebase Functions Gen2・Cloud Run・Cloud Tasksです。Firestoreと非公開のFirebase Storageを使用し、Firebase Authenticationで認証します。Firebase framework-aware HostingがSSR Functionを生成します。

- [テストとCI](docs/TESTING.md)
- [本番デプロイ](docs/setup/production-deployment.md)（承認後に対象を限定して手動実行）
- [セキュリティ調査の入口](docs/security/README.md)
- [変更履歴](docs/changelog.md)

## ライセンス・問い合わせ

教育目的で開発しています。質問・不具合は [GitHub Issues](https://github.com/tutti-works/online-review-gallery/issues) へ報告してください。
