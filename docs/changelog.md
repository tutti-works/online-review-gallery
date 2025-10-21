# 変更履歴

このファイルには、オンライン講評会支援ギャラリーアプリの詳細な開発履歴と変更ログが記録されています。

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
