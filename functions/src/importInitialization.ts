import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { getSafeErrorCode } from './httpSecurity';

export const INITIALIZATION_FUNCTION = 'locations/asia-northeast1/functions/initializeClassroomImport';
export const INITIALIZATION_TIMEOUT_SECONDS = 1800;

export type ImportInput = {
  galleryId: string;
  classroomId: string;
  assignmentId: string;
  userEmail: string;
};

export type InitializationTask = { importJobId: string; accessToken: string };
type Enqueue = (task: InitializationTask) => Promise<void>;

const enqueueInitialization: Enqueue = task => getFunctions()
  .taskQueue<InitializationTask>(INITIALIZATION_FUNCTION)
  .enqueue(task, { id: task.importJobId, dispatchDeadlineSeconds: INITIALIZATION_TIMEOUT_SECONDS });

// Only persist non-secret job metadata. The OAuth token travels in the private
// Cloud Task payload and is never returned by the status API or logged.
export async function startImport(
  input: ImportInput,
  accessToken: string,
  db: Firestore = getFirestore(),
  enqueue: Enqueue = enqueueInitialization,
): Promise<string> {
  const ref = db.collection('importJobs').doc();
  await ref.set({
    id: ref.id,
    galleryId: input.galleryId,
    classroomId: input.classroomId,
    assignmentId: input.assignmentId,
    createdBy: input.userEmail,
    status: 'pending',
    progress: 0,
    totalFiles: 0,
    processedFiles: 0,
    errorFiles: [],
    totalSubmissions: 0,
    completedSubmissions: 0,
    succeededSubmissions: 0,
    failedSubmissions: 0,
    failedFileCount: 0,
    initializationComplete: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    await enqueue({ importJobId: ref.id, accessToken });
  } catch (error) {
    // An ambiguous enqueue failure may race with an already running worker.
    // Do not overwrite a job which the worker has claimed or finished.
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.data()?.status === 'pending') {
        tx.update(ref, { status: 'error', errorMessage: 'initialization_enqueue_failed',
          completedAt: FieldValue.serverTimestamp() });
      }
    });
    throw error;
  }
  return ref.id;
}

export async function runImportInitialization(
  task: InitializationTask,
  initialize: (jobId: string, input: ImportInput, accessToken: string) => Promise<void>,
  db: Firestore = getFirestore(),
): Promise<void> {
  if (!task || typeof task.importJobId !== 'string' || !task.importJobId
    || task.importJobId.includes('/') || typeof task.accessToken !== 'string' || !task.accessToken) {
    throw new Error('invalid_initialization_task');
  }
  const ref = db.collection('importJobs').doc(task.importJobId);
  // Initialization can create placeholders and enqueue many submissions. It
  // must never be replayed after partial execution or simultaneous delivery.
  const input = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const job = snap.data();
    if (!job || job.status !== 'pending') return null;
    tx.update(ref, { status: 'processing', initializationStartedAt: FieldValue.serverTimestamp() });
    return { galleryId: job.galleryId, classroomId: job.classroomId,
      assignmentId: job.assignmentId, userEmail: job.createdBy } as ImportInput;
  });
  if (!input) return;

  const startedAt = Date.now();
  try {
    await initialize(ref.id, input, task.accessToken);
    console.log('Import initialization finished', { importJobId: ref.id, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error('Import initialization failed', { importJobId: ref.id,
      errorCode: getSafeErrorCode(error), durationMs: Date.now() - startedAt });
    await ref.update({ status: 'error', errorMessage: 'initialization_failed',
      completedAt: FieldValue.serverTimestamp() });
    throw new Error('initialization_failed');
  }
}
