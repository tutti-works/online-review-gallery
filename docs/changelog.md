# 変更履歴

このファイルには、オンライン講評会支援ギャラリーアプリの主要な変更履歴が記録されています。
技術的な詳細は各専門ドキュメントを参照してください。

---

## 2026-01-19: いいねUIの同期とギャラリーのハートトグル

**概要**: 自分がいいねした作品のハートを赤表示にし、ギャラリー下部のハートからいいねの付与/解除を行えるようにした。

**主な変更**:
- ユーザー別のいいね状態を取得して同期。
- ギャラリーのハートをクリックでいいね付与/解除（adminのみ）。
- モーダル内サイドバーへいいね状態を伝播して色を切り替え。

---

## 2025-11-20: 再インポート時の上書き機能実装

**概要**: 未提出・エラー作品を再インポート時に自動上書きする機能を実装

**主な変更**:
- `submitted` 作品: スキップ（従来通り保護）
- `not_submitted` / `error` 作品: 最新状態で上書き
- `ImportJob.overwrittenCount` フィールド追加

**影響範囲**:
- バックエンド: `importController.ts`, `fileProcessor.ts`, `processFileTaskHttp.ts`
- フロントエンド: `types/index.ts`, React Hooks依存配列最適化, Next.js Image最適化
- ドキュメント: `import-skip-and-placeholders.md`, `changelog.md`

**ユーザー体験の向上**:
- 未提出学生が後日提出 → 再インポートで自動反映 ✅
- エラー作品のファイル修正後 → 再インポートで自動反映 ✅

**詳細**: [再インポート機能仕様](import-skip-and-placeholders.md#21-再インポートスキップと上書き機能-f-02-07)

**コミット**: d0b720d

---

## 2025-11-06 (更新4): Firestore読み取り回数の最適化

**問題**: ギャラリー6個、数十作品で8,000読み取り/日（無料枠の16%消費）

**原因**: React Hooks依存配列の不適切な設定により、ギャラリー切り替えごとに全データ再取得

**修正内容**:
- `useGalleryArtworks.ts`: 依存配列を `[isInitialized, fetchArtworks]` → `[isInitialized, currentGalleryId]` に変更
- `GallerySwitcher.tsx`: 依存配列を `[currentGalleryId]` → `[]` に変更（マウント時のみ）
- `dashboard/page.tsx`: 依存配列を `[userRole]` → `[]` に変更（マウント時のみ）

**効果**:
- 読み取り回数: 8,000回/日 → 800-1,200回/日（**85-90%削減**）
- ギャラリー切り替え時の読み取り: 56回 → 0回（キャッシュ使用）
- 無料枠使用率: 16% → 1.6-2.4%

**詳細**: [コストとパフォーマンス分析](COST_AND_PERFORMANCE.md#3-firestore)

**コミット**: 4e4d48d

---

## 2025-11-06 (更新3): 同一学生の重複インポートバグを修正

**問題**: 同一インポート内で同じ学生の作品が2つ作成される

**原因**: `submissionsByStudent` Mapのキーが正規化前のメールアドレスだった

**修正内容**:
- `importController.ts`: Mapキーを `normalizeIdentifier(studentEmail)` に変更
- 大文字小文字、空白の違いを吸収

**効果**: 同一学生の重複作品生成を防止

**詳細**: [再インポート機能仕様](import-skip-and-placeholders.md#12-実装完了サマリー2025-11-06)

**コミット**: 3ec79b9

---

## 2025-11-06 (更新2): 学籍番号順ソートとインポート完了判定の不具合を修正

**問題1**: 未提出学生が学籍番号順ソート時に最上位表示される

**修正**: `extractStudentIdFromEmail()` 関数を追加し、メールアドレスから学籍番号を抽出

**問題2**: サポート外形式ファイルのみの再インポート時に完了判定されない

**修正**: `validTasks.length === 0` 時に明示的に `checkImportCompletion()` を呼び出し

**詳細**: [再インポート機能仕様](import-skip-and-placeholders.md#12-実装完了サマリー2025-11-06)

**コミット**: 88442f7

---

## 2025-11-06 (更新1): Node.js 18 → 20 ランタイムアップグレード

**変更内容**:
- `firebase.json`: `"nodejs18"` → `"nodejs20"`
- `functions/package.json`: `"engines": {"node": "20"}`

**理由**: Node.js 18のサポート終了に備えた事前対応

**影響**: なし（後方互換性あり）

**コミット**: 24a6ece

---

## 2025-11-06: 再インポートスキップと未提出・エラー作品プレースホルダー機能実装

**概要**: インポート機能の大幅強化（3つの主要機能を実装）

**実装機能**:
1. **再インポートスキップ** (F-02-07)
   - `galleryId + studentEmail` で既存作品を判定
   - 既存学生はスキップし、重複作品生成を防止

2. **未提出学生プレースホルダー** (F-02-08)
   - Classroom割り当て済み学生を取得
   - 未提出学生用にグレーサムネイル作品を自動生成
   - `status: 'not_submitted'`

3. **エラー作品プレースホルダー** (F-02-09)
   - サポート外形式（docx, zip等）提出時にエラー作品を生成
   - `status: 'error'`, `errorReason: 'unsupported_format'`

**データモデル変更**:
- `Artwork.status`: `'submitted' | 'not_submitted' | 'error'`
- `Artwork.errorReason`: `'unsupported_format' | 'processing_error'`

**フロントエンド機能**:
- 未提出/エラー作品の非表示フィルター
- 学籍番号順ソート（メールアドレスから抽出）
- グレープレースホルダー表示

**詳細**: [再インポート機能仕様](import-skip-and-placeholders.md)

**コミット**: 40ace0c

---

## 2025-11-04: アノテーション機能の実装

**概要**: ギャラリー作品に直接描画・コメントできるアノテーション機能を実装

**主な機能**:
- Canvas上での自由描画（ペン、蛍光ペン、矢印、図形）
- テキストコメント追加
- アノテーションの保存・読み込み
- アノテーション表示/非表示切り替え

**技術スタック**:
- Fabric.js 6.4.3
- Firebase Storage（アノテーション画像保存）
- Firestore（メタデータ保存）

**詳細**: [アノテーション実装サマリー](annotation-implementation-summary.md)

---

## 2025-10-30: A3横向き全画面表示対応

**変更内容**:
- 画像サイズ: 1920px → **2400px**
- PDF DPI: 150 → **200**
- 最大ファイルサイズ: **20MB**

**計算根拠**:
```
A3サイズ: 297mm × 420mm
200 DPI換算: 2,339px × 3,307px
長辺最大: 2400px
```

**影響**:
- ファイルサイズ: 2MB → 3MB/作品（+50%）
- 処理時間: 15秒 → 25秒/ファイル（+67%）
- 年間コスト: ¥30（無料枠内で変更なし）

**メリット**: A3プロジェクター全画面表示でも鮮明

**詳細**: [コストとパフォーマンス分析](COST_AND_PERFORMANCE.md#設定変更の影響)

---

## 2025-10-25: PDF処理最適化

**変更内容**:
- 一時ファイル削除: 処理成功時・エラー時・24時間経過後の3段階削除
- プログレッシブJPEG採用（表示速度向上）
- サムネイル最適化

**効果**:
- 一時ファイルストレージコスト: ほぼ$0
- 初回表示速度向上

**詳細**: [PDF処理ガイド](PDF_PROCESSING_GUIDE.md)

---

## 2025-10-22: 背景インポート機能実装

**概要**: Google Classroomから課題提出物を一括インポートする機能

**実装内容**:
- Google Classroom API統合
- Google Drive API統合
- Cloud Functions（Gen 2）によるバックグラウンド処理
- Cloud Tasksによる並列ファイル処理
- リアルタイム進捗表示

**処理フロー**:
1. `importClassroomSubmissions`: 提出物リスト取得、一時Storage保存
2. Cloud Tasks: 並列で画像変換（最大10並列）
3. `processFileTask`: PDF → 画像変換、最適化、Firestore保存

**パフォーマンス**:
- 70人分のインポート: 約8-10分
- 並列処理でスケーラブル

**詳細**: [背景インポート機能](BACKGROUND_IMPORT.md)

---

## 2025-10-20: プロジェクト初期セットアップ

**技術スタック選定**:
- フロントエンド: Next.js 14, React, TypeScript, Tailwind CSS
- バックエンド: Firebase Functions (Gen 2), Cloud Run, Cloud Tasks
- データベース: Firestore
- ストレージ: Firebase Storage
- APIs: Google Classroom API, Google Drive API

**初期機能**:
- Firebase Authentication（Google OAuth）
- ギャラリー一覧表示
- 作品詳細モーダル
- いいね・コメント機能
- ラベル機能
- ロールベースアクセス制御（Admin/Viewer/Guest）

**詳細**: [要件定義](requirements.md)

---

## 変更履歴の見方

各エントリーには以下の情報が含まれます：
- **日付**: 変更実施日
- **概要**: 変更内容の簡潔な説明
- **詳細リンク**: 技術詳細を記載した専門ドキュメント
- **コミット**: Git commit hash

**関連ドキュメント**:
- [要件定義](requirements.md) - システム要件と機能一覧
- [コストとパフォーマンス分析](COST_AND_PERFORMANCE.md) - 料金・処理時間分析
- [再インポート機能仕様](import-skip-and-placeholders.md) - インポート機能の詳細
- [背景インポート機能](BACKGROUND_IMPORT.md) - インポート処理フロー
- [アノテーション実装サマリー](annotation-implementation-summary.md) - アノテーション機能
- [テストシナリオ](TESTING.md) - 主要機能のテストケース
- [PDF処理ガイド](PDF_PROCESSING_GUIDE.md) - PDF変換の技術詳細

---

**ドキュメントバージョン**: 2.0（簡潔版）
**最終更新**: 2025-11-20
**削減**: 1008行 → 250行（75%削減）
