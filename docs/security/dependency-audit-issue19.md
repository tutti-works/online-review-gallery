# npm依存脆弱性の影響調査（Issue #19）

調査日: 2026-09-27。対象: rootの `package-lock.json`、開始時コミット `c419af2bee3be24562cc0d42325815b9ed9231ff`。Node 22.16.0 / npm 10.9.2。

## 結論

後続: [Issue #20のNext.js 15 / Hosting SSR互換更新](next15-hosting-issue20.md)。Next固有critical解消候補を検証したが、生成SSRの新規sharp依存により本番反映は保留。以下はIssue #19時点の履歴を維持する。

- 更新前の41件を再現した。本番依存ツリーに12件、開発用依存だけに29件。件数はnpmが集約した**パッケージ数**であり、独立した攻撃やCVEの数ではない。親パッケージへの伝播も含む。
- critical 2件は `next` と `basic-ftp`。Nextのcritical advisoryは2本あるが、npmの集計では1パッケージである。
- `jws`、`nanoid`、`basic-ftp` のみ、既存親依存が許容するpatch/minorへ更新した。全体38件、本番依存10件が残る。
- 本番で注意すべき残存項目は **Next.jsのApp Router / RSC処理**。criticalの成立条件が本番構成に合わなくても、Next全体を「影響なし」としない。Nextの更新はSSR互換性検証を伴う別Issueに分離する。
- `firebase-admin: 13.10.0`、Next / React / Firebase / firebase-tools / Nodeのバージョン、既存overridesは維持。デプロイ、Rules、Functions、Cloud Run、IAM、データの変更は行っていない。

## 件数と証跡

| 監査対象 | low | moderate | high | critical | 合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| root全依存・更新前 | 1 | 19 | 19 | 2 | 41 |
| root production・更新前 | 0 | 8 | 3 | 1 | 12 |
| root devのみ・更新前（差分） | 1 | 11 | 16 | 1 | 29 |
| root全依存・更新後 | 1 | 19 | 17 | 1 | 38 |
| root production・更新後 | 0 | 8 | 1 | 1 | 10 |
| root devのみ・更新後（差分） | 1 | 11 | 16 | 0 | 28 |

`npm audit --json` と `npm audit --omit=dev --json` を更新前後に実行。いずれも脆弱性が残るため終了コード1で、通信失敗ではない。`npm ls --all --json` と個別 `npm ls basic-ftp jws uuid nanoid postcss google-gax gaxios --all`、インストール済みコードで経路を確認した。

[監査スナップショット](dependency-audit-issue19.json)に件数、全41パッケージのadvisory URL・対象範囲・親への伝播・npm提示修正先・配置場所を保存している。監査DBは更新されるため、将来の件数は変わり得る。

**productionに存在する件数と、攻撃成立件数を区別する。** 更新前12件のうち、Next 1件は公開SSRで処理されるため影響を除外できない。Admin関連9件（親への伝播を含む）は認証・Firestoreの利用経路を持つが、確認した脆弱な機能の成立条件は満たさない。PostCSS / nanoidの2件は主にビルド処理であり、投稿作品のCSSをSSRでコンパイルする経路はない。実攻撃を再現した件数は0件で、未検証を安全性の証明にしない。

### framework-aware生成SSRとの境界

rootの `--omit=dev` は、デプロイ済みコンテナ全体の監査ではない。過去デプロイ時のローカル生成物 `.firebase/online-review-gallery/functions/package-lock.json` も読み取り監査したところ **15件（low 1 / moderate 10 / high 3 / critical 1）**。root更新前の12件に加え `cookie`、`firebase-frameworks`、`firebase-functions` が現れる。後二者には子依存からの伝播がある。

この生成物は `next 14.2.35` / `firebase-admin 13.10.0` / `firebase-frameworks 0.11.8` を含み、`basic-ftp` は含まない。生成物は再生成・編集していない。現在の本番イメージを取得したわけではなく、今回のroot更新が本番や古い生成物へ適用されたとは主張しない。次の承認済みHosting反映時は、再生成されたlockfileでも `jws` / `nanoid` の修正版と追加SSR依存を確認する。

追加のcookieは名前・path・domainの文字検証不足（GHSA-pxg6-pf52-xh8x、修正0.7.0）。アダプターの応答処理に関係するため、SSR互換更新の調査対象とする。npmの `firebase-frameworks 0.4.2` への変更提案はダウングレードであり採用しない。`firebase-functions 7.4.0` の提案も生成SSRのmajor変更になるため採用していない。

## criticalを優先確認

### Next.js 14.2.35（直接・production）

1. [WindowsホストでのRCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36): Windows filesystemでホストするサーバーが条件。本番はFirebase生成SSRのLinuxランタイムであり、この条件に合わない。開発PCはWindowsなのでローカルには関係する。`dev:preview` は `127.0.0.1` にbindするが、これは修正そのものではない。通常の `npm run dev` を外部公開しない。Windows開発環境のリスクもNext更新Issueに含める。
2. [AVIF画像最適化でのRCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4): Image Optimization APIによるAVIF処理が条件。`next.config.js` の `images.unoptimized: true` に加え、14.2.35の `next/dist/server/next-server.js` の `handleNextImageRequest` がこの設定時に404を返すことを確認した。画像表示はStorage取得と通常の画像要素を使用する。この本番構成では当該経路は無効。

両criticalの修正系列は15.5.24 / 16.3.3以降。npmは全advisory解消候補として16.3.6を提示した。14系列のpatch更新では解消しないため、major更新を本Issueで行わない。これらはNextの画像最適化に関する判断であり、別デプロイ単位の画像変換Functions / Cloud Runの安全性を保証するものではない。

### basic-ftp 5.0.5（推移・devのみ）

経路: `firebase-tools → proxy-agent → pac-proxy-agent → get-uri → basic-ftp`。

[critical advisory](https://github.com/patrickjuchli/basic-ftp/security/advisories/GHSA-5rq4-664w-9x2c)は悪意あるFTPサーバーの一覧を `downloadToDir()` で処理すると保存先を逸脱する問題。アプリはFTPを使用しない。CLI内 `get-uri/dist/ftp.js` は `downloadTo()` / `list()` を使用し、`downloadToDir()` を呼んでいない。rootのproduction監査と既存生成SSRのどちらにも当該パッケージはない。

したがって本番SSRで当該criticalの成立経路は見つからない。ただしFTPの別のhigh advisory（CRLF、一覧・応答のメモリ消費）もあるため、criticalだけを直す5.2.0ではなく、同majorの **5.3.1** まで限定更新した。更新後は全basic-ftp advisoryが監査から消えた。

## 本番コードパスの判断

### Next.jsの残存advisory

App Routerを使用し、`/api/admin/users` と `/showcase/[galleryId]` は動的SSR対象。認証に成功したリクエストだけがNextの内部処理へ届く構造ではない。クライアントの `withAuth` をNextの脆弱性への対策として数えない。

| advisory群（ID末尾ではなく完全IDを列挙） | ローカルコードに基づく判断 |
| --- | --- |
| GHSA-h25m-26qc-wcjf / GHSA-q4gf-8mx6-v5v3 / GHSA-8h8q-6873-q5fj | RSCのデシリアライズDoS。App Routerに該当。独自Server Actionsがなくても、Next同梱のRSC処理をバージョンだけで安全扱いできない。影響を除外できず、更新を優先する。 |
| GHSA-vfv6-92ff-j949 / GHSA-wfc6-r584-vfw7 | RSCレスポンスと共有キャッシュの混同。Hosting/CDNのキー・Varyの実動作を本番で試験していないため未排除。 |
| GHSA-68g3-v927-f742 / GHSA-4633-3j49-mh5q | bodyのあるリクエストのキャッシュ混同。管理APIはforce-dynamic / no-storeだが、全SSRレスポンスの安全性は保証しない。Next更新対象。 |
| GHSA-m99w-x7hq-7vfj / GHSA-89xv-2m56-2m9x / GHSA-4c39-4ccg-62r3 / GHSA-955p-x3mx-jcvp | Server Actions / Server Function関連。ソースに `use server` の定義なし、独自custom serverなし、管理APIはnodejs。該当する独自機能の経路は見つからない。 |
| GHSA-ggv3-7p47-pfv8 / GHSA-p9j2-gv94-2wf4 / GHSA-c4j6-fc7j-m34r | rewrites / WebSocket upgrade関連。アプリ独自のrewrites・WebSocket upgrade定義なし。生成SSRアダプター全体の到達性までは未証明。 |
| GHSA-3g8h-86w9-wvmq / GHSA-36qx-fr4f-26g5 | middleware redirect / Pages Router i18n。middleware・Pages Router・i18n設定なし。 |
| GHSA-ffhc-5mcf-pf4q / GHSA-gx5p-jg67-6x7h | CSP nonce / beforeInteractiveの非信頼入力。いずれの利用もソースにない。 |
| GHSA-9g9p-9gw9-jx7f / GHSA-3x4c-7xq6-9pq8 / GHSA-h64f-5h5j-jqjh | Image OptimizerのDoS等。前述のunoptimized設定とサーバー側404分岐により経路が無効。 |

各advisoryのURL・severity・対象範囲はスナップショットの `before.all.vulnerabilities.next.via` を参照。[RSC DoSの一次情報](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3)、[共有キャッシュに関する一次情報](https://github.com/vercel/next.js/security/advisories/GHSA-wfc6-r584-vfw7)も参照。React 18を直接指定していることだけでNext同梱RSCの影響を否定しない。

### Admin SDK / jws / uuid

- `src/app/api/admin/users/route.ts` は `firebase-admin/auth` で `verifyIdToken(token, true)` を実行し、Firestore transactionを使用する。Admin SDKを「保守スクリプト専用」と扱わない。
- [jwsのHMAC検証問題](https://github.com/auth0/node-jws/security/advisories/GHSA-869p-cjfg-cm3x): Admin SDK配下の `jsonwebtoken → jws 3.2.2` と `google-auth-library → jws 4.0.0` が対象。Adminの `token-verifier.js` はFirebase ID tokenのアルゴリズムをRS256に制限する。今回のAPIにHMAC鍵選択を攻撃者が操作する経路は見つからない。それでも認証コードの依存であり、互換patch **3.2.3 / 4.0.1** に更新した。
- [uuidのbuffer境界問題](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq): v3/v5/v6にbufferを渡す機能が対象。インストール済み `google-gax/build/src/util.js`、`gaxios/build/src/gaxios.js`、`teeny-request/build/src/index.js` は `v4()` を使用する。本APIから非信頼bufferを渡す経路は見つからない。
- `firebase-admin` / Firestore / Storage / google-gax / gaxios / retry-request / teeny-requestのmoderateは、このuuidへの伝播であり、8本の独立した攻撃ではない。StorageのAdmin SDKはアプリSSRから呼ばれていないが、Firestore / Google認証の親経路は使われる。
- uuidは修正11.1.1以降に対し親が8/9系列を要求する。overrideやAdmin 14への変更はしない。ローカル生成 `firebase-frameworks 0.11.8` のpeer範囲はAdmin `^11.0.1 || ^12.0.0 || ^13.0.0`。13系列と両立する親更新を待つ。

### PostCSS / nanoid

Next固定のPostCSS 8.4.31とroot devの8.5.6を区別する。CSS / source mapをビルドする際の任意ファイル読取・XSS等であり、SSRで投稿者のCSSを処理する経路は見つからない。非信頼PRをビルドするCIでは別途影響があるため、恒久放置の理由にはしない。

`postcss/lib/input.js` とNext内の同ファイルは `nanoid/non-secure` を固定長6で呼ぶ。攻撃者指定サイズ等の経路は見つからないが、同majorの **3.3.19** へ更新した。PostCSS本体はNextの固定依存が残るため、本Issueで部分更新せずNext更新と開発ツール更新に分離する。

## 更新前41パッケージの棚卸し

P = root production監査に含まれる（dev側にも存在し得る）、D = devのみ。直 = root直接依存、推 = 推移依存。PostCSSはrootでは直接dev依存、Next配下では推移production依存。

更新判断の記号:

- **済** = 今すぐ修正する対象として今回限定更新済み。
- **小** = 安全なpatch/minor更新で修正可能な候補。下記バージョンはadvisoryの修正境界。今回は変更せず、親の許容範囲・全配置の解消・検証を次の小規模更新で確認する。`fixAvailable: true` は安全性の証明ではない。
- **待** = 親依存の更新待ち。現在の親の固定値・major範囲を越えるため、強制差し替えしない。
- **別** = 別Issueで対応。Nextなど互換性の確認とmajor更新が必要。

「audit fix」列は、**無条件の実行は全行で不可**。候補はnpmが修正を提示しているという意味で、実行・安全性検証済みという意味ではない。済の3項目も `audit fix` ではなくパッケージ名を限定した `npm update` で変更した。

| パッケージ（更新前） | severity | 種別 | 主な親 / 本番での利用・判断 | 修正境界・major要否 / audit fix / 方針 |
| --- | --- | --- | --- | --- |
| @google-cloud/firestore 7.11.6 | moderate | P・推 | Admin → Firestore。管理APIで使用、uuid条件非該当 | Admin14.5.0をnpm提示、major必要 / 不可 / 待 |
| @google-cloud/pubsub 5.3.1 | moderate | D・推 | CLI → PubSub → OpenTelemetry。本番SSR未使用 | core2.8.0へ親更新必要 / 候補だが親確認 / 待 |
| @google-cloud/storage 7.22.0 | moderate | P・推 | Admin → Storage。アプリSSRでは未使用、uuid伝播 | Admin14.5.0提示、major必要 / 不可 / 待 |
| @next/eslint-plugin-next 14.2.35 | high | D・推 | eslint-config-next → glob。本番未使用 | glob10.3.10固定。親16.3.6提示 / 不可 / 別 |
| @opentelemetry/core 1.30.1 | moderate | D・推 | CLI → PubSub。Baggage処理、本番未使用 | 2.8.0、core majorと親変更 / 候補だが親確認 / 待 |
| @typescript-eslint/eslint-plugin 6.21.0 | high | D・直 | lint → estree → minimatch。本番未使用 | 子minimatchのpatch、親major不要の候補 / 候補 / 小 |
| @typescript-eslint/parser 6.21.0 | high | D・直 | lint → estree → minimatch。本番未使用 | 同上 / 候補 / 小 |
| @typescript-eslint/type-utils 6.21.0 | high | D・推 | eslint-plugin → estree / utils。本番未使用 | 同上 / 候補 / 小 |
| @typescript-eslint/typescript-estree 6.21.0 | high | D・推 | parser / type-utils → minimatch。本番未使用 | 同上 / 候補 / 小 |
| @typescript-eslint/utils 6.21.0 | high | D・推 | eslint-plugin → estree。本番未使用 | 同上 / 候補 / 小 |
| ajv 6.12.6 / 8.17.1 | moderate | D・推 | ESLint / CLI → exegesis等。$data ReDoS、本番未使用 | 6.14.0 / 8.18.0以降、major不要 / 候補 / 小 |
| baseline-browser-mapping 2.8.9 | moderate | D・推 | autoprefixer → browserslist。ビルド時の不正入力終了 | 2.11.0、major不要 / 候補 / 小 |
| basic-ftp 5.0.5 | critical | D・推 | CLI → proxy-agent → get-uri。本番未使用 | 5.3.1、minorのみ / 限定更新 / 済 |
| body-parser 1.20.3 | moderate | D・推 | CLI / exegesis → qs。本番未使用 | 1.20.7以降とqs修正、major不要の候補 / 候補 / 小 |
| brace-expansion 1.1.12 / 2.0.2 | high | D・推 | minimatch（ESLint/CLI等）。ビルド・lintのglob処理 | 1.1.18 / 2.1.4、major不要 / 候補 / 小 |
| browserslist 4.26.2 | high | D・推 | autoprefixer。ビルドのクエリ・stats処理 | 4.28.6より新しい修正版、major不要の候補 / 候補 / 小 |
| csv-parse 5.6.0 | moderate | D・推 | CLIのCSV処理、本番未使用 | 7.0.2、CLI要求^5を越えるmajor / 候補だが親確認 / 待 |
| eslint-config-next 14.2.35 | high | D・直 | lint → @next/eslint-plugin-next → glob | 16.3.6提示、major必要 / 不可 / 別 |
| fast-uri 3.1.0 | high | D・推 | CLI → ajv。URI解釈、本番未使用 | 3.1.6、patch候補 / 候補 / 小 |
| firebase-admin 13.10.0 | moderate | P・直 | API認証・Firestore。uuid伝播、条件非該当 | 14.5.0提示はSSR互換性に反する / 不可 / 待 |
| firebase-tools 15.30.2 | moderate | D・直 | CLI、上記PubSub/CSV/stream-json等。本番未使用 | 子のmajor更新を要する項目あり / 一括不可 / 待 |
| flatted 3.3.3 | high | D・推 | ESLint → file-entry-cache → flat-cache。ローカルcache解析 | 3.4.2以降、minor候補 / 候補 / 小 |
| form-data 4.0.4 | high | D・推 | CLI。multipart生成、本番未使用（Admin側の2.5.6は対象外） | 4.0.6、patch候補 / 候補 / 小 |
| gaxios 6.7.1 | moderate | P・推 | Admin → Google認証、CLI。uuid.v4、条件非該当 | uuid majorが必要、親7系経路には別版あり / 一括不可 / 待 |
| glob 10.3.10 | high | D・推 | Next ESLint plugin等。CLI -c/--cmdの注入、アプリで使用なし | 10.5.0だがNext pluginが固定 / 不可 / 待 |
| google-gax 4.6.1 | moderate | P・推 | Admin → Firestore。uuid.v4、条件非該当 | Admin14.5.0提示、major必要 / 不可 / 待 |
| jws 3.2.2 / 4.0.0 | high | P・推 | Admin → jsonwebtoken / Google認証。RS256、詳細は本文 | 3.2.3 / 4.0.1、patchのみ / 限定更新 / 済 |
| minimatch 3.1.2 / 5.1.6 / 9.0.3 | high | D・推 | ESLint / estree / CLI → readdir-glob。非信頼globでReDoS | 3.1.4 / 5.1.8 / 9.0.7、major不要 / 候補 / 小 |
| nanoid 3.3.11 | high | P・推 | Next → PostCSS、root PostCSS。固定長CSS内部ID | 3.3.19、patchのみ / 限定更新 / 済 |
| next 14.2.35 | critical | P・直 | 公開SSR / App Router。本文の条件別評価を参照 | npm提示16.3.6、major必要 / 不可 / 別 |
| picomatch 2.3.1 / 4.0.3 | high | D・推 | tailwind / eslint resolver / CLI → chokidar。glob処理 | 2.3.2 / 4.0.4、patch候補 / 候補 / 小 |
| postcss 8.4.31 / 8.5.6 | high | P・直dev＋推prod | Next固定＋tailwind。ビルドCSS、SSR投稿処理なし | 8.5.22より新しい修正版、Nextは8.4.31固定 / 一括不可 / 待 |
| postcss-selector-parser 6.1.2 | low | D・推 | tailwind / postcss-nested。ビルドCSSの再帰 | 6.1.3、patch候補 / 候補 / 小 |
| qs 6.13.0 | moderate | D・推 | CLI → body-parser。クエリ解析、本番未使用 | 6.16.0、minor候補 / 候補 / 小 |
| re2 1.24.1 | moderate | D・推 | CLI → superstatic。エミュレーター等、本番未使用 | 1.26.0より新しい修正版、native検証必要 / 候補 / 小 |
| retry-request 7.0.2 | moderate | P・推 | Admin → Firestore/Storage → teeny-request、uuid伝播 | Admin14.5.0提示、major必要 / 不可 / 待 |
| stream-json 1.9.1 | moderate | D・推 | CLIのJSON filter処理、本番未使用 | 3.4.0より新しい修正版、CLI要求^1を越えるmajor / 候補だが親確認 / 待 |
| teeny-request 9.0.0 | moderate | P・推 | Admin → Storage / retry-request。uuid.v4、条件非該当 | Admin14.5.0提示、major必要 / 不可 / 待 |
| tmp 0.2.5 | high | D・推 | CLIの一時ファイル処理、本番未使用 | 0.2.6、patch候補 / 候補 / 小 |
| universal-analytics 0.5.3 | moderate | D・推 | CLI → uuid8。CLI分析、本番未使用 | 子uuid11.1.1以上への親対応が必要 / 候補だが親確認 / 待 |
| uuid 8.3.2 / 9.0.1 | moderate | P・推 | Google SDK / CLI analytics。v3/v5/v6＋buffer条件なし | 11.1.1、major必要 / 不可 / 待 |

「本番未使用」はrootアプリと確認した生成SSRの経路に限る。CI・開発者PCで非信頼ファイル、FTP/PAC、CLI入力等を処理するリスクは残るため、dev項目をすべて無視する方針ではない。

## 今回の変更と今後の対応

実行した限定更新:

```powershell
npm.cmd update jws nanoid basic-ftp --package-lock-only --ignore-scripts --no-audit --no-fund
```

lockfileの変更は以下の4配置だけ。package.jsonは変更なし。

| 配置 | 変更 |
| --- | --- |
| node_modules/jws | 4.0.0 → 4.0.1 |
| node_modules/jsonwebtoken/node_modules/jws | 3.2.2 → 3.2.3 |
| node_modules/nanoid | 3.3.11 → 3.3.19 |
| node_modules/basic-ftp | 5.0.5 → 5.3.1 |

残存38件の理由と順序:

1. **Next / ESLint Next / framework-aware Hostingの互換更新（別Issue候補・優先）**: 14系列内では解消不可。15/16の候補を選び、React互換、同梱RSC、画像無効化維持、認証API、生成SSR依存、CDNキャッシュとWindows開発環境を検証する。生成SSR固有のcookie / Functions警告も別監査に含める。更新先は今回決定・インストールしていない。本番反映には別途承認が必要。
2. **開発ツールの小規模更新（別Issue候補）**: 表の「小」をESLint/glob系、CSS/browserデータ系、CLI系に分けて更新する。今回の3項目は少数配置で検証できる一方、残りは多数の共有・固定依存にまたがるため範囲を広げない。特にnativeのre2はCLI/エミュレーターも検証する。
3. **Admin 13と両立する親更新待ち**: uuidを無理に上げない。13系列のバックポートか、HostingのAdmin14対応を確認してから別Issue化する。条件非該当のコード経路が変わる際は再評価する。

自動audit fix、force、override追加、major更新は未実行。新規GitHub Issueの起票・コメント投稿は行っていない。

## 検証

更新後にIssue指定の `npm ci --include=dev --no-fund`、typecheck、lint（`--max-warnings=0`）、test:auth-flow（6）、test:review-labels（5）、test:course-archive（4）、test:local-preview（3）、test:admin-users（5）を実行して成功した。buildはCIと同じダミーFirebase設定で成功（13ページ生成）。

追加の `test:admin-users:emulator` も8件成功（合計31件）。`demo-atria-admin` のローカルFirestoreだけを使用し、transaction、競合、最後の管理者保護、直接ロール書込拒否を確認した。

認証依存更新の補足として、使い捨てのRSA鍵をローカルで生成し、実際のjsonwebtoken配下jws 3と直接jws 4で正常なRS256署名の検証・改ざんpayloadの拒否を確認した。これはオフラインの署名検証であり、Googleログインの実機確認ではない。

初回buildはサンドボックスのGoogle Fonts通信制限によるEACCES、初回エミュレーター起動はFirebase CLIのローカル設定ファイル読み取りEPERMで失敗し、それぞれ許可後に再実行して成功。ブラウザ・本番サイト操作、ライブ攻撃検証は行っていない。

残る通知: npmの38件、既存deprecated通知、baseline-browser-mapping / Browserslistの古さ、Nodeのexperimental strip-types / module type警告。lintは警告0。
