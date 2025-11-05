# 変更履歴

このファイルには、オンライン講評会支援ギャラリーアプリの詳細な開発履歴と変更ログが記録されています。

---

## 2025-11-06: 再インポートスキップと未提出・エラー作品プレースホルダー機能実装

### 実装した機能

- **再インポートスキップ機能**: 既存学生の重複作品生成を防止
- **未提出学生のプレースホルダー作品**: Classroom APIから割り当て学生を取得し、未提出者にグレーサムネイルを生成
- **エラー作品のプレースホルダー**: サポート外ファイル形式や処理失敗時にグレーサムネイルとエラー情報を表示
- **フィルター機能**: 未提出/エラー作品の表示/非表示を切り替えるチェックボックス
- **特殊な並び替えロジック**: 提出作品を優先表示し、未提出/エラー作品を後ろに配置

### 技術詳細

**作品ステータスの拡張:**
```typescript
status: 'submitted' | 'not_submitted' | 'error'
errorReason?: 'unsupported_format' | 'processing_error'
```

**再インポートスキップロジック:**
- `normalizeIdentifier()` 関数で学生メールを正規化（小文字化、トリム）
- 既存作品のメールをSetに格納して重複チェック
- 判定キー: `galleryId + normalizeIdentifier(studentEmail)`
- スキップした学生数をログに記録

**未提出プレースホルダー生成:**
- Google Classroom APIの `assignedStudents` を取得
- 提出済み学生メールと既存学生メールを除外
- `status: 'not_submitted'` でプレースホルダー作品を生成
- グレーサムネイル（600x600px）を使用

**エラープレースホルダー生成:**
- サポート外ファイル形式検出時（画像/PDF以外）
- ファイル処理失敗時
- `status: 'error'` と `errorReason` を記録
- 提出ファイル情報（ファイル名、MIME type）を保持

**フィルター/ソート機能:**
- `src/lib/artworkUtils.ts` にユーティリティ関数を実装:
  - `isSubmitted()`, `isNotSubmitted()`, `isError()`, `isIncomplete()`
  - `getStatusText()`: ステータステキスト生成
  - `sortBySubmissionDate()`: 提出日時順ソート（未提出/エラーを後ろに配置）
  - `sortByStudentId()`: 学籍番号順ソート（同様のロジック）

**モーダル表示:**
- 未提出作品: 学生情報、「まだ提出されていません」メッセージ
- エラー作品: 学生情報、エラー理由、提出ファイル情報

### 実装ファイル

**Cloud Functions:**
- [functions/src/importController.ts](functions/src/importController.ts#L120-L213): 再インポートスキップロジック
- [functions/src/importController.ts](functions/src/importController.ts#L439-L523): 未提出プレースホルダー生成
- [functions/src/fileProcessor.ts](functions/src/fileProcessor.ts#L156-L192): エラープレースホルダー生成

**フロントエンド:**
- [src/lib/artworkUtils.ts](src/lib/artworkUtils.ts): ステータス判定・ソートユーティリティ関数
- [src/app/gallery/page.tsx](src/app/gallery/page.tsx): フィルター/ソート機能UI
- [src/components/ArtworkModal.tsx](src/components/ArtworkModal.tsx): プレースホルダー作品のモーダル表示
- [src/components/artwork-modal/ArtworkViewer.tsx](src/components/artwork-modal/ArtworkViewer.tsx): プレースホルダー表示UI

**型定義:**
- `Artwork` インターフェースを拡張（`status`, `errorReason` フィールド追加）

### データ構造

**Artworkドキュメント（通常の提出作品）:**
```typescript
{
  studentId: string,
  studentName: string,
  studentEmail: string,
  status: 'submitted',
  images: [{
    originalUrl: string,
    thumbnailUrl: string,
    pageNumber: number
  }],
  submittedAt: Timestamp,
  // ... その他のフィールド
}
```

**未提出プレースホルダー:**
```typescript
{
  studentId: string,
  studentName: string,
  studentEmail: string,
  status: 'not_submitted',
  images: [{
    originalUrl: 'https://placehold.co/600x600/e5e7eb/9ca3af?text=Not+Submitted',
    thumbnailUrl: 'https://placehold.co/600x600/e5e7eb/9ca3af?text=Not+Submitted',
    pageNumber: 1
  }],
  // submittedAt なし
}
```

**エラープレースホルダー:**
```typescript
{
  studentId: string,
  studentName: string,
  studentEmail: string,
  status: 'error',
  errorReason: 'unsupported_format' | 'processing_error',
  images: [{
    originalUrl: 'https://placehold.co/600x600/fee2e2/ef4444?text=Error',
    thumbnailUrl: 'https://placehold.co/600x600/fee2e2/ef4444?text=Error',
    pageNumber: 1
  }],
  submittedFiles?: [{
    filename: string,
    mimeType: string
  }],
  submittedAt: Timestamp
}
```

### 使用シーン

**再インポートスキップ:**
- 同じギャラリーに同じ学生の作品を再度インポートしようとした場合
- 不完全なインポート後に再実行する場合（既存作品は維持）

**未提出プレースホルダー:**
- 課題割り当て学生の中で未提出の学生を可視化
- 提出状況の一覧確認
- 未提出者への催促対応

**エラープレースホルダー:**
- サポート外形式（TIFF、EPS、SVG等）の提出を検出
- ファイル破損やメモリ不足による処理失敗を記録
- エラー原因の特定と学生への連絡

### UX改善

**視覚的識別:**
- 通常作品: カラーサムネイル
- 未提出作品: グレーサムネイル
- エラー作品: 赤系グレーサムネイル

**フィルター操作:**
- 「未提出/エラー作品を非表示」チェックボックスで表示切り替え
- デフォルトは表示状態（全作品を確認可能）

**並び替え:**
- 「提出日時順」「学籍番号順」で提出作品を優先表示
- 未提出/エラー作品は各ソート基準の後ろに配置

**モーダル情報:**
- 未提出作品: 学生情報のみ表示
- エラー作品: エラー理由と提出ファイル情報を詳細表示
- 作品間ナビゲーションで連続確認可能

### パフォーマンス

**再インポート処理:**
- 既存作品クエリ: 1回のみ実行
- メール正規化: O(n) の線形時間
- 重複チェック: Set使用でO(1)

**プレースホルダー生成:**
- Classroom API呼び出し: インポート時1回のみ
- プレースホルダー画像: 外部サービス（placehold.co）使用
- Firestore書き込み: バッチ処理で効率化

**フィルター/ソート:**
- クライアント側での動的処理
- 数百件規模で1ms未満

---

## 2025-11-06: ギャラリー作品数同期機能実装とartworksフィールド非推奨化

### 実装した機能

- ギャラリードキュメントの`artworkCount`を実際の作品数で同期する機能を実装
- `artworks`配列フィールドを非推奨化し、`artworkCount`のみを使用する設計に変更
- ダッシュボードページに同期機能UIを統合
- エミュレーター環境対応の認証処理を実装

### 技術詳細

**同期機能の実装:**
- `syncGalleryArtworkCount` Cloud Function を実装
- 全ギャラリーまたは特定ギャラリーの作品数を同期
- Firestoreクエリ結果から実際の作品数を取得して `artworkCount` を更新
- 同期結果（旧カウント、新カウント、差分）を返却

**エミュレーター対応:**
- `process.env.FUNCTIONS_EMULATOR === 'true'` で環境を検出
- 本番環境：厳密な認証チェック（`getUserByEmail` + 管理者ロール確認）
- エミュレーター環境：ログ出力のみでリクエストを許可（認証ユーザーレコードが不要）

**クエリパターンの変更:**
- `.count().get()` から `.get().size` に変更（エミュレーター互換性のため）
- 単一ギャラリーと全ギャラリー両方のパスで適用

**artworksフィールド非推奨化:**
- 新規ギャラリー作成時に `artworks: []` を作成しないように変更
- インポート処理で `artworks` 配列を更新しないように変更
- 同期処理で既存の `artworks` フィールドを削除しない（放置）
- `artworkCount` のみを信頼できる作品数として使用

**ダッシュボードUI:**
- 「ギャラリー作品数同期」セクションを追加
- 同期実行ボタンとローディング状態表示
- 同期結果を表形式で表示（ギャラリー名、旧カウント、新カウント、差分）
- 差分の色分け表示（増加: 緑、減少: 赤、変更なし: グレー）

### 実装ファイル

**Cloud Functions:**
- `functions/src/index.ts`: `syncGalleryArtworkCount` 関数の実装
  - エミュレーター対応認証処理（896-916行目）
  - クエリパターン変更（930-933, 962-965行目）
  - `artworks` フィールド削除処理を削除
- `functions/src/importController.ts`: `finalizeGallery` 関数を修正
  - `artworks` 配列の更新を削除（579-592行目）

**フロントエンド:**
- `src/app/dashboard/page.tsx`: 同期機能UIの追加
  - `handleSyncArtworkCount` 関数実装（77-121行目）
  - 同期結果表示UI（356-409行目）
- `src/app/admin/import/page.tsx`: 新規ギャラリー作成処理を修正
  - `artworks: []` を削除、`artworkCount: 0` を追加（315-323行目）

**型定義:**
- `SyncResult` インターフェースを定義（ `oldArtworksArrayLength` を含む）

### データ構造の変更

**ギャラリードキュメント:**
```typescript
// 旧構造（非推奨）
{
  artworks: string[],  // 非推奨：もう使用しない
  artworkCount: number
}

// 新構造
{
  artworkCount: number  // これだけを使用
}
```

**移行戦略:**
1. 新規作成時に `artworks` フィールドを作成しない
2. インポート時に `artworks` フィールドを更新しない
3. 同期時に既存の `artworks` フィールドを削除しない（放置）
4. `artworkCount` のみを信頼できる作品数として使用

### 使用シーン

- 作品の個別削除後に作品数が不整合になった場合
- データマイグレーション後の整合性確認
- 定期的なデータ整合性チェック

### UX改善

- 同期確認ダイアログで操作内容を明示
- 同期実行中はボタンを無効化してテキストを変更
- 同期完了後に結果サマリーをアラート表示
- 詳細な同期結果を表形式で表示
- ページリロードで最新のギャラリー一覧を取得

---

## 2025-11-04: モーダル内作品間ナビゲーション機能実装

### 実装した機能

- モーダルを開いたまま前後の作品に移動できるナビゲーションボタンを追加
- コントロールバーに「前の作品」「次の作品」ボタンと「作品 X/総数」表示を統合
- 二重矢印アイコン（◄◄ / ►►）で作品間ナビゲーションとページナビゲーションを視覚的に区別
- 縦区切り線でUIセクションを明確に分離

### 技術詳細

**UIレイアウト:**
```
[◄◄ 前の作品] 作品 5/25 [次の作品 ►►] | [◄] 1/3 [►] | [📝] | [-] 100% [+] リセット
```
- 左側: 作品間ナビゲーション（二重矢印）
- 中央: ページナビゲーション（単一矢印）※複数ページの場合のみ表示
- 右側: ズームコントロール

**Props拡張:**
- `ArtworkModal`: `artworks`, `currentIndex`, `onNavigate` を追加
- `ArtworkViewer`: `currentArtworkIndex`, `totalArtworks`, `onArtworkChange` を追加

**作品切り替えロジック:**
- `handleArtworkChange(direction: 'prev' | 'next')` 関数を実装
- 注釈の自動保存処理を統合（`requestAutoSave('artwork-change')`）
- ページ番号とズーム状態を自動リセット
- フィルタリング・ソート後の作品順序を正確に反映（`filteredArtworks`配列を使用）

**無効化制御:**
- 最初の作品: 「前の作品」ボタンを無効化
- 最後の作品: 「次の作品」ボタンを無効化
- 注釈保存中: 両方のボタンを無効化

**型定義更新:**
- `AnnotationSaveReason` 型に `'artwork-change'` を追加

**実装ファイル:**
- `src/app/gallery/page.tsx`: 作品リストとナビゲーションハンドラーをモーダルに渡す
- `src/components/ArtworkModal.tsx`: 作品切り替え処理の実装
- `src/components/artwork-modal/ArtworkViewer.tsx`: UIボタンの追加
- `src/components/annotation-canvas/types.ts`: 型定義の拡張

### UX改善

- 作品切り替え時に未保存の注釈があれば自動保存
- 保存失敗時は作品切り替えをキャンセルしてデータ損失を防止
- モーダルを閉じずに連続的に作品を閲覧可能

---

## 2025-10-21: 合計ラベルフィルター機能実装

### 実装した機能

- ラベル数字の合計値（1〜10）でフィルタリングする機能を実装
- プルダウンセレクトボックスで合計値を選択
- 合計フィルター選択時は個別ラベルボタンを自動無効化
- 個別フィルターと合計フィルターの排他制御

### 技術詳細

**状態管理:**
- `totalLabelFilter` (number | null) ステートを追加

**UIコンポーネント:**
- プルダウンセレクトボックス（デフォルト: "合計で絞り込み"、選択肢: 1〜10）
- 個別ラベルボタンに `disabled` 属性と `opacity-50 cursor-not-allowed` スタイルを適用

**フィルタリングロジック:**
- `getFilteredArtworks()` 関数を拡張
- 正規表現 `/-(\d+)$/` でラベルから数字を抽出
- `reduce` で合計値を計算
- 合計フィルターが優先され、個別フィルターより先に評価

**相互作用ロジック:**
- `handleTotalLabelFilterChange()`: 合計値選択時に `selectedLabels` を空配列にクリア
- `toggleLabelFilter()`: 合計フィルター有効時は早期リターンで個別フィルター操作を無効化

**実装ファイル:**
- `src/app/gallery/page.tsx`: 全ての変更を含む

### パフォーマンス

- クライアント側での動的フィルタリング（シンプルで十分な性能）
- 数百件規模の作品でも1ms未満で処理完了

---

## 2025-10-07: WebP対応、インポートUI改善、バグ修正

### (4) 複数ファイル提出時のサムネイル重複生成バグ修正
- 全体で1ページ目のみサムネイル生成するように修正
- リダイレクト時のbeforeunload警告を無効化

### (3) PDF変換最適化とエラー詳細記録
- PDF変換をJPEG経由の2段階処理に変更（メモリ使用量削減によるSegmentation Fault対策）
- エラー詳細情報の記録機能追加（`errorDetails`フィールド）
- インポートUI改善（エラー詳細の表示）

### (2) インポート待機UI改善
- 警告メッセージ表示（ページを閉じないよう注意喚起）
- beforeunload確認ダイアログ
- 段階的ステータス表示（「データ取得中」→「ファイル確認中」→「処理キュー準備中」）
- ローディングスピナーアニメーション

### (1) WebP形式対応実装
- 画像・PDF両方をWebPに変換
- ファイルサイズ約30%削減を実現
- Sharp使用による高品質変換

---

## 2025-10-06: ハイブリッドギャラリー管理システム

### (3) ギャラリー選択フロー改善
- 初回訪問時の挙動改善
  - ギャラリーが存在しない場合の適切なメッセージ表示
  - 選択画面の誘導UI
- localStorage・URL同期の最適化
- 削除されたギャラリーのハンドリング強化
  - 自動検証とクリーンアップ
  - URLパラメータとlocalStorageの同期

### (2) ハイブリッドギャラリー管理システム実装
- ギャラリー切り替えUI（2段階ドロップダウン）
- ギャラリー別データ削除機能
- URL・localStorage連携
- Google Classroom APIから授業名・課題名を自動取得

**実装ファイル:**
- `functions/src/importController.ts`: ギャラリー自動生成
- `functions/src/fileProcessor.ts`: 作品数キャッシュ更新
- `functions/src/index.ts`: ギャラリー別削除機能
- `src/components/GallerySwitcher.tsx`: 2段階ドロップダウンUI
- `src/app/gallery/page.tsx`: ギャラリー選択ロジック
- `src/app/dashboard/page.tsx`: 削除機能UI

### (1) 複数ファイル提出の統合処理実装
- 同じ学生の複数ファイルを1つのartworkにまとめる機能
- 全ファイルの全ページを統合表示
- ページ番号の通し採番
- サムネイルは1ページ目のみ生成

**実装ファイル:**
- `functions/src/fileProcessor.ts`: `processMultipleFiles`関数
- `src/app/gallery/page.tsx`: モーダルでのファイル名表示

---

## 2025-10-05: GitHub Actions自動デプロイ、Google Analytics

### 実装した機能

- GitHub Actionsによる自動デプロイパイプライン設定
- Google Analytics（GA4）有効化
- 本番環境への自動デプロイフロー確立

**ファイル変更:**
- `.github/workflows/firebase-deploy.yml`: 新規作成
- `.env.production`: Google Analytics Measurement ID追加
- `next.config.js`: GA設定追加

---

## 2025-10-04: Firebase Hosting移行、SSR対応

### 実装した機能

- Firebase HostingへのSSR対応移行
- asia-northeast1リージョンへのデプロイ
- Next.js App Routerの最適化

**ファイル変更:**
- `firebase.json`: Hosting設定追加
- `next.config.js`: Firebase Hosting対応
- デプロイスクリプトの整備

---

## 2025-10-02: Cloud Run移行とPDF処理の最適化

### 実装した機能

#### 1. Cloud Run移行（processFileTask）
- PDF処理機能をFirebase FunctionsからCloud Runに移行
- GraphicsMagickとGhostscriptをDockerイメージに組み込み
- Cloud Buildを使用したイメージビルドプロセスを確立
- Cloud Tasks経由でのHTTPエンドポイント呼び出しを実装

#### 2. PDF処理の最適化
- pdf2picの出力形式（path vs buffer）の問題を解決
- PDF出力サイズを3400x2404px（A3横向き比率）に最適化
- サムネイルを420x297pxに設定し、アスペクト比を維持（fit: 'inside'）
- Firestoreへの`undefined`値保存エラーを修正

#### 3. データリセット機能
- 管理者向けにすべてのデータを削除する機能を追加
- Firebase Functionsの認証方式をIDトークンからリクエストボディのメール検証に変更
- galleriesコレクションを完全削除する処理に変更

#### 4. artworksデータ構造の改善
- トップレベルに`thumbnailUrl`フィールドを追加（最初のページのサムネイル）
- 空の`images`配列によるエラーを修正

#### 5. インポート進捗表示の修正
- ギャラリーページで進捗が正しく更新されない問題を修正
- 404エラー時にlocalStorageをクリアする処理を追加
- デバッグログを追加して進捗追跡を改善

### ファイル変更一覧

```
変更:
- functions/src/cloudrun.ts (Cloud Runエントリーポイント、storageBucket設定追加)
- functions/src/processFileTaskHttp.ts (HTTP形式のペイロード処理)
- functions/src/fileProcessor.ts (PDF処理最適化、undefined値修正)
- functions/src/index.ts (deleteAllData機能追加)
- functions/Dockerfile (必要なファイルのみコピー、lib/index.js除外)
- functions/package.json (@google-cloud/functions-framework追加)
- src/app/gallery/page.tsx (進捗表示修正、空images配列対応)
- src/app/dashboard/page.tsx (deleteAllData呼び出し方法変更)
- CLOUD_RUN_DEPLOYMENT.md (Cloud Build手順を追加)
- SETUP.md (Cloud Runデプロイ手順を追加)

新規作成:
- functions/.env.online-review-gallery (Cloud Run URL設定)
```

### 解決した問題

#### PDF処理関連
- ❌ "Request body is missing data" → ✅ lib/index.jsをDockerイメージから除外
- ❌ "Bucket name not specified" → ✅ cloudrun.tsでstorageBucket設定
- ❌ "Page has no buffer" → ✅ page.pathから読み込みに変更
- ❌ "Cannot use undefined as Firestore value" → ✅ thumbnailUrlを条件付きで追加
- ❌ PDF出力が正方形（3400x3400） → ✅ width/heightを明示的に指定
- ❌ サムネイルがクロップされる → ✅ fit: 'cover' → 'inside'に変更

#### その他
- ❌ インポート進捗が「インポート進行中」で止まる → ✅ 404ハンドリング追加
- ❌ images配列が空でエラー → ✅ nullチェック追加

---

## 2025-09-30: 主要機能の実装完了

### 実装した機能

#### 1. ギャラリー表示のFirestore連携
- Firestoreから作品データを取得する処理を実装
- 作成日時順にソートして表示
- Timestamp型からDate型への変換処理を追加

#### 2. いいね機能のFirestore保存処理
- いいねの追加・削除機能を実装
- `likes`コレクションに保存
- トグル機能（いいね済みの場合は解除）
- 楽観的UI更新でスムーズな操作感を実現

#### 3. コメント機能のFirestore保存処理
- コメントの投稿機能を実装
- `artworks`コレクションのcommentsフィールドに保存
- 投稿者情報とタイムスタンプを記録

#### 4. Firestore Security Rules設定
- 役割ベースのアクセス制御を実装
- 管理者（admin）と閲覧者（viewer）の権限を分離
- 各コレクションごとに適切なアクセス権限を設定

#### 5. 環境変数の設定
- Firebase Functions URLをasia-northeast1リージョンに修正
- `.env.local`と`.env.example`を更新
- 開発環境と本番環境の設定を明確化

#### 6. 型エラーの修正
- sharpのimportをデフォルトインポートに修正
- corsのimportをデフォルトインポートに修正
- OAuth2Clientの型定義を修正
- エラーハンドリングの型安全性を向上

#### 7. ドキュメント作成
- `SETUP.md`: セットアップガイドの作成
- `CHANGELOG.md`: 変更履歴の記録

### ファイル変更一覧

```
変更:
- src/app/gallery/page.tsx (ギャラリー表示・いいね・コメント機能の実装)
- firestore.rules (セキュリティルールの設定)
- .env.local (Functions URLの修正)
- .env.example (テンプレートの更新)
- functions/src/fileProcessor.ts (sharpのimport修正)
- functions/src/index.ts (corsのimport修正)
- functions/src/importController.ts (OAuth2Clientの型修正)
- src/app/admin/import/page.tsx (エラーハンドリングの型修正)

新規作成:
- SETUP.md (セットアップガイド)
- CHANGELOG.md (変更履歴)
```

### 動作確認項目

#### ビルド確認 ✅
```bash
npm run typecheck  # 型チェック: 成功
npm run build      # ビルド: 成功
```

### 既知の問題

#### 軽微な警告
- `src/app/dashboard/page.tsx:31`: `<img>`タグを`<Image />`コンポーネントに置き換えることを推奨
