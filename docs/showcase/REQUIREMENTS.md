# 専用ギャラリー要件（年度末成果発表展示会）

## 目的
- 年度末成果発表展示会向けに、既存ギャラリーとは独立した専用ページを提供する。
- 既存ギャラリーの運用やデータ構造には影響を与えない。
- いいねされた作品のみを「優秀作品」として掲載する。

## 前提・ロール
- いいねの付与は管理者のみ（既存仕様に準拠）。
- 閲覧者は優秀作品の閲覧のみ可能。
- 専用ギャラリーは「専用ルート」でのみ提供する（例: /showcase）。
- 管理者は「閲覧モード切替」でviewer表示を確認できる（ローカル保存）。

## アクセス制限（専用ギャラリーのみ）
- Firebase AuthのGoogleログインを前提。
- ログインメールのドメインが以下のいずれかの場合のみ許可。
  - musashino-u.ac.jp
  - *.musashino-u.ac.jp（例: stu.musashino-u.ac.jp）
- それ以外のドメインは専用ギャラリーにアクセス不可。
- 既存ギャラリーや通常ログインフローには干渉しない。
- 専用ログインページを使用（例: /showcase/login）。

## 画面構成
### 1) 入口ページ（課題グリッド）
- 表示対象: 優秀作品が1件以上ある課題のみ表示。
- パネル内容: 「最優秀作品のサムネイル + 課題名」。
- 最優秀作品が未設定の場合: 優秀作品内で学籍番号A→Zで最初の作品を使用。
- 作品ページが複数ある場合: 最初のページをパネル画像として使用。
- 課題パネルの画像比率はA3（420/297）。
- 最優秀アイコンとクラス名は表示しない。
- 管理者操作: 「全課題を一括更新」ボタンを配置。
- 管理者操作: 「閲覧モード切替」ボタンを配置。

### 2) 課題詳細ページ（優秀作品一覧）
- グリッド表示。
- グリッドの先頭に「課題概要（A3画像）」パネルを配置。
  - 未登録の場合: 閲覧者には非表示、管理者にはアップロードUIを表示。
  - クリックで拡大表示（モーダル）。補足文言は表示しない。
  - 管理者は右上の再アップロードアイコンから更新できる（確認モーダル付き）。
- 以降に優秀作品のサムネイルを並べる。
  - 並び順: 学籍番号 A→Z。
  - 画像比率はA3（420/297）、学籍番号は非表示。
- 管理者操作:
  - 「この課題を更新」ボタン。
  - 最優秀作品の選択（優秀作品一覧から指定）。
    - 最優秀アイコンは管理者のみ表示。
    - 「最優秀に指定」ボタンは氏名の右側に表示。
  - 課題名の編集。
  - 課題概要（A3画像）のアップロード/更新（再アップロード時は確認モーダル）。
  - 「閲覧モード切替」ボタン。
- ナビゲーション: 「課題グリッドへ戻る」リンクを設置。

### 3) 作品詳細ビュー（没入）
- A3作品を全画面に近い形で表示。
- 左右操作で「同じ課題内の優秀作品」を順に移動。
- 作品ページが複数ある場合はページ切り替え可能。
- 作品ドキュメントに `showcaseHiddenPageNumbers` が設定されている場合、該当ページは Showcase 上で非表示にする。
- 画像は縦横比を維持し、下部が欠けないように表示する。

## 優秀作品の選定ルール
- 既存ギャラリーの artworks から、likeCount > 0 の作品を抽出。
- これを「優秀作品」として専用ギャラリーに同期。
- 同期は管理者操作（更新ボタン）で行う。

## 同期フロー（管理者）
### 課題単位の更新
- 1課題のみ対象。
- 対象課題の artworks を取得。
- likeCount > 0 の作品IDを抽出。
- 学籍番号A→Zで並べ替え、専用コレクションに保存。

### 全課題一括更新
- 入口ページで実行。
- すべての課題を対象に上記処理を実行。
- 実行結果をUIで可視化する（進行/完了/失敗）。

## データ設計（追加）
既存コレクションへの書き込みは行わない。専用コレクションを追加する。

### Firestore: showcaseGalleries/{galleryId}
- galleryId: 既存galleriesのIDと一致
- displayTitle: 課題名（管理者による上書き）
- featuredArtworkId: 最優秀作品ID
- curatedArtworkIds: 優秀作品ID一覧（更新ボタンで同期）
- overviewImageUrl: 課題概要（A3画像）のURL
- overviewImagePath: Storage上の保存パス
- overviewImageThumbUrl: 課題概要サムネイルのURL
- overviewImageThumbPath: サムネイルの保存パス
- syncedAt: 最終同期日時
- updatedBy: 更新した管理者のメール

### Firestore: artworks/{artworkId}（Showcase表示制御の任意フィールド）
- showcaseHiddenPageNumbers: number[]（任意）
- 用途: Showcase のみで非表示にしたいページ番号を指定する（例: `[1]`）。
- 補足: 元画像や `images` 配列自体は削除しない。Showcase 読み込み時に表示対象から除外する。

### Storage
- 既存 /galleries とは別パスを使用する（干渉回避）。
- 例: /showcase/{galleryId}/overview.{ext}
- サムネイルも同じパス配下に保存する（例: /showcase/{galleryId}/overview-{timestamp}-thumb.jpg）

## 既存ギャラリーへの影響
- 既存の galleries / artworks / likes は読み取りのみ。
- 例外: Showcase 表示制御が必要な場合のみ、`artworks/{artworkId}.showcaseHiddenPageNumbers` を更新する。
- 既存UI・運用フローは変更しない。

## 今後の実装メモ
- 学籍番号ソートは既存の getStudentId / sortByStudentId を利用。
- 入口/詳細の両方に「更新」ボタンを配置。
- Overviewパネルは閲覧者に非表示、管理者にはアップロードUI。
- ドメイン制限は専用ルートのみ適用。

## メンテナンス（未使用データのクリーンアップ）
Showcase の未使用データを検出・削除するスクリプトを用意する。

### 対象
- Firestore: galleries に存在しない showcaseGalleries ドキュメント（孤立）
- Storage: showcaseGalleries で参照されていない overview 画像/サムネイル

### 使い方
- ドライラン（削除なし）
  - `npm run cleanup:showcase`
- 未使用ファイルを削除
  - `npm run cleanup:showcase -- --apply --delete-orphan-files`
- 孤立した showcase ドキュメントも削除
  - `npm run cleanup:showcase -- --apply --delete-orphan-docs`
- curatedArtworkIds が空の showcase ドキュメントを削除
  - `npm run cleanup:showcase -- --apply --delete-empty-curated`
- overview 以外の showcase 配下も対象にする
  - `npm run cleanup:showcase -- --apply --delete-orphan-files --include-non-overview`
- 件数表示
  - `--limit=200` / `--list-all`
 - PowerShell で `npm run` 経由の引数が落ちる場合は、直接実行する
   - `node scripts/cleanup-showcase.js --apply --delete-orphan-files`

### 認証
- `firebase-admin-key.json` がある場合は自動で使用。
- 別パスを使う場合は `--credentials=PATH` もしくは `GOOGLE_APPLICATION_CREDENTIALS` を指定。
- `--project=PROJECT_ID` / `--bucket=BUCKET_NAME` の指定にも対応。

## Change Log
- 2026-02-10: 作品単位で Showcase 非表示ページを制御できる `showcaseHiddenPageNumbers` を artworks に追加。例: `M5nh110LkXwptybPmmuX` の1ページ目を `[1]` で非表示化。
- 2026-02-03: 課題概要のサムネイルを Storage に保存して一覧表示を高速化。未使用データのクリーンアップスクリプト（cleanup:showcase）を追加。
- 2026-02-02 (commit 6a9541d0486e1e42c9616f522b1d5fa3f62a6597): 課題統合（Update Merge）を追加。showcaseGalleries に updateSourceGalleryId を保持し、同一クラスの既存ギャラリーから更新ソースを選択可能にした。プレビュー/同期時に学籍番号でマッチした学生の作品を差し替え（submitted のみ）。新規追加は行わず、既存の curated 作品のみを更新対象とする。
