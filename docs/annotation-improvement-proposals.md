# 注釈機能の改善提案ドキュメント

**作成日:** 2025-10-22
**最終更新:** 2025-11-01
**ステータス:** 基本実装完了、拡張機能の優先順位検討中

---

## 目次

1. [経緯](#経緯)
2. [現在の実装状況](#現在の実装状況)
3. [改善提案](#改善提案)
4. [優先順位と実装計画](#優先順位と実装計画)
5. [検討すべき質問](#検討すべき質問)
6. [参考資料](#参考資料)

---

## 経緯

### 実装完了時点（2025-10-23）

- Fabric.jsからKonva.jsへの移行完了
- 注釈機能（F-06）の基本実装完了
  - フリーハンド描画（Line + Bezier曲線）
  - 描画モード/選択モードの切り替え
  - 線の選択・移動・削除
  - Firestore保存・読み込み
  - 未保存変更の警告
- 要件定義書を更新

### 実装状況レビュー（2025-11-01）

実装コードをレビューした結果、以下の状況を確認しました：

**完了した実装:**
1. ✅ Konva.jsベースの安定した描画システム（582行）
2. ✅ 2層レイヤー構造による最適化
3. ✅ ResizeObserverによる自動リサイズ対応
4. ✅ タッチデバイス対応
5. ✅ 権限制御とFirestore統合

**改善余地がある項目:**
1. エラーハンドリングの UX（`alert()` 使用）→ トースト通知への移行を検討
2. 型定義の厳密性不足（`updatedBy` の省略可能性）→ 将来的に必須化を検討
3. アクセシビリティの改善余地 → ARIA属性の追加を検討

**拡張機能の実装待ち:**
1. ズーム・パン連携
2. ツールバー拡張（色パレット、太さプリセット）
3. 自動保存機能
4. Undo/Redo機能
5. 消しゴムツール

### 現在のステータス

**基本実装完了**: 注釈機能の基本動作は完了。拡張機能の優先順位を検討中。

---

## 現在の実装状況（2025-11-01）

### 実装済みファイル

```
src/
├── components/
│   ├── AnnotationCanvas.tsx          # Konva.js統合（582行）
│   ├── ArtworkModal.tsx              # モーダル本体
│   └── artwork-modal/
│       ├── ArtworkViewer.tsx         # 画像表示・注釈切り替え
│       ├── ArtworkSidebar.tsx        # サイドバー
│       └── usePanZoom.ts             # ズーム・パン機能
├── app/gallery/
│   ├── page.tsx                      # メインロジック
│   ├── types.ts                      # 型定義
│   ├── components/                   # プレゼンテーションコンポーネント
│   └── hooks/                        # カスタムフック
├── constants/
│   └── labels.ts                     # ラベル定義
└── types/index.ts                     # グローバル型定義
```

### 実装済み機能

- ✅ Konva.jsによるフリーハンド描画（Line + Bezier曲線、tension: 0.5）
- ✅ 描画モードと選択モードの切り替え
- ✅ ブラシ設定（カラーピッカーで色選択、1〜30pxで太さ調整）
- ✅ 注釈の保存・読み込み（JSON形式、stage.toJSON() / Node.create()）
- ✅ ページごとの独立した注釈管理（pageNumberで識別）
- ✅ レスポンシブ対応（ResizeObserver使用、自動スケーリング）
- ✅ 未保存変更の警告（isDirtyフラグ管理）
- ✅ 管理者/閲覧者の権限制御（editable props）
- ✅ 2層レイヤー構造（background-layer、drawing-layer）
- ✅ タッチデバイス対応（touchStart, touchMove, touchEnd）
- ✅ 線の選択時のシャドウエフェクト（視覚的フィードバック）
- ✅ hitStrokeWidth調整（細い線でもタップしやすい）

---

## 改善提案

### 提案1: 初期化 useEffect の再分割

#### 現状の問題

**2025-11-01更新: この問題はKonva.js実装で解決されました。**

Konva.js実装では、以下のように適切に分離されています：

```typescript
// src/components/AnnotationCanvas.tsx

// 画像の読み込み（imageUrlが変更された時のみ）
useEffect(() => {
  const prepareImage = async () => {
    const img = await loadImage(imageUrl);
    setBackgroundImage(img);
    setBaseSize({ width: img.width, height: img.height });
  };
  prepareImage();
}, [imageUrl]); // imageUrlのみに依存

// ブラシ設定の変更は状態として管理され、再初期化は不要
// brushColor, brushWidthは新しい線を描画する際にのみ参照される
```

**解決された点:**
- ✅ ブラシ設定変更時にキャンバスが再初期化されない
- ✅ 画像の変更時のみ背景を再読み込み
- ✅ displaySizeの変更はResizeObserverで自動処理
- ✅ 不要な依存配列がないため、パフォーマンスが最適化されている

**結論: この改善提案は対応不要（既に解決済み）**

---

#### 参考: 旧実装（Fabric.js）での改善案A: 初期化を完全に分離（アーカイブ）

```typescript
// 初回のみ実行（依存配列空）
useEffect(() => {
  let isMounted = true;

  const initialize = async () => {
    const fabric = await loadFabric();
    if (!isMounted) return;

    const canvas = new fabric.Canvas(canvasRef.current, {...});
    fabricCanvasRef.current = canvas;

    // イベントハンドラーは ref 経由で最新を参照
    const handleChange = () => markDirtyRef.current(true);
    changeEvents.forEach((eventName) => {
      canvas.on(eventName as any, handleChange as any);
    });

    // ResizeObserver
    resizeObserver = new ResizeObserver(() => {
      loadBackgroundImageRef.current(canvas);
      loadAnnotationRef.current(canvas);
    });

    await loadBackgroundImageRef.current(canvas);
    await loadAnnotationRef.current(canvas);
    applyEditableStateRef.current(canvas, editable);
  };

  void initialize();

  return () => {
    isMounted = false;
    // クリーンアップ
  };
}, []); // 空の依存配列

// 個別の更新用 useEffect
useEffect(() => {
  const canvas = fabricCanvasRef.current;
  if (!canvas) return;
  canvas.freeDrawingBrush.color = brushColor;
}, [brushColor]);

useEffect(() => {
  const canvas = fabricCanvasRef.current;
  if (!canvas) return;
  canvas.freeDrawingBrush.width = brushWidth;
}, [brushWidth]);
```

**メリット:**
- ブラシ設定変更時にキャンバスが再初期化されない
- パフォーマンス向上

**デメリット:**
- ref 管理が複雑になる（`markDirtyRef`, `loadBackgroundImageRef`, `loadAnnotationRef`, `applyEditableStateRef`）
- ref と state の同期ずれのリスク
- コードの可読性が低下する可能性

#### 改善案B: useCallback の依存を減らす

```typescript
// markDirty を useCallback から外して直接定義
const markDirty = (dirty: boolean) => {
  setIsDirty(dirty);
  onDirtyChange?.(dirty);
};

// applyEditableState は isDrawing を ref で保持
const isDrawingRef = useRef(isDrawing);
useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);

const applyEditableState = useCallback((canvas, isEditable) => {
  canvas.isDrawingMode = isEditable && isDrawingRef.current;
  canvas.selection = isEditable;
  // ...
}, []); // 依存配列を空にする
```

**メリット:**
- 案Aより実装がシンプル
- 既存コードへの影響が少ない

**デメリット:**
- ref の使用箇所が増える
- 完全には再初期化を防げない可能性

**2025-11-01更新: Konva.js実装により、この検討事項はすべて解決されました。**

---

### 提案2: `updatedBy` の必須化

#### 現状の問題

**場所:** `src/types/index.ts:126-133`

```typescript
export interface ArtworkAnnotation {
  pageNumber: number;
  data: string;
  width: number;
  height: number;
  updatedAt: Date | string;
  updatedBy?: string;  // ← 省略可能だが実際は管理者ログイン時は必須
}
```

**問題点:**
- 型定義では省略可能だが、実際には管理者が編集する際は必ず設定される
- 型の不正確さがコードの安全性を低下させる

#### 改善案

```typescript
export interface ArtworkAnnotation {
  pageNumber: number;
  data: string;
  width: number;
  height: number;
  updatedAt: Date | string;
  updatedBy: string;  // 必須に変更
}
```

#### 実施前の確認事項

1. **Firestore 保存処理の確認**

   **場所:** `src/app/gallery/page.tsx:283-377`

   ```typescript
   const handleSaveAnnotation = async (
     artworkId: string,
     pageNumber: number,
     annotation: AnnotationSavePayload | null,
   ) => {
     if (user?.role !== 'admin' || !user?.email) return;

     const newAnnotation = {
       pageNumber,
       data: annotation.data,
       width: annotation.width,
       height: annotation.height,
       updatedAt: new Date(),
       updatedBy: user.email,  // ← これが必ず設定されているか確認
     };
     // ...
   };
   ```

   **確認:** `user.email` が常に存在するか？

2. **既存データの確認**

   本番環境で注釈機能が既に使用されている場合、`updatedBy` が欠けているドキュメントが存在する可能性がある。

   **確認クエリ例:**
   ```typescript
   // マイグレーションスクリプト（必要に応じて）
   const artworksRef = collection(db, 'artworks');
   const artworksWithAnnotations = await getDocs(
     query(artworksRef, where('annotations', '!=', null))
   );

   let needsMigration = false;
   artworksWithAnnotations.forEach((doc) => {
     const data = doc.data();
     const annotations = data.annotations || [];
     annotations.forEach((ann: any) => {
       if (!ann.updatedBy) {
         console.log(`Document ${doc.id} has annotation without updatedBy`);
         needsMigration = true;
       }
     });
   });

   if (needsMigration) {
     console.log('マイグレーションが必要です');
   }
   ```

3. **過渡期の型定義**

   マイグレーション期間中は一時的に null を許容する：

   ```typescript
   export interface ArtworkAnnotation {
     pageNumber: number;
     data: string;
     width: number;
     height: number;
     updatedAt: Date | string;
     updatedBy: string | null;  // 一時的に null 許容
   }

   // 型ガードで安全に処理
   function hasUpdatedBy(
     ann: ArtworkAnnotation
   ): ann is ArtworkAnnotation & { updatedBy: string } {
     return ann.updatedBy != null;
   }

   // 使用例
   const validAnnotations = artwork.annotations?.filter(hasUpdatedBy) || [];
   ```

#### マイグレーション計画（必要な場合）

1. 既存データの調査（上記クエリ実行）
2. マイグレーションスクリプト作成
3. バックアップ取得
4. マイグレーション実行
5. 型定義を必須に変更
6. コード修正

---

### 提案3: エラーハンドリングの改善（通知 UI）

#### 現状の問題

**場所:** `src/app/gallery/page.tsx:374`, `src/components/ArtworkModal.tsx:73-85`

```typescript
// page.tsx:374
} catch (error) {
  console.error('Save annotation error:', error);
  alert('注釈の保存に失敗しました');  // ← alert は UX として粗い
}

// ArtworkModal.tsx:82
} catch (error) {
  console.error('Failed to save annotation:', error);
  alert('注釈の保存に失敗しました');  // ← 同上
}
```

**問題点:**
- `alert()` はブラウザネイティブのダイアログで、デザインが統一されない
- モーダルで表示するため、背景がブロックされる
- アクセシビリティが低い

#### 改善オプション

##### オプションA: モーダル内にエラーバナー

**実装コスト:** 低
**再利用性:** 低

```typescript
// ArtworkModal.tsx
const [error, setError] = useState<string | null>(null);
const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);

const handleSaveAnnotation = async (payload: AnnotationSavePayload | null) => {
  if (!onSaveAnnotation) return;

  setError(null);  // エラーをクリア
  setIsSavingAnnotation(true);

  try {
    await onSaveAnnotation(artwork.id, currentPageNumber, payload);
    setAnnotationDirty(false);
  } catch (error) {
    console.error('Failed to save annotation:', error);
    setError('注釈の保存に失敗しました。もう一度お試しください。');
  } finally {
    setIsSavingAnnotation(false);
  }
};

// JSX
return (
  <div className="fixed inset-0 z-50 bg-black bg-opacity-90">
    <div className="flex h-full w-full p-4">
      <div className="relative flex h-full w-full overflow-hidden rounded-lg bg-white shadow-2xl">

        {/* エラーバナー */}
        {error && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-start space-x-3">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-600"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <ArtworkViewer {...viewerProps} />
        <ArtworkSidebar {...sidebarProps} />
      </div>
    </div>
  </div>
);
```

**メリット:**
- 実装が簡単
- 既存コードへの影響が最小
- 注釈機能固有のエラー処理に適している

**デメリット:**
- 他の場所で再利用できない
- プロジェクト全体で統一された通知UIにならない

##### オプションB: 共通トーストコンポーネント

**実装コスト:** 中
**再利用性:** 高

```typescript
// src/components/Toast/ToastContext.tsx
import { createContext, useContext, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (type: ToastType, message: string, duration?: number) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string, duration = 5000) => {
    const id = crypto.randomUUID();
    const newToast: Toast = { id, type, message };

    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, duration);
    }
  }, []);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
      {children}
      <ToastContainer toasts={toasts} onClose={hideToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// src/components/Toast/ToastContainer.tsx
function ToastContainer({ toasts, onClose }: { toasts: Toast[]; onClose: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg shadow-lg flex items-center space-x-3 ${
            toast.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
            toast.type === 'warning' ? 'bg-yellow-50 border border-yellow-200 text-yellow-700' :
            'bg-blue-50 border border-blue-200 text-blue-700'
          }`}
        >
          <p>{toast.message}</p>
          <button onClick={() => onClose(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

// 使用例: ArtworkModal.tsx
import { useToast } from '@/components/Toast/ToastContext';

const ArtworkModal = (...) => {
  const { showToast } = useToast();

  const handleSaveAnnotation = async (payload) => {
    try {
      await onSaveAnnotation(...);
      showToast('success', '注釈を保存しました');
    } catch (error) {
      showToast('error', '注釈の保存に失敗しました');
    }
  };

  // ...
};
```

**メリット:**
- プロジェクト全体で再利用可能
- 統一されたUI/UX
- 複数のトーストを同時に表示可能

**デメリット:**
- 実装コストが高い
- `_app.tsx` などでプロバイダーをラップする必要がある
- 既存コードの改修が必要

##### オプションC: React Hot Toast ライブラリ

**実装コスト:** 低
**再利用性:** 高
**依存関係:** +4KB gzip

```bash
npm install react-hot-toast
```

```typescript
// _app.tsx or layout.tsx
import { Toaster } from 'react-hot-toast';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}

// 使用例: ArtworkModal.tsx
import toast from 'react-hot-toast';

const handleSaveAnnotation = async (payload) => {
  try {
    await onSaveAnnotation(...);
    toast.success('注釈を保存しました');
  } catch (error) {
    toast.error('注釈の保存に失敗しました');
  }
};
```

**メリット:**
- 実装が非常に簡単
- 機能が豊富（プログレス、カスタムスタイル、アニメーションなど）
- メンテナンス不要

**デメリット:**
- 依存関係が増える（約4KB gzip）
- カスタマイズの自由度がやや低い

#### プロジェクト全体での通知ニーズ

通知が必要になりそうな場所：
- ✅ 注釈保存の成功/失敗
- ✅ コメント投稿の成功/失敗
- ✅ いいねの成功/失敗（現在はエラー時のみalert）
- ✅ 作品削除の成功/失敗（現在はalert）
- ✅ ラベル更新の成功/失敗（現在はエラー時のみalert）
- ✅ インポート完了の通知
- ✅ データリセットの成功/失敗

→ **複数箇所で必要なため、オプションBまたはCが推奨**

---

### 提案4: Konva.js 読み込み失敗時のリカバリ

#### 現状の問題

**2025-11-01更新: 現在の実装状況**

Konva.jsは動的インポートではなく、直接インポートされています：

```typescript
// src/components/AnnotationCanvas.tsx
import Konva from 'konva';
import { Stage, Layer, Line, Image as KonvaImage } from 'react-konva';
```

**問題点:**
- ライブラリの読み込み失敗は、ページ全体の読み込みエラーとなる
- 部分的なリカバリが困難

#### 改善案

```typescript
let fabricPromise: Promise<FabricNamespace> | null = null;

const loadFabric = async (): Promise<FabricNamespace> => {
  if (!fabricPromise) {
    fabricPromise = import('fabric')
      .then((module) => {
        console.log('[AnnotationCanvas] Fabric.js loaded successfully');
        return module.fabric;
      })
      .catch((error) => {
        console.error('[AnnotationCanvas] Failed to load Fabric.js:', error);
        fabricPromise = null;  // リセットして再試行可能にする
        throw error;
      });
  }
  return fabricPromise;
};
```

#### 追加の UI 改善案

エラー発生時にユーザーに再試行のオプションを提供：

```typescript
// AnnotationCanvas.tsx
const [loadError, setLoadError] = useState<string | null>(null);

useEffect(() => {
  const initialise = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const fabric = await loadFabric();
      // 初期化処理...
    } catch (error) {
      console.error('[AnnotationCanvas] Initialization failed:', error);
      setLoadError('注釈機能の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  void initialise();
}, []);

// JSX
{loadError && (
  <div className="flex flex-col items-center justify-center p-8 space-y-4">
    <p className="text-red-600">{loadError}</p>
    <button
      onClick={() => window.location.reload()}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      ページを再読み込み
    </button>
  </div>
)}
```

#### 自動リトライロジック（オプション）

ネットワークエラーの場合、自動でリトライ：

```typescript
const loadFabric = async (retries = 3, delay = 1000): Promise<FabricNamespace> => {
  if (!fabricPromise) {
    fabricPromise = (async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const module = await import('fabric');
          console.log('[AnnotationCanvas] Fabric.js loaded successfully');
          return module.fabric;
        } catch (error) {
          console.error(`[AnnotationCanvas] Load attempt ${attempt}/${retries} failed:`, error);

          if (attempt === retries) {
            fabricPromise = null;  // 最後の試行が失敗したらリセット
            throw error;
          }

          // 次の試行まで待機
          await new Promise((resolve) => setTimeout(resolve, delay * attempt));
        }
      }
      throw new Error('All retry attempts failed');
    })();
  }
  return fabricPromise;
};
```

---

### 提案5: アクセシビリティの改善

#### 現状の問題

**場所:** `src/components/AnnotationCanvas.tsx:409`

```tsx
<canvas ref={canvasRef} className="block w-full" />
```

**問題点:**
- スクリーンリーダーがキャンバスの内容を認識できない
- キーボード操作に対応していない
- 注釈の状態変化が伝わらない

#### 改善案1: 基本的な ARIA 属性

```tsx
<canvas
  ref={canvasRef}
  className="block w-full"
  role="img"
  aria-label={
    editable
      ? "作品への注釈を編集するキャンバス。描画モードでフリーハンドで線を描けます。選択モードで線を選択・移動・削除できます。"
      : "作品への注釈を表示するキャンバス。閲覧専用です。"
  }
  aria-live={editable ? "polite" : undefined}
  aria-describedby="annotation-instructions"
/>

{editable && (
  <div id="annotation-instructions" className="sr-only">
    現在{isDrawing ? '描画' : '選択'}モードです。
    描画モードでは画像上にフリーハンドで線を描けます。
    選択モードでは描いた線をクリックして選択し、移動・削除できます。
  </div>
)}
```

#### 改善案2: 注釈リストのテキスト表現

```tsx
<div className="sr-only" aria-live="polite" aria-atomic="true">
  {(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return '注釈キャンバスを読み込んでいます';

    const objectCount = canvas.getObjects().length;
    if (objectCount === 0) return 'このページには注釈がありません';

    return `このページには${objectCount}個の注釈があります`;
  })()}
</div>
```

#### 改善案3: キーボード操作対応（将来的な拡張）

現在はマウス/タッチのみ対応。将来的にキーボード操作を追加する場合：

```typescript
const handleKeyDown = useCallback((event: KeyboardEvent) => {
  const canvas = fabricCanvasRef.current;
  if (!canvas || !editable) return;

  const activeObject = canvas.getActiveObject();
  if (!activeObject) return;

  switch (event.key) {
    case 'Delete':
    case 'Backspace':
      canvas.remove(activeObject);
      canvas.discardActiveObject();
      canvas.renderAll();
      markDirty(true);
      event.preventDefault();
      break;

    case 'ArrowUp':
      activeObject.top = (activeObject.top || 0) - 10;
      activeObject.setCoords();
      canvas.renderAll();
      markDirty(true);
      event.preventDefault();
      break;

    // ArrowDown, ArrowLeft, ArrowRight も同様
  }
}, [editable, markDirty]);

useEffect(() => {
  if (!editable) return;

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [editable, handleKeyDown]);
```

#### WCAG 準拠レベルの検討

教育機関向けアプリケーションの場合、以下のレベルを検討：

- **WCAG 2.1 Level A（最低限）:** 基本的なアクセシビリティ
  - キーボード操作可能
  - テキスト代替の提供
  - 色のコントラスト比

- **WCAG 2.1 Level AA（推奨）:** 標準的なアクセシビリティ
  - Level A の要件すべて
  - より厳しいコントラスト比（4.5:1）
  - 複数の方法でコンテンツにアクセス可能

- **WCAG 2.1 Level AAA（理想）:** 最高レベルのアクセシビリティ
  - Level AA の要件すべて
  - 最も厳しいコントラスト比（7:1）
  - 手話通訳など

**推奨:** まずは Level A を目指し、段階的に AA に近づける

---

## 優先順位と実装計画

### フェーズ1: 緊急度が高い改善（テスト後すぐ）

#### 1-1. Fabric.js 読み込み失敗時のリカバリ ⚠️ 高優先度

**理由:** リスク高、実装コスト低

**タスク:**
- [ ] `loadFabric()` にエラーハンドリングとリセット処理を追加
- [ ] エラー発生時の UI フィードバックを追加
- [ ] （オプション）自動リトライロジックを実装

**所要時間:** 1-2時間

**実装ファイル:**
- `src/components/AnnotationCanvas.tsx`

---

#### 1-2. `updatedBy` 必須化の事前調査 ⚠️ 高優先度

**理由:** データ破損リスク

**タスク:**
- [ ] 本番環境で注釈機能が使用されているか確認
- [ ] 既存データの確認クエリを実行
- [ ] `updatedBy` が欠けているドキュメントの有無を確認
- [ ] マイグレーションの必要性を判断
- [ ] （必要なら）マイグレーションスクリプト作成

**所要時間:** 2-4時間（マイグレーション含む場合は+2時間）

**実装ファイル:**
- `src/types/index.ts`
- `scripts/migrate-annotations.ts`（新規作成の可能性）

---

### フェーズ2: UX改善（次のスプリント）

#### 2-1. 通知 UI の導入 ✨ UX向上

**理由:** ユーザー体験への影響大

**タスク:**
- [ ] プロジェクト全体のニーズを確認
- [ ] オプションA/B/Cから選択
- [ ] 実装
- [ ] 既存の `alert()` を置き換え

**所要時間:**
- オプションA（モーダル内バナー）: 2-3時間
- オプションB（共通トースト）: 4-6時間
- オプションC（react-hot-toast）: 1-2時間

**実装ファイル:**
- オプションA: `src/components/ArtworkModal.tsx`
- オプションB: `src/components/Toast/`（新規）, `src/app/layout.tsx`
- オプションC: `src/app/layout.tsx`, 各コンポーネント

**推奨:** まずオプションAで実装し、プロジェクト全体で必要になったらオプションCに移行

---

### フェーズ3: パフォーマンス最適化（必要に応じて）

#### 3-1. 初期化 useEffect の再分割 🚀 パフォーマンス

**理由:** 実際のパフォーマンス問題を確認してから

**タスク:**
- [ ] パフォーマンス測定（React DevTools Profiler）
- [ ] ブラシ色/太さ変更時のラグを確認
- [ ] 問題が確認されたら改善案Aまたは案Bを実装

**所要時間:** 測定1時間 + 実装4-6時間

**実装ファイル:**
- `src/components/AnnotationCanvas.tsx`

**判断基準:**
- ブラシ色変更時に明確なラグ（>100ms）がある場合に実装
- ユーザーからパフォーマンス不満の報告がある場合に実装

---

### フェーズ4: アクセシビリティ（時間がある時）

#### 4-1. 基本的な ARIA 属性の追加 ♿ アクセシビリティ

**理由:** 実装コスト低、教育機関向けとして重要

**タスク:**
- [ ] `<canvas>` に `role="img"` と `aria-label` を追加
- [ ] 注釈の状態を `sr-only` で提供
- [ ] `aria-live` で状態変化を通知

**所要時間:** 2-3時間

**実装ファイル:**
- `src/components/AnnotationCanvas.tsx`

---

#### 4-2. キーボード操作対応 ♿ アクセシビリティ（将来的）

**理由:** 実装コストやや高、WCAG AA準拠のため

**タスク:**
- [ ] Delete/Backspace キーでオブジェクト削除
- [ ] 矢印キーでオブジェクト移動
- [ ] Tab キーでオブジェクト選択
- [ ] Esc キーで選択解除

**所要時間:** 4-6時間

**実装ファイル:**
- `src/components/AnnotationCanvas.tsx`

---

## 検討すべき質問

テスト完了後、以下の質問について検討してください：

### 1. useEffect 再分割について

- ❓ 現状でパフォーマンス問題は感じられますか？
  - ブラシ色変更時にラグがありますか？
  - キャンバスが再初期化される様子が見えますか？
- ❓ ref 管理の複雑さをどう評価されますか？
  - コードの可読性 vs パフォーマンスのトレードオフ
  - 案A（完全分離）と案B（依存最小化）のどちらが保守性が高いと思われますか？

### 2. updatedBy 必須化について

- ❓ 本番環境で注釈機能は既に使用中ですか？
- ❓ 既存データに `updatedBy` が欠けているドキュメントはありますか？
- ❓ マイグレーションスクリプトは必要ですか？
- ❓ マイグレーション中のダウンタイムは許容できますか？

### 3. 通知 UI について

- ❓ プロジェクト全体でトースト通知のニーズはありますか？
  - インポート完了通知
  - 作品削除の成功通知
  - コメント投稿の失敗通知
  - その他
- ❓ ライブラリ導入（react-hot-toast など）は許容できますか？
  - バンドルサイズへの影響（+4KB gzip）
  - 依存関係の増加
- ❓ まずはモーダル内バナー（オプションA）から始めますか？
  - 段階的に共通トースト（オプションBまたはC）へ移行

### 4. アクセシビリティについて

- ❓ WCAG 準拠のレベルはどこまで目指しますか？
  - Level A（最低限）
  - Level AA（推奨、教育機関向け）
  - Level AAA（理想）
- ❓ キーボード操作対応の優先度は？
  - 高（すぐに実装）
  - 中（時間がある時に実装）
  - 低（将来的な拡張として検討）
- ❓ スクリーンリーダー対応のテストは可能ですか？
  - NVDA（Windows）
  - JAWS（Windows）
  - VoiceOver（macOS/iOS）

### 5. パフォーマンス最適化について

- ❓ 実際にパフォーマンス問題が発生していますか？
  - ブラシ設定変更時のラグ
  - キャンバス描画時のフレームレート低下
  - メモリ使用量の増加
- ❓ React DevTools Profiler で計測しましたか？
- ❓ 「過度な最適化」として現状維持も選択肢では？

---

## 参考資料

### 関連ドキュメント

- [要件定義書](./requirements.md) - 注釈機能の詳細仕様
- [変更履歴](./changelog.md) - 実装履歴
- [Fabric.js 公式ドキュメント](http://fabricjs.com/docs/) - API リファレンス

### 関連コード

#### 主要実装ファイル

- [src/components/AnnotationCanvas.tsx](../src/components/AnnotationCanvas.tsx) - 注釈キャンバス（420行）
- [src/components/ArtworkModal.tsx](../src/components/ArtworkModal.tsx) - モーダル本体（163行）
- [src/components/artwork-modal/ArtworkViewer.tsx](../src/components/artwork-modal/ArtworkViewer.tsx) - 画像表示（212行）
- [src/components/artwork-modal/ArtworkSidebar.tsx](../src/components/artwork-modal/ArtworkSidebar.tsx) - サイドバー（279行）
- [src/app/gallery/page.tsx](../src/app/gallery/page.tsx) - メインロジック（451行）
- [src/types/index.ts](../src/types/index.ts) - 型定義

#### 問題箇所

- `AnnotationCanvas.tsx:179-247` - 初期化 useEffect
- `AnnotationCanvas.tsx:33-39` - Fabric.js 読み込み
- `AnnotationCanvas.tsx:409` - Canvas 要素
- `ArtworkModal.tsx:73-85` - エラーハンドリング
- `types/index.ts:126-133` - ArtworkAnnotation 型定義

### 外部リソース

#### アクセシビリティ

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM: Keyboard Accessibility](https://webaim.org/techniques/keyboard/)

#### React パフォーマンス

- [React DevTools Profiler](https://react.dev/learn/react-developer-tools)
- [Optimizing Performance - React](https://react.dev/learn/render-and-commit)
- [useEffect vs useLayoutEffect](https://kentcdodds.com/blog/useeffect-vs-uselayouteffect)

#### 通知 UI ライブラリ

- [react-hot-toast](https://react-hot-toast.com/) - シンプルで軽量
- [react-toastify](https://fkhadra.github.io/react-toastify/introduction) - 多機能
- [sonner](https://sonner.emilkowal.ski/) - モダンなデザイン

---

## 次のステップ

### テスト実施前

- [ ] このドキュメントをチームで共有
- [ ] 質問事項を検討
- [ ] 優先順位を確認

### テスト実施中

- [ ] 注釈機能の動作確認
  - [ ] フリーハンド描画
  - [ ] ブラシ色/太さの変更
  - [ ] 描画モード/選択モードの切り替え
  - [ ] 注釈の保存/読み込み
  - [ ] ページ切り替え時の動作
  - [ ] レスポンシブ対応
  - [ ] 権限制御（管理者/閲覧者）
- [ ] パフォーマンス確認
  - [ ] ブラシ設定変更時のラグ
  - [ ] 描画時のフレームレート
  - [ ] メモリ使用量
- [ ] エラーケースの確認
  - [ ] ネットワークエラー時の挙動
  - [ ] Fabric.js 読み込み失敗時の挙動
  - [ ] 保存失敗時のエラーメッセージ

### テスト完了後

- [ ] テスト結果を記録
- [ ] 発見された問題を Issue に登録
- [ ] このドキュメントを参照して改善項目を議論
- [ ] 実装する改善項目を決定
- [ ] 実装計画を立てる

---

## 改訂履歴

| 日付 | バージョン | 変更内容 |
|:-----|:-----------|:---------|
| 2025-10-22 | 1.0.0 | 初版作成 |

---

**このドキュメントは生きたドキュメントです。テスト結果や新しい発見があれば随時更新してください。**
