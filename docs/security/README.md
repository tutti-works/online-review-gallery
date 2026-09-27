# セキュリティ調査の入口

整理日: 2026-09-27。以下は保存済みの調査記録であり、継続的に更新される監査結果ではありません。Issue #24では再監査・依存更新・本番照会を行っていません。

## mainの状態と判断

- Next.js 14 / React 18を維持しています。ルートの `firebase-admin` はHosting生成SSRとの互換性のため13.10.0固定です。別のデプロイ単位である `functions/` の依存とは区別します。
- Issue #19の限定的なpatch/minor更新はmainへ反映済みですが、その作業では本番デプロイを行っていません。保存済み生成SSRや本番コンテナへ反映されたとは扱いません。
- Issue #20 / PR #21は、公式adapterが生成SSRに旧sharpを導入するため移行を見送りました。PRの実装・依存更新は未mergeで、Next.jsの既知リスクは未解消です。
- 公式adapterが修正版sharpを許容する等の条件を満たしたら、新しいIssueで再検討します。条件・検証範囲は [生成SSR sharp調査](generated-ssr-sharp-issue20.md) を参照してください。

## 調査記録

| 資料 | 対象・読み方 |
|---|---|
| [Issue #19依存監査](dependency-audit-issue19.md) | 2026-09-27のroot lockfile更新前後、dev／productionの分類、保存済み生成SSR。件数は脆弱パッケージ集計で、独立CVE数や現在の本番の件数ではない。 |
| [Issue #19 JSON](dependency-audit-issue19.json) | 上記の機械可読な詳細証跡。人間向け要約はMarkdown参照。 |
| [Issue #20 Next.js 15検証](next15-hosting-issue20.md) | 2026-09-27の未mergeブランチ上のbuild・テスト・SSR生成結果。mainの実装状態ではない。 |
| [Issue #20 sharp解消調査](generated-ssr-sharp-issue20.md) | 同日のadapter・CLI・依存解決調査。公開版やlatestという表記も調査時点のもの。 |
| [2026-09-22再監査](../audit-2026-09-22.md) | Issue #4〜#9等に先行する監査根拠。古い件数・優先順位は現在値として使用しない。 |

## 認証・データ保護の参照先

- [管理者管理とadmin-only](../features/admin-management.md): アプリ入場制限とAPI／Rulesの違い
- [Storage非公開化](../implementation/storage-privacy-migration.md): 移行の確認記録・未参照object
- [Git履歴の個人情報](../implementation/users-json-history.md): 判断が残る履歴対応
- [PLAN](../../PLAN.md): 現在の残課題
