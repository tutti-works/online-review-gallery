# PDF処理負荷とコスト最適化ガイド

## 現在の実装

### 処理フロー
```
PDF (Drive) → 一時Storage → pdf2pic変換 → Sharp最適化 → Storage保存
```

### リソース設定
- **メモリ**: 2GB
- **タイムアウト**: 30分
- **リトライ**: 最大3回
- **同時実行**: 最大100インスタンス

---

## 処理負荷の目安

### 1ページあたりのコスト

| 項目 | 値 |
|------|-----|
| CPU時間 | 1.5～3秒 |
| メモリ使用 | 50～100MB |
| 一時ディスク | 5～10MB (`/tmp`) |
| Storage書き込み | 2ファイル（画像+サムネイル） |

### PDFファイル全体のコスト（例: 20ページ）

| 項目 | 値 |
|------|-----|
| **処理時間** | 30～60秒 |
| **メモリピーク** | 500MB～1.5GB |
| **一時ディスク** | 100～200MB |
| **Storage書き込み** | 21ファイル (20画像 + 1サムネイル) |
| **Cloud Functions料金** | ~$0.003/ファイル |

---

## 実装済みの最適化

### ✅ 1. ファイルサイズ制限
```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
```
- 100MB以上のPDFは処理前に拒否
- メモリ不足エラーを防止

### ✅ 2. ページ数制限
```typescript
const MAX_PDF_PAGES = 50; // 最大50ページ
```
- 50ページ超のPDFはエラー
- 処理時間とコストの予測可能性向上

### ✅ 3. エラー時の一時ファイル削除
- 処理失敗時も`unprocessed/`の一時ファイルを削除
- Storage容量の無駄遣いを防止

### ✅ 4. 定期的なクリーンアップ
- 毎日午前3時（JST）に自動実行
- 24時間以上経過した一時ファイルを削除
- Function: `cleanupTempFiles`

---

## さらなる最適化オプション

### オプション1: DPI削減（品質とのトレードオフ）

**現在:**
```typescript
density: 150, // DPI
```

**低負荷モード:**
```typescript
density: 100, // DPI削減 → 処理速度30%向上
```

**メリット:**
- CPU時間: -30%
- メモリ使用: -20%
- ファイルサイズ: -40%

**デメリット:**
- 画質がやや低下（大学課題なら許容範囲内）

---

### オプション2: 画像サイズ削減

**現在:**
```typescript
width: 1920,
height: 1920,
```

**提案:**
```typescript
width: 1280,  // フルHD以下
height: 1280,
```

**メリット:**
- 処理時間: -20%
- ファイルサイズ: -60%
- Storage転送量削減

**デメリット:**
- 高解像度ディスプレイで拡大時に粗く見える

---

### オプション3: ストリーミング処理（高度）

**現在の問題:**
```typescript
const pages = await converter.bulk(-1); // 全ページを一度にメモリ展開
```

**改善案:**
```typescript
// 1ページずつ処理してメモリを即座に解放
for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
  const page = await converter.convert(pageNum);
  await processAndUploadPage(page);
  // ページ処理後、メモリを解放
}
```

**メリット:**
- メモリ使用量が一定（100～200MB）
- 100ページ超のPDFも処理可能

**デメリット:**
- pdf2picの制約で実装が難しい可能性あり
- 処理時間がやや増加（ループオーバーヘッド）

---

## 負荷テストの推奨方法

### ❌ 非推奨: 本番Functions + エミュレーター

**問題点:**
- 本番Functionsは本番Storageにしかアクセスできない
- Firestoreエミュレーターと本番Functionsは接続不可
- Storage料金が発生する

### ✅ 推奨: エミュレーターでの負荷テスト

```bash
# Functionsエミュレーター起動
npm run serve

# テストデータ準備
# - 小さな画像ファイル（PDF処理はスキップ）
# - 10～100ファイルを同時インポート

# 測定項目
# 1. メモリ使用量（タスクマネージャー）
# 2. 処理時間（Firestoreの進捗データ）
# 3. 同時実行数（Functionsログ）
```

**測定可能な項目:**
- ✅ メモリ使用量
- ✅ 処理時間
- ✅ 同時実行の挙動
- ✅ エラーハンドリング
- ❌ PDF処理（Windows環境では不可）

**PDF処理の負荷テストは本番環境でのみ可能:**
- 小さなテストPDF（3～5ページ）でテスト
- Cloud Functionsのログでメモリ使用量を確認
- Storage料金に注意（テスト後、不要ファイルを削除）

---

## コスト削減のベストプラクティス

### 1. 事前のファイル検証
```typescript
// importClassroomSubmissions内で事前チェック
if (fileSize > MAX_FILE_SIZE) {
  // Cloud Tasksにキューイングせず、即座に拒否
  continue;
}
```

### 2. ページ数の事前確認
```typescript
// pdf-libなどでページ数のみ確認（軽量）
const pdfDoc = await PDFDocument.load(pdfBuffer);
const pageCount = pdfDoc.getPageCount();
if (pageCount > MAX_PDF_PAGES) {
  throw new Error('Too many pages');
}
```

### 3. バッチサイズの制限
```typescript
// 同時処理数を制限（Cloud Tasksのレート制限）
// 例: 5ファイル/秒
const RATE_LIMIT = 5;
```

---

## 監視とアラート

### 推奨する監視項目

1. **メモリ使用率**
   - 1.8GB超過時にアラート（2GBの90%）
   - Cloud Monitoringで設定

2. **処理時間**
   - 5分超過時にアラート
   - 異常に遅いPDFを検出

3. **エラー率**
   - 10%超過時にアラート
   - メモリ不足やタイムアウトを検出

4. **Storage使用量**
   - `unprocessed/`が1GB超過時にアラート
   - クリーンアップFunctionの動作確認

---

## まとめ

### 現在の設定で対応可能な範囲
- ✅ 画像ファイル: 無制限（100MB以下）
- ✅ PDFファイル: 50ページまで、100MB以下
- ✅ 同時処理: 100ファイル

### 大規模PDFへの対応が必要な場合
1. DPIを100に削減（処理速度30%向上）
2. 画像サイズを1280pxに削減（ファイルサイズ60%削減）
3. ページ数制限を30に引き下げ（コスト削減）

### テスト戦略
- エミュレーターで画像処理の負荷テスト
- 本番環境で小規模PDF（3～5ページ）のテスト
- Cloud Functionsログで実際のメモリ使用量を確認
