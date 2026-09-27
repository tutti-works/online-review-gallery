# 生成SSRのsharp解消調査（Issue #20 / PR #21）

調査日: 2026-09-27。対象: `codex/issue20-next15-ssr` / `9564ce2` の既存生成物と公開メタデータ・ソース。

関連: [Issue #20](https://github.com/tutti-works/online-review-gallery/issues/20)、[PR #21（未mergeで終了）](https://github.com/tutti-works/online-review-gallery/pull/21)、[Next.js 15移行・検証記録](next15-hosting-issue20.md)、[Issueの調査報告](https://github.com/tutti-works/online-review-gallery/issues/20#issuecomment-5851026391)。

## 結論と実施範囲

**現行の公式adapterと通常のnpm依存解決では、生成SSRを修正版sharpだけにする方法は確認できなかった。** Firebase CLI最新15.31.0だけへの更新でも解消しない。2026-09-27時点ではNext.js 15.5.26への移行検証自体は成功したが、Firebase framework-aware Hostingの公式adapterが生成SSRへ `sharp 0.33.5` を導入するため本番反映を見送った。Issue #20とPR #21は調査結果をmainへ記録して終了する。PRは未mergeでCloseし、main / 本番のNext.js 14系・React 18系は維持する。

今回行ったのは、npm registry・GitHub API・公式ドキュメントの読み取り、既存生成manifest/lockfile/adapter/CLIソースの確認、`npm explain sharp`、semver範囲比較、および本資料とIssue #20への追記。依存インストール、lockfile更新、設定変更、生成処理の再実行、生成物の手修正、build/test、ブラウザ操作は行っていない。代替構成のインストール実験をしていないため、以下は既存ツリーの観測と宣言範囲・ソースに基づく評価であり、新構成の動作保証ではない。

## 対応版の確認

| 対象 | 読み取り結果 | 判断 |
| --- | --- | --- |
| firebase-tools 15.30.2（現在） | adapter `^0.11.0`、画像最適化用sharp `^0.32 || ^0.33` | 問題がある既存生成元 |
| firebase-tools 15.31.0（npm latest） | 同じ2範囲を維持。Next対応範囲 `12 - 16.0`、Node22対応 | CLI更新だけでは解消しない |
| firebase-tools 15.30.3-main.2（preview） | gitHead `a050d0fed1c6f251c62c41d21af046b70d34a8bc` も同じ2範囲 | 修正候補にならない |
| firebase-frameworks 0.11.8（npm latest） | sharp optional peer `^0.32 || ^0.33`、Admin13/Node22対応 | 修正版sharpを許容しない |
| firebase-frameworks 0.11.8-canary.d76fcf3（canary） | 同じsharp範囲、Admin13/Node22対応 | 解消しない |
| firebase-frameworks 0.11.0-next.1（nextタグ） | sharp `^0.32.1`、Admin11、Node16/18/20 | 古いタグ。指定バージョンとの互換性も満たさない |
| adapter mainの0.11.9表記（未公開） | sharp範囲は同じ。Admin14/Node24を追加しているがAdmin13/Node22も許容 | 将来版番号だけでは修正と判断できない |

npmの公開versions一覧は0.11.8まで。未公開mainは `firebase/apphosting-adapters` のコミット `ed2be48b15a0b00982fd08f264519309c54030de` で確認した。旧 `FirebaseExtended/firebase-framework-tools` URLから移転先へ解決される。リポジトリ名にApp Hostingが含まれていても、調査対象パッケージは従来Hosting用の `firebase-frameworks` である。

根拠:

- [CLI 15.31.0 constants](https://github.com/firebase/firebase-tools/blob/v15.31.0/src/frameworks/constants.ts)、[Next生成処理](https://github.com/firebase/firebase-tools/blob/v15.31.0/src/frameworks/next/index.ts)、[共通生成処理](https://github.com/firebase/firebase-tools/blob/v15.31.0/src/frameworks/index.ts)、[release notes](https://github.com/firebase/firebase-tools/releases/tag/v15.31.0)
- [adapterの固定コミットmanifest](https://github.com/firebase/apphosting-adapters/blob/ed2be48b15a0b00982fd08f264519309c54030de/packages/firebase-frameworks/package.json)
- npm読み取り: `npm view firebase-frameworks dist-tags version peerDependencies peerDependenciesMeta engines --json`、`npm view firebase-frameworks@canary ...`、`npm view firebase-frameworks@next ...`、`npm view firebase-frameworks versions --json`、`npm view firebase-tools dist-tags version engines --json`
- [過去のsharp対応PR #227](https://github.com/firebase/apphosting-adapters/pull/227) は2024-08-06にmergeされた0.33対応であり、0.35.4対応ではない。今回の限定的なIssue検索では修正版の公開予定は確認できなかった。未発見を修正予定なしの証明とはしない。

## 正確な依存経路

既存 `.firebase/demo-atria-ssr-check/functions` で `npm explain sharp` を読み取り実行した結果:

```text
生成SSR（engines.node = 22）
├─ firebase-frameworks ^0.11.0 → 0.11.8
│  └─ peerOptional sharp ^0.32 || ^0.33
│     → node_modules/sharp 0.33.5
└─ next 15.5.26
   └─ optional sharp ^0.34.3 || ^0.35.4
      → node_modules/next/node_modules/sharp 0.35.4
```

生成manifestにはsharpの直接依存はない。CLIはアプリの依存に `firebase-frameworks: ^0.11.0` を加え、root lockfileをコピーし、生成先で `npm i --omit dev --no-audit` を実行する。この既存解決結果では、Next用の修正版sharpとadapter用の旧sharpが別々に配置されている。optional peerは本来不在を許容するが、**この生成ツリーでは実際に導入済み**であり、optional指定だけで不在とは扱えない。

別経路としてCLIは画像最適化を検出した場合に `dependencies.sharp = SHARP_VERSION` を追加する。現在は `images.unoptimized: true` で、生成manifestにも直接依存がないため、今回の0.33.5はこの直接追加経路ではない。将来画像最適化を有効にするなら、adapter peerだけでなくCLIの `SHARP_VERSION` の修正も必要。

ローカルsemver比較では `satisfies('0.35.4', '^0.32 || ^0.33') = false`、Nextとadapterのsharp範囲の `intersects(...) = false`。0.xのcaret範囲は次のminorを許容しない。通常の解決で両者を0.35.4に統合することはできない。

## 回避策の評価

| 案 | 安全性・影響範囲 | 評価 |
| --- | --- | --- |
| CLIを15.31.0へ更新 | 生成処理の制約が同じ。他のCLI変更も入る | 本件を理由に更新しない |
| sharp 0.35.4以上を直接依存に追加 | adapterのpeer契約に違反する。競合または旧版の別配置を防げない | 宣言上、正常な解消策にならない。実験・変更なし |
| npm dedupe / lock再生成 | 交差しない許容範囲を統合できない | 解消策にならない。実行なし |
| 画像最適化の無効化 | 既に無効。adapter optional peerの導入は残る | 追加効果なし |
| `omit=peer` / `omit=optional` | ディスクへの配置を制御するが解決・lock記録は残る。optional全体の除外はNextのsharpやSWC native依存にも影響し得る。ローカルCLIとクラウド再インストールの一貫性も別途必要 | 修正版への自然な解決ではない。未検証で採用しない |
| legacy-peer-deps / force / override / 生成物編集 | peer契約を無視・上書き、または再生成で失われる | 対象外 |
| 古いadapterへのダウングレード / Git版 / fork | Next15、Admin13、Node22の互換性・保守責任の再検証が必要。mainにも修正なし | 安全な既成の代替として採用しない |
| 修正済み公式adapterの公開を待つ | アプリ4バージョンを維持したまま解消できる可能性がある | 最小範囲の次候補。ただし公開と検証が条件 |

[npm optional peer仕様](https://docs.npmjs.com/cli/v10/configuring-npm/package-json/#peerdependenciesmeta)、[npm omit仕様](https://docs.npmjs.com/cli/v10/using-npm/config/#omit)。omitを単に監査非表示目的と決めつけるものではないが、今回求める脆弱依存の解消を証明する方法にはなっていない。

## 到達可能性と残存リスク

**`sharp 0.33.5` は生成SSRに残るが、ATRIAで実際に使用される経路は現時点で確認されていない。** 未使用・安全を保証するものではない。

既存adapter distのsharp直接importはAngular用にある。Next用はNextサーバーへ渡し、Next側には修正版0.35.4がある。前回のローカル確認では画像最適化URLが404だった。ただし、これは前回の検証結果であり今回の再実行ではない。生成SSRに旧版が存在する事実は変わらず、全実行経路で安全との保証や残存リスクの受容には置き換えない。

既存監査で挙がった [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) と [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) を解消する基準はsharp 0.35.4以上。今回auditは再実行せず、件数の新しいスナップショットは作っていない。

## Hosting方式と将来の再検討条件

**App Hosting移行が必須とは断定しない。** adapterのpeer修正またはNext向け依存分離が公式に公開されれば、現在のHosting方式のまま解消できる可能性がある。一方、現時点の公開版には該当する修正がない。

[Firebase公式Hosting資料](https://firebase.google.com/docs/hosting/frameworks/nextjs) はframework-aware Hostingをpreviewとし、Next.js向け新規参加を終了、既存利用者へApp Hostingを推奨している。修正時期や継続サポートは保証されていないため、無期限に修正が来ると仮定しない。

新しいIssueで再検討する際の確認条件:

1. 公式npm版がsharp 0.35.4以上をpeerとして許容するか、Next用には旧sharpを要求しない構成になること。0.11.9という番号だけでは不可。
2. CLIのadapter指定範囲からその修正版を取得できること。必要なら別途承認のうえCLI更新を検証する。画像最適化を使う場合はCLIの直接sharp指定も確認する。
3. 今回検証したNext 15.5.26 / React 19.1.9 / Admin 13.10.0 / Node22は過去の検証構成として扱い、再検討時点のmainと公式対応状況から更新先・互換性を改めて評価する。
4. 承認後にクリーンな生成SSRのmanifest・lockfile・`npm explain sharp`・`npm ls`・auditで旧sharp不在と修正版、既存修正の維持を確認する。Windowsだけでなく本番相当Linux/Node22でnative依存も確認する。
5. typecheck / lint / 関連テスト / build / CIと生成SSRのルート・認証拒否・RSC・画像描画を再確認する。merge・本番反映は改めてユーザー承認を得る。

今回の終了に伴う本番変更は行わない。本番Next14の既知リスクがこの調査で解消されたわけではない。修正版の公開見込みが立たず更新を急ぐ場合は、App Hostingまたは自主管理SSRを別の移行案件として比較する。ビルド・SSR実行環境、IAM/サービスアカウント、環境変数、ドメイン/CDN/キャッシュ、費用、ロールバックに影響するため、本調査では構成作成も移行も行わない。App Hostingなら指定4バージョンを必ず保持できるとの実証もしていない。

この条件は次回調査の基準であり、自動監視や定期実行は設定していない。

2026-09-27の最終判断: 現行Firebase adapterでは安全に解消できないため、調査結果をmainへ記録してIssue #20を終了し、PR #21も未mergeでCloseする。Firebase公式adapterが `sharp 0.35.4+` を許容する、またはNext向け旧sharp依存が解消された時点で、新しいIssueを作って改めて更新を検討する。この古いブランチは再利用せず、その時点のmainから新しいブランチを作る。mainへ反映するのはドキュメントのみで、実装コード・依存更新・設定変更は取り込まない。本番Next.js 14系の既知リスクは未解消であり、Closeは脆弱性修正完了を意味しない。
