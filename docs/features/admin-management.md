# 管理者管理

ダッシュボードの「管理者管理」または左ナビから `/admin/users` を開く。admin のみ利用できる。

- メールアドレスで追加する。前後空白を除去し小文字化する。登録前のGoogleアカウントも指定できる。既存adminは重複追加しない。
- 一覧は `userRoles` のadminを表示する。保存済みの `displayName` がなければメールアドレスのみ表示する。Authユーザー全件取得は行わない。
- 削除は確認ダイアログを経由し、**guestに変更**する。viewerへ自動復元はしない。既存のその他のフィールド・作品・Googleアカウントは保持する。
- 自分自身の削除には追加の確認チェックが必要。削除後はギャラリーへ移動する。
- 最後のadminは削除不可。各端末は自分のロールドキュメントを購読し、権限変更を反映する。読み取り失敗時はguestとして扱う。

## 書き込みと互換性

`/api/admin/users` はFirebase IDトークンを検証（失効確認あり）し、確認済みメールアドレスの現在のadminロールをFirestoreで確認する。リクエストが指定する操作ユーザーやロールは信用しない。

追加・削除はAdmin SDKのFirestoreトランザクションで行う。`_adminManagement/roles` を共通ロックとして読み書きし、呼び出し元の権限、現在の一覧、最後のadminを同じトランザクションで検査する。同時削除でも1人を残す。ロックは初回操作時に作成され、初期カウント設定・データ移行は不要。

`userRoles/{email}` の既存IDは変更しない。既存IDとの大文字小文字を無視した一致は同じドキュメントを更新する。複数の既存IDが同じメールに一致する場合は変更を拒否し、勝手に統合しない。その他のロール・認証ガードは従来どおり。

本番Rulesでは、自分のロール読み取りを維持し、**クライアントのuserRoles直接書き込みをadminも含めて禁止**する。APIを迂回した最終管理者削除を防ぐため。ロックのクライアント読み書きも許可しない。その他コレクションとStorageのRulesは変更しない。特権サーバー・Console経由の操作はRules対象外。

## 実行環境・反映

- アプリ側の `firebase-admin` は実行時依存の13.10.0に固定する。Hostingの生成SSRが使用する `firebase-frameworks` の対応範囲に合わせたもの（14系は依存解決に失敗する）。既存Functions側の依存は変更しない。Next.jsのNode.jsサーバーAPIとしてHostingの生成SSR内で動作し、新規の独立FunctionsやCloud Runサービスは不要。
- サーバーはApplication Default Credentialsを使う。クライアントのFirebase設定はサーバー認証情報ではない。SSR実行サービスアカウントにFirestore読み書き・Firebase Authユーザー参照が必要。権限不足なら自動変更せず確認する。
- 本番反映には **Hosting（生成SSRを含む）と `firestore:rules`** が必要。Rules変更はユーザー承認後に行う。独立Functions・Storage Rules・データ移行は対象外。Rulesだけ先に反映すると旧クライアントのロール直接書き込みは停止する。
- ローカルプレビューはクライアント・サーバー双方で追加・削除を拒否する。一覧取得には読み取り可能なサーバー認証情報が必要。設定を自動で追加しない。
- ローカルの書き込み検証にはEmulatorを使用する。サーバー側の `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` とクライアント側のEmulator設定を両方そろえる。既存の `firestore.rules.dev` は開発用自己登録を許すため、本番権限検証には使わない。

## 検証

`npm run test:admin-users` と `npm run test:auth-flow` でAPI入力・認証境界・プレビュー書き込み拒否・管理画面のガード・自己削除確認・ロール購読を検証する。

`npm run test:admin-users:emulator` は専用 `demo-atria-admin` プロジェクトとローカルFirestore（8188番）で本番Rulesを読み込む。追加・重複・削除・同時操作・最後のadmin保護・権限削除後の書き込み拒否を検証する。本番データには接続しない。Java 21が必要。CIには軽量テストのみ追加し、Emulatorテストはローカルで実行する。

本番のGoogleログイン・画面・操作確認は本番反映後にユーザーが行う。
