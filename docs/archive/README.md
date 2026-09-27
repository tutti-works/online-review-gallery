# アーカイブ・履歴資料

このディレクトリの計画・設定値・実装済み表記・見積もりは当時の記録です。現在仕様は [requirements](../requirements.md)、次の作業は [PLAN](../../PLAN.md)、全体の入口は [文書索引](../README.md) を参照してください。

## 保管資料

| 資料 | 用途 |
|---|---|
| [注釈の旧実装計画](annotation-roadmap-2025.md) | 旧要件書の第10章を分離。2025年の技術選定・拡張案・工数。 |
| [注釈の性能最適化計画](phase3-performance-optimization-plan.md) | 2025-11-03の設計・実装記録。現在の注釈は [機能仕様](../features/ANNOTATION_FEATURE.md) 参照。 |
| [旧手動テストシナリオ](manual-test-scenarios-2025.md) | 2025-11-20版TESTINGのケース。現在の [テストとCI](../TESTING.md) とは分離。 |
| [A3表示変更](A3_LANDSCAPE_UPDATE.md) | 2025-10-30の画像表示変更記録。 |
| [サムネイル変更](THUMBNAIL_UPDATE.md) | 当時の生成サイズ・表示変更。 |
| [Chrome DevTools MCP](chrome-devtools-mcp.md) | 当時のツール導入資料。現行ツール設定や操作許可を定めるものではない。 |

## 旧要件書バックアップの整理（Issue #24）

旧 `docs/requirements.md.backup` は、2025年の文書分割コミット `49e8f0e` で追加された約59KBのコピーでした。内容を比較し、同コミットの親にある `docs/requirements.md` と全文一致（改行コードを正規化して比較）することを確認しました。実行時参照はなく、単なるバックアップのためdocs直下から削除しました。

復元元はGit履歴です。内容確認には次の読み取りコマンドを使えます。

```bash
git show 49e8f0e:docs/requirements.md.backup
git show 49e8f0e^:docs/requirements.md
```

旧要件書全体をもう1部保管せず、読み続ける価値のある注釈計画を上記資料に分離しています。監査スナップショットは削除せず [セキュリティ索引](../security/README.md) と [2026-09-22監査](../audit-2026-09-22.md) から辿れます。
