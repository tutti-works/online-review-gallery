# インポート機能仕様書

✅ **実装完了日**: 2025-11-06
📝 **ステータス**: 本番環境デプロイ済み
📄 **機能ID**: F-02-07, F-02-08, F-02-09

---

## 1. 概要

### 1.1. 機能の目的

本機能は、Google Classroomから課題を再インポートする際の利便性向上を目的とする。以下の3つの主要機能を実装した：

1. **再インポートスキップ・上書き機能** ✅: 既に作品が存在する学生の処理を制御し、重複作品の生成を防ぐ
2. **未提出学生のプレースホルダー作品** ✅: Google Classroomで「割り当て済み」だが提出していない学生用のプレースホルダー作品を自動生成
3. **エラー作品のプレースホルダー** ✅: サポートされていないファイル形式の提出に対するエラー作品を生成

### 1.2. ユーザーストーリー

**AS A** 教員（管理者）
**I WANT TO** 同じ課題を再インポートしても重複作品が作られないようにしたい
**SO THAT** 学生の提出状況を一覧で把握でき、処理エラーが発生した作品のみ再処理できる

**AS A** 教員（管理者）
**I WANT TO** 未提出の学生もギャラリーに表示されるようにしたい
**SO THAT** 誰が提出していないか一目で分かり、講評会で全員の状況を把握できる

**AS A** 教員（管理者）
**I WANT TO** エラーが発生した作品を視覚的に識別したい
**SO THAT** どの学生のファイル形式が問題なのか即座に判断できる

### 1.3. 解決した問題（実装前の課題）

- ~~再インポート時に既存の作品が重複して作成される~~ → ✅ **解決**: `galleryId + studentEmail` の組み合わせで重複チェックを実装
- ~~未提出の学生はギャラリーに表示されず、提出状況の全体像が把握できない~~ → ✅ **解決**: 未提出学生用のプレースホルダー作品を自動生成
- ~~サポートされていないファイル形式（.docx等）の提出がエラーログにしか記録されない~~ → ✅ **解決**: エラー作品としてギャラリーに表示

---

## 2. 機能仕様

### 2.1. 再インポートスキップと上書き機能 (F-02-07)

✅ **2025-11-20更新**: `status` に基づく上書きロジックを実装

#### 2.1.1. 判定キー

- **`galleryId + studentEmail`** の組み合わせで既存作品を判定する
- `submissionId` は含めない（同じ学生の再提出も既存作品として扱う）

#### 2.1.2. 再インポート時の処理フロー

既存作品の `status` に基づいて、スキップまたは上書きを判定する：

```typescript
// 既存作品を Map で管理（status情報も含む）
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

// 各提出物に対して処理を判定
const existingArtwork = existingArtworksByEmail.get(normalizedEmail);
if (existingArtwork) {
  if (existingArtwork.status === 'submitted') {
    // ✅ 正常提出済み → スキップ
    console.log(`⏭️ Skipping ${studentEmail} - already submitted`);
    skippedCount++;
    continue;
  } else {
    // 🔄 未提出・エラー → 上書き
    console.log(`🔄 Overwriting ${studentEmail} (current status: ${existingArtwork.status})`);
    overwriteCount++;
  }
}
```

#### 2.1.3. スキップ・上書き判定ロジック

| 既存作品の状態 | Classroomの提出状態 | 処理 | 理由 |
|---|---|---|---|
| `submitted` | 正常提出 | **スキップ** | 正常提出済みは保護 |
| `submitted` | 未提出/エラー | **スキップ** | ありえないケース |
| `not_submitted` | 正常提出 | **上書き** ✅ | 後日提出した学生を反映 |
| `not_submitted` | 未提出 | **上書き** | 最新状態を維持 |
| `not_submitted` | エラー提出 | **上書き** | サポート外形式提出を記録 |
| `error` | 正常提出 | **上書き** ✅ | ファイル修正後の再提出を反映 |
| `error` | 未提出 | **上書き** | 提出取り消しを反映 |
| `error` | エラー提出 | **上書き** | エラー状態を維持 |

**設計思想**:
- ✅ **`submitted` 作品は絶対にスキップ**（正常提出を保護）
- 🔄 **`not_submitted` / `error` 作品は常に上書き**（最新状態を反映）

#### 2.1.4. 上書き時のドキュメント処理

上書き時は、既存ドキュメントIDを再利用して `set({ merge: true })` で更新：

```typescript
// 既存作品IDを保持
const artworkRef = existingArtworkId
  ? db.collection('artworks').doc(existingArtworkId)
  : db.collection('artworks').doc(); // 新規作品

// 上書き時は artworkCount を増やさない
await artworkRef.set(artworkData, { merge: true });

if (!existingArtworkId) {
  // 新規作品のみカウント増加
  await db.collection('galleries').doc(galleryId).update({
    artworkCount: FieldValue.increment(1),
  });
}
```

#### 2.1.5. インポート完了時の表示

```typescript
console.log(`
インポート完了:
- 新規処理: ${newStudentCount}件
- 上書き: ${overwriteCount}件  // ✅ 2025-11-20追加
- スキップ: ${skippedCount}件
- エラー: ${errorCount}件
`);
```

フロントエンドのインポート完了画面にも上書き数を表示する。

**ImportJob データ構造の拡張**:
```typescript
interface ImportJob {
  // ... 既存フィールド
  overwrittenCount?: number;  // ✅ 2025-11-20追加
}
```

---

### 2.2. 未提出学生のプレースホルダー作品 (F-02-08)

#### 2.2.1. 未提出学生の判定フロー

```
1. Google Classroom APIから「割り当て済み」学生リストを取得
   ↓
2. 提出済み学生のメールアドレスを取得
   ↓
3. 差分を取り、未提出学生を特定
   ↓
4. 各未提出学生にプレースホルダー作品を生成
```

#### 2.2.2. Google Classroom API呼び出し

```typescript
// functions/src/importController.ts 内
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
    throw new Error('Failed to fetch assigned students');
  }

  const data = await response.json();
  return data.students || [];
}
```

**必要なスコープ**: `classroom.courses.readonly`, `classroom.rosters.readonly`, `classroom.profile.emails` のいずれか（現在の `studentsubmissions.students.readonly` で取得可能）

#### 2.2.3. プレースホルダー作品のデータ構造

```typescript
interface NotSubmittedArtwork {
  id: string;                      // Firestore auto-generated ID
  galleryId: string;
  classroomId: string;
  assignmentId: string;

  status: 'not_submitted';         // 必須フィールド

  studentName: string;             // Classroom APIから取得
  studentEmail: string;            // 判定キー
  studentId?: string;              // 学籍番号（取得可能な場合）

  title: string;                   // 例: "山田太郎 - 未提出"

  files: [];                       // 空配列
  images: [];                      // 空配列

  submittedAt: null;               // 未提出なのでnull
  isLate: false;

  likeCount: 0;
  labels: [];
  comments: [];

  createdAt: Timestamp;            // プレースホルダー生成日時
  importedBy: string;
}
```

#### 2.2.4. 生成処理

```typescript
// functions/src/importController.ts 内
const assignedStudents = await listAssignedStudents(classroomId, accessToken);
const submittedEmails = new Set(submissions.map(s => s.userId));

const notSubmittedStudents = assignedStudents.filter(
  student => !submittedEmails.has(student.userId)
);

for (const student of notSubmittedStudents) {
  // 既存作品がある場合はスキップ
  if (existingStudentEmails.has(student.profile.emailAddress)) {
    continue;
  }

  await db.collection('artworks').add({
    galleryId,
    classroomId,
    assignmentId,
    status: 'not_submitted',
    studentName: student.profile.name.fullName,
    studentEmail: student.profile.emailAddress,
    studentId: student.profile.id,
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
```

---

### 2.3. エラー作品のプレースホルダー (F-02-09)

#### 2.3.1. エラー作品の判定基準

**エラー作品として扱う条件**:
- 提出されたファイルが全て、サポートされていないファイル形式（.docx, .xlsx, .pptx等）

**エラー作品として扱わない条件**:
- バックエンド処理エラー（メモリ不足、タイムアウト、PDF変換失敗等）
  → これらは再インポートで再試行可能なため、エラー作品は生成しない

#### 2.3.2. エラー作品のデータ構造

```typescript
interface ErrorArtwork {
  id: string;
  galleryId: string;
  classroomId: string;
  assignmentId: string;

  status: 'error';                 // 必須フィールド
  errorReason: 'unsupported_format'; // エラー理由

  studentName: string;
  studentEmail: string;
  studentId?: string;

  title: string;                   // 例: "山田太郎の提出物 - エラー"

  files: SubmittedFile[];          // 提出されたファイル情報は保持
  images: [];                      // 空配列（画像生成なし）

  submittedAt: Timestamp;          // 提出日時は記録
  isLate: boolean;

  likeCount: 0;
  labels: [];
  comments: [];

  createdAt: Timestamp;
  importedBy: string;
}
```

#### 2.3.3. 生成処理

```typescript
// functions/src/fileProcessor.ts 内（processMultipleFiles関数）

// 全ファイルの処理後
if (allImages.length === 0) {
  // ファイル形式エラーかどうか判定
  const allFilesUnsupported = files.every(f => {
    const supportedTypes = ['image/', 'application/pdf'];
    return !supportedTypes.some(type => f.type.startsWith(type));
  });

  if (allFilesUnsupported) {
    // サポートされていないファイル形式のみの場合、エラー作品を生成
    const artworkData = {
      galleryId,
      classroomId,
      assignmentId,
      status: 'error',
      errorReason: 'unsupported_format',
      studentName,
      studentEmail,
      studentId,
      title: `${studentName}の提出物 - エラー`,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        originalFileUrl: f.url,
        mimeType: f.mimeType,
      })),
      images: [],
      submittedAt,
      isLate,
      likeCount: 0,
      labels: [],
      comments: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      importedBy: userEmail,
    };

    await db.collection('artworks').add(artworkData);
    return { success: true, artworkId: artworkData.id };
  } else {
    // 処理エラーの場合は、エラー作品を生成せず、エラーログのみ記録
    throw new Error('Processing error occurred');
  }
}
```

---

## 3. 実装概要

### 3.1. 主要な実装ファイル

**バックエンド**:
- `functions/src/importController.ts`: 再インポートスキップ判定、上書き処理
- `functions/src/fileProcessor.ts`: ドキュメント上書き処理
- `functions/src/processFileTaskHttp.ts`: タスクペイロード拡張

**フロントエンド**:
- `src/types/index.ts`: `Artwork.status`, `Artwork.errorReason`, `ImportJob.overwrittenCount`追加
- `src/lib/artworkUtils.ts`: `isSubmitted()`, `isNotSubmitted()`, `isError()`ユーティリティ関数
- `src/app/gallery/[id]/page.tsx`: 未提出/エラーフィルター、学籍番号順ソート
- `src/components/ArtworkModal.tsx`: 未提出/エラー表示

### 3.2. データモデル

**Artwork型の拡張**:
```typescript
export interface Artwork {
  id: string;
  title: string;
  galleryId: string;

  // 新規追加フィールド
  status: 'submitted' | 'not_submitted' | 'error';
  errorReason?: 'unsupported_format' | 'processing_error';

  files: SubmittedFile[];
  images: ArtworkImage[];

  studentName: string;
  studentEmail: string;
  studentId?: string;

  submittedAt: Date | null;  // 未提出の場合はnull
  isLate: boolean;

  classroomId: string;
  assignmentId: string;

  likeCount: number;
  labels: LabelType[];
  comments: Comment[];
  annotations?: ArtworkAnnotation[];

  createdAt: Date;
  importedBy: string;
}
```

**ImportJob型の拡張**:
```typescript
export interface ImportJob {
  // 既存フィールド...
  overwrittenCount?: number; // ✅ 2025-11-20追加
}
```

### 3.3. フロントエンド主要機能

**1. ユーティリティ関数（src/lib/artworkUtils.ts）**:
- `isSubmitted()`, `isNotSubmitted()`, `isError()`: status判定
- `extractStudentIdFromEmail()`: メールアドレスから学籍番号抽出
- `sortBySubmissionDate()`: 提出日時ソート（未提出は末尾）

**2. グレープレースホルダー表示**:
- 未提出: グレー背景 + "未提出"テキスト
- エラー: グレー背景 + "エラー"テキスト
- いいね・コメント機能は非表示

**3. ソートロジック**:
- 提出日時順: submitted作品のみソート、not_submitted/error作品は末尾に学籍番号順
- 学籍番号順: 全作品を学籍番号で混在ソート

**4. フィルタリング**:
- 「未提出/エラーを非表示」チェックボックス
- 非表示件数の表示

**5. モーダル表示**:
- 未提出: 学生情報のみ表示、フィードバック機能なし
- エラー: エラー理由、提出ファイル一覧、対応形式説明

---

## 4. バックエンド実装概要

### 4.1. 再インポートスキップ・上書きロジック

**実装ファイル**: `functions/src/importController.ts`

**処理フロー**:
1. 既存作品を `Map<normalizedEmail, ExistingArtworkInfo>` で管理
2. 各提出物について:
   - `status === 'submitted'` → スキップ
   - `status === 'not_submitted' || 'error'` → 既存IDを保持して上書き
   - 既存作品なし → 新規作成

**重要な変更**:
- `existingArtworkId` をタスクペイロードに追加
- `overwriteCount` を `ImportJob` に記録

### 4.2. 未提出学生プレースホルダー生成

**実装ファイル**: `functions/src/importController.ts`

**処理フロー**:
1. Google Classroom APIから割り当て済み学生を取得
2. 提出済み学生リストと比較
3. 差分（未提出学生）にプレースホルダー作品を生成:
   - `status: 'not_submitted'`
   - `images: []`, `files: []`
   - `submittedAt: null`

### 4.3. エラー作品生成

**実装ファイル**: `functions/src/importController.ts`

**処理フロー**:
1. 提出ファイルが全てサポート外形式の場合:
   - `status: 'error'`
   - `errorReason: 'unsupported_format'`
   - エラー作品を生成

2. 処理エラー（メモリ不足等）の場合:
   - エラー作品は生成しない
   - 再インポートで再試行可能

### 4.4. ドキュメント上書き処理

**実装ファイル**: `functions/src/fileProcessor.ts`

**処理フロー**:
1. `existingArtworkId` があれば既存ドキュメント参照を取得
2. `set({ merge: true })` で上書き
3. 新規作品の場合のみ `artworkCount` を増加

**重要な実装**:
```typescript
const artworkRef = existingArtworkId
  ? db.collection('artworks').doc(existingArtworkId)
  : db.collection('artworks').doc();

await artworkRef.set(artworkData, { merge: true });

if (!existingArtworkId) {
  await db.collection('galleries').doc(galleryId).update({
    artworkCount: FieldValue.increment(1),
  });
}
```

---

## 5. FAQ

### Q1: 既存の作品に `status` フィールドがない場合、どうなりますか？

A: フロントエンド・バックエンドともに、`status ?? 'submitted'` でデフォルト値を設定するため、既存作品は全て「提出済み」として扱われます。

### Q2: 未提出の学生が後から提出した場合、どうなりますか？

A: ✅ **2025-11-20実装**: 再インポート時に、`not_submitted` 作品は自動的に上書きされます。Classroomで正常に提出されていれば、プレースホルダーが正常な作品（`status: 'submitted'`）に更新されます。手動削除は不要です。

### Q3: エラー作品に対して、いいねやコメントはできますか？

A: 現在の仕様では、エラー作品にはいいね・コメント・ラベル機能を表示しません。将来的な拡張で、全作品に対してフィードバック可能にする予定です。

### Q4: 処理エラー（メモリ不足等）で失敗した作品は、エラー作品として扱われますか？

A: いいえ。処理エラーの場合は作品自体が生成されず、再インポートで再試行可能です。エラー作品として扱うのは、サポートされていないファイル形式のみです。

### Q5: Google Classroom APIのスコープは追加で必要ですか？

A: 現在の `studentsubmissions.students.readonly` スコープで、割り当て済み学生リストも取得可能です。追加のスコープは不要です。

---

## 6. 関連ドキュメント

- [実装詳細](../implementation/import-implementation.md) - フロントエンド・バックエンドの詳細実装
- [データマイグレーション](../implementation/data-migration.md) - Artwork.status マイグレーション
- [テストシナリオ](../TESTING.md) - 再インポート機能のテスト
- [背景インポート機能](BACKGROUND_IMPORT.md) - インポート処理フロー全体
- [要件定義](../requirements.md#32-データインポート機能-f-02) - F-02全体の要件

---

**ドキュメントバージョン**: 1.0
**最終更新日**: 2025-11-20
**作成者**: Claude Code
**ステータス**: ✅ 実装完了・本番環境デプロイ済み
