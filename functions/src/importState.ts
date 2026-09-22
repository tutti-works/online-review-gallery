import { createHash, randomUUID } from 'node:crypto';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';

export type SubmissionState = 'queued' | 'processing' | 'succeeded' | 'failed';
const terminal = (state: unknown) => state === 'succeeded' || state === 'failed';
const LEASE_MS = 35 * 60 * 1000;

export function studentKey(email?: string | null, userId?: string | null, submissionId?: string | null): string {
  const normalized = email?.trim().toLowerCase();
  if (normalized) return `email:${normalized}`;
  if (userId?.trim()) return `user:${userId.trim()}`;
  if (submissionId?.trim()) return `submission:${submissionId.trim()}`;
  throw new Error('submission_identity_missing');
}

export function submissionDocumentId(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Cloud Tasks permits an explicit task resource name. A hash avoids unsafe IDs and
// sequential-prefix lookup hotspots; the job ID keeps separate imports distinct.
export function submissionTaskName(parent: string, jobId: string, key: string): string {
  return `${parent}/tasks/i-${createHash('sha256').update(`${jobId}\0${key}`).digest('hex')}`;
}

export function isAlreadyExistsTaskError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code: unknown }).code;
  return code === 6 || code === '6' || code === 'ALREADY_EXISTS';
}

export function submissionOutcome(imageCount: number): 'succeeded' | 'failed' {
  return imageCount > 0 ? 'succeeded' : 'failed';
}

export async function createSubmissionRecord(
  jobId: string,
  key: string,
  studentIdentifier: string,
  artworkId: string,
  galleryId: string,
  existingArtworkId?: string,
  db: Firestore = getFirestore(),
): Promise<void> {
  const ref = db.collection('importJobs').doc(jobId).collection('submissions').doc(submissionDocumentId(key));
  await ref.create({
    key,
    studentIdentifier,
    artworkId,
    galleryId,
    existingArtworkId: existingArtworkId || null,
    state: 'queued',
    failedFileCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export type ClaimResult = { kind: 'claimed'; attemptId: string; artworkId: string; existingArtworkId?: string }
  | { kind: 'terminal' } | { kind: 'busy' };

export async function claimSubmission(jobId: string, key: string, db: Firestore = getFirestore()): Promise<ClaimResult> {
  const jobRef = db.collection('importJobs').doc(jobId);
  const ref = jobRef.collection('submissions').doc(submissionDocumentId(key));
  return db.runTransaction(async tx => {
    const [snap, jobSnap] = await Promise.all([tx.get(ref), tx.get(jobRef)]);
    if (!snap.exists || snap.get('key') !== key) throw new Error('submission_record_missing');
    if (!jobSnap.exists) throw new Error('import_job_missing');
    if (jobSnap.get('status') === 'completed' || jobSnap.get('status') === 'error') return { kind: 'terminal' };
    const state = snap.get('state');
    if (terminal(state)) return { kind: 'terminal' };
    const leaseUntil = snap.get('leaseUntil');
    if (state === 'processing' && typeof leaseUntil === 'number' && leaseUntil > Date.now()) {
      return { kind: 'busy' };
    }
    const attemptId = randomUUID();
    tx.update(ref, { state: 'processing', attemptId, leaseUntil: Date.now() + LEASE_MS, updatedAt: FieldValue.serverTimestamp() });
    return { kind: 'claimed', attemptId, artworkId: snap.get('artworkId'), existingArtworkId: snap.get('existingArtworkId') || undefined };
  });
}

export async function releaseSubmissionClaim(jobId: string, key: string, attemptId: string, db: Firestore = getFirestore()): Promise<void> {
  const ref = db.collection('importJobs').doc(jobId).collection('submissions').doc(submissionDocumentId(key));
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('state') === 'processing' && snap.get('attemptId') === attemptId) {
      tx.update(ref, { state: 'queued', attemptId: FieldValue.delete(),
        leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

export interface FinishSubmission {
  jobId: string;
  key: string;
  state: 'succeeded' | 'failed';
  failedFileCount: number;
  failureCode?: string;
  artwork?: Record<string, unknown>;
  attemptId?: string;
}

export async function finishSubmission(input: FinishSubmission, db: Firestore = getFirestore()): Promise<boolean> {
  const jobRef = db.collection('importJobs').doc(input.jobId);
  const ref = jobRef.collection('submissions').doc(submissionDocumentId(input.key));
  return db.runTransaction(async tx => {
    const [snap, jobSnap] = await Promise.all([tx.get(ref), tx.get(jobRef)]);
    if (!snap.exists || snap.get('key') !== input.key || !jobSnap.exists) throw new Error('submission_record_missing');
    if (jobSnap.get('status') === 'error' || jobSnap.get('status') === 'completed') return false;
    if (terminal(snap.get('state'))) return false;
    if (input.attemptId && snap.get('attemptId') !== input.attemptId) throw new Error('submission_lease_lost');
    if (!input.attemptId && snap.get('state') !== 'queued') throw new Error('submission_already_processing');
    const galleryRef = db.collection('galleries').doc(snap.get('galleryId'));
    const artworkRef = db.collection('artworks').doc(snap.get('artworkId'));
    if (input.artwork) {
      tx.set(artworkRef, input.artwork, { merge: Boolean(snap.get('existingArtworkId')) });
      tx.update(galleryRef, {
        updatedAt: FieldValue.serverTimestamp(),
        ...(!snap.get('existingArtworkId') ? { artworkCount: FieldValue.increment(1) } : {}),
      });
    }
    tx.update(ref, {
      state: input.state,
      failedFileCount: input.failedFileCount,
      failureCode: input.failureCode || null,
      attemptId: FieldValue.delete(),
      leaseUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(jobRef, {
      completedSubmissions: FieldValue.increment(1),
      [input.state === 'succeeded' ? 'succeededSubmissions' : 'failedSubmissions']: FieldValue.increment(1),
      failedFileCount: FieldValue.increment(input.failedFileCount),
    });
    return true;
  });
}
