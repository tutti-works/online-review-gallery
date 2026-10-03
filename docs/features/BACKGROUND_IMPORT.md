# バックグラウンドインポートと進捗表示

更新: 2026-10-03。[インポート画面](../../src/app/admin/import/page.tsx)、[開始・Task管理](../../functions/src/importInitialization.ts)、[初期化処理](../../functions/src/importController.ts)、[進捗フック](../../src/app/gallery/hooks/useImportProgress.ts) に照合しています。504対策は本番反映済み。同日にユーザーによる本番インポート確認も完了しました（ユーザー報告）。

## 開始から画面遷移まで

1. adminが授業・課題を選び、必要なClassroom／DriveのOAuthスコープを取得します。
2. ギャラリーを作成・再利用し、`importClassroomSubmissions` へPOSTします。`Authorization` はFirebase ID token、`X-Classroom-OAuth-Token` はGoogle API用access tokenです。
3. サーバーはジョブを登録し、専用の `initializeClassroomImport` Task投入成功を確認してジョブIDを返します。提出一覧・学生情報・Driveファイル取得、一時Storage保存、提出レコード準備は初期化Task内で行います。
4. 正常応答を受けた後、`activeImportJob`（job ID、gallery ID、開始時刻）をlocalStorageへ保存します。画面は開始メッセージを表示し、1.5秒後に `/gallery?galleryId=...` へ遷移します。
5. 初期化Taskと、その後のCloud Tasksによる変換はサーバー側で進み、ギャラリーで準備中の表示と進捗を確認します。Emulatorでは初期化Task内で提出をローカル処理する経路もあります。

**ジョブ登録・Task投入の開始応答を受け取るまでは画面を離れず待ちます。** 応答後の初期化はサーバーで進みます。一定秒数での応答や処理完了を保証するものではありません。新queue・IAM・本番確認と初期化の制約は [504対策](../implementation/import-initialization.md) と [PLAN](../../PLAN.md) を参照してください。

## 進捗の監視と復元

- 3秒ごとに、Firebase ID token付きで `getImportStatus` を呼びます。管理者認証が必要です。
- 新規ジョブは学生提出単位の総数・完了数・成功／失敗数を表示します。旧ジョブは `totalFiles` / `processedFiles` へフォールバックします。
- completed／errorで監視を止め、localStorageの追跡情報を消して作品を再取得します。completedは進捗表示を消し、errorはエラー案内を残します。404でも追跡を終了します。一時的な通信失敗は次のポーリングで再試行します。
- 追跡できるジョブは1つです。同じオリジン・ブラウザのlocalStorageを共有するタブや再訪問で復元できます。別ブラウザ・端末に自動共有する機能はありません。
- 保存時刻から2時間を超えた追跡情報は、フック起動時に削除します。これはサーバージョブのキャンセルや完了判定ではありません。

## 状態管理と制約

提出レコード、安定したTask名・artwork ID、二重完了防止、生成画像の補償削除は [Issue #8の実装](../implementation/import-idempotency.md) を参照してください。強制終了時の補償処理・lease・queue側の再試行制約があり、UIの進捗監視だけで復旧を保証しません。

再インポート・未提出・エラー表示は [機能仕様](import-feature.md)、検証範囲は [TESTING](../TESTING.md) に記載します。
