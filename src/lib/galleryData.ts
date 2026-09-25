import type { Gallery } from '@/types';

export async function fetchGalleries(): Promise<Gallery[]> {
  const [{ collection, getDocs, orderBy, query }, { db }] = await Promise.all([
    import('firebase/firestore'), import('@/lib/firebase'),
  ]);
  const snapshot = await getDocs(query(collection(db, 'galleries'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      courseName: data.courseName || 'コース名未設定',
      assignmentName: data.assignmentName || '課題名未設定',
      courseId: data.courseId || '',
      assignmentId: data.assignmentId || '',
      classroomId: data.classroomId || data.courseId || '',
      artworkCount: data.artworkCount || 0,
      createdBy: data.createdBy || '',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
    };
  });
}

export async function fetchArchivedCourseIds(): Promise<Set<string>> {
  const [{ collection, getDocs }, { db }] = await Promise.all([
    import('firebase/firestore'), import('@/lib/firebase'),
  ]);
  const snapshot = await getDocs(collection(db, 'archivedCourses'));
  return new Set(snapshot.docs.map((item) => item.id));
}
