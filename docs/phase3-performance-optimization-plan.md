# フェーズ3: パフォーマンス最適化 詳細設計書

**作成日:** 2025-11-03
**対象フェーズ:** フェーズ3 - 効率化機能
**見積もり工数:** 11-13時間（2日間）
**ステータス:** 設計中

---

## 📋 目次

1. [概要](#概要)
2. [現状分析](#現状分析)
3. [最適化項目の詳細設計](#最適化項目の詳細設計)
   - [3.1 注釈データの差分更新](#31-注釈データの差分更新)
   - [3.2 perfectDrawEnabledの動的制御](#32-perfectdrawenabledの動的制御)
   - [3.3 背景画像のキャッシュ](#33-背景画像のキャッシュ)
4. [実装計画](#実装計画)
5. [テスト戦略](#テスト戦略)
6. [ロールアウト計画](#ロールアウト計画)
7. [リスクと対策](#リスクと対策)

---

## 概要

### 背景

フェーズ1・2で注釈機能の基本機能と高度な操作性を実装完了。現在の実装では以下の課題が存在：

- **Firestoreへの全量保存**: 毎回`stage.toJSON()`で全データを送信
- **背景画像の再ロード**: ページ切り替え時に毎回ネットワークリクエスト
- **描画精度の固定**: `perfectDrawEnabled`の設定がない（暗黙的にtrue）

### 目的

ユーザー体験を損なわずに以下を実現：
- 保存処理の高速化（200-300ms）
- ページ切り替えの即応性（待ち時間ゼロ）
- 低スペックデバイスでの快適な描画（FPS 50維持）

### スコープ

✅ **対象:**
- Firestore保存処理の最適化
- Konva.js描画パフォーマンスの改善
- 画像ロードの最適化

❌ **対象外:**
- サーバーサイドの最適化
- CDNキャッシュの設定
- データベースインデックスの最適化

---

## 現状分析

### 既存の最適化実装

**✅ 実装済み:**
- `useMemo`/`useCallback`による再計算防止（30箇所以上）
- 状態管理の分離（不要な再レンダリング抑制）
- `ResizeObserver`による効率的なレイアウト更新
- 条件付きレンダリング（Stage描画の遅延）

### パフォーマンス計測（現状）

| 指標 | 現在の値 | 目標値 |
|------|---------|--------|
| ページ切り替え時間 | 1-2秒 | 即座（<100ms） |
| 注釈保存時間 | 500ms-1秒 | 200-300ms |
| 描画時CPU使用率 | 60-80% | 40-60% |
| ネットワーク送信量（50線） | 10-25KB | 5-10KB |

### ボトルネック特定

**1. Firestore保存処理**
```tsx
// 現在: src/app/gallery/page.tsx:283-340
if (existingAnnotation) {
  await updateDoc(artworkRef, {
    annotations: arrayRemove(existingAnnotation),  // 1回目
  });
}
await updateDoc(artworkRef, {
  annotations: arrayUnion(newAnnotation),  // 2回目
});
```
- **問題点**: 2トランザクション、全JSON送信

**2. 背景画像ロード**
```tsx
// 現在: src/components/AnnotationCanvas.tsx:368-402
useEffect(() => {
  const prepareImage = async () => {
    setBackgroundImage(null);  // 毎回リセット
    const img = await loadImage(imageUrl);  // 毎回ロード
    setBackgroundImage(img);
  };
  prepareImage();
}, [imageUrl]);
```
- **問題点**: キャッシュなし、同じ画像を複数回ロード

**3. 描画精度設定**
```tsx
// 現在: src/components/AnnotationCanvas.tsx:1058-1069
<Line
  // perfectDrawEnabled 未設定（デフォルトtrue）
  points={...}
  stroke={...}
/>
```
- **問題点**: 常に高精度描画でCPU負荷が高い

---

## 最適化項目の詳細設計

### 3.1 注釈データの差分更新

#### 現在のデータモデル

```tsx
// Firestore Schema (現在)
{
  id: "artwork-123",
  annotations: [
    {
      pageNumber: 1,
      data: "{...stage.toJSON()...}",  // 全Stage状態
      width: 1920,
      height: 1080,
      updatedAt: Timestamp,
      updatedBy: "admin@example.com"
    },
    { pageNumber: 2, ... }
  ]
}
```

**問題点:**
- 配列要素の更新に`arrayRemove` + `arrayUnion`が必要（2トランザクション）
- 毎回全データを送信

#### 提案: ページ単位Map方式

```tsx
// Firestore Schema (提案)
{
  id: "artwork-123",
  annotationsMap: {
    "1": {
      lines: [  // LineShape[]を正規化済みで保存
        {
          id: "line-123",
          tool: "draw",
          points: [100, 200, 150, 250, ...],
          stroke: "#000000",
          strokeWidth: 2
        },
        ...
      ],
      width: 1920,
      height: 1080,
      updatedAt: Timestamp,
      updatedBy: "admin@example.com"
    },
    "2": { ... }
  },

  // 互換性のため残す（将来削除）
  annotations: [...]  // 既存クライアント用
}
```

**メリット:**
1. **1トランザクション**: `annotationsMap.${pageNumber}`を直接更新
2. **正規化ロジック再利用**: 既存の正規化処理をそのまま使用
3. **移行が容易**: 新旧スキーマを併用可能

#### 保存処理の実装

```tsx
// src/app/gallery/page.tsx
const handleSaveAnnotation = async (
  artworkId: string,
  pageNumber: number,
  annotation: AnnotationSavePayload | null,
) => {
  const { doc, updateDoc } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const artworkRef = doc(db, 'artworks', artworkId);

  if (annotation) {
    // LineShape[]に変換（既存のsaveAnnotation内で正規化済み）
    const lines = extractLinesFromStageJSON(annotation.data);

    // 1トランザクションで更新
    await updateDoc(artworkRef, {
      [`annotationsMap.${pageNumber}`]: {
        lines,  // 正規化済みのLineShape[]
        width: annotation.width,
        height: annotation.height,
        updatedAt: new Date(),
        updatedBy: user.email,
      }
    });
  } else {
    // 削除
    await updateDoc(artworkRef, {
      [`annotationsMap.${pageNumber}`]: deleteField()
    });
  }
};

// Stage JSONからLineShape[]を抽出
const extractLinesFromStageJSON = (stageJSON: string): LineShape[] => {
  const stageData = JSON.parse(stageJSON);
  const layers = Array.isArray(stageData.children) ? stageData.children : [];
  const drawingLayer = layers.find(layer =>
    layer?.attrs?.name === DRAWING_LAYER_NAME
  );

  if (!drawingLayer || !Array.isArray(drawingLayer.children)) {
    return [];
  }

  return drawingLayer.children
    .filter(node => node.className === 'Line')
    .map(node => ({
      id: node.attrs.id,
      tool: node.attrs.tool || 'draw',
      points: node.attrs.points || [],
      stroke: node.attrs.stroke,
      strokeWidth: node.attrs.strokeWidth,
    }));
};
```

#### 読み込み処理の実装

```tsx
// 新旧スキーマの互換性維持
const loadAnnotation = (artwork: Artwork, pageNumber: number) => {
  // 新スキーマを優先
  if (artwork.annotationsMap?.[pageNumber]) {
    const pageData = artwork.annotationsMap[pageNumber];
    return {
      data: convertLinesToStageJSON(pageData.lines, pageData.width, pageData.height),
      width: pageData.width,
      height: pageData.height,
    };
  }

  // 旧スキーマへのフォールバック
  const annotation = artwork.annotations?.find(
    ann => ann.pageNumber === pageNumber
  );

  return annotation ? {
    data: annotation.data,
    width: annotation.width,
    height: annotation.height,
  } : null;
};

// LineShape[]からStage JSON形式に変換
const convertLinesToStageJSON = (
  lines: LineShape[],
  width: number,
  height: number
): string => {
  const stageData = {
    attrs: {
      width,
      height,
    },
    className: 'Stage',
    children: [
      {
        attrs: { name: 'background-layer' },
        className: 'Layer',
        children: []
      },
      {
        attrs: { name: DRAWING_LAYER_NAME, id: DRAWING_LAYER_NAME },
        className: 'Layer',
        children: lines.map(line => ({
          attrs: {
            id: line.id,
            tool: line.tool,
            points: line.points,
            stroke: line.stroke,
            strokeWidth: line.strokeWidth,
            lineCap: 'round',
            lineJoin: 'round',
            tension: 0.5,
            globalCompositeOperation: line.tool === 'erase' ? 'destination-out' : 'source-over',
            listening: line.tool === 'draw',
            draggable: false,
          },
          className: 'Line'
        }))
      }
    ]
  };

  return JSON.stringify(stageData);
};
```

#### データ移行戦略

**フェーズ1: デュアル書き込み（1週間）**
```tsx
// 新旧両方に書き込み
await updateDoc(artworkRef, {
  // 新スキーマ
  [`annotationsMap.${pageNumber}`]: newData,

  // 旧スキーマ（互換性維持）
  annotations: arrayUnion(legacyAnnotation),
});
```

**フェーズ2: 新スキーマ読み込み優先（1週間）**
- 読み込み時は新スキーマを優先、なければ旧スキーマ
- 保存時は新スキーマのみ

**フェーズ3: 旧スキーマ削除（必要に応じて）**
- すべてのデータが新スキーマに移行完了後
- 旧スキーマのサポートコードを削除

#### Undo/Redo統合（オプション）

**将来的な拡張として検討:**

```tsx
// 差分検出の実装（オプション）
type LineDiff = {
  added: LineShape[];
  removed: string[];  // ID
  modified: LineShape[];
};

const computeLineDiff = (
  previous: LineShape[],
  current: LineShape[]
): LineDiff => {
  const prevMap = new Map(previous.map(line => [line.id, line]));
  const currMap = new Map(current.map(line => [line.id, line]));

  const added: LineShape[] = [];
  const removed: string[] = [];
  const modified: LineShape[] = [];

  // 新規・変更を検出
  for (const [id, currLine] of currMap) {
    const prevLine = prevMap.get(id);
    if (!prevLine) {
      added.push(currLine);
    } else if (!deepEqual(prevLine.points, currLine.points)) {
      modified.push(currLine);
    }
  }

  // 削除を検出
  for (const id of prevMap.keys()) {
    if (!currMap.has(id)) {
      removed.push(id);
    }
  }

  return { added, removed, modified };
};

// 保存時に最後の履歴と現在を比較
const lastSavedState = lastSavedStateRef.current;
const diff = computeLineDiff(lastSavedState, currentLines);

// 差分のみをFirestoreに送信（さらなる最適化）
await updateDoc(artworkRef, {
  [`annotationsMap.${pageNumber}.patches`]: arrayUnion({
    timestamp: new Date(),
    diff,
  })
});
```

**注意点:**
- 複雑度が増すため初期実装では見送り
- ページ単位Map方式で十分な効果が見込める
- 必要に応じてフェーズ4以降で検討

---

### 3.2 perfectDrawEnabledの動的制御

#### Konva.jsの`perfectDrawEnabled`とは

| 設定値 | 描画品質 | パフォーマンス | 用途 |
|--------|---------|---------------|------|
| `true` | 高精度（アンチエイリアス強） | 低速（CPU負荷高） | 印刷品質 |
| `false` | 標準品質 | 高速（CPU負荷低） | リアルタイム描画 |

**Konva.js公式ドキュメントより:**
> "If you have a lot of shapes on the stage, you may want to disable pixel perfect drawing to improve performance."

#### 実装前の必須作業: ベースライン計測

**計測スクリプト:**

```tsx
// utils/performanceTest.ts
export const generateTestAnnotations = (lineCount: number): LineShape[] => {
  const lines: LineShape[] = [];
  for (let i = 0; i < lineCount; i++) {
    const points: number[] = [];
    // 各線に50点（一般的な手書き線）
    for (let j = 0; j < 50; j++) {
      points.push(
        Math.random() * 1920,
        Math.random() * 1080
      );
    }
    lines.push({
      id: `test-${Date.now()}-${i}`,
      tool: 'draw',
      points,
      stroke: '#000000',
      strokeWidth: 2,
    });
  }
  return lines;
};

export const useDrawingPerformance = () => {
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameRef = useRef<number>(performance.now());

  const recordFrame = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameRef.current;
    frameTimesRef.current.push(delta);

    // 最新100フレームのみ保持
    if (frameTimesRef.current.length > 100) {
      frameTimesRef.current.shift();
    }

    lastFrameRef.current = now;
  }, []);

  const getAverageFPS = useCallback(() => {
    if (frameTimesRef.current.length === 0) return 0;
    const avgDelta = frameTimesRef.current.reduce((a, b) => a + b)
      / frameTimesRef.current.length;
    return Math.round(1000 / avgDelta);
  }, []);

  const reset = useCallback(() => {
    frameTimesRef.current = [];
    lastFrameRef.current = performance.now();
  }, []);

  return { recordFrame, getAverageFPS, reset };
};
```

**計測手順:**

1. **テストケース生成**
   ```tsx
   const testCases = [
     { lineCount: 10, label: '軽量' },
     { lineCount: 50, label: '中量' },
     { lineCount: 100, label: '重量' },
     { lineCount: 200, label: '超重量' },
   ];
   ```

2. **各ケースで計測**
   - `perfectDrawEnabled: true` vs `false`
   - 描画中のFPS（5秒間の平均）
   - CPU使用率（DevTools Performance）
   - 視覚的な品質比較（スクリーンショット）

3. **低スペックデバイスでの検証**
   - Chrome DevTools: CPU throttling 4x slowdown
   - 実機テスト（可能であれば）

**計測結果のフォーマット:**

```markdown
| 線数 | perfectDraw | FPS | CPU使用率 | 視覚品質 |
|------|-------------|-----|----------|---------|
| 10   | true        | 60  | 40%      | ★★★★★ |
| 10   | false       | 60  | 30%      | ★★★★☆ |
| 50   | true        | 45  | 60%      | ★★★★★ |
| 50   | false       | 58  | 45%      | ★★★★☆ |
| 100  | true        | 28  | 80%      | ★★★★★ |
| 100  | false       | 52  | 55%      | ★★★★☆ |
| 200  | true        | 15  | 95%      | ★★★★★ |
| 200  | false       | 48  | 65%      | ★★★★☆ |
```

#### ハイブリッド制御の実装

**戦略1: 描画中のみ高精度**

```tsx
// src/components/AnnotationCanvas.tsx
const [isPerfectDrawMode, setIsPerfectDrawMode] = useState(false);

const handlePointerDown = useCallback((event: KonvaEventObject<PointerEvent>) => {
  if (mode === 'draw' || mode === 'erase') {
    setIsPerfectDrawMode(true);  // 描画開始時に有効化
    recordHistory();
    // ... 既存の描画開始処理
  }
}, [mode, recordHistory]);

const finishDrawing = useCallback(() => {
  setIsPerfectDrawMode(false);  // 確定後に無効化
  setIsDrawing(false);
}, []);

// Lineコンポーネントに適用
{lines.map((line) => (
  <Line
    key={line.id}
    perfectDrawEnabled={isPerfectDrawMode}  // 動的制御
    // ... その他のprops
  />
))}
```

**戦略2: 点数・線数による動的制御**

```tsx
const shouldUsePerfectDraw = useMemo(() => {
  // 総点数を計算
  const totalPoints = lines.reduce(
    (sum, line) => sum + line.points.length,
    0
  );

  // 閾値判定
  const POINT_THRESHOLD = 5000;  // 5000点以上でfalse
  const LINE_THRESHOLD = 100;    // 100本以上でfalse

  if (totalPoints > POINT_THRESHOLD) {
    console.log('[PerfectDraw] Disabled: high point count', totalPoints);
    return false;
  }

  if (lines.length > LINE_THRESHOLD) {
    console.log('[PerfectDraw] Disabled: high line count', lines.length);
    return false;
  }

  return true;  // デフォルトは高品質
}, [lines]);

// 適用
<Line perfectDrawEnabled={shouldUsePerfectDraw} {...props} />
```

**戦略3: 設定可能なハイブリッド（推奨）**

```tsx
// lib/config/annotation.ts
export const ANNOTATION_CONFIG = {
  perfectDraw: {
    enabled: process.env.NEXT_PUBLIC_PERFECT_DRAW !== 'false',
    strategy: (process.env.NEXT_PUBLIC_PERFECT_DRAW_STRATEGY || 'dynamic') as
      'always' | 'never' | 'drawing' | 'dynamic',
    pointThreshold: 5000,
    lineThreshold: 100,
  },
} as const;

// src/components/AnnotationCanvas.tsx
const perfectDrawEnabled = useMemo(() => {
  const { enabled, strategy, pointThreshold, lineThreshold } =
    ANNOTATION_CONFIG.perfectDraw;

  if (!enabled) return false;

  switch (strategy) {
    case 'always':
      return true;

    case 'never':
      return false;

    case 'drawing':
      return isPerfectDrawMode;  // 描画中のみ

    case 'dynamic': {
      // 点数・線数で判定
      const totalPoints = lines.reduce((sum, line) => sum + line.points.length, 0);
      return totalPoints <= pointThreshold && lines.length <= lineThreshold;
    }

    default:
      return false;
  }
}, [isPerfectDrawMode, lines]);
```

**.env.local（開発・QA環境）**
```env
# perfectDraw機能を有効化
NEXT_PUBLIC_PERFECT_DRAW=true

# 戦略: always | never | drawing | dynamic
NEXT_PUBLIC_PERFECT_DRAW_STRATEGY=dynamic
```

#### QAチェックリスト

**描画品質チェック:**
- [ ] 10本の線: perfectDraw on/off で視覚的差異を確認
- [ ] 50本の線: 同上
- [ ] 100本の線: 同上
- [ ] ズーム200%時の線のジャギー確認
- [ ] 異なる色・太さでの品質確認

**パフォーマンスチェック:**
- [ ] 通常デバイス（CPU throttlingなし）でFPS計測
- [ ] 低スペックモード（4x throttling）でFPS計測
- [ ] 描画中のCPU使用率確認
- [ ] バッテリー消費テスト（モバイルデバイス）

**機能チェック:**
- [ ] 描画モード切り替え時の動作確認
- [ ] Undo/Redo時の表示確認
- [ ] 保存・読み込み後の品質確認

---

### 3.3 背景画像のキャッシュ

#### 現在の問題の詳細分析

**問題のフロー:**
```
ページ1表示 → loadImage(image-1.jpg) [2秒]
  ↓
ページ2表示 → loadImage(image-2.jpg) [2秒]
  ↓
ページ1に戻る → loadImage(image-1.jpg) [2秒] ← 再ロード！
```

**ネットワークリクエストの詳細:**
- 画像サイズ: フルHD JPEGで200KB-1MB
- レイテンシ: Firebase Storage経由で500ms-2秒
- 不要なリクエスト: ページ往復で50%以上

#### ImageCacheManagerの実装

```tsx
// lib/ImageCacheManager.ts
type CachedImage = {
  element: HTMLImageElement;
  bitmap: ImageBitmap | null;
  size: number;
  lastAccess: number;
};

export class ImageCacheManager {
  private cache = new Map<string, CachedImage>();
  private maxMemory: number;
  private currentMemory = 0;

  constructor(maxMemoryMB: number = 200) {
    this.maxMemory = maxMemoryMB * 1024 * 1024;
  }

  /**
   * 画像を取得（キャッシュヒット or 新規ロード）
   */
  async get(cacheKey: string, imageUrl: string): Promise<HTMLImageElement> {
    // キャッシュヒット
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      cached.lastAccess = Date.now();
      console.log(`[ImageCache] HIT: ${cacheKey}`);
      return cached.element;
    }

    console.log(`[ImageCache] MISS: ${cacheKey}, loading...`);

    // 新規ロード
    const img = await this.loadImage(imageUrl);
    const bitmap = await this.createBitmap(img);
    const size = this.estimateSize(img);

    // メモリ制限チェック
    await this.ensureCapacity(size);

    // キャッシュに追加
    this.cache.set(cacheKey, {
      element: img,
      bitmap,
      size,
      lastAccess: Date.now(),
    });
    this.currentMemory += size;

    console.log(
      `[ImageCache] Cached: ${cacheKey}, ` +
      `memory: ${Math.round(this.currentMemory / 1024 / 1024)}MB`
    );

    return img;
  }

  /**
   * 必要なメモリ容量を確保（LRU削除）
   */
  private async ensureCapacity(requiredSize: number): Promise<void> {
    while (
      this.currentMemory + requiredSize > this.maxMemory &&
      this.cache.size > 0
    ) {
      const oldestKey = this.findOldestEntry();
      if (!oldestKey) break;
      this.evict(oldestKey);
    }
  }

  /**
   * 最も古いエントリを検索（LRU）
   */
  private findOldestEntry(): string | null {
    let oldest: [string, number] | null = null;

    for (const [key, cached] of this.cache.entries()) {
      if (!oldest || cached.lastAccess < oldest[1]) {
        oldest = [key, cached.lastAccess];
      }
    }

    return oldest ? oldest[0] : null;
  }

  /**
   * キャッシュエントリを削除
   */
  private evict(key: string): void {
    const cached = this.cache.get(key);
    if (!cached) return;

    // GPUリソースのクリーンアップ
    cached.bitmap?.close();

    this.currentMemory -= cached.size;
    this.cache.delete(key);

    console.log(
      `[ImageCache] Evicted: ${key}, ` +
      `memory: ${Math.round(this.currentMemory / 1024 / 1024)}MB`
    );
  }

  /**
   * 画像サイズを推定（RGBA 4バイト/ピクセル）
   */
  private estimateSize(img: HTMLImageElement): number {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return width * height * 4;
  }

  /**
   * ImageBitmapを作成（GPU最適化）
   */
  private async createBitmap(
    img: HTMLImageElement
  ): Promise<ImageBitmap | null> {
    if (typeof createImageBitmap === 'undefined') {
      return null;
    }

    try {
      return await createImageBitmap(img);
    } catch (error) {
      console.warn('[ImageCache] Failed to create ImageBitmap:', error);
      return null;
    }
  }

  /**
   * 画像をロード
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (error) => {
        console.error('[ImageCache] Failed to load image:', url, error);
        reject(error);
      };
      img.src = url;
    });
  }

  /**
   * 特定アートワークのキャッシュを無効化
   */
  invalidateArtwork(artworkId: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${artworkId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.evict(key));

    console.log(
      `[ImageCache] Invalidated ${keysToDelete.length} entries for ${artworkId}`
    );
  }

  /**
   * すべてのキャッシュをクリア
   */
  clear(): void {
    const keys = Array.from(this.cache.keys());
    keys.forEach(key => this.evict(key));
    console.log('[ImageCache] Cleared all cache');
  }

  /**
   * キャッシュ統計を取得
   */
  getStats() {
    return {
      entryCount: this.cache.size,
      memoryUsed: Math.round(this.currentMemory / 1024 / 1024),
      memoryMax: Math.round(this.maxMemory / 1024 / 1024),
      memoryUsagePercent: Math.round(
        (this.currentMemory / this.maxMemory) * 100
      ),
    };
  }
}

// シングルトンインスタンス
export const imageCacheManager = new ImageCacheManager(200); // 200MB
```

#### キャッシュキーの設計

```tsx
// lib/utils/cacheKey.ts
export const generateImageCacheKey = (
  artwork: Artwork,
  imageUrl: string
): string => {
  // URLからクエリパラメータを除外（タイムスタンプなど）
  const url = new URL(imageUrl);
  const baseUrl = `${url.origin}${url.pathname}`;

  // アートワークの更新日時をバージョンとして使用
  const version = artwork.updatedAt
    ? typeof artwork.updatedAt.toMillis === 'function'
      ? artwork.updatedAt.toMillis()
      : Date.now()
    : Date.now();

  return `${artwork.id}:${baseUrl}:${version}`;
};
```

**キャッシュキーの構成要素:**
- `artworkId`: 作品の識別子
- `baseUrl`: クエリパラメータを除いたURL
- `version`: 更新日時（作品差し替え時に無効化するため）

#### AnnotationCanvasでの使用

```tsx
// src/components/AnnotationCanvas.tsx
import { imageCacheManager, generateImageCacheKey } from '@/lib/ImageCacheManager';

// 既存のuseEffectを置き換え
useEffect(() => {
  let cancelled = false;

  const prepareImage = async () => {
    setIsLoading(true);
    setBackgroundImage(null);
    setBaseSize(null);

    if (!imageUrl) {
      if (!cancelled) setIsLoading(false);
      return;
    }

    try {
      // artworkオブジェクトをpropsで受け取る必要がある
      const cacheKey = generateImageCacheKey(artwork, imageUrl);
      const img = await imageCacheManager.get(cacheKey, imageUrl);

      if (cancelled) return;

      const width = img.naturalWidth || img.width || DEFAULT_WIDTH;
      const height = img.naturalHeight || img.height || DEFAULT_HEIGHT;

      setBackgroundImage(img);
      setBaseSize({ width, height });
    } catch (error) {
      console.error('[AnnotationCanvas] Failed to load background image:', error);
    } finally {
      if (!cancelled) {
        setIsLoading(false);
      }
    }
  };

  void prepareImage();

  return () => {
    cancelled = true;
  };
}, [artwork, imageUrl]);
```

#### propsの追加

```tsx
// src/components/AnnotationCanvas.tsx
export type AnnotationCanvasProps = {
  artwork: Artwork;  // ← 追加
  imageUrl: string;
  // ... その他の既存props
};
```

```tsx
// src/components/artwork-modal/ArtworkViewer.tsx
<AnnotationCanvasComponent
  artwork={artwork}  // ← 追加
  imageUrl={currentImage.url}
  // ... その他のprops
/>
```

#### メモリ管理とモニタリング

**開発ツールの追加:**

```tsx
// components/debug/ImageCacheMonitor.tsx (開発環境のみ)
'use client';

import { useEffect, useState } from 'react';
import { imageCacheManager } from '@/lib/ImageCacheManager';

export const ImageCacheMonitor = () => {
  const [stats, setStats] = useState(imageCacheManager.getStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(imageCacheManager.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs font-mono z-50">
      <div className="font-bold mb-1">Image Cache</div>
      <div>Entries: {stats.entryCount}</div>
      <div>Memory: {stats.memoryUsed}MB / {stats.memoryMax}MB</div>
      <div>Usage: {stats.memoryUsagePercent}%</div>
      <button
        onClick={() => {
          imageCacheManager.clear();
          setStats(imageCacheManager.getStats());
        }}
        className="mt-2 px-2 py-1 bg-red-600 rounded hover:bg-red-700"
      >
        Clear Cache
      </button>
    </div>
  );
};
```

**使用方法:**
```tsx
// src/app/gallery/page.tsx (開発環境のみ)
{process.env.NODE_ENV === 'development' && <ImageCacheMonitor />}
```

---

## 実装計画

### タイムライン（2日間 / 11-13時間）

#### Day 1: 計測と容易な最適化（6-7時間）

| 時間 | タスク | 成果物 |
|------|--------|--------|
| 1h | ベースライン計測環境構築 | `utils/performanceTest.ts` |
| 1h | 現状パフォーマンス計測 | 計測結果レポート（Markdown） |
| 2-3h | 背景画像キャッシュ実装 | `lib/ImageCacheManager.ts` |
| 1h | perfectDraw動的制御実装 | `lib/config/annotation.ts` |
| 1h | 単体テスト・動作確認 | テスト合格 |

#### Day 2: データモデル変更と統合テスト（5-6時間）

| 時間 | タスク | 成果物 |
|------|--------|--------|
| 2h | annotationsMap実装 | 保存・読み込み処理 |
| 1h | データ移行ロジック | デュアル書き込み対応 |
| 1-2h | 統合テスト・QA | QAチェックリスト完了 |
| 1h | パフォーマンス再計測 | 改善効果レポート |

### マイルストーン

**M1: 計測完了（Day 1午前）**
- ✅ ベースライン計測スクリプト完成
- ✅ 現状のFPS・保存時間・ネットワーク量を記録

**M2: 容易な最適化完了（Day 1午後）**
- ✅ 背景画像キャッシュ動作確認
- ✅ perfectDraw制御動作確認
- ✅ 体感速度の改善を確認

**M3: データモデル変更完了（Day 2午前）**
- ✅ annotationsMap保存・読み込み動作
- ✅ 新旧スキーマの互換性確認

**M4: 全体統合完了（Day 2午後）**
- ✅ すべての最適化が統合動作
- ✅ パフォーマンス目標達成
- ✅ QAチェックリスト完了

---

## テスト戦略

### 単体テスト

**ImageCacheManager:**
```tsx
// __tests__/lib/ImageCacheManager.test.ts
describe('ImageCacheManager', () => {
  let manager: ImageCacheManager;

  beforeEach(() => {
    manager = new ImageCacheManager(10); // 10MB制限
  });

  afterEach(() => {
    manager.clear();
  });

  it('should cache and retrieve image', async () => {
    const key = 'test:image1:123';
    const url = '/test-image.jpg';

    const img1 = await manager.get(key, url);
    const img2 = await manager.get(key, url);

    expect(img1).toBe(img2); // 同じインスタンス
    expect(manager.getStats().entryCount).toBe(1);
  });

  it('should evict oldest entry when memory limit reached', async () => {
    // テスト実装
  });

  it('should invalidate artwork cache', async () => {
    // テスト実装
  });
});
```

### 統合テスト

**注釈保存・読み込み:**
```tsx
// __tests__/integration/annotation-save-load.test.ts
describe('Annotation Save/Load with new schema', () => {
  it('should save annotation using annotationsMap', async () => {
    // 保存処理のテスト
  });

  it('should load annotation from annotationsMap', async () => {
    // 読み込み処理のテスト
  });

  it('should fallback to old schema if annotationsMap not available', async () => {
    // 互換性のテスト
  });
});
```

### パフォーマンステスト

**自動計測スクリプト:**
```tsx
// scripts/performance-test.ts
const runPerformanceTest = async () => {
  const results: any[] = [];

  for (const lineCount of [10, 50, 100, 200]) {
    const lines = generateTestAnnotations(lineCount);

    // 保存時間計測
    const saveStart = performance.now();
    await saveAnnotation({ lines, width: 1920, height: 1080 });
    const saveTime = performance.now() - saveStart;

    // FPS計測
    const fps = await measureDrawingFPS(lines, 5000);

    results.push({ lineCount, saveTime, fps });
  }

  console.table(results);
};
```

### QAチェックリスト

**機能チェック:**
- [ ] 注釈の保存・読み込みが正常動作
- [ ] Undo/Redoが正常動作
- [ ] ページ切り替えが正常動作
- [ ] ズーム・パンが正常動作
- [ ] 消しゴムツールが正常動作

**パフォーマンスチェック:**
- [ ] ページ切り替えが即座（<100ms）
- [ ] 保存処理が高速（<300ms）
- [ ] 描画FPSが50以上（100本の線）
- [ ] メモリ使用量が適切（<300MB）

**品質チェック:**
- [ ] 線の描画品質が許容範囲
- [ ] ズーム時のジャギーが許容範囲
- [ ] 異なる色・太さで品質確認

**互換性チェック:**
- [ ] 旧スキーマのデータが読み込める
- [ ] 新スキーマで保存したデータが読み込める
- [ ] 新旧スキーマの混在環境で動作

---

## ロールアウト計画

### フェーズ1: 開発環境（1日）

**目的:** 実装の安定性確認

**アクション:**
- Feature Flagで各最適化を個別に有効化
- 開発チームでの動作確認
- 単体テスト・統合テスト実行

**成功基準:**
- すべてのテスト合格
- 既存機能の動作に影響なし

### フェーズ2: QA環境（2-3日）

**目的:** 品質保証とパフォーマンス検証

**アクション:**
- QAチームによる機能テスト
- パフォーマンス計測（before/after）
- 視覚品質の評価

**成功基準:**
- QAチェックリスト完了
- パフォーマンス目標達成
- 致命的なバグなし

### フェーズ3: ステージング環境（3-5日）

**目的:** 本番同等環境での検証

**アクション:**
- 実データでの動作確認
- データ移行ロジックの検証
- 負荷テスト

**成功基準:**
- 実データで正常動作
- データ移行が正常完了
- 負荷に耐えられる

### フェーズ4: 本番環境（段階的）

**Week 1: Canary Deployment（一部ユーザーのみ）**
- Feature Flag: `ENABLE_PHASE3_OPTIMIZATION=true`（10%）
- 監視: エラー率、パフォーマンスメトリクス
- ロールバック準備: Feature Flagで即座に無効化可能

**Week 2: Gradual Rollout（徐々に拡大）**
- 10% → 25% → 50% → 100%
- 各段階で24時間監視
- 問題なければ次の段階へ

**Week 3: Full Rollout**
- 全ユーザーに展開
- 旧スキーマのサポート継続（1週間）

**Week 4: Cleanup**
- 旧スキーマのサポートコード削除（オプション）
- Feature Flagの削除

---

## リスクと対策

### リスク1: データ移行の失敗

**リスク内容:**
- 新スキーマへの移行時にデータ損失
- 新旧スキーマの不整合

**対策:**
- ✅ デュアル書き込み期間を設ける（1週間）
- ✅ 読み込み時のフォールバック機能
- ✅ データバックアップの実施
- ✅ Feature Flagで即座にロールバック可能

**検証方法:**
- ステージング環境で実データを使用してテスト
- 移行前後のデータ整合性チェック

### リスク2: メモリリーク

**リスク内容:**
- 画像キャッシュがメモリを圧迫
- GPUメモリの枯渇

**対策:**
- ✅ LRU方式での自動削除
- ✅ メモリ上限の設定（200MB）
- ✅ 開発環境でのモニタリングツール
- ✅ `ImageBitmap.close()`での適切なクリーンアップ

**検証方法:**
- Chrome DevTools Memory Profilerでの監視
- 長時間使用テスト（1時間以上）

### リスク3: 描画品質の劣化

**リスク内容:**
- `perfectDrawEnabled: false`で視覚品質が低下
- ユーザーからのクレーム

**対策:**
- ✅ QAチームによる視覚品質評価
- ✅ ハイブリッド制御で状況に応じて調整
- ✅ Feature Flagで戦略を切り替え可能
- ✅ ユーザーフィードバックの収集

**検証方法:**
- 複数のテストケースでbefore/afterのスクリーンショット比較
- 実際のアートワークでの検証

### リスク4: パフォーマンス改善が期待値に届かない

**リスク内容:**
- 実装したが効果が薄い
- 開発コストに見合わない

**対策:**
- ✅ 実装前のベースライン計測
- ✅ 段階的実装（効果の高いものから）
- ✅ 各最適化を個別に測定
- ✅ 効果が薄い場合は実装見送りも検討

**検証方法:**
- 定量的なパフォーマンス指標の比較
- ユーザーからの体感フィードバック

### リスク5: 予期しない副作用

**リスク内容:**
- 他の機能に影響
- 既存のバグが顕在化

**対策:**
- ✅ 包括的な統合テスト
- ✅ Feature Flagでの段階的展開
- ✅ モニタリングとアラート設定
- ✅ ロールバック手順の文書化

**検証方法:**
- 全機能の回帰テスト
- Canary Deploymentでの監視

---

## 付録

### A. Feature Flag設定

```tsx
// lib/featureFlags.ts
export const FEATURE_FLAGS = {
  // 画像キャッシュ
  imageCache:
    process.env.NEXT_PUBLIC_FEATURE_IMAGE_CACHE === 'true',

  // perfectDraw制御
  perfectDrawHybrid:
    process.env.NEXT_PUBLIC_FEATURE_PERFECT_DRAW_HYBRID === 'true',

  // annotationsMap（新スキーマ）
  annotationMapSchema:
    process.env.NEXT_PUBLIC_FEATURE_ANNOTATION_MAP === 'true',
} as const;
```

**.env.local（開発環境）:**
```env
NEXT_PUBLIC_FEATURE_IMAGE_CACHE=true
NEXT_PUBLIC_FEATURE_PERFECT_DRAW_HYBRID=true
NEXT_PUBLIC_FEATURE_ANNOTATION_MAP=true
```

**.env.production（本番環境 - 初期）:**
```env
NEXT_PUBLIC_FEATURE_IMAGE_CACHE=false
NEXT_PUBLIC_FEATURE_PERFECT_DRAW_HYBRID=false
NEXT_PUBLIC_FEATURE_ANNOTATION_MAP=false
```

### B. パフォーマンスメトリクス

**計測項目:**
```tsx
export type PerformanceMetrics = {
  // ページ切り替え
  pageTransitionTime: number;  // ms

  // 注釈保存
  annotationSaveTime: number;  // ms
  annotationSaveSize: number;  // bytes

  // 描画パフォーマンス
  drawingFPS: number;
  cpuUsage: number;  // %

  // キャッシュ
  cacheHitRate: number;  // %
  cacheMemoryUsage: number;  // MB
};
```

**ログ収集:**
```tsx
// lib/analytics/performance.ts
export const logPerformanceMetrics = (metrics: PerformanceMetrics) => {
  if (process.env.NODE_ENV === 'development') {
    console.table(metrics);
  }

  // 本番環境では分析ツールに送信
  // analytics.track('performance_metrics', metrics);
};
```

### C. 参考資料

**Konva.js:**
- [Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [perfectDrawEnabled Documentation](https://konvajs.org/api/Konva.Shape.html#perfectDrawEnabled)

**Firebase Firestore:**
- [Best Practices](https://firebase.google.com/docs/firestore/best-practices)
- [Data Model Design](https://firebase.google.com/docs/firestore/manage-data/structure-data)

**Browser APIs:**
- [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap)
- [Performance API](https://developer.mozilla.org/en-US/docs/Web/API/Performance)

---

**ドキュメント管理:**
- 作成日: 2025-11-03
- 最終更新: 2025-11-03
- レビュー担当: [TBD]
- 承認者: [TBD]
