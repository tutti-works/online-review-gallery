# Issue #9: Hosting 生成 SSR Function の Node.js 22 化

## runtime の決定元

このリポジトリは `firebase.json` の `hosting.source: "."` と `frameworksBackend.region: "asia-northeast1"` を使う framework-aware Hosting。`functions/` は別 codebase で、同じファイルの `functions.runtime: "nodejs22"` が適用されるが、Hosting 生成 SSR Function には適用されない。

調査時のローカル Firebase CLI `firebase-tools@15.30.2` の `lib/frameworks/index.js` は、生成する `.firebase/online-review-gallery/functions/package.json` の `engines.node` を、Next.js integration が返す `packageJson` に値があれば保持し、なければ CLI 実行中の Node.js major version を設定する。`lib/frameworks/constants.js` の対応 major は 20 / 22 / 24。`lib/deploy/functions/runtimes/node/parseRuntimeAndValidateSDK.js` は生成物の `engines.node` から `nodejs22` のように runtime を選ぶ（生成 codebase には `firebase.json` の `functions.runtime` 指定なし）。従来はルートに `engines.node` がなく、既存の生成物は `"node": "20"` だった。CLI 起動環境だけで runtime が変わり得る状態だった。

Next.js integration はルート `package.json` を生成物の基礎としてコピーするため、ルートの `engines.node` を `"22"` に固定した。これは Firebase の[Functions runtime 設定](https://firebase.google.com/docs/functions/manage-functions#set_nodejs_version)に沿う。CLI 実行時の Node.js が 20 でも生成物の `engines.node` は 22 を維持する。`frameworksBackend` へ未確認の `runtime` を足す変更はしていない。

## 変更範囲と確認

- ルート `package.json` / `package-lock.json` の `engines.node` を 22 に設定。
- 使われていない `.github/workflows/firebase-hosting-deploy.yml` と `.github/workflows/firebase-hosting-pull-request.yml` を削除。Actions の Node.js 20 を置換したのではない。
- App Hosting、Cloud Run、通常の Firebase Functions、Firestore / Storage / Auth / Rules は変更しない。
- `npm ci`、`npm run build`、生成された `.firebase/online-review-gallery/functions/package.json` の `engines.node`、Hosting デプロイ時の SSR Function runtime を確認する。本番サイト操作・ログイン・インポートの確認はユーザーが行う。

## 2026-09-23 の検証・反映

- 既存 `node_modules/re2/build/Release/re2.node` が使用中で、作業ツリー直下の `npm ci` は `EPERM unlink` で中断。依存を `npm install` で復旧した後、ルートの `package.json` と lockfile を隔離一時ディレクトリへコピーして `npm ci` は成功。ルートでの `npm run build` は成功（既存の React Hooks lint 警告4件）。
- Firebase CLI `15.30.2` が生成した `.firebase/online-review-gallery/functions/package.json` は `engines.node: "22"`。通常 Functions の `firebase.json` 設定は `nodejs22` のまま。
- `firebase deploy --only hosting --project online-review-gallery --non-interactive` が成功。生成 SSR Function `ssronlinereviewgallery` は `asia-northeast1` の第2世代で更新され、`gcloud functions describe` にて `state: ACTIVE` / `buildConfig.runtime: nodejs22` / `updateTime: 2026-09-23T10:48:04Z` を確認。Hosting live チャネルの最終リリースは 2026-09-23 19:48:11 JST。Node.js 20 の期限警告は今回のデプロイ出力に出ていない。
- 生成 SSR codebase の `firebase-functions` が古いという別警告は残っている。Node.js 20の期限警告とは別件であり、今回の対応では依存更新を行っていない。
- Codexは本番サイト操作・ログイン・インポートを実施していない。ユーザーが本番サイトでClassroomインポートを確認し、Issue #9はClose済み。
