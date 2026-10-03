# インポート開始APIの504対策

更新: 2026-10-03。本番デプロイと稼働状態・認証付きTask配送の確認は完了しました。実授業での本番インポートはユーザー確認待ちです。

## 変更した経路

従来は `importClassroomSubmissions` の応答前に、全提出の走査、学生プロフィール取得、Driveファイルのダウンロード、一時Storage保存を行っていました。提出数・容量によって540秒のHTTP上限を超える経路でした。

現在のコードでは、管理者認証と入力検証の後、`importJobs` を作成し、`initializeClassroomImport` へTaskを投入します。投入成功を確認した時点で、従来と同じ200応答と `importJobId` を返します。開始APIにはClassroom／Drive／Storageの取得・保存処理を含めません。

初期化Taskがジョブを `pending → processing` に変更し、ギャラリー情報、提出一覧・添付ファイル、提出レコード、従来の変換Task、未提出プレースホルダーを準備します。提出の変換・集計は既存のCloud Run／提出単位Taskを使います。`initializationComplete` になるまでジョブを完了にしない従来の境界を維持します。

Cloud Functionsの応答後にPromiseを放置する方式ではありません。初期化Taskのhandlerが処理完了までawaitします。Firebase Admin SDKのTask投入はFunctions Emulatorへの経路も持ち、初期化後の提出変換は従来のEmulator分岐で処理します。実Emulatorでのインポートは今回未確認です。

## 制限・失敗時の挙動

- 開始APIは60秒。初期化FunctionとTaskのdispatch deadlineはともに1,800秒です。Taskだけをデフォルト10分のまま残しません。
- 初期化は同時4ジョブまで、各instanceの同時実行は1です。ジョブ内の添付取得は直列です。学生一覧のプロフィールを再利用し、不足分のプロフィール取得は同じuser IDにつき1回だけ行います。
- Classroom／Driveのリクエストは60秒上限、SDK自動再試行なしです。初期化開始から24分を超えたらページ取得・提出・添付・作品準備の区切りで中断し、ジョブをerrorにします。既に始まったStorage／Firestore処理を強制中断する保証ではありません。
- キュー投入失敗は `initialization_enqueue_failed`、初期化失敗は `initialization_failed` として記録します。すでにworkerがclaimしたジョブを、投入結果の通信失敗でerrorへ上書きしません。
- Firestore transactionでpendingジョブだけをclaimします。重複配送・並走・部分実行後の再配送で初期化全体を再実行しません。プレースホルダー作成までの全経路は再実行可能な設計ではないため、初期化Taskの `maxAttempts` は1です。提出変換Taskの再試行方針は変更しません。
- 初期化中のプロセス強制終了、配送前のIAM拒否、ジョブ記録自体への書込失敗では、pending／processingのまま残る場合があります。自動復旧を保証しません。停止ジョブ・一時objectの確認は必要です。
- Google access tokenはIAMで制限された初期化Taskのbodyだけに渡します。Firestore、開始応答、status応答、アプリのログには保存・出力しません。Task payloadの閲覧権限は秘密情報へのアクセスとして扱います。refresh tokenは保持しないため、キュー待機等でaccess tokenが失効した場合は再ログイン・再インポートが必要です。

経過時間と件数のログを、名簿取得完了・添付取得完了・初期化終了に出します。実Google API／本番データでの所要時間はまだ測定していません。

## 画面と検証

開始応答後は従来どおりギャラリーへ移り、3秒ごとのstatus APIで追跡します。初期化中は「提出物を準備しています」と表示し、初期化後に提出件数を表示します。バックグラウンド初期化失敗は画面にエラーとして残します。localStorageの追跡期限は、初期化と変換がともに応答後に進むため2時間へ変更しました。この期限はジョブのキャンセルではありません。

`functions/test/importInitialization.test.js` は、遅い初期化を保留しても開始応答が返ること、投入確認の待機、投入失敗、投入とworkerの競合、重複配送、初期化失敗、プロフィールキャッシュ、実際のHTTP exportとTask handlerの接続・deadlineを検証します。外部API・Cloud Tasks／IAMはテストダブルであり、本番配送の証明ではありません。既存の認証・提出集計テストも実行します。

2026-10-03のローカル検証は、Functions buildと全36テスト、フロントtypecheck・lint（警告0件）・Next build、認証回帰11テスト、`git diff --check` が成功しました。Cloud RunのDockerfileに新しい `studentProfiles` モジュールのコピーを追加し、コピー対象のローカル依存が欠けないこともテストしています。今回、変換サービスのコンテナ再ビルド・デプロイは行っていません。buildのブラウザ互換性データ更新通知は既知の警告です。

## 本番反映記録（2026-10-03）

ユーザーの本番反映・コミット・プッシュ承認後、初期化Function／専用queue → 開始・進捗API → Hosting／生成SSRの順で対象を限定して反映しました。各Firebase CLIの `Deploy complete!` を確認しています。新Functionを含め、対象4FunctionはすべてNode.js 22／ACTIVEです。

| 対象 | 反映後 |
|---|---|
| `initializeClassroomImport` | `initializeclassroomimport-00001-ruw`、1,800秒、専用queueはRUNNING・同時4・最大1 attempt |
| `importClassroomSubmissions` | `importclassroomsubmissions-00052-dij`、60秒 |
| `getImportStatus` | `getimportstatus-00048-xob`、30秒 |
| Hosting／`ssronlinereviewgallery` | live version `29fba0956f486b4e`、2026-10-03 12:03:05 JST、`ssronlinereviewgallery-00056-qol` |

既存のComputeサービスアカウントのproject IAMには投入・サービスアカウント利用・呼出しの必要権限が含まれており、権限追加は行いませんでした。新Functionのservice IAMには無認証公開のbindingを設定していません。

専用queueに、存在しない確認用job IDとダミーのGoogle tokenを含むTaskを1件投入しました。OIDC配送によるPOSTはHTTP 204／0.826秒で終了し、Taskは正常終了後に削除されています。この処理は存在確認だけで、importJob・作品・Storage・Google APIへの変更は行いません。実際の開始APIの応答時間や実授業の変換完了を示す計測ではありません。

開始APIと進捗APIは無認証で401、初期化Functionは無認証で403を確認しました。公開トップと「提出物を準備しています」を含む配信JSはHTTP 200です。

反映前後の比較で、対象外7 Functions、対象外8 Cloud Runサービス、Firestore／Storage Rulesのruleset、既存2キューの設定が不変でした。変換サービスは `processfiletask-00027-bgh` のままです。本番データのインポート・移行・削除は実行していません。

残る確認: ユーザーが実授業で開始応答の速さ、準備表示、作品・提出集計、完了、再インポートを確認します。Hosting生成SSRの既知の旧SDK警告は残り、今回の504対策では依存更新を行っていません。

## 本番反映時の確認

本番反映・IAM変更はユーザー承認後に行います。新しい初期化Function／queueを先に用意し、開始APIをその後に切り替えます。対象外のCloud Run、Rules、データを一括デプロイしません。

1. `npm --prefix functions run build` を行い、生成libを確認します。
2. `firebase deploy --only functions:initializeClassroomImport --project online-review-gallery` で初期化Functionと専用queueを作成します。
3. 実際の開始API用サービスアカウントが新queueへ投入でき、Cloud TasksのOIDC identityが新Functionを呼び出せることをCLI/APIで確認します。無認証公開で解決しません。権限が不足する場合は必要な権限と対象を明示し、変更承認を受けます。
4. `firebase deploy --only functions:importClassroomSubmissions,functions:getImportStatus --project online-review-gallery` で開始APIとstatusを反映します。
5. フロントのbuild後、承認されたHosting／生成SSRのみを反映します。
6. 実授業で、開始応答の所要時間、queue配送、準備表示、作品・提出集計、再インポートを確認します。これは現在のローカル検証には含みません。

Task queueの作成・IAM・dispatch deadlineの仕様は [Firebase公式ドキュメント](https://firebase.google.com/docs/functions/task-functions) を参照してください。
