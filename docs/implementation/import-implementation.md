# インポート機能 実装詳細

📝 **対象機能**: F-02-07, F-02-08, F-02-09
🔧 **実装言語**: TypeScript (Node.js 22, React 18)
📅 **最終更新**: 2025-11-20

---

## 1. 概要

このドキュメントは、インポート機能（再インポートスキップ、未提出プレースホルダー、エラー作品）のフロントエンド・バックエンド実装詳細を記載します。

**参照**: [インポート機能仕様](../features/import-feature.md)

---

## 2. フロントエンド実装

### 2.1. グレーサムネイル表示

#### 2.1.1. ArtworkCard コンポーネント

```tsx
// src/components/ArtworkCard.tsx

export function ArtworkCard({ artwork, onClick }: ArtworkCardProps) {
  const status = artwork.status || 'submitted';

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow"
    >
      {/* サムネイル表示 */}
      <div className="relative aspect-[3/2] bg-gray-100">
        {status === 'submitted' ? (
          // 通常のサムネイル
          <img
            src={artwork.images[0]?.thumbnailUrl || artwork.images[0]?.url}
            alt={artwork.title}
            className="w-full h-full object-cover"
          />
        ) : (
          // グレーのプレースホルダー
          <div className="w-full h-full bg-gray-300 flex items-center justify-center">
            <span className="text-gray-600 font-medium text-lg">
              {status === 'not_submitted' ? '未提出' : 'エラー'}
            </span>
          </div>
        )}

        {/* オーバーレイ情報 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <p className="text-white text-sm font-medium truncate">
            {artwork.studentName}
          </p>
          {status === 'submitted' && (
            <div className="flex items-center gap-2 text-white/90 text-xs mt-1">
              <span>👍 {artwork.likeCount}</span>
              <span>💬 {artwork.comments.length}</span>
              {artwork.images.length > 1 && (
                <span>📄 {artwork.images.length}ページ</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ラベル表示（提出済み作品のみ） */}
      {status === 'submitted' && artwork.labels.length > 0 && (
        <div className="p-2 flex gap-1 flex-wrap">
          {artwork.labels.map((label, idx) => (
            <span
              key={idx}
              className={`px-2 py-1 rounded text-xs ${getLabelStyle(label)}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 2.1.2. デザイン仕様

| 要素 | 値 |
|------|-----|
| 背景色 | `bg-gray-300` (Tailwind) |
| テキスト色 | `text-gray-600` |
| テキストサイズ | `text-lg` (18px) |
| テキスト位置 | `flex items-center justify-center` |
| テキスト内容 | 未提出: "未提出" / エラー: "エラー" |
| アイコン | なし（テキストのみ） |

---

### 2.2. ソートロジック実装

#### 2.2.1. src/app/gallery/page.tsx

```typescript
const sortedArtworks = useMemo(() => {
  let sorted = [...filteredArtworks];

  if (sortBy === 'submittedAt-asc' || sortBy === 'submittedAt-desc') {
    // 提出日時順: 提出済み作品と未完了作品を分離
    const submitted = sorted.filter(a => isSubmitted(a));
    const incomplete = sorted.filter(a => isIncomplete(a));

    // 提出済み作品を日付順にソート
    submitted.sort((a, b) => {
      const dateA = a.submittedAt?.getTime() || 0;
      const dateB = b.submittedAt?.getTime() || 0;
      return sortBy === 'submittedAt-asc' ? dateA - dateB : dateB - dateA;
    });

    // 未完了作品を学籍番号順にソート
    incomplete.sort((a, b) =>
      a.studentEmail.localeCompare(b.studentEmail)
    );

    // 提出済み → 未完了の順に結合
    return [...submitted, ...incomplete];

  } else if (sortBy === 'studentEmail-asc' || sortBy === 'studentEmail-desc') {
    // 学籍番号順: 全作品を混在させてソート
    sorted.sort((a, b) => {
      const comparison = a.studentEmail.localeCompare(b.studentEmail);
      return sortBy === 'studentEmail-asc' ? comparison : -comparison;
    });
    return sorted;

  } else {
    return sorted;
  }
}, [filteredArtworks, sortBy]);
```

#### 2.2.2. ソートの挙動まとめ

| ソート方法 | 提出済み作品 | 未提出作品 | エラー作品 |
|:----------|:------------|:----------|:----------|
| **提出日時（早い順）** | 提出日時でソート（先頭） | 学籍番号順（末尾） | 学籍番号順（末尾） |
| **提出日時（遅い順）** | 提出日時でソート（先頭） | 学籍番号順（末尾） | 学籍番号順（末尾） |
| **学籍番号（A→Z）** | 学籍番号順（混在） | 学籍番号順（混在） | 学籍番号順（混在） |
| **学籍番号（Z→A）** | 学籍番号順（混在） | 学籍番号順（混在） | 学籍番号順（混在） |

---

### 2.3. フィルタリング機能

#### 2.3.1. GalleryHeader コンポーネント

```tsx
// src/components/GalleryHeader.tsx

interface GalleryHeaderProps {
  hideIncomplete: boolean;
  onHideIncompleteChange: (value: boolean) => void;
  artworks: Artwork[];
}

export function GalleryHeader({
  hideIncomplete,
  onHideIncompleteChange,
  artworks,
}: GalleryHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* 未提出/エラーフィルター */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hideIncomplete}
            onChange={(e) => onHideIncompleteChange(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">
            未提出/エラーを非表示
          </span>
        </label>

        {hideIncomplete && (
          <span className="text-xs text-gray-500">
            ({artworks.filter(isIncomplete).length}件 非表示中)
          </span>
        )}
      </div>
    </div>
  );
}
```

#### 2.3.2. フィルターロジック

```typescript
// src/app/gallery/page.tsx

const [hideIncomplete, setHideIncomplete] = useState(false);

const filteredArtworks = useMemo(() => {
  let filtered = artworks;

  // 未提出/エラーフィルター
  if (hideIncomplete) {
    filtered = filtered.filter(a => isSubmitted(a));
  }

  // 既存のラベルフィルター
  if (selectedLabels.length > 0) {
    filtered = filtered.filter(a =>
      a.labels.some(label => selectedLabels.includes(label))
    );
  }

  // 合計ラベルフィルター
  if (totalLabelFilter !== null) {
    filtered = filtered.filter(a => {
      const total = a.labels.reduce((sum, label) => {
        const match = label.match(/-(\d+)$/);
        return sum + (match ? parseInt(match[1]) : 0);
      }, 0);
      return total === totalLabelFilter;
    });
  }

  return filtered;
}, [artworks, hideIncomplete, selectedLabels, totalLabelFilter]);
```

---

### 2.4. モーダル表示制御

#### 2.4.1. 未提出作品のモーダル

```tsx
// src/components/ArtworkModal.tsx

export function ArtworkModal({ artwork, onClose }: ArtworkModalProps) {
  const status = artwork.status || 'submitted';

  if (status === 'not_submitted') {
    return (
      <Modal onClose={onClose}>
        <div className="text-center p-8">
          <div className="w-24 h-24 bg-gray-300 rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-3xl text-gray-600">📭</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">{artwork.studentName}</h2>
          <p className="text-gray-600 mb-4">この課題は未提出です</p>

          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <p className="text-sm text-gray-700"><strong>学生名:</strong> {artwork.studentName}</p>
            <p className="text-sm text-gray-700"><strong>メール:</strong> {artwork.studentEmail}</p>
            {artwork.studentId && (
              <p className="text-sm text-gray-700"><strong>学籍番号:</strong> {artwork.studentId}</p>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  if (status === 'error') {
    return (
      <Modal onClose={onClose}>
        <div className="text-center p-8">
          <div className="w-24 h-24 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <span className="text-3xl text-red-600">⚠️</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">{artwork.studentName}</h2>
          <p className="text-red-600 font-medium mb-4">エラー: サポートされていないファイル形式</p>

          <div className="bg-gray-50 rounded-lg p-4 text-left mb-4">
            <p className="text-sm text-gray-700"><strong>学生名:</strong> {artwork.studentName}</p>
            <p className="text-sm text-gray-700"><strong>メール:</strong> {artwork.studentEmail}</p>
            <p className="text-sm text-gray-700"><strong>提出日時:</strong> {formatDate(artwork.submittedAt)}</p>
          </div>

          {artwork.files.length > 0 && (
            <div className="bg-red-50 rounded-lg p-4 text-left">
              <p className="text-sm font-medium text-red-800 mb-2">提出されたファイル:</p>
              <ul className="space-y-1">
                {artwork.files.map((file, idx) => (
                  <li key={idx} className="text-sm text-red-700">
                    📄 {file.name} ({file.mimeType})
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-600 mt-3">
                ※ 対応形式: 画像（JPEG, PNG, GIF）、PDF
              </p>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // 通常の作品表示
  return (
    <Modal onClose={onClose}>
      {/* 既存の実装 */}
    </Modal>
  );
}
```

---

## 3. バックエンド実装

### 3.1. importController.ts - 再インポートスキップ・上書きロジック

#### 3.1.1. 既存作品チェック処理

```typescript
// functions/src/importController.ts

export const initializeImport = onCall(
  { ... },
  async (request) => {
    // 1. 既存作品を取得（status情報も含む）
    const existingArtworksSnapshot = await db
      .collection('artworks')
      .where('galleryId', '==', galleryId)
      .get();

    const existingArtworksByEmail = new Map<string, ExistingArtworkInfo>();
    existingArtworksSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const normalized = normalizeIdentifier(data.studentEmail);
      existingArtworksByEmail.set(normalized, {
        id: doc.id,
        status: data.status || 'submitted',
        studentEmail: data.studentEmail,
      });
    });

    console.log(`Existing artworks: ${existingArtworksByEmail.size} students`);

    // 2. Google Classroom APIから提出物を取得
    const submissions = await listSubmissions(
      classroomId,
      assignmentId,
      accessToken
    );

    // 3. 提出物を学生ごとにグループ化
    const submissionsByStudent = new Map();
    let skippedCount = 0;
    let overwriteCount = 0;

    for (const submission of submissions) {
      const normalizedEmail = normalizeIdentifier(submission.userId);
      const existingArtwork = existingArtworksByEmail.get(normalizedEmail);

      if (existingArtwork) {
        if (existingArtwork.status === 'submitted') {
          // ✅ 正常提出済み → スキップ
          console.log(`⏭️ Skipping ${submission.userId} - already submitted`);
          skippedCount++;
          continue;
        } else {
          // 🔄 未提出・エラー → 上書き
          console.log(`🔄 Overwriting ${submission.userId} (current status: ${existingArtwork.status})`);
          overwriteCount++;
        }
      }

      // 提出物をMapに追加（existingArtworkIdを保持）
      if (!submissionsByStudent.has(normalizedEmail)) {
        submissionsByStudent.set(normalizedEmail, {
          studentEmail: submission.userId,
          files: [],
          existingArtworkId: existingArtwork?.id, // 上書き用ID
        });
      }

      submissionsByStudent.get(normalizedEmail).files.push(...submission.attachments);
    }

    // 4. Cloud Tasks作成（提出済み学生のみ）
    for (const [email, submissionData] of submissionsByStudent) {
      await createProcessFileTask(galleryId, submissionData);
    }

    // 5. importJobを更新
    await db.collection('importJobs').doc(jobId).update({
      totalFiles: submissionsByStudent.size,
      skippedCount,
      overwrittenCount: overwriteCount,
      status: 'processing',
    });

    return {
      success: true,
      jobId,
      skippedCount,
      overwrittenCount: overwriteCount,
    };
  }
);
```

#### 3.1.2. メールアドレス正規化

```typescript
// functions/src/importController.ts

function normalizeIdentifier(email: string): string {
  return email.toLowerCase().trim();
}
```

---

### 3.2. fileProcessor.ts - ドキュメント上書き処理

#### 3.2.1. 上書きロジック

```typescript
// functions/src/fileProcessor.ts

export const processMultipleFiles = onTaskDispatched(
  { ... },
  async (request) => {
    const { existingArtworkId } = request.data;

    // 画像処理...

    // 作品ドキュメント作成/上書き
    const artworkRef = existingArtworkId
      ? db.collection('artworks').doc(existingArtworkId)
      : db.collection('artworks').doc();

    await artworkRef.set(artworkData, { merge: true });

    // 新規作品の場合のみカウント増加
    if (!existingArtworkId) {
      await db.collection('galleries').doc(galleryId).update({
        artworkCount: admin.firestore.FieldValue.increment(1),
      });
    }

    console.log(existingArtworkId ? '🔄 Overwritten artwork' : '✅ Created new artwork');
  }
);
```

---

### 3.3. 未提出学生プレースホルダー生成

#### 3.3.1. Google Classroom API呼び出し

```typescript
// functions/src/importController.ts

async function listAssignedStudents(
  courseId: string,
  accessToken: string
): Promise<Student[]> {
  const response = await fetch(
    `https://classroom.googleapis.com/v1/courses/${courseId}/students`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch assigned students: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.students || [];
}
```

#### 3.3.2. プレースホルダー生成処理

```typescript
// functions/src/importController.ts（initializeImport内）

// 4. 割り当て済み学生取得
const assignedStudents = await listAssignedStudents(classroomId, accessToken);
const submittedEmails = new Set(submissions.map(s => normalizeIdentifier(s.userId)));

// 5. 未提出学生の判定
const notSubmittedStudents = assignedStudents.filter(student => {
  const studentEmail = normalizeIdentifier(student.profile?.emailAddress);
  return studentEmail &&
         !submittedEmails.has(studentEmail) &&
         !existingArtworksByEmail.has(studentEmail);
});

// 6. プレースホルダー作品を生成
for (const student of notSubmittedStudents) {
  await db.collection('artworks').add({
    galleryId,
    classroomId,
    assignmentId,
    status: 'not_submitted',
    studentName: student.profile.name.fullName,
    studentEmail: student.profile.emailAddress,
    studentId: extractStudentIdFromEmail(student.profile.emailAddress),
    title: `${student.profile.name.fullName} - 未提出`,
    files: [],
    images: [],
    submittedAt: null,
    isLate: false,
    likeCount: 0,
    labels: [],
    comments: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    importedBy: userEmail,
  });
}

console.log(`Created ${notSubmittedStudents.length} not-submitted placeholders`);
```

---

### 3.4. エラー作品生成

#### 3.4.1. サポート外ファイル形式の判定

```typescript
// functions/src/fileProcessor.ts

// 全ファイル処理後
if (allImages.length === 0) {
  // ファイル形式エラーかどうか判定
  const supportedTypes = ['image/', 'application/pdf'];
  const allFilesUnsupported = files.every(f =>
    !supportedTypes.some(type => f.type.startsWith(type))
  );

  if (allFilesUnsupported) {
    // エラー作品を生成
    const artworkData = {
      galleryId,
      classroomId,
      assignmentId,
      status: 'error',
      errorReason: 'unsupported_format',
      studentName,
      studentEmail,
      studentId: extractStudentIdFromEmail(studentEmail),
      title: `${studentName}の提出物 - エラー`,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        originalFileUrl: f.url,
        mimeType: f.mimeType,
      })),
      images: [],
      submittedAt: admin.firestore.Timestamp.fromDate(new Date(submittedAt)),
      isLate,
      likeCount: 0,
      labels: [],
      comments: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      importedBy: userEmail,
    };

    await db.collection('artworks').add(artworkData);

    // artworkCountを増加
    await db.collection('galleries').doc(galleryId).update({
      artworkCount: admin.firestore.FieldValue.increment(1),
    });

    return;
  } else {
    // 処理エラーの場合は例外をスロー
    throw new Error('Processing error: No images could be generated');
  }
}
```

---

## 4. パフォーマンス最適化

### 4.1. Firestoreクエリの最適化

#### 4.1.1. 必要なフィールドのみ取得

```typescript
// 効率的なクエリ
const existingArtworksSnapshot = await db
  .collection('artworks')
  .where('galleryId', '==', galleryId)
  .select('studentEmail', 'status')  // 必要なフィールドのみ
  .get();
```

#### 4.1.2. インデックスの作成

```
コレクション: artworks
フィールド:
  - galleryId (Ascending)
  - studentEmail (Ascending)
```

---

### 4.2. フロントエンド最適化

#### 4.2.1. useMemoの活用

```typescript
const filteredAndSortedArtworks = useMemo(() => {
  // フィルタリング・ソート処理
  return sorted;
}, [artworks, hideIncomplete, selectedLabels, sortBy]);
```

---

## 5. エラーハンドリング

### 5.1. Google Classroom APIエラー

```typescript
try {
  const assignedStudents = await listAssignedStudents(classroomId, accessToken);
} catch (error) {
  console.error('Failed to fetch assigned students:', error);

  await db.collection('importJobs').doc(jobId).update({
    status: 'error',
    errorMessage: 'Google Classroom APIから学生リストを取得できませんでした',
    errorDetails: error.message,
  });

  throw new Error('Failed to fetch assigned students');
}
```

### 5.2. Firestore書き込みエラー

```typescript
try {
  await db.collection('artworks').add(artworkData);
} catch (error) {
  console.error('Failed to create artwork:', error);

  // リトライ処理（最大3回）
  let retryCount = 0;
  while (retryCount < 3) {
    try {
      await db.collection('artworks').add(artworkData);
      break;
    } catch (retryError) {
      retryCount++;
      if (retryCount >= 3) {
        throw retryError;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
}
```

---

## 6. 関連ドキュメント

- [インポート機能仕様](../features/import-feature.md) - 機能仕様書
- [データマイグレーション](data-migration.md) - Artwork.status マイグレーション
- [テストシナリオ](../TESTING.md) - テストケース
- [背景インポート機能](../features/BACKGROUND_IMPORT.md) - 処理フロー全体

---

**ドキュメントバージョン**: 1.0
**最終更新日**: 2025-11-20
