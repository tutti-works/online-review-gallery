const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createAdminUsersService } = require('./helpers/loadTs.cjs')('src/lib/server/adminUsers.ts');
const projectId = 'demo-atria-admin';
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local Firestore emulator required');
let env, app, db, service;
const a = 'admin@example.com', b = 'second@example.com', v = 'viewer@example.com';
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  app = initializeApp({ projectId }, 'admin-tests');
  db = getFirestore(app);
  service = createAdminUsersService(db);
});
beforeEach(async () => {
  await env.clearFirestore();
  await Promise.all([
    db.doc('userRoles/' + a).set({ role: 'admin', displayName: 'Admin' }),
    db.doc('userRoles/' + b).set({ role: 'admin' }),
    db.doc('userRoles/' + v).set({ role: 'viewer', retained: 'metadata' }),
  ]);
});
after(async () => { await db?.terminate(); if (app) await deleteApp(app); await env?.cleanup(); });

test('admin lists admins; viewer, guest and missing roles cannot list or mutate', async () => {
  assert.equal((await service.list(a)).length, 2);
  for (const actor of [v, 'guest@example.com', 'unknown@example.com']) {
    for (const operation of [() => service.list(actor), () => service.change(actor, 'add', 'new@example.com', false), () => service.change(actor, 'remove', a, true)]) {
      await assert.rejects(operation, (err) => err.status === 403);
    }
  }
});

test('add normalizes email, preserves existing metadata, rejects duplicate; remove becomes guest', async () => {
  await service.change(a, 'add', '  VIEWER@EXAMPLE.COM  ', false);
  assert.equal((await db.doc('userRoles/' + v).get()).data().retained, 'metadata');
  await assert.rejects(() => service.change(a, 'add', v, false), /既に管理者/);
  await service.change(a, 'remove', v, false);
  assert.equal((await db.doc('userRoles/' + v).get()).data().role, 'guest');
  await service.change(a, 'add', 'new@example.com', false);
  assert.equal((await db.doc('userRoles/new@example.com').get()).data().role, 'admin');
});

test('self deletion requires strong confirmation, then immediately loses server access', async () => {
  await assert.rejects(() => service.change(a, 'remove', a, false), /追加の確認/);
  assert.deepEqual(await service.change(a, 'remove', a, true), { selfRemoved: true });
  await assert.rejects(() => service.list(a), (err) => err.status === 403);
  await assert.rejects(() => service.change(b, 'remove', b, true), /最後の管理者/);
});

test('concurrent self removals cannot delete the last admin', async () => {
  const results = await Promise.allSettled([service.change(a, 'remove', a, true), service.change(b, 'remove', b, true)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('userRoles').where('role', '==', 'admin').get()).size, 1);
});

test('concurrent additions create one role and report duplicate', async () => {
  const results = await Promise.allSettled([service.change(a, 'add', 'new@example.com', false), service.change(b, 'add', 'new@example.com', false)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /既に管理者/);
});

test('legacy casing is preserved; ambiguous aliases cannot be changed', async () => {
  await db.doc('userRoles/Mixed@Example.com').set({ role: 'viewer', retained: true });
  await service.change(a, 'add', 'mixed@example.com', false);
  assert.equal((await db.doc('userRoles/Mixed@Example.com').get()).data().role, 'admin');
  assert.equal((await db.doc('userRoles/mixed@example.com').get()).exists, false);
  await db.doc('userRoles/mixed@example.com').set({ role: 'admin' });
  await assert.rejects(() => service.change(a, 'remove', 'mixed@example.com', false), /複数/);
});

test('production Rules reject direct role writes and lock access for every client; own reads stay allowed', async () => {
  for (const email of [a, v, 'guest@example.com', null]) {
    const client = email ? env.authenticatedContext(email, { email }).firestore() : env.unauthenticatedContext().firestore();
    for (const op of [
      () => setDoc(doc(client, 'userRoles/new@example.com'), { role: 'admin' }),
      () => updateDoc(doc(client, 'userRoles/' + a), { role: 'guest' }),
      () => deleteDoc(doc(client, 'userRoles/' + a)),
      () => getDocs(collection(client, 'userRoles')),
      () => getDoc(doc(client, '_adminManagement/roles')),
      () => setDoc(doc(client, '_adminManagement/roles'), { updatedAt: new Date() }),
    ]) await assertFails(op());
    if (email) await assertSucceeds(getDoc(doc(client, 'userRoles/' + email)));
    else await assertFails(getDoc(doc(client, 'userRoles/' + a)));
  }
});

test('role removal immediately revokes existing admin write permissions', async () => {
  const client = env.authenticatedContext(a, { email: a }).firestore();
  await assertSucceeds(setDoc(doc(client, 'galleries/before'), { title: 'allowed' }));
  await service.change(b, 'remove', a, false);
  await assertFails(setDoc(doc(client, 'galleries/after'), { title: 'denied' }));
  await assertSucceeds(getDoc(doc(client, 'galleries/before')));
});
