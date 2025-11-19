# 用語集

このドキュメントでは、プロジェクト全体で使用する標準的な用語を定義します。

---

## 🌐 言語使用方針

**基本原則**:
- **日本語**: ユーザー向け機能名、UI要素、ドキュメントの説明文
- **英語**: コード内変数名、技術用語、APIエンドポイント名

**例**:
- ✅ 「アートワーク（artwork）」 - 初出時は併記
- ✅ コード: `artwork.status`
- ✅ UI: 「作品」
- ❌ 混在: 「artworkのstatus」

---

## 📅 日付フォーマット

**標準形式**: `YYYY-MM-DD`（ISO 8601）

**使用例**:
- ✅ `2025-11-20`
- ✅ `2025-01-05`
- ❌ `2025年11月20日`
- ❌ `Nov 20, 2025`
- ❌ `20/11/2025`

**例外**: ユーザー向けUI表示では日本語形式も可（例: 「2025年11月20日」）

---

## 🔑 主要用語

### A

**Artwork（アートワーク / 作品）**
- 学生が提出したPDFまたは画像ファイルから生成された作品データ
- コード: `artwork`
- UI: 「作品」
- データモデル: `Artwork` interface

**Annotation（アノテーション / 注釈）**
- 作品上に描画された手書きの線やコメント
- コード: `annotation`
- UI: 「注釈」
- データモデル: `ArtworkAnnotation` interface

**Assignment（課題）**
- Google Classroom上の課題
- コード: `assignment`
- UI: 「課題」

---

### C

**Cloud Functions（クラウドファンクション）**
- Firebase Cloud Functions（第2世代）
- ✅ **標準用語**: Cloud Functions
- ❌ **非推奨**: Firebase Functions
- コンテキスト: Google Cloud Platformのサービスとして扱う

**Classroom**
- Google Classroom
- 常に「Google Classroom」と表記（初出時のみフルネーム、以降は「Classroom」も可）

---

### E

**Error Artwork（エラー作品）**
- サポート外形式の提出や処理エラーにより生成されたプレースホルダー作品
- `status: 'error'`
- UI: 「エラー作品」

---

### F

**Firestore**
- Cloud Firestore
- データベースサービス
- ✅ 標準: Firestore
- ❌ 非推奨: Cloud Firestore（冗長）

---

### G

**Gallery（ギャラリー）**
- 1つの課題に対応する作品集合の表示単位
- コード: `gallery`
- UI: 「ギャラリー」
- 命名規則: `{courseId}_{assignmentId}`

---

### I

**Import Job（インポートジョブ）**
- Google Classroomからの一括インポート処理
- コード: `importJob`
- UI: 「インポート」
- データモデル: `ImportJob` interface

---

### N

**Not Submitted Artwork（未提出作品）**
- 課題割り当て済みだが提出していない学生のプレースホルダー作品
- `status: 'not_submitted'`
- UI: 「未提出作品」

---

### P

**Placeholder（プレースホルダー）**
- 未提出またはエラー作品の代わりに表示されるグレーサムネイル
- UI: 「プレースホルダー」

---

### R

**Re-import（再インポート）**
- 既にインポート済みのギャラリーに対して再度インポートを実行すること
- UI: 「再インポート」

**Role（ロール / 権限）**
- ユーザーの権限レベル
- 種類: Admin, Viewer, Guest
- UI: 「権限」

---

### S

**Status（ステータス / 状態）**
- 作品の提出状態
- 値: `'submitted'`, `'not_submitted'`, `'error'`
- UI: 「状態」

**Submitted Artwork（提出済み作品）**
- 正常に処理された作品
- `status: 'submitted'`
- UI: 「提出済み作品」

**Storage**
- Firebase Storage（Cloud Storage for Firebase）
- ✅ 標準: Storage
- ❌ 非推奨: Firebase Storage, Cloud Storage

---

## 🔧 技術用語

### バックエンドサービス

| 用語 | 標準表記 | 説明 |
|------|---------|------|
| Cloud Functions | Cloud Functions | Firebase Cloud Functions（第2世代） |
| Cloud Run | Cloud Run | PDFバッチ処理用 |
| Cloud Tasks | Cloud Tasks | タスクキュー |
| Firestore | Firestore | NoSQLデータベース |
| Storage | Storage | ファイルストレージ |

### フロントエンド技術

| 用語 | 標準表記 | 説明 |
|------|---------|------|
| Next.js | Next.js | Reactフレームワーク |
| React | React | UIライブラリ |
| TypeScript | TypeScript | 型付きJavaScript |
| Tailwind CSS | Tailwind CSS | CSSフレームワーク |

### 描画・アノテーション

| 用語 | 標準表記 | 説明 |
|------|---------|------|
| Konva.js | Konva.js | Canvas描画ライブラリ |
| react-konva | react-konva | React用Konvaラッパー |
| Canvas | Canvas | HTML Canvas要素 |

---

## 📏 命名規則

### ファイル名

**ドキュメント**:
- ✅ `UPPERCASE_WITH_UNDERSCORES.md` - 主要ドキュメント
- ✅ `lowercase-with-hyphens.md` - 詳細仕様・ガイド
- 例: `ANNOTATION_FEATURE.md`, `import-skip-and-placeholders.md`

**コードファイル**:
- ✅ `PascalCase.tsx` - Reactコンポーネント
- ✅ `camelCase.ts` - ユーティリティ、フック
- 例: `ArtworkModal.tsx`, `useAnnotations.ts`

### 変数名

**TypeScript/JavaScript**:
- ✅ `camelCase` - 変数、関数
- ✅ `PascalCase` - 型、インターフェース、クラス
- ✅ `UPPER_SNAKE_CASE` - 定数
- 例: `artwork`, `ArtworkStatus`, `MAX_FILE_SIZE`

### データベースコレクション

**Firestore**:
- ✅ `lowercase` - コレクション名
- ✅ `camelCase` - フィールド名
- 例: `artworks`, `studentEmail`

---

## 🚫 非推奨用語

| 非推奨 | 推奨 | 理由 |
|--------|------|------|
| Firebase Functions | Cloud Functions | 正式名称はCloud Functions for Firebase |
| Cloud Firestore | Firestore | 冗長 |
| Firebase Storage | Storage | 冗長 |
| 作品データ | アートワーク | コード内用語と統一 |
| ファイル | アートワーク（提出物の場合） | 明確化 |

---

## 🌍 地域設定

**タイムゾーン**: Asia/Tokyo（JST, UTC+9）

**ロケール**:
- 日本語: `ja-JP`
- 英語: `en-US`（開発者向けドキュメント）

---

## 🔗 関連ドキュメント

- [要件定義](requirements.md) - システム要件
- [変更履歴](changelog.md) - 用語変更の履歴

---

**ドキュメントバージョン**: 1.0
**作成日**: 2025-11-20
**最終更新**: 2025-11-20
