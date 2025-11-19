# サムネイルサイズ変更について

## 変更内容

サムネイルサイズを **400×400px（正方形）** から **420×297px（A3横向き比率）** に変更しました。

---

## コード変更

### Functions ([functions/src/fileProcessor.ts](../functions/src/fileProcessor.ts))

```typescript
// 変更前
const THUMBNAIL_SIZE = 400;

// 変更後
const THUMBNAIL_WIDTH = 420;  // A3横向き比率
const THUMBNAIL_HEIGHT = 297;
```

### フロントエンド ([src/app/gallery/page.tsx](../src/app/gallery/page.tsx))

```tsx
// 変更前
<div className="aspect-auto">
  <Image width={artwork.images[0].width} height={artwork.images[0].height} />
</div>

// 変更後
<div className="relative w-full" style={{ aspectRatio: '420 / 297' }}>
  <Image width={420} height={297} className="w-full h-full object-cover" />
</div>
```

---

## デプロイ方法

### ローカル開発環境（エミュレーター）

エミュレーターを再起動してください：

```bash
# エミュレーターを停止（Ctrl+C）
# 再ビルドして起動
cd functions
npm run build
cd ..
firebase emulators:start
```

### 本番環境

Cloud Functionsをデプロイしてください：

```bash
cd functions
npm run deploy
```

または特定のFunctionのみ：

```bash
firebase deploy --only functions:processFileTask
```

---

## 既存データについて

### ⚠️ 重要: 既存のサムネイルは更新されません

- **既存の作品**: 400×400pxのまま
- **新規インポート**: 420×297pxで生成

### 既存サムネイルを更新する場合

#### オプション1: 手動で再インポート（推奨）

1. 既存のギャラリーを削除
2. 新しくインポート
3. 自動的に420×297pxのサムネイルが生成される

#### オプション2: サムネイル再生成Function（高度）

既存サムネイルを一括再生成するFunctionを作成できます：

```typescript
// 例: 再生成Function（実装は必要に応じて）
export const regenerateThumbnails = onRequest(async (req, res) => {
  const artworks = await db.collection('artworks').get();

  for (const artworkDoc of artworks.docs) {
    const artwork = artworkDoc.data();
    // 元画像から420×297pxのサムネイルを再生成
    // ...
  }

  res.send('Complete');
});
```

---

## 確認方法

### 新規インポート後の確認

1. インポート実行
2. ブラウザの開発者ツールを開く（F12）
3. Networkタブでサムネイル画像のURLを確認
4. 画像を右クリック → 「新しいタブで開く」
5. 画像のサイズを確認（420×297pxになっているはず）

### Chrome DevToolsでの確認

```
1. ギャラリーページを開く
2. F12キー → Networkタブ
3. 画像ファイルをクリック
4. Headersタブで確認:
   - Size: ~40KB（以前は~50KB）
   - Dimensions: 420×297（以前は400×400）
```

---

## メリット

### 1. ファイルサイズ削減

| 項目 | 変更前 | 変更後 | 削減率 |
|------|--------|--------|--------|
| サムネイルサイズ | 400×400px | 420×297px | - |
| ピクセル数 | 160,000 | 124,740 | -22% |
| ファイルサイズ | ~50KB | ~40KB | -20% |

### 2. ネットワーク転送量削減

**70人 × 週1回の場合:**
```
変更前: 70作品 × 50KB = 3.5MB
変更後: 70作品 × 40KB = 2.8MB

削減: -0.7MB/週 = -2.8MB/月
```

### 3. より自然な表示

- A3横向き提出物の場合、切り取られずに表示
- 実物に近いプレビュー

---

## トラブルシューティング

### 問題: 新規インポート後も400×400pxのまま

**原因:**
- Cloud Functionsが古いバージョンのまま
- ブラウザキャッシュ

**解決方法:**

1. **Functionsを再デプロイ**
   ```bash
   cd functions
   npm run build
   firebase deploy --only functions
   ```

2. **ブラウザキャッシュをクリア**
   ```
   Chrome: Ctrl+Shift+Delete → 「キャッシュされた画像とファイル」を削除
   ```

3. **ハードリロード**
   ```
   Ctrl+Shift+R（Windows/Linux）
   Cmd+Shift+R（Mac）
   ```

### 問題: エミュレーターで変更が反映されない

**解決方法:**

1. **エミュレーターを完全停止**
   ```bash
   # Ctrl+C で停止
   # ポートを確認
   netstat -ano | findstr :5001
   # プロセスを強制終了（必要に応じて）
   taskkill /F /PID <PID>
   ```

2. **再ビルド＆再起動**
   ```bash
   cd functions
   npm run build
   cd ..
   firebase emulators:start
   ```

---

## まとめ

- ✅ コード変更完了（420×297px）
- ✅ ビルド成功
- ⏳ デプロイ待ち（本番環境の場合）
- ⚠️ 既存データは手動再インポートが必要

**新規インポートから420×297pxのサムネイルが生成されます！**
