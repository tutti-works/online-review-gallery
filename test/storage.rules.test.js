const { readFileSync } = require('node:fs');
const { after, before, beforeEach, describe, test } = require('node:test');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');
const { getBytes, ref, uploadBytes } = require('firebase/storage');

// Storage Rules の firestore.get() は Emulator Hub の project ID を使うため、
// .firebaserc と同じ project ID で初期化する。
const projectId = 'online-review-gallery';
let testEnv;

const viewer = () => testEnv.authenticatedContext('viewer', { email: 'viewer@example.com' });
const campusViewer = () => testEnv.authenticatedContext('campus-viewer', { email: 'student@stu.musashino-u.ac.jp' });
const admin = () => testEnv.authenticatedContext('admin', { email: 'admin@musashino-u.ac.jp' });
const outsideAdmin = () => testEnv.authenticatedContext('outside-admin', { email: 'admin@example.com' });

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      setDoc(doc(context.firestore(), 'userRoles/admin@musashino-u.ac.jp'), { role: 'admin' }),
      setDoc(doc(context.firestore(), 'userRoles/admin@example.com'), { role: 'admin' }),
      uploadBytes(ref(context.storage(), 'galleries/gallery-1/images/image.webp'), new Uint8Array([1])),
      uploadBytes(ref(context.storage(), 'showcase/gallery-1/overview.webp'), new Uint8Array([2])),
      uploadBytes(ref(context.storage(), 'unprocessed/job-1/source.pdf'), new Uint8Array([3])),
    ]);
  });
});

after(async () => {
  await testEnv?.cleanup();
});

describe('galleries', () => {
  const path = 'galleries/gallery-1/images/image.webp';

  test('未認証 read は拒否する', async () => {
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
  });

  test('認証済み viewer read は許可する', async () => {
    await assertSucceeds(getBytes(ref(viewer().storage(), path)));
  });

  test('viewer write は拒否する', async () => {
    await assertFails(uploadBytes(ref(viewer().storage(), 'galleries/gallery-1/images/viewer.webp'), new Uint8Array([4])));
  });

  test('admin write は許可する', async () => {
    await assertSucceeds(uploadBytes(ref(admin().storage(), 'galleries/gallery-1/images/admin.webp'), new Uint8Array([5])));
  });
});

describe('showcase', () => {
  const path = 'showcase/gallery-1/overview.webp';

  test('未認証 read は拒否する', async () => {
    await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), path)));
  });

  test('認証済み学外ドメイン read は拒否する', async () => {
    await assertFails(getBytes(ref(viewer().storage(), path)));
  });

  test('ルート学内ドメイン read は許可する', async () => {
    await assertSucceeds(getBytes(ref(admin().storage(), path)));
  });

  test('学内サブドメイン read は許可する', async () => {
    await assertSucceeds(getBytes(ref(campusViewer().storage(), path)));
  });

  test('学内 admin write は許可する', async () => {
    await assertSucceeds(uploadBytes(ref(admin().storage(), 'showcase/gallery-1/admin.webp'), new Uint8Array([6])));
  });

  test('学外 admin write は拒否する', async () => {
    await assertFails(uploadBytes(ref(outsideAdmin().storage(), 'showcase/gallery-1/outside.webp'), new Uint8Array([7])));
  });
});

describe('unprocessed', () => {
  const readPath = 'unprocessed/job-1/source.pdf';

  test('未認証クライアントの read / write を拒否する', async () => {
    const storage = testEnv.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, readPath)));
    await assertFails(uploadBytes(ref(storage, 'unprocessed/job-1/anonymous.pdf'), new Uint8Array([8])));
  });

  test('認証済みクライアントの read / write を拒否する', async () => {
    const storage = admin().storage();
    await assertFails(getBytes(ref(storage, readPath)));
    await assertFails(uploadBytes(ref(storage, 'unprocessed/job-1/admin.pdf'), new Uint8Array([9])));
  });

  test('Rulesをバイパスするserver contextでは read / write できる', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storage = context.storage();
      const serverPath = 'unprocessed/job-1/server.pdf';
      await assertSucceeds(uploadBytes(ref(storage, serverPath), new Uint8Array([10])));
      await assertSucceeds(getBytes(ref(storage, serverPath)));
    });
  });
});
