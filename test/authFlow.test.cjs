const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'sessionStorage', code)(
    (id) => (id in mocks ? mocks[id] : id === '@/components/AuthAccessGate' ? { __esModule: true, default: ({ children }) => children } : require(id)),
    module,
    module.exports,
    mocks.sessionStorage || { getItem: () => null, removeItem: () => {} }
  );
  return module.exports;
}

function hooks() {
  const state = [],
    effects = [];
  return {
    state,
    effects,
    react: {
      ...React,
      useState(initial) {
        const index = state.length;
        state.push(initial);
        return [
          initial,
          (value) => {
            state[index] = typeof value === 'function' ? value(state[index]) : value;
          },
        ];
      },
      useRef: (current) => ({ current }),
      useCallback: (callback) => callback,
      useEffect: (effect) => effects.push(effect),
    },
  };
}

test('root inside the admission gate redirects only admin and never mounts non-admin login content', async () => {
  for (const role of [null, 'admin', 'viewer', 'guest']) {
    const h = hooks(),
      redirects = [];
    const Page = load('src/app/page.tsx', {
      react: h.react,
      'next/navigation': {
        useRouter: () => ({ replace: (url) => redirects.push(url) }),
      },
      '@/context/AuthContext': {
        useAuth: () => ({
          user: role ? { role } : null,
          loading: false,
          signInWithGoogle: async () => {},
        }),
      },
    }).default;
    const Gate = load('src/components/AuthAccessGate.tsx', {
      react: h.react,
      'next/navigation': { useRouter: () => ({ replace: (url) => redirects.push(url) }) },
      '@/context/AuthContext': { useAuth: () => ({ user: role ? { role } : null, loading: false }) },
      '@/utils/roles': { ROLES: { ADMIN: 'admin' } },
    }).default;
    const html = renderToStaticMarkup(Gate({ children: React.createElement(Page) }));
    h.effects.forEach((effect) => effect());
    assert.deepEqual(redirects, role === 'admin' ? ['/dashboard'] : []);
    assert.equal(html.includes('Googleでログイン'), role === null);
    assert.equal(html.includes('ゲストとして'), false);
  }
});

test('legacy login redirects to root', () => {
  const urls = [];
  load('src/app/login/page.tsx', {
    'next/navigation': { redirect: (url) => urls.push(url) },
  }).default();
  assert.deepEqual(urls, ['/']);
});

test('shared admission gate hides every descendant during loading and for all non-admin roles', () => {
  for (const loading of [true, false]) {
    for (const role of [null, 'admin', 'viewer', 'guest', undefined]) {
      const h = hooks();
      const Gate = load('src/components/AuthAccessGate.tsx', {
        react: h.react,
        'next/navigation': { useRouter: () => ({ replace() { throw new Error('unexpected redirect'); } }) },
        '@/context/AuthContext': { useAuth: () => ({ user: role === null ? null : { role }, loading }) },
        '@/utils/roles': { ROLES: { ADMIN: 'admin' } },
      }).default;
      const html = renderToStaticMarkup(Gate({ children: React.createElement('div', null, 'PROTECTED CONTENT') }));
      assert.equal(html.includes('PROTECTED CONTENT'), !loading && (role === null || role === 'admin'));
      assert.equal(html.includes('現在、このサービスは管理者のみ利用できます。'), !loading && role !== null && role !== 'admin');
    }
  }
});

test('denial dialog waits for OK, prevents dismissal and duplicate logout, navigates only after success', async () => {
  const h = hooks(), redirects = [];
  let signOuts = 0, resolveLogout;
  const Gate = load('src/components/AuthAccessGate.tsx', {
    react: h.react,
    'next/navigation': { useRouter: () => ({ replace: (url) => redirects.push(url) }) },
    '@/context/AuthContext': { useAuth: () => ({ user: { role: 'viewer' }, loading: false,
      logout: () => { signOuts++; return new Promise((resolve) => { resolveLogout = resolve; }); } }) },
    '@/utils/roles': { ROLES: { ADMIN: 'admin' } },
  }).default;
  const denial = Gate({ children: null });
  const tree = denial.type();
  const dialog = tree.props.children;
  let prevented = false;
  dialog.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  h.effects.forEach((effect) => effect());
  assert.equal(signOuts, 0);
  const button = dialog.props.children.find((child) => child?.type === 'button');
  button.props.onClick();
  button.props.onClick();
  assert.equal(signOuts, 1);
  assert.deepEqual(redirects, []);
  resolveLogout();
  await new Promise(setImmediate);
  assert.deepEqual(redirects, ['/']);
});

test('failed logout keeps denial in place and allows an explicit retry', async () => {
  const h = hooks();
  let attempts = 0;
  const Gate = load('src/components/AuthAccessGate.tsx', {
    react: h.react,
    'next/navigation': { useRouter: () => ({ replace() { throw new Error('must not navigate'); } }) },
    '@/context/AuthContext': { useAuth: () => ({ user: { role: 'guest' }, loading: false,
      logout: async () => { attempts++; throw new Error('offline'); } }) },
    '@/utils/roles': { ROLES: { ADMIN: 'admin' } },
  }).default;
  const denial = Gate({ children: null });
  const dialog = denial.type().props.children;
  const button = dialog.props.children.find((child) => child?.type === 'button');
  button.props.onClick();
  await new Promise(setImmediate);
  assert.match(h.state[1], /ログアウトできませんでした/);
  assert.equal(h.state[0], false);
  button.props.onClick();
  await new Promise(setImmediate);
  assert.equal(attempts, 2);
});

test('auth restoration resolves roles without signing out before acknowledgement', async () => {
  for (const role of ['admin', 'viewer', 'guest', null, 'anonymous', 'failure']) {
    const h = hooks();
    let listener,
      signOuts = 0,
      reads = 0,
      clears = 0;
    const { AuthProvider } = load('src/context/AuthContext.tsx', {
      react: h.react,
      'firebase/auth': {
        onAuthStateChanged: (_, fn) => {
          listener = fn;
          return () => {};
        },
        signOut: async () => {
          signOuts++;
        },
      },
      '@/lib/firebase': { auth: {}, db: {} },
      '@/lib/previewFirestore': {
        doc: () => ({}),
        getDoc: async () => {
          reads++;
          if (role === 'failure') throw new Error('unavailable');
          return { exists: () => role !== null, data: () => ({ role }) };
        },
      },
      '@/utils/roles': {
        ROLES: { ADMIN: 'admin', VIEWER: 'viewer', GUEST: 'guest' },
      },
      sessionStorage: {
        getItem: () => null,
        removeItem: () => {
          clears++;
        },
      },
    });
    const tree = AuthProvider({ children: null });
    assert.equal('signInAsGuest' in tree.props.value, false);
    h.effects.forEach((effect) => effect());
    await listener({
      uid: 'test',
      email: role === 'anonymous' ? null : 'test@example.test',
      isAnonymous: role === 'anonymous',
    });
    assert.equal(h.state[1], false);
    assert.equal(h.state[0].role, ['admin', 'viewer'].includes(role) ? role : 'guest');
    assert.equal(signOuts, 0);
    assert.equal(clears, 0);
    assert.equal(reads, role === 'anonymous' ? 0 : 1);
  }
});

test('a stale role read cannot restore an account after signout or overwrite a newer session', async () => {
  const h = hooks();
  let listener;
  const reads = [];
  const gate = () => null;
  const { AuthProvider } = load('src/context/AuthContext.tsx', {
    react: h.react,
    '@/components/AuthAccessGate': { __esModule: true, default: gate },
    'firebase/auth': { onAuthStateChanged: (_, callback) => { listener = callback; return () => {}; } },
    '@/lib/firebase': { auth: {}, db: {} },
    '@/lib/previewFirestore': { doc: () => ({}), getDoc: () => new Promise((resolve) => reads.push(resolve)) },
    '@/utils/roles': { ROLES: { ADMIN: 'admin', VIEWER: 'viewer', GUEST: 'guest' } },
  });
  const tree = AuthProvider({ children: 'APP SHELL' });
  assert.equal(tree.props.children.type, gate);
  assert.equal(tree.props.children.props.children, 'APP SHELL');
  h.effects.forEach((effect) => effect());
  const first = listener({ uid: 'old', email: 'old@example.test' });
  assert.equal(h.state[1], true);
  assert.equal(h.state[0], null);
  await listener(null);
  reads.shift()({ exists: () => true, data: () => ({ role: 'admin' }) });
  await first;
  assert.equal(h.state[0], null);
  const second = listener({ uid: 'old', email: 'old@example.test' });
  const third = listener({ uid: 'new', email: 'new@example.test' });
  reads[1]({ exists: () => true, data: () => ({ role: 'viewer' }) });
  await third;
  reads[0]({ exists: () => true, data: () => ({ role: 'admin' }) });
  await second;
  assert.equal(h.state[0].uid, 'new');
  assert.equal(h.state[0].role, 'viewer');
  assert.equal(h.state[1], false);
});

test('provider logout waits for Firebase signOut before clearing the application session', async () => {
  const h = hooks(), cleared = [];
  let finish, calls = 0;
  const { AuthProvider } = load('src/context/AuthContext.tsx', {
    react: h.react,
    'firebase/auth': { signOut: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } },
    '@/lib/firebase': { auth: {}, db: {} },
    '@/lib/previewFirestore': {},
    '@/utils/roles': { ROLES: { ADMIN: 'admin', VIEWER: 'viewer', GUEST: 'guest' } },
    sessionStorage: { removeItem: (key) => cleared.push(key) },
  });
  const tree = AuthProvider({ children: null });
  const pending = tree.props.value.logout();
  assert.equal(calls, 1);
  assert.deepEqual(cleared, []);
  finish();
  await pending;
  assert.deepEqual(cleared, ['googleAccessToken']);
  assert.equal(h.state[0], null);
});

test('existing role gates keep guest gallery access and restrict dashboard/admin', () => {
  for (const [role, required, target] of [
    [null, 'viewer', '/'],
    ['guest', 'viewer', '/gallery'],
    ['guest', 'guest', null],
    ['viewer', 'viewer', null],
    ['viewer', 'admin', '/'],
    ['admin', 'admin', null],
  ]) {
    const h = hooks(),
      redirects = [];
    const withAuth = load('src/components/withAuth.tsx', {
      react: h.react,
      'next/navigation': {
        useRouter: () => ({ replace: (url) => redirects.push(url) }),
      },
      '@/context/AuthContext': {
        useAuth: () => ({ user: role ? { role } : null, loading: false }),
      },
      '@/utils/roles': {
        ROLES: { ADMIN: 'admin', VIEWER: 'viewer', GUEST: 'guest' },
      },
    }).default;
    withAuth(() => null, required)({});
    h.effects.forEach((effect) => effect());
    assert.deepEqual(redirects, target ? [target] : []);
  }
});

test('role subscription reflects remote removal and fails closed on read errors', () => {
  const h = hooks();
  const originalState = h.react.useState;
  h.react.useState = (initial) => originalState(h.state.length === 0 ? { uid: 'test', email: 'admin@example.com', role: 'admin' } : initial);
  let snapshot, failed, unsubscribed = false;
  const { AuthProvider } = load('src/context/AuthContext.tsx', {
    react: h.react,
    'firebase/auth': { onAuthStateChanged: () => () => {} },
    '@/lib/firebase': { auth: {}, db: {} },
    '@/lib/previewFirestore': {
      doc: () => ({}),
      onSnapshot: (_, success, error) => { snapshot = success; failed = error; return () => { unsubscribed = true; }; },
    },
    '@/utils/roles': { ROLES: { ADMIN: 'admin', VIEWER: 'viewer', GUEST: 'guest' } },
  });
  AuthProvider({ children: null });
  const cleanups = h.effects.map((effect) => effect());
  snapshot({ data: () => ({ role: 'guest' }) });
  assert.equal(h.state[0].role, 'guest');
  snapshot({ data: () => ({ role: 'viewer' }) });
  assert.equal(h.state[0].role, 'viewer');
  snapshot({ data: () => undefined });
  assert.equal(h.state[0].role, 'guest');
  snapshot({ data: () => ({ role: 'admin' }) });
  failed();
  assert.equal(h.state[0].role, 'guest');
  cleanups.forEach((cleanup) => cleanup?.());
  assert.equal(unsubscribed, true);
});

test('admin page requires admin role, disables last removal, and strengthens self confirmation', () => {
  const admin = { email: 'admin@example.com', displayName: 'Admin' };
  const other = { email: 'other@example.com', displayName: 'Other' };
  for (const [admins, target, self] of [[[admin], null, false], [[admin, other], admin, true], [[admin, other], other, false]]) {
    const h = hooks();
    const values = [admins, true, false, '', '', '', target, false];
    const originalState = h.react.useState;
    h.react.useState = () => originalState(values[h.state.length]);
    let required;
    const Page = load('src/app/admin/users/page.tsx', {
      react: h.react,
      'next/link': { __esModule: true, default: (props) => React.createElement('a', props) },
      'next/navigation': { useRouter: () => ({ replace() {} }) },
      '@/components/withAuth': { __esModule: true, default: (page, role) => { required = role; return page; } },
      '@/context/AuthContext': { useAuth: () => ({ user: { ...admin, role: 'admin' }, refreshRole: async () => {} }) },
      '@/lib/adminUsersClient': { adminUsersRequest: async () => ({ admins }) },
      '@/lib/localPreview': { isLocalPreview: () => false, blockPreviewWrite: () => false },
    }).default;
    const html = renderToStaticMarkup(Page());
    assert.equal(required, 'admin');
    assert.equal(html.includes('type="checkbox"'), self);
    if (admins.length === 1) {
      assert.match(html, /最後の管理者は削除できません/);
      assert.match(html, /disabled="">管理者から削除/);
    }
    if (self) {
      assert.match(html, /他の管理者機能が利用できなくなる/);
      assert.match(html, /disabled="">管理者権限を削除/);
    }
  }
});
