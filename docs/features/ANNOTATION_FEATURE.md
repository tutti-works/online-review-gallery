# アノテーション機能

更新: 2026-09-27。mainの [AnnotationCanvas](../../src/components/AnnotationCanvas.tsx)、[ArtworkViewer](../../src/components/artwork-modal/ArtworkViewer.tsx)、[GalleryPage](../../src/app/gallery/GalleryPage.tsx) に照合しています。

## 操作

- Konva / react-konvaで作品画像上にフリーハンド描画します。描画・選択・パン・消しゴムのツールを切り替え、線の移動・削除、Undo／Redo、全消去を行えます。
- 色・線幅は [定数](../../src/components/annotation-canvas/constants.ts) のプリセットを使います。現行は6色、線幅2／6／12、履歴上限15です。
- 注釈は作品のページごとに管理します。ページ・作品の切り替えや注釈モード終了時には未保存ドラフトの保存処理を行います。
- 通常表示では注釈の表示を切り替えられます。画像のズーム・パンに追従し、タッチ入力にも対応します。端末ごとの操作・性能確認は自動テストとは別です。

## 保存・復元

描画コンポーネントが保存payloadを親へ渡し、GalleryPageが `artworks/{artworkId}` を更新します。

- `annotationsMap` にページごとの線・元サイズ・更新者・更新日時を保存します。
- 旧 `annotations` 配列に対象ページがあれば保存時に除去します。画面内の互換配列はローカル状態で更新し、新しい永続データはmapへ保存します。
- 復元時は `annotationsMap` を優先し、旧注釈データへフォールバックします。変換処理は [annotationsユーティリティ](../../src/utils/annotations.ts) を参照してください。
- 全消去の保存では対象ページのmapエントリと旧配列の対応ページを削除します。

注釈専用のFirestoreサブコレクションへの保存ではありません。現行の保存経路はFirestoreの線データで、Storageへの注釈画像アップロードを必要としません。型の入口は [データ構造](../implementation/data-model.md) です。

## 権限・プレビュー

現在は [共通admin-only制限](admin-management.md#暫定admin-onlyログインissue-22) により、viewer／guestはアプリへ入場できません。描画側の `editable` とFirestore Rulesのadmin write判定は別に維持します。

[UIプレビュー](../ui-preview.md)では手動保存・自動保存を含む書き込みを停止します。保存成功の検証にはEmulator等の検証環境を使ってください。

## 描画と性能

元画像サイズと表示サイズを分け、リサイズ・ズーム・パン時に線の位置を調整します。画像キャッシュと描画レイヤーを利用し、perfectDrawの戦略・しきい値は [annotation設定](../../src/config/annotation.ts) で管理します。昔の計測値や「一定のFPS」を現在の保証として扱いません。

## 問題が起きたとき

- 保存できない: Read-Onlyプレビューか、現在のadminロール、`artworks/{id}` のRules、保存処理のエラーを確認します。存在しない注釈サブコレクション用Rulesを追加しないでください。
- ページ変更で表示が消える: ページ番号と `annotationsMap` のキー、旧配列との互換変換、ドラフト保存の失敗を確認します。
- 描画が重い: 端末・画像サイズ・線や点の数・描画設定を記録し、再現条件を比較します。

## 開発履歴・拡張案

過去の技術選定・ロードマップは [2025年の注釈計画](../archive/annotation-roadmap-2025.md)、当時の性能設計は [最適化計画](../archive/phase3-performance-optimization-plan.md) に残しています。テキスト・図形・協調編集等の案は現在の実装仕様や確定した開発予定ではありません。

検証方法は [TESTING](../TESTING.md)、現在の優先順位は [PLAN](../../PLAN.md) を参照してください。
