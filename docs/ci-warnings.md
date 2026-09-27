# CI導入時の警告棚卸し（Issue #17、2026-09-27）

> 歴史的スナップショット。警告原文・件数・検証結果・未完了表記は各作業時点のものです。現在のCI実行範囲は [TESTING](TESTING.md)、依存リスクは [セキュリティ索引](security/README.md) を参照してください。

## 後続調査の結論（Issue #20 / PR #21、2026-09-27）

Next.js 15.5.26への移行検証自体は成功したが、Firebase framework-aware Hostingの公式adapterが生成SSRへ `sharp 0.33.5` を導入するため本番反映を見送った。現行adapterでは安全に解消できず、調査結果をmainの文書へ記録してIssue #20とPR #21を終了する。PR #21は未mergeでCloseし、実装・依存・設定変更はmainへ取り込まない。main / 本番のNext.js 14系は維持し、既知リスクは未解消。

Firebase公式adapterが `sharp 0.35.4+` を許容する、またはNext向け旧sharp依存が解消された時点で、新しいIssueを作って再検討する。旧ブランチは再利用せず、その時点のmainから新しいブランチを作る。

[移行検証記録](security/next15-hosting-issue20.md) / [生成SSR sharpの依存経路・再検討条件](security/generated-ssr-sharp-issue20.md)。以下は元の作業時点の記録を維持する。


## Issue #17で解消済み: Hooks警告2件

原文（両ファイル共通）:

```text
Warning: React Hook useCallback has missing dependencies: 'shouldDebugImages' and 'shouldDebugReads'. Either include them or remove the dependency array. react-hooks/exhaustive-deps
```

発生箇所は `src/app/showcase/page.tsx` の `loadData`（修正前236行）と `src/app/showcase/[galleryId]/page.tsx` の `loadData`（修正前268行）。レンダー内で宣言したデバッグフラグをコールバックが参照していました。

両フラグはNext.jsがビルド時に確定する公開環境変数です。props/stateではなく、通常実行で古い値を捕捉する不具合はありません。モジュール定数に移してその性質を明示しました。一覧の依存 `[]`、詳細の `[galleryId]`、読み込みEffectの `[isAllowed, loadData]` は維持します。state更新でコールバックが変わることはなく、再取得ループや不要な再実行は追加しません。詳細の画像ログEffectは、モジュール定数を依存から外し `[sortedArtworks]` を維持します。認証判定・取得処理・手動同期処理は変更しません。

## 既知警告として残す: ブラウザ互換性データ

ビルド時の原文（日数は時間経過で変化）:

```text
[baseline-browser-mapping] The data in this module is over two months old. To ensure accurate Baseline data, please update: `npm i baseline-browser-mapping@latest -D`
Browserslist: browsers data (caniuse-lite) is 12 months old. Please run:
  npx update-browserslist-db@latest
Browserslist: caniuse-lite is outdated. Please run:
  npx update-browserslist-db@latest
```

発生元は `baseline-browser-mapping/dist/index.cjs` と `browserslist/node.js`。lockfile内の互換性データが古いためです。アプリ例外ではありませんが、新しいブラウザ判定・生成CSSの対象に影響するため、依存メンテナンス時にデータ更新とbuild差分を確認します。今回のCI導入では依存を更新せず、通知を表示したまま残します。

## 別Issueに分離して後で対応する: 生成SSR依存

Firebase CLIの警告原文:

```text
package.json indicates an outdated version of firebase-functions. Please upgrade using npm install --save firebase-functions@latest in your functions directory.
```

発生元は `firebase-tools/lib/deploy/functions/runtimes/node/versioning.js`。直前のHostingデプロイで、自動生成 `.firebase/online-review-gallery/functions/package.json` の `firebase-functions: ^6.0.1` に対して発生しました。生成物はCLIにより再作成されるため、そこへの手修正や通常の `functions/package.json` 更新で解決するものではありません。

CIにはデプロイ処理がなく、この警告は通常のCIでは発生しません。Firebase CLIの生成テンプレートとSDK互換性を調査する別の作業として扱います。対応時はNode.js 22・SSR設定の維持、ローカルbuild、承認後のHostingのみの反映とSSRのACTIVE確認が必要です。今回はCLI・SDK・本番ランタイムを変更しません。この棚卸し時点では別Issueの起票は未実施でした。後続のIssue #19／#20の判断は冒頭のリンク先を参照してください。

## 既知警告として残す: Node.jsのテスト実行

Node.js 22.16.0での原文:

```text
ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///.../src/lib/reviewLabels.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
```

`test:review-labels` と `test:course-archive` が `--experimental-strip-types` で実際の `.ts` ファイルを直接読むためです。後者ではパスが `courseArchive.ts` になります。型検証は別のtypecheckで行い、テストの型除去に依存しません。

ルートpackage.jsonはCommonJSの設定ファイルとも共用しているため、警告を消すだけの `type: module` 追加はしません。テストは成功しており、現状は既知として維持します。CIはNode 22系列の更新版を使用するので、パッチバージョンによって実験機能警告が出ない場合もあります。Nodeのメジャー更新・警告の全面抑制は行いません。

## npm ciでの追加通知

lockfileの依存ツリーに由来する `npm warn deprecated`（inflight、rimraf 3、glob 7/10、@humanwhocodes/config-array/object-schema、node-domexception、uuid 9、eslint 8）も既知です。ESLint/Next.js/Firebase CLIなどの親依存を確認して更新する必要があり、一括更新やoverridesによる強制置換は今回行いません。非推奨通知は脆弱性監査の代わりにはなりません。セキュリティ監査・依存更新は別作業で扱います。

### Issue #19の調査・限定更新（2026-09-27）

41件を再現し、本番依存12件・devのみ29件に分類しました。`jws`、`nanoid`、`basic-ftp` のみ親依存を変えずpatch/minor更新し、全体38件・本番依存10件になりました。criticalは2→1件（Next.js）。Nextのcritical成立条件と、影響を除外できないRSC・キャッシュ処理は区別しています。Admin 13.10.0固定を維持し、本番デプロイは行っていません。

全41パッケージの経路・修正候補・残す理由・生成SSRとの違いは[Issue #19の依存監査](security/dependency-audit-issue19.md)を参照してください。更新後のnpm ci・typecheck・lint・build・31テストは成功しました。

## 新規警告の扱い

CIのlintは `--max-warnings=0` で失敗させます。build・Node・npmの通知はこの一覧と比較し、未知の警告を自動的に既知扱いしないでください。互換性データの経過月数やローカルパス・PIDの違いは新規警告ではありません。

## 導入時のローカル検証結果

Node.js 22.16.0で `npm ci --no-audit --no-fund`、typecheck、lint（警告0件）、軽量テスト16件が成功しました。workflowのダミーFirebase環境変数でNext.js buildも成功しています。初回buildはサンドボックスのGoogle Fonts通信制限で失敗し、通信許可後の再実行で成功しました。YAMLの構文とイベント・権限・ステップ構成も確認済みです。

この導入時点ではGitHub上のCI実行とIssueへの結果投稿は未実施でした。現在のCI結果は対象コミットのActionsを確認してください。本番変更・デプロイは実施していません。
