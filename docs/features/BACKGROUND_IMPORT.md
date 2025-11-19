# バックグラウンドインポート機能

## 概要

インポートボタンを押した後、ページを移動してもインポート処理が継続される仕組みを実装しました。

---

## 実装内容

### 1. ページ移動してもインポートが継続

**仕組み:**
```
ユーザー: インポートボタンクリック
  ↓
フロントエンド: Cloud Functionsへリクエスト送信
  ↓
Cloud Functions: バックグラウンド処理開始（継続）✅
  ↓
フロントエンド: 2秒後にギャラリーページへリダイレクト
  ↓
ギャラリーページ: 進捗を監視・表示
```

**特徴:**
- ✅ Cloud Functionsはバックグラウンドで継続実行
- ✅ ページを閉じても処理は完了する
- ✅ ギャラリーページで進捗を確認できる
- ✅ 別のタブ・ブラウザからでも進捗確認可能

---

### 2. 実装の詳細

#### インポートページ ([src/app/admin/import/page.tsx](../src/app/admin/import/page.tsx))

**変更点:**

1. **インポートジョブ情報をlocalStorageに保存**
   ```typescript
   localStorage.setItem('activeImportJob', JSON.stringify({
     importJobId,
     galleryId,
     startedAt: new Date().toISOString(),
   }));
   ```

2. **2秒後にギャラリーページへリダイレクト**
   ```typescript
   setTimeout(() => {
     window.location.href = '/gallery';
   }, 2000);
   ```

**メリット:**
- インポート開始を確認できる（2秒間）
- 自動的にギャラリーページへ移動
- インポート状況を継続監視

---

#### ギャラリーページ ([src/app/gallery/page.tsx](../src/app/gallery/page.tsx))

**追加機能:**

1. **進行中のインポートジョブを確認**
   ```typescript
   const checkActiveImport = async () => {
     const activeImportStr = localStorage.getItem('activeImportJob');
     if (!activeImportStr) return;

     // 進捗を監視（3秒ごと）
     const checkProgress = setInterval(async () => {
       const response = await fetch(`${functionsBaseUrl}/getImportStatus?importJobId=${importJobId}`);
       // ... 進捗を更新
     }, 3000);
   };
   ```

2. **進捗表示UI**
   ```tsx
   {importProgress && (
     <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
       <h3>⏳ インポート進行中</h3>
       <div className="progress-bar">
         <div style={{ width: `${importProgress.progress}%` }}></div>
       </div>
       <p>{importProgress.processedFiles} / {importProgress.totalFiles} ファイル処理済み</p>
     </div>
   )}
   ```

3. **完了時の自動更新**
   ```typescript
   if (data.status === 'completed') {
     clearInterval(checkProgress);
     localStorage.removeItem('activeImportJob');
     fetchArtworks(); // 作品リストを再取得
     setTimeout(() => setImportProgress(null), 5000); // 5秒後に非表示
   }
   ```

---

## ユーザー体験

### インポートの流れ

```
1. 教員: インポートページで授業・課題を選択
   ↓
2. 教員: 「インポートを開始」ボタンをクリック
   ↓
3. システム: 「インポート処理を開始しました...」表示（2秒間）
   ↓
4. システム: 自動的にギャラリーページへ移動
   ↓
5. ギャラリーページ: 進捗バー表示
   「⏳ インポート進行中 45% (35/70 ファイル処理済み)」
   ↓
6. 教員: 別のページを見たり、他の作業ができる
   ↓
7. システム: 処理完了後、自動的に作品をギャラリーに表示
   「✅ インポート完了 - 作品が追加されました！」
```

### 画面遷移

```
[インポートページ]
   ↓ ボタンクリック
[インポートページ] 「処理開始...」
   ↓ 2秒後
[ギャラリーページ] 進捗バー表示
   ↓ 9分後
[ギャラリーページ] 完了メッセージ + 新しい作品表示
   ↓ 5秒後
[ギャラリーページ] 通常表示
```

---

## 技術的な特徴

### 1. ページ間での状態共有

**localStorage使用:**
```typescript
// インポートページ
localStorage.setItem('activeImportJob', JSON.stringify({
  importJobId: 'job_12345',
  galleryId: 'gallery_67890',
  startedAt: '2025-10-01T12:00:00Z',
}));

// ギャラリーページ
const activeImport = JSON.parse(localStorage.getItem('activeImportJob'));
```

**メリット:**
- ✅ ブラウザを閉じても情報保持（セッションストレージより永続的）
- ✅ 別タブからでもアクセス可能
- ✅ サーバーへの追加リクエスト不要

---

### 2. 自動クリーンアップ

**30分経過で自動削除:**
```typescript
const startTime = new Date(startedAt).getTime();
if (Date.now() - startTime > 30 * 60 * 1000) {
  localStorage.removeItem('activeImportJob');
  return;
}
```

**理由:**
- インポートは通常9分で完了
- 30分経過 = 異常終了の可能性
- 古いデータを自動削除

---

### 3. リアルタイム進捗更新

**3秒ごとにポーリング:**
```typescript
setInterval(async () => {
  const response = await fetch(`/getImportStatus?importJobId=${importJobId}`);
  const data = await response.json();
  setImportProgress(data);
}, 3000);
```

**最適化:**
- ✅ Cloud Functionsへの負荷が低い（3秒に1回）
- ✅ ユーザーは進捗をリアルタイムで確認
- ✅ 完了時は自動的に停止

---

## エッジケース対応

### 1. ブラウザを閉じた場合

**動作:**
- ✅ Cloud Functionsは継続実行（影響なし）
- ✅ 再度ギャラリーページを開くと進捗表示が復活
- ✅ localStorageから情報を復元

**例:**
```
教員: インポート開始
教員: ブラウザを閉じる
Cloud Functions: 処理継続（9分後完了）
---
30分後
---
教員: 再度ギャラリーページを開く
システム: 「作品が追加されました」表示
```

---

### 2. 複数のインポートジョブ

**現在の実装:**
- 一度に1つのインポートジョブのみ追跡
- 新しいインポート開始時、古いジョブ情報を上書き

**将来の拡張案:**
```typescript
// 複数ジョブ対応（オプション）
localStorage.setItem('importJobs', JSON.stringify([
  { importJobId: 'job1', status: 'processing' },
  { importJobId: 'job2', status: 'processing' },
]));
```

---

### 3. ネットワークエラー

**対策:**
```typescript
try {
  const response = await fetch(`/getImportStatus?importJobId=${importJobId}`);
  // ...
} catch (err) {
  console.error('Progress check error:', err);
  // エラーでも継続監視（次の3秒後に再試行）
}
```

**特徴:**
- ✅ 一時的なネットワークエラーは無視
- ✅ 次のポーリングで自動復旧
- ✅ ユーザーに不要なエラー表示をしない

---

## パフォーマンスへの影響

### Cloud Functionsへのリクエスト

**進捗確認（getImportStatus）:**
```
インポート時間: 9分
ポーリング間隔: 3秒
リクエスト回数: 9分 ÷ 3秒 = 180回

1回あたりのコスト:
- 呼び出し: 1回
- 実行時間: 0.1秒（軽量）
- GB秒: 0.5GB × 0.1秒 = 0.05 GB秒

合計（1インポートあたり）:
- 呼び出し: 180回
- GB秒: 9 GB秒
```

**月間（70人 × 週1回 × 4週）:**
```
呼び出し: 180回 × 4回 = 720回
GB秒: 9 GB秒 × 4回 = 36 GB秒

無料枠との比較:
- 呼び出し: 720回 << 200万回 ✅
- GB秒: 36 GB秒 << 40万 GB秒 ✅
```

**評価: 影響はほぼゼロ**

---

## まとめ

### ✅ 実装した機能

| 機能 | 説明 |
|------|------|
| **バックグラウンド処理** | ページ移動してもインポート継続 |
| **自動リダイレクト** | 2秒後にギャラリーページへ移動 |
| **進捗表示** | リアルタイムで進捗バー表示 |
| **自動更新** | 完了時に作品リストを自動取得 |
| **永続化** | localStorageで状態保存 |
| **クリーンアップ** | 30分後に自動削除 |

### 🎯 ユーザー体験の改善

**改善前:**
- ❌ インポートページで9分間待つ必要
- ❌ ページを離れると進捗が分からない

**改善後:**
- ✅ インポート開始後すぐに別の作業ができる
- ✅ ギャラリーページで進捗確認
- ✅ ブラウザを閉じても処理継続
- ✅ 完了時に自動的に作品表示

### 📊 技術的メリット

- ✅ Cloud Functionsの負荷増加なし
- ✅ コスト増加なし（無料枠内）
- ✅ シンプルな実装（localStorage + ポーリング）
- ✅ エラーハンドリングが堅牢
