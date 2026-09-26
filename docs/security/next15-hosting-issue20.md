# Next.js 15 / Hosting SSR互換更新（Issue #20）

調査日: 2026-09-27。開始コミット: `d47089e`。Node 22.16.0 / npm 10.9.2。

## 状態: 更新候補を実装、デプロイは保留

Next.js本体のcriticalを解消する **15.5.26** を採用候補として実装した。ローカルbuildとFirebase CLIの生成処理、生成SSRへのHTTP確認は成功した。ただし、生成時に `firebase-frameworks` のoptional peerから新しい脆弱な `sharp 0.33.5` が入る。**新規依存脆弱性なしという条件を満たさないため、本番反映しない。** Issue #20は未完了。

`firebase-admin 13.10.0`、Firebase SDK 12.19.0、Firebase CLI 15.30.2、Konva 9.3.16、Node 22を維持。Hosting方式、Firebase設定、既存Functions、Cloud Run、Rules、IAM、本番データを変更していない。生成物への手修正、peer強制無視、overrideの追加はしていない。

前提調査: [Issue #19](dependency-audit-issue19.md)。監査結果: [Issue #20スナップショット](dependency-audit-issue20.json)。件数はnpmの脆弱パッケージ集計であり、独立したCVE数ではない。

## 更新候補の比較

| 候補 | セキュリティ | Firebase Hosting / React / Node | 判断 |
| --- | --- | --- | --- |
| 14.2.35を維持 | App Router/RSC/キャッシュを含むadvisoryとcriticalが残る | 現状維持だが修正にはならない | 不採用 |
| 15.5.24–25 | criticalの修正はあるが、最新の15系修正と同等ではない | 現行CLI対応範囲内 | 15.5.26より優先する理由なし |
| **15.5.26** | 監査でNext固有advisoryが消え、PostCSSからの伝播のみ。Next自身のsharpは修正版0.35.4 | CLIの `supportedRange: "12 - 16.0"` 内。Node要件は18.18 / 19.8 / 20以上で22を含む。React19系を使用 | 最小major更新候補。ただし生成SSRのsharpが反映阻害要因 |
| 16.3.6 | npm提示の修正先。15より新しいだけで自動採用しない | 現行CLIの対応範囲外。React19、Turbopack既定化、next lint削除等の移行が増える | 不採用。CLI/アダプターまで変更する調査は別途確認 |

参照: [Next 15移行ガイド](https://nextjs.org/docs/app/guides/upgrading/version-15)、[Next 16移行ガイド](https://nextjs.org/docs/app/guides/upgrading/version-16)、[Firebase framework-aware Hosting](https://firebase.google.com/docs/hosting/frameworks/nextjs)。App Hostingの対応表は別製品なので互換性の根拠にしていない。

Nextのnpm peerはReact18も許容するが、App Routerの公式移行方針に合わせReact19へ更新した。作品描画はReactのreconcilerを直接使うため、react-konva18だけ残す構成は避けた。19.0.10のreconciler 0.32.0がReact `^19.1.0` を必要とするため、修正版 **React / React DOM 19.1.9** と型19.1系を選んだ。React19.2/19.3、Konva10への更新は行っていない。

## 実装範囲

- Next / eslint-config-next: 15.5.26に固定。
- React / React DOM: 19.1.9、react-konva: 19.0.10に固定。
- @types/react: 19.1.17、@types/react-dom: 19.1.11。
- `AnnotationCanvas` の `useRef` に明示的なundefined初期値と型を付与。保存処理・UI・描画ロジックは維持。
- Next15で削除された `swcMinify` 設定を除去。既定のSWC minifyを使用。
- Nextが要求するTypeScript target ES2017と生成された型参照を反映。
- `scripts/check-hosting-ssr.cjs`: デプロイを行わず、CLIの実際の生成処理をdemoプロジェクトで実行する事前確認。独自manifestの合成ではない。依存解決、runtime、修正済みjws/nanoid、critical、新規advisoryを検査し、新規advisoryがあれば失敗する。

初回lockfile更新時は旧React18を指すERESOLVE警告が出たが、クリーン `npm ci` と `npm ls --all` は成功し、最終ツリーにpeer競合はない。ESLint8を維持し、設定方式の移行はしていない。

## アプリ側の確認

同期 `cookies()` / `headers()` / route propsの `params` は使っていない。動的showcaseはクライアントの `useParams()` であり、Promise化の手修正は不要。管理APIは従来どおり `runtime: nodejs` / `force-dynamic` / no-store。認証・権限・インポート・アーカイブの処理は変更していない。

- root、dashboard、admin/users、admin/import、gallery、archive、showcase一覧、showcase動的詳細: 生成SSRをローカルHTTPサーバーで起動し、8ルートの200/ATRIA HTMLを確認。
- 動的showcaseのRSCリクエスト: 200 / `text/x-component`。
- 管理API: 未認証401 / no-store。認証前にAdmin SDKへのアクセスを拒否。
- `next/image`: `images.unoptimized: true` を維持。`/_next/image` は404。
- 認証ロール・復元・遷移、管理API、合計点、アーカイブ、local previewの既存23テストが成功。
- React19での描画リスクを確認するため、実際の `AnnotationCanvas` をダミーSVGとメモリ内保存callbackで起動。Chromeで描画、Undo、Redo、PNG 800×566生成、dirty解除を確認。Firebaseへは保存していない。

上記は本番確認や実アカウントGoogleログイン、Classroom import実行、Storage実画像/CORSの確認ではない。これらの機能コードは維持したが、本番UI・機能確認はユーザーが行う。

## 監査結果

| 対象 | low | moderate | high | critical | 合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| root更新前 | 1 | 19 | 17 | 1 | 38 |
| root更新後 | 1 | 20 | 15 | 0 | 36 |
| root production更新前 | 0 | 8 | 1 | 1 | 10 |
| root production更新後 | 0 | 9 | 1 | 0 | 10 |
| Issue19で保存した旧生成SSR | 1 | 10 | 3 | 1 | 15 |
| 今回のdemo生成SSR | 1 | 10 | 3 | 0 | 14 |

rootのmoderate +1はNextがcriticalから既存PostCSSの伝播moderateへ移った結果。新規advisoryではない。Next固有advisoryは0。PostCSS highとAdmin/uuidのmoderateは既知の残存項目で、Admin14やNext16へ機械的に更新しない。jws 3.2.3 / 4.0.1、nanoid 3.3.19、basic-ftp 5.3.1は維持。root監査は全依存・omit=devを実行し、脆弱性が残るため終了1。

### 生成SSRで新規sharpが入る問題

実際の生成lockfileは次の構成となった。

```text
Node: 22
next: 15.5.26
firebase-admin: 13.10.0
firebase-frameworks: 0.11.8
firebase-functions: 6.6.0（既存major 6を維持）
sharp: 0.33.5（frameworksのoptional peer ^0.32 || ^0.33）
next/node_modules/sharp: 0.35.4（修正版）
```

生成処理・npmインストール・`npm ls --omit=dev --all` は成功。Adminはアダプターpeer範囲 `^11.0.1 || ^12.0.0 || ^13.0.0` に入り、Node22もengine範囲内。しかし、rootのNext15がsharpを導入したことで、生成時にアダプターの旧optional peerも解決される。

新規advisory:

- [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj): libvips関連、修正sharp 0.35.0。
- [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c): libheif関連、修正sharp 0.35.4。

アダプター内のsharp直接importはAngular用で、Next用は `createNextServer()` に渡す。今回のNext処理では自身の修正版sharpを解決し、画像最適化も404になるため、確認した経路から旧sharpへの到達は見つからない。ただし、これは脆弱依存の不在を意味しない。生成SSRのhigh総数が3のままでも、jws修正等との相殺で**新規highが追加されている**。

最新版firebase-frameworksも0.11.8でpeer範囲に修正版sharpを含まない。npmが示すframeworks 0.4.2へのダウングレードは採用しない。生成物削除/手修正、sharp override、peer無視、監査を隠すomit設定も採用していない。

**反映再開にはユーザー判断が必要**。選択肢は、今回確認した未使用経路と画像最適化無効を前提に旧optional peerの残存を明示的に許容するか、アダプターの修正待ち/別途互換対応を行うこと。Hosting方式変更、App Hosting移行、CLI大規模変更などはIssueで指定された確認対象なので実施しない。

## 検証と警告

- `npm ci --include=dev --no-fund`: 成功。
- `npm run typecheck`: 成功。
- `npm run lint -- --max-warnings=0`: 成功、ESLint警告0。
- test:auth-flow 6 / review-labels 5 / course-archive 4 / local-preview 3 / admin-users 5: **23テスト成功**。
- `npm run build`: Next15.5.26、13静的ページ生成成功。動的API・showcaseも生成成功。
- 生成SSR互換確認: 成功。新規advisory検査: **sharpにより不合格**。
- GitHub CI: 結果確認後に追記。

既存のdeprecated依存、Browserslist / baseline-browser-mappingデータ、Node型除去警告は残る。`next lint` の廃止予定通知が追加されるが、15系では動作する。

Firebase CLIは生成時にesbuild 0.19.2をrootへ `--no-save` で一時追加した。manifest/lockfileに追加していない。rootを再度npm ciし除去したため、一時的な監査37件と最終36件を混同しない。生成時のWindows optional WASMディレクトリcleanupにEPERM警告が出たが、依存解決の終了コードと確認は成功。

ローカル生成SSRの連続HTTP確認ではworkspace root推論とMaxListenersExceededWarningも観測した。アダプターの各リクエスト `prepare()` とrouter初期化時のprocess listener登録は旧14.2.35生成物にもある。今回警告を抑制せず記録し、本番で増えていないとは主張しない。

再実行:

```powershell
node scripts/check-hosting-ssr.cjs
```

`.firebase/demo-atria-ssr-check/` のみを生成し、本番APIへのデプロイは呼ばない。CLIのprivate生成APIを使うためCLI更新時は再点検する。npm registry / Google Fontsへのネットワークは必要。CLIが追加した一時依存は検証後 `npm ci` で除去する。生成物・ログ・ダミービルドをそのまま本番へアップロードせず、反映承認後に通常のHosting生成をやり直す。
