const test = require('node:test');
const assert = require('node:assert/strict');
const {
  studentKey, submissionDocumentId, submissionTaskName, isAlreadyExistsTaskError,
  submissionOutcome, createSubmissionRecord, claimSubmission, releaseSubmissionClaim, finishSubmission,
} = require('../lib/importState');
const { checkImportCompletion } = require('../lib/importController');
const { cleanupGeneratedObjects, processMultipleFiles } = require('../lib/fileProcessor');
const sharp = require('sharp');
const firestoreModule = require('firebase-admin/firestore');
const storageModule = require('firebase-admin/storage');

function fakeDb() {
  const docs = new Map();
  let nextId = 0;
  const transform = (value, previous) => {
    if (value?.constructor?.name === 'NumericIncrementTransform') return (previous || 0) + value.operand;
    if (value?.constructor?.name === 'ServerTimestampTransform') return new Date();
    if (value?.constructor?.name === 'DeleteTransform') return undefined;
    return value;
  };
  const put = (path, patch, merge) => {
    const result = merge ? { ...docs.get(path) } : {};
    for (const [key, value] of Object.entries(patch)) {
      const next = transform(value, result[key]);
      if (next === undefined) delete result[key]; else result[key] = next;
    }
    docs.set(path, result);
  };
  const ref = path => ({
    path,
    id: path.split('/').at(-1),
    collection: name => collection(`${path}/${name}`),
    create: async data => { if (docs.has(path)) throw new Error('exists'); put(path, data, false); },
    set: async (data, options) => put(path, data, options?.merge),
    update: async data => { if (!docs.has(path)) throw new Error('missing'); put(path, data, true); },
    get: async () => snapshot(path),
  });
  const collection = path => ({ doc: id => ref(`${path}/${id || `auto-${++nextId}`}`) });
  const snapshot = path => ({ exists: docs.has(path), data: () => docs.get(path), get: key => docs.get(path)?.[key] });
  return {
    docs,
    collection,
    runTransaction: async fn => {
      const writes = [];
      const tx = {
        get: async target => snapshot(target.path),
        update: (target, data) => writes.push(() => put(target.path, data, true)),
        set: (target, data, options) => writes.push(() => put(target.path, data, options?.merge)),
      };
      const result = await fn(tx);
      writes.forEach(write => write());
      return result;
    },
  };
}

test('identity never uses an empty key and remains stable without a profile', () => {
  assert.equal(studentKey(' A@Example.edu '), 'email:a@example.edu');
  assert.equal(studentKey('', 'user-1', 'submission-1'), 'user:user-1');
  assert.equal(studentKey('', '', 'submission-2'), 'submission:submission-2');
  assert.notEqual(studentKey('', 'user-1'), studentKey('', 'user-2'));
  assert.throws(() => studentKey('', '', ''), /submission_identity_missing/);
  assert.match(submissionDocumentId('user:user-1'), /^[a-f0-9]{64}$/);
});

test('task names are deterministic and ALREADY_EXISTS is not an enqueue failure', () => {
  const parent = 'projects/p/locations/l/queues/q';
  assert.equal(submissionTaskName(parent, 'job', 'user:1'), submissionTaskName(parent, 'job', 'user:1'));
  assert.notEqual(submissionTaskName(parent, 'job', 'user:1'), submissionTaskName(parent, 'job', 'user:2'));
  assert.match(submissionTaskName(parent, 'job', 'user:1'), /\/tasks\/i-[a-f0-9]{64}$/);
  assert.equal(isAlreadyExistsTaskError({ code: 6 }), true);
  assert.equal(isAlreadyExistsTaskError({ code: 7 }), false);
});

test('multiple files and partial failure still produce one terminal submission', async () => {
  assert.equal(submissionOutcome(2), 'succeeded');
  assert.equal(submissionOutcome(0), 'failed');
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    initializationComplete: true, totalSubmissions: 1, completedSubmissions: 0,
    succeededSubmissions: 0, failedSubmissions: 0, failedFileCount: 0, errorFiles: ['old-error'] });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  await createSubmissionRecord('j', 'user:u', 'u', 'art-1', 'g', undefined, db);
  const claim = await claimSubmission('j', 'user:u', db);
  assert.equal(claim.kind, 'claimed');
  assert.equal((await claimSubmission('j', 'user:u', db)).kind, 'busy');
  const input = { jobId: 'j', key: 'user:u', state: 'succeeded', failedFileCount: 1,
    artwork: { id: 'art-1', images: [{}, {}] }, attemptId: claim.attemptId };
  assert.equal(await finishSubmission(input, db), true);
  assert.equal(await finishSubmission(input, db), false);
  assert.equal((await claimSubmission('j', 'user:u', db)).kind, 'terminal');
  const job = db.docs.get('importJobs/j');
  assert.equal(job.completedSubmissions, 1);
  assert.equal(job.succeededSubmissions, 1);
  assert.equal(job.failedFileCount, 1);
  assert.equal(db.docs.get('galleries/g').artworkCount, 1);
  assert.equal(db.docs.get('artworks/art-1').images.length, 2);
  await checkImportCompletion('j', db);
  assert.equal(db.docs.get('importJobs/j').status, 'completed');
});

test('all queue failures can complete a job without creating artworks', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    initializationComplete: true, totalSubmissions: 2, completedSubmissions: 0,
    succeededSubmissions: 0, failedSubmissions: 0, failedFileCount: 0 });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  for (const key of ['user:a', 'user:b']) {
    await createSubmissionRecord('j', key, key, key, 'g', undefined, db);
    assert.equal(await finishSubmission({ jobId: 'j', key, state: 'failed',
      failedFileCount: 2, failureCode: 'task_enqueue_failed' }, db), true);
  }
  await checkImportCompletion('j', db);
  assert.equal(db.docs.get('importJobs/j').status, 'completed');
  assert.equal(db.docs.get('importJobs/j').failedSubmissions, 2);
  assert.equal(db.docs.get('importJobs/j').completedSubmissions, 2);
  assert.equal(db.docs.get('galleries/g').artworkCount, 0);
});

test('all file failures terminate once and an existing artwork does not increase gallery count', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    initializationComplete: false, totalSubmissions: 1, completedSubmissions: 0,
    succeededSubmissions: 0, failedSubmissions: 0, failedFileCount: 0, errorFiles: ['a', 'b'] });
  await db.collection('galleries').doc('g').set({ artworkCount: 1 });
  await db.collection('artworks').doc('existing').set({ id: 'existing', status: 'not_submitted', likeCount: 3 });
  await createSubmissionRecord('j', 'user:u', 'u', 'existing', 'g', 'existing', db);
  const claim = await claimSubmission('j', 'user:u', db);
  const input = { jobId: 'j', key: 'user:u', state: 'failed', failedFileCount: 2,
    failureCode: 'no_images_generated', artwork: { id: 'existing', status: 'error', images: [] },
    attemptId: claim.attemptId };
  assert.equal(await finishSubmission(input, db), true);
  assert.equal(await finishSubmission(input, db), false);
  await checkImportCompletion('j', db);
  assert.equal(db.docs.get('importJobs/j').status, 'processing');
  await db.collection('importJobs').doc('j').update({ initializationComplete: true });
  await checkImportCompletion('j', db);
  assert.equal(db.docs.get('importJobs/j').status, 'completed');
  assert.equal(db.docs.get('importJobs/j').completedSubmissions, 1);
  assert.equal(db.docs.get('importJobs/j').failedSubmissions, 1);
  assert.equal(db.docs.get('importJobs/j').failedFileCount, 2);
  assert.equal(db.docs.get('galleries/g').artworkCount, 1);
  assert.equal(db.docs.get('artworks/existing').likeCount, 3);
});

test('legacy jobs remain readable without new counters', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('old').set({ galleryId: 'g', status: 'processing',
    totalFiles: 1, processedFiles: 1, errorFiles: ['historical-error'] });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  await checkImportCompletion('old', db);
  assert.equal(db.docs.get('importJobs/old').status, 'completed');
});

test('new jobs never add errorFiles length to submission progress', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    initializationComplete: true, totalSubmissions: 2, completedSubmissions: 0,
    processedFiles: 1, errorFiles: ['a', 'b', 'c'] });
  await checkImportCompletion('j', db);
  assert.equal(db.docs.get('importJobs/j').status, 'processing');
  assert.equal(db.docs.get('importJobs/j').progress, 10);
});

test('a failed write can release only its own processing claim for retry', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ status: 'processing' });
  await createSubmissionRecord('j', 'user:u', 'u', 'a', 'g', undefined, db);
  const first = await claimSubmission('j', 'user:u', db);
  await releaseSubmissionClaim('j', 'user:u', 'different-attempt', db);
  assert.equal((await claimSubmission('j', 'user:u', db)).kind, 'busy');
  await releaseSubmissionClaim('j', 'user:u', first.attemptId, db);
  assert.equal((await claimSubmission('j', 'user:u', db)).kind, 'claimed');
});

test('compensation touches only generated paths and does not mask cleanup failure', async () => {
  const deleted = [];
  const failed = [];
  await cleanupGeneratedObjects(['new-image', 'new-thumbnail'], async path => {
    deleted.push(path);
    if (path === 'new-image') throw new Error('delete failed');
  }, (path, error) => failed.push([path, error.message]));
  assert.deepEqual(deleted, ['new-image', 'new-thumbnail']);
  assert.deepEqual(failed, [['new-image', 'delete failed']]);
});

async function withProcessorDoubles(db, failThumbnailSave, run) {
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const objects = new Map([['unprocessed/j/input.png', image]]);
  const deleted = [];
  const bucket = { file: path => ({
    save: async buffer => {
      if (failThumbnailSave && path.includes('/thumbnails/')) throw new Error('storage_save_failed');
      objects.set(path, buffer);
    },
    exists: async () => [objects.has(path)],
    download: async () => [objects.get(path)],
    delete: async () => { deleted.push(path); objects.delete(path); },
  }) };
  const originalFirestore = firestoreModule.getFirestore;
  const originalStorage = storageModule.getStorage;
  firestoreModule.getFirestore = () => db;
  storageModule.getStorage = () => ({ bucket: () => bucket });
  try { await run({ objects, deleted }); }
  finally {
    firestoreModule.getFirestore = originalFirestore;
    storageModule.getStorage = originalStorage;
  }
}

function processorArgs() {
  return ['j', 'Student', 'student@example.edu', 'student', new Date().toISOString(), false,
    [{ id: 'file-1', name: 'input.png', type: 'image', mimeType: 'image/png',
      originalFileUrl: 'https://drive.google.com/example', tempFilePath: 'unprocessed/j/input.png' }],
    'g', 'course', 'assignment', undefined, 'email:student@example.edu', 'art-1', 'classroom-user', 'submission-1', 0];
}

test('running the same submission processor twice creates one artwork and one count', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    totalSubmissions: 1, completedSubmissions: 0, succeededSubmissions: 0,
    failedSubmissions: 0, failedFileCount: 0 });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  await createSubmissionRecord('j', 'email:student@example.edu', 'student@example.edu', 'art-1', 'g', undefined, db);
  await withProcessorDoubles(db, false, async () => {
    await processMultipleFiles(...processorArgs());
    await processMultipleFiles(...processorArgs());
  });
  assert.equal(db.docs.get('importJobs/j').completedSubmissions, 1);
  assert.equal(db.docs.get('galleries/g').artworkCount, 1);
  assert.equal(db.docs.get('artworks/art-1').images.length, 1);
});

test('one good image and one missing file count as one succeeded submission with a warning', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    totalSubmissions: 1, completedSubmissions: 0, succeededSubmissions: 0,
    failedSubmissions: 0, failedFileCount: 0 });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  await createSubmissionRecord('j', 'email:student@example.edu', 'student@example.edu', 'art-1', 'g', undefined, db);
  await withProcessorDoubles(db, false, async () => {
    const args = processorArgs();
    args[6].push({ ...args[6][0], id: 'missing', name: 'missing.png', tempFilePath: 'unprocessed/j/missing.png' });
    await processMultipleFiles(...args);
  });
  assert.equal(db.docs.get('importJobs/j').completedSubmissions, 1);
  assert.equal(db.docs.get('importJobs/j').succeededSubmissions, 1);
  assert.equal(db.docs.get('importJobs/j').failedFileCount, 1);
  assert.equal(db.docs.get('artworks/art-1').images.length, 1);
  const record = db.docs.get(`importJobs/j/submissions/${submissionDocumentId('email:student@example.edu')}`);
  assert.equal(record.failureCode, 'partial_file_failure');
});

test('reimport reuses an existing error artwork without incrementing the gallery', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    totalSubmissions: 1, completedSubmissions: 0, succeededSubmissions: 0,
    failedSubmissions: 0, failedFileCount: 0 });
  await db.collection('galleries').doc('g').set({ artworkCount: 1 });
  await db.collection('artworks').doc('art-1').set({ id: 'art-1', status: 'error',
    errorReason: 'old_error', likeCount: 2, createdAt: 'original' });
  await createSubmissionRecord('j', 'email:student@example.edu', 'student@example.edu', 'art-1', 'g', 'art-1', db);
  await withProcessorDoubles(db, false, async () => {
    const args = processorArgs();
    args[10] = 'art-1';
    await processMultipleFiles(...args);
  });
  const artwork = db.docs.get('artworks/art-1');
  assert.equal(artwork.status, 'submitted');
  assert.equal(artwork.errorReason, undefined);
  assert.equal(artwork.likeCount, 2);
  assert.equal(artwork.createdAt, 'original');
  assert.equal(db.docs.get('galleries/g').artworkCount, 1);
});

test('an image upload failure compensates only newly generated objects', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    totalSubmissions: 1, completedSubmissions: 0, succeededSubmissions: 0,
    failedSubmissions: 0, failedFileCount: 0 });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  await createSubmissionRecord('j', 'email:student@example.edu', 'student@example.edu', 'art-1', 'g', undefined, db);
  await withProcessorDoubles(db, true, async ({ objects, deleted }) => {
    objects.set('galleries/g/images/pre-existing.webp', Buffer.from('old'));
    await processMultipleFiles(...processorArgs());
    assert.equal(objects.has('galleries/g/images/pre-existing.webp'), true);
    assert.equal([...objects.keys()].filter(path => path.includes('galleries/g/') && !path.includes('pre-existing')).length, 0);
    assert.equal(deleted.some(path => path.includes('/images/')), true);
    assert.equal(deleted.some(path => path.includes('pre-existing')), false);
  });
  assert.equal(db.docs.get('importJobs/j').completedSubmissions, 1);
  assert.equal(db.docs.get('importJobs/j').failedSubmissions, 1);
  assert.equal(db.docs.get('galleries/g').artworkCount, 1);
});

test('a Firestore artwork write failure compensates generated images and terminates the submission', async () => {
  const db = fakeDb();
  await db.collection('importJobs').doc('j').set({ galleryId: 'g', status: 'processing',
    totalSubmissions: 1, completedSubmissions: 0, succeededSubmissions: 0,
    failedSubmissions: 0, failedFileCount: 0 });
  await db.collection('galleries').doc('g').set({ artworkCount: 0 });
  await createSubmissionRecord('j', 'email:student@example.edu', 'student@example.edu', 'art-1', 'g', undefined, db);
  const originalRunTransaction = db.runTransaction;
  db.runTransaction = fn => originalRunTransaction(tx => fn({ ...tx,
    set: (target, data, options) => {
      if (target.path === 'artworks/art-1') throw new Error('firestore_write_failed');
      tx.set(target, data, options);
    },
  }));
  await withProcessorDoubles(db, false, async ({ objects, deleted }) => {
    await processMultipleFiles(...processorArgs());
    assert.equal([...objects.keys()].some(path => path.startsWith('galleries/g/')), false);
    assert.equal(deleted.some(path => path.includes('/images/')), true);
    assert.equal(deleted.some(path => path.includes('/thumbnails/')), true);
  });
  assert.equal(db.docs.has('artworks/art-1'), false);
  assert.equal(db.docs.get('galleries/g').artworkCount, 0);
  assert.equal(db.docs.get('importJobs/j').completedSubmissions, 1);
  assert.equal(db.docs.get('importJobs/j').failedSubmissions, 1);
});
