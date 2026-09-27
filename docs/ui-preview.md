# UIプレビュー

`npm.cmd run dev:preview -- --port 3000` で起動し、Chromeで http://localhost:3000/gallery を開きます。

- `.env.local` のFirebase接続情報を使用します。エミュレーター接続は無効です。
- `/` からGoogleログインを利用できます。旧 `/login` は `/` へリダイレクトします。
- 作品画像は、ログイン中のFirebase IDトークンをローカルのGET専用API経由でStorageへ送って取得します。サービスアカウントは使いません。Storage Rulesでアクセスを判定します。
- プレビューではFirestore・Storageの保存、削除、インポートや同期へのPOSTを停止します。Firestoreはメモリーキャッシュを使います。
- 通常の開発は `npm.cmd run dev`。プレビューAPIは通常開発・本番で404になります。
- 暫定admin-only制限が適用されるため、登録済みadminでログインします。Emulatorを含め、管理者ロールの自動作成はありません。[管理者管理](features/admin-management.md)を参照してください。

保護の確認: `node --test test/localPreview.test.cjs`
