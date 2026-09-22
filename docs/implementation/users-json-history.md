# Issue #7: Firebase Auth export の公開履歴調査

調査日: 2026-09-23。個人情報の値はこの文書に記録しない。

## 現在の変更と利用状況

- `users.json` はローカルに残し、Gitインデックスからのみ除外した。`.gitignore`にも登録した。変更は未コミット・未pushのため、公開GitHubの現行mainにはまだ存在する。
- アプリ、Functions、script、Firebase deploy設定、テスト、CI、ローカル開発手順に `users.json` の実行時参照はない。文書にある参照は監査上の言及のみ。`.claude/settings.local.json` には `firebase auth:export` 実行許可の記録があるが、このファイルの利用ではない。
- 内容は2ユーザー分のFirebase Authenticationエクスポート形式。メールアドレス、Firebase / provider ID、表示名、写真URL、作成・最終ログイン時刻を含む。確認したJSON項目にはpassword hash / salt、access / refresh / custom token、秘密鍵、service account credentialはない。値の実在性はリポジトリだけでは確定できない。
- 追跡中の他ファイルについて、`localId` / `providerUserInfo`形式のコピーと、service account / credential / secretを示すファイル名は見つからなかった。全面的なsecrets auditではない。

## 履歴と公開範囲

- `users.json` は2025-09-30の初期コミット `3972afd` と `424c60f` の両系統に同一blobとして追加された。`git rev-list --objects --all -- users.json` では内容blobは1種類。追加後の内容変更は確認されなかった。
- `main`、`feature/annotation-system`、`agent/showcase-login-return` とその `origin/*` 履歴から取得可能。通常の追跡停止コミット後も旧コミットからの取得は可能。
- GitHubリポジトリ作成時刻は2025-09-29 18:07:39 UTC（JSTでは2025-09-30 03:07:39）、調査時のvisibilityはPUBLIC。初期コミットは同日03:11:36 JST。visibility変更の履歴を確認できないため、公開開始日時や閲覧・取得の有無までは断定できない。

## 判断と、別承認が必要な対応

実在ユーザーの情報なら履歴除去を推奨候補とする。ただし履歴除去だけでは既存clone、fork、GitHubのPR参照・キャッシュ、検索エンジン等を必ず消せない。対象者への連絡やGitHub Supportへの相談の要否も所有者が判断する。再利用可能な認証情報は確認したファイルに見つからず、現時点でcredential rotationが必須とは判断しない。

履歴書換えを選ぶ場合は、対象を `users.json` の全branch・tag履歴に限定し、以下を**別途承認後**に実行する。ここでは実行しない。

1. 共同作業者にpush停止を周知し、open PR・保護branch・tag・fork・cloneを棚卸しする。全refをfetchした新規mirror cloneと復旧用backupを用意し、その保存先を非公開にする。
2. 隔離したcloneで `git filter-repo --path users.json --invert-paths --force` を実行する。`git filter-repo` の導入と結果のref差分・残存blob・正常buildを確認する。元の作業ディレクトリでは実行しない。
3. 承認済みrefだけを `--force-with-lease` で更新する計画を立てる。branch protection変更や全branch / tag pushを一括で行わず、実際の対象ref・旧/新SHA・rollback手順を明示して再承認を受ける。
4. 共同作業者は古い履歴を再pushしないようfresh cloneで再同期する。GitHub上のキャッシュ・PR・forkについては残存を確認し、必要ならGitHub Supportに相談する。

復旧は非公開backupの元ref/SHAを用い、誤更新したrefだけを所有者と合意して戻す。履歴公開を戻す操作は個人情報を再公開するため、単純な全ref巻き戻しは行わない。
