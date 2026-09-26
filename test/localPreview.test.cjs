const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the actual TypeScript guards; Firebase functions must never be reached in preview.
function load(file) {
  const filename = path.resolve(__dirname, '../src/lib', file + '.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => (id.startsWith('./') ? load(id.slice(2)) : require(id)),
    module,
    module.exports
  );
  return module.exports;
}

test('preview blocks every Firestore and Storage write before SDK invocation', () => {
  process.env.NODE_ENV = 'development';
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW = 'true';
  for (const [module, methods] of [
    [
      'previewFirestore',
      [
        'setDoc',
        'addDoc',
        'updateDoc',
        'deleteDoc',
        'writeBatch',
        'runTransaction',
      ],
    ],
    [
      'previewStorage',
      [
        'uploadBytes',
        'uploadBytesResumable',
        'uploadString',
        'deleteObject',
        'updateMetadata',
      ],
    ],
  ]) {
    const sdk = load(module);
    for (const method of methods)
      assert.throws(() => sdk[method](), /変更は保存されません/, method);
  }
});

test('preview fetch permits reads but rejects writes without network I/O', async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (...args) => {
    calls.push(args);
    return new Response('ok');
  };
  try {
    const { previewFetch } = load('previewFetch');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await assert.rejects(
        previewFetch('https://example.test', { method }),
        /変更は保存されません/
      );
    }
    await assert.rejects(
      previewFetch(new Request('https://example.test', { method: 'POST' })),
      /変更は保存されません/
    );
    assert.equal(calls.length, 0);
    await previewFetch('https://example.test');
    assert.equal(calls.length, 1);
  } finally {
    global.fetch = original;
  }
});

test('preview flag never changes production behavior', () => {
  const { isLocalPreview } = load('localPreview');
  process.env.NODE_ENV = 'production';
  assert.equal(isLocalPreview(), false);
  process.env.NODE_ENV = 'development';
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW = 'false';
  assert.equal(isLocalPreview(), false);
  process.env.NEXT_PUBLIC_LOCAL_PREVIEW = 'true';
  assert.equal(isLocalPreview(), true);
});
