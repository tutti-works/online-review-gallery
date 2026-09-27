# データ構造の入口

更新: 2026-09-27。現在の要件は [requirements](../requirements.md)。全フィールドの定義は [フロントエンド型](../../src/types/index.ts)、インポートの内部状態は [importState](../../functions/src/importState.ts) を正とします。

## Firestore

| コレクション／文書 | 役割・主要フィールド |
|---|---|
| `galleries/{id}` | 授業・課題のメタデータ。`courseId`、`assignmentId`、名前、`artworkCount`。作品本体はartworksから取得し、旧 `artworks` 配列は使用しない。 |
| `artworks/{id}` | `galleryId`、学生情報、元ファイル `files`、変換画像 `images`、`status`、`labels`、`comments`、`likeCount`、注釈。 |
| `likes/{id}` | `artworkId` と `userEmail` のいいね。トップレベルコレクションで、Artworkのサブコレクションではない。 |
| `archivedCourses/{courseId}` | `archivedAt`（サーバー時刻）。文書があれば授業全体をアーカイブ表示。 |
| `userRoles/{email}` | `admin` / `viewer` / `guest`。クライアントは自分のロールのみ読め、直接書き込みは禁止。 |
| `_adminManagement/roles` | 管理者変更を直列化するサーバー側transactionの共通ロック。 |
| `importJobs/{jobId}` | ジョブ状態、学生提出単位の件数、`initializationComplete`。旧 `totalFiles` / `processedFiles` は互換表示に残す。 |
| `importJobs/{jobId}/submissions/{keyHash}` | 学生キー、確定したartwork ID、claim・終端状態・失敗情報。クライアント向け進捗は認証付きAPI経由。 |
| `showcaseGalleries/{galleryId}` | 展示タイトル、代表作品、選定ID・表示順、更新元Gallery、概要画像path、同期日時。 |

## 作品・画像・注釈

- `status` は `submitted` / `not_submitted` / `error`。旧データの欠落を扱う互換処理があります。新しいインポートの進捗状態とは別です。
- `images` は全ファイル通しの `pageNumber` と `sourceFileId` / `sourceFileName` を持ちます。認証付き取得には `storagePath` / `thumbnailPath` を使い、旧URLフィールドは互換用です。
- 評価ラベルは `labels` 配列を維持します。色別更新と集計の規則は [機能仕様](../features/gallery-and-feedback.md#33-ラベル機能-f-04-03) を参照してください。
- 注釈は `annotationsMap` のページ別の線・サイズ・更新情報を保存し、旧 `annotations` との互換変換を [annotationsユーティリティ](../../src/utils/annotations.ts) で扱います。
- `showcaseHiddenPageNumbers` はShowcaseで非表示にするページ番号で、元画像の削除ではありません。

## 詳細と境界

- [インポート状態・安定ID・transaction](import-idempotency.md)
- [管理者管理のAPI・ロック・最後のadmin保護](../features/admin-management.md)
- [Showcaseデータ・同期](../showcase/REQUIREMENTS.md)
- [Storage移行記録](storage-privacy-migration.md)
- [Firestore Rules](../../firestore.rules) / [Storage Rules](../../storage.rules)

この文書の一覧は新規データ移行の指示ではありません。過去のstatus導入設計は [履歴資料](data-migration.md) に残しています。
