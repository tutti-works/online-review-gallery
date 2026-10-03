const test = require('node:test');
const assert = require('node:assert/strict');
const { startImport, runImportInitialization, INITIALIZATION_FUNCTION,
  INITIALIZATION_TIMEOUT_SECONDS } = require('../lib/importInitialization');
const { createStudentProfileResolver } = require('../lib/studentProfiles');

function fakeDb() {
  const docs = new Map();
  let nextId = 0;
  let transaction = Promise.resolve();
  const put = (path, patch, merge = false) => docs.set(path, {
    ...(merge ? docs.get(path) : {}), ...patch,
  });
  const ref = path => ({
    path, id: path.split('/').at(-1),
    set: async data => put(path, data),
    update: async data => put(path, data, true),
  });
  return {
    docs,
    collection: name => ({ doc: id => ref(`${name}/${id || `job-${++nextId}`}`) }),
    runTransaction: fn => {
      const next = transaction.then(() => fn({
        get: async target => ({ data: () => docs.get(target.path) }),
        update: (target, data) => put(target.path, data, true),
      }));
      transaction = next.catch(() => {});
      return next;
    },
  };
}

const input = { galleryId: 'gallery', classroomId: 'course', assignmentId: 'assignment',
  userEmail: 'admin@example.edu' };
const defer = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('Cloud Run image includes every local dependency of its copied entrypoint', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
  const copied = new Set([...dockerfile.matchAll(/^COPY lib\/(\w+\.js) /gm)].map(match => match[1]));
  const pending = ['cloudrun.js'];
  const visited = new Set();
  while (pending.length) {
    const module = pending.pop();
    if (visited.has(module)) continue;
    visited.add(module);
    assert.ok(copied.has(module), `Docker image is missing ${module}`);
    const source = fs.readFileSync(path.join(__dirname, '../lib', module), 'utf8');
    for (const match of source.matchAll(/require\(["']\.\/([^"']+)["']\)/g)) {
      pending.push(`${match[1]}.js`);
    }
  }
});

test('start returns a trackable job even while background initialization is blocked', async () => {
  const db = fakeDb();
  const blockedDownload = defer();
  const entered = defer();
  let worker;
  let finished = false;
  const jobId = await startImport(input, 'private-token', db, async task => {
    worker = runImportInitialization(task, async (id, job, token) => {
      assert.equal(id, task.importJobId);
      assert.deepEqual(job, input);
      assert.equal(token, 'private-token');
      entered.resolve();
      await blockedDownload.promise;
      finished = true;
    }, db);
    await entered.promise;
  });
  try {
    assert.equal(jobId, 'job-1');
    assert.equal(finished, false);
    assert.equal(db.docs.get(`importJobs/${jobId}`).status, 'processing');
    assert.equal(db.docs.size, 1);
    assert.doesNotMatch(JSON.stringify([...db.docs.values()]), /private-token|accessToken/);
  } finally {
    blockedDownload.resolve();
    await worker;
  }
});

test('start awaits enqueue acknowledgement before claiming success', async () => {
  const db = fakeDb();
  const acknowledgement = defer();
  const entered = defer();
  let responded = false;
  const start = startImport(input, 'token', db, async () => {
    entered.resolve();
    await acknowledgement.promise;
  }).then(id => { responded = true; return id; });
  await entered.promise;
  assert.equal(responded, false);
  acknowledgement.resolve();
  assert.equal(await start, 'job-1');
});

test('queue failure marks the registered job error without storing credential details', async () => {
  const db = fakeDb();
  await assert.rejects(startImport(input, 'secret', db, async () => {
    throw new Error('upstream error containing secret');
  }));
  const job = db.docs.get('importJobs/job-1');
  assert.equal(job.status, 'error');
  assert.equal(job.errorMessage, 'initialization_enqueue_failed');
  assert.doesNotMatch(JSON.stringify(job), /secret/);
});

test('ambiguous queue failure cannot overwrite a worker that already claimed the job', async () => {
  const db = fakeDb();
  await assert.rejects(startImport(input, 'token', db, async task => {
    await runImportInitialization(task, async () => {}, db);
    throw new Error('acknowledgement lost');
  }));
  assert.equal(db.docs.get('importJobs/job-1').status, 'processing');
});

test('concurrent and repeated deliveries run initialization only once', async () => {
  const db = fakeDb();
  let task;
  await startImport(input, 'token', db, async payload => { task = payload; });
  const gate = defer();
  const entered = defer();
  let calls = 0;
  const initialize = async () => { calls++; entered.resolve(); await gate.promise; };
  const worker = runImportInitialization(task, initialize, db);
  await entered.promise;
  try {
    await runImportInitialization(task, initialize, db);
    assert.equal(calls, 1);
  } finally {
    gate.resolve();
    await worker;
  }
  await runImportInitialization(task, initialize, db);
  assert.equal(calls, 1);
});

test('initialization failure is terminal and re-delivery does not replay partial work', async () => {
  const db = fakeDb();
  let task;
  let calls = 0;
  await startImport(input, 'private-token', db, async payload => { task = payload; });
  const initialize = async () => { calls++; throw new Error('OAuth details private-token'); };
  await assert.rejects(runImportInitialization(task, initialize, db), /initialization_failed/);
  const job = db.docs.get('importJobs/job-1');
  assert.equal(job.status, 'error');
  assert.equal(job.errorMessage, 'initialization_failed');
  assert.doesNotMatch(JSON.stringify(job), /private-token|OAuth details/);
  await runImportInitialization(task, initialize, db);
  assert.equal(calls, 1);
});

test('invalid and missing jobs cannot execute initialization', async () => {
  const db = fakeDb();
  let called = false;
  const initialize = async () => { called = true; };
  await assert.rejects(runImportInitialization({ importJobId: '../other', accessToken: 't' }, initialize, db));
  await assert.rejects(runImportInitialization({ importJobId: 'j', accessToken: '' }, initialize, db));
  await runImportInitialization({ importJobId: 'missing', accessToken: 't' }, initialize, db);
  assert.equal(called, false);
});

test('assigned roster supplies profiles and repeated fallback lookups share one request', async () => {
  const calls = [];
  const classroom = { userProfiles: { get: async ({ userId }) => {
    calls.push(userId);
    return { data: { id: userId, emailAddress: 'fallback@example.edu' } };
  } } };
  const rosterProfile = { id: 'profile-id', emailAddress: 'roster@example.edu', name: { fullName: 'Student' } };
  const resolve = createStudentProfileResolver(classroom, [{ userId: 'roster-user', profile: rosterProfile }]);
  assert.deepEqual(await resolve('roster-user'), rosterProfile);
  assert.deepEqual(await resolve('profile-id'), rosterProfile);
  const fallback = await Promise.all([resolve('missing-user'), resolve('missing-user')]);
  assert.deepEqual(fallback[0], fallback[1]);
  assert.deepEqual(calls, ['missing-user']);
});

test('failed fallback requests are not repeated for every submission', async () => {
  let calls = 0;
  const resolve = createStudentProfileResolver({ userProfiles: { get: async () => {
    calls++; throw new Error('profile unavailable');
  } } }, []);
  await assert.rejects(resolve('missing'));
  await assert.rejects(resolve('missing'));
  assert.equal(calls, 1);
});

test('HTTP entrypoint and exported task handler use the queue with a 30 minute deadline', async () => {
  const firestore = require('firebase-admin/firestore');
  const functions = require('firebase-admin/functions');
  const security = require('../lib/httpSecurity');
  const controller = require('../lib/importController');
  const original = { getFirestore: firestore.getFirestore, getFunctions: functions.getFunctions,
    requireAdmin: security.requireAdmin, initializeImport: controller.initializeImport };
  const db = fakeDb();
  const gate = defer();
  const entered = defer();
  let worker;
  let exports;
  let queueName;
  let taskOptions;
  let prepared = false;
  firestore.getFirestore = () => db;
  security.requireAdmin = async () => ({ email: input.userEmail });
  controller.initializeImport = async (jobId, galleryId, courseId, assignmentId, email, auth) => {
    assert.deepEqual([jobId, galleryId, courseId, assignmentId, email],
      ['job-1', input.galleryId, input.classroomId, input.assignmentId, input.userEmail]);
    assert.equal(auth.credentials.access_token, 'private-token');
    entered.resolve();
    await gate.promise;
    prepared = true;
  };
  functions.getFunctions = () => ({ taskQueue: name => {
    queueName = name;
    return { enqueue: async (payload, options) => {
      taskOptions = options;
      worker = exports.initializeClassroomImport.run({ data: payload });
      await entered.promise;
    } };
  } });
  try {
    exports = require('../lib/index');
    let responseBody;
    const headers = new Map();
    const response = { status: code => { assert.equal(code, 200); return response; },
      on: () => {}, getHeader: name => headers.get(name), setHeader: (name, value) => headers.set(name, value),
      json: data => { responseBody = data; } };
    await exports.importClassroomSubmissions({ method: 'POST', body: input, headers: {},
      get: name => name === 'x-classroom-oauth-token' ? 'private-token' : undefined }, response);
    assert.equal(prepared, false);
    assert.equal(responseBody.importJobId, 'job-1');
    assert.doesNotMatch(JSON.stringify(responseBody), /private-token/);
    assert.equal(queueName, INITIALIZATION_FUNCTION);
    assert.deepEqual(taskOptions, { id: 'job-1', dispatchDeadlineSeconds: INITIALIZATION_TIMEOUT_SECONDS });
    const endpoint = exports.initializeClassroomImport.__endpoint;
    assert.equal(endpoint.platform, 'gcfv2');
    assert.equal(endpoint.timeoutSeconds, 1800);
    assert.equal(endpoint.taskQueueTrigger.retryConfig.maxAttempts, 1);
    assert.notEqual(endpoint.taskQueueTrigger.invoker, 'public');
  } finally {
    gate.resolve();
    if (worker) await worker;
    firestore.getFirestore = original.getFirestore;
    functions.getFunctions = original.getFunctions;
    security.requireAdmin = original.requireAdmin;
    controller.initializeImport = original.initializeImport;
  }
});
