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
    (id) => (id in mocks ? mocks[id] : require(id)),
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

test('root displays only Google sign-in and redirects every authenticated role to dashboard', async () => {
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
    const html = renderToStaticMarkup(Page());
    h.effects.forEach((effect) => effect());
    assert.deepEqual(redirects, role ? ['/dashboard'] : []);
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

test('auth restoration retains registered and fallback roles, rejects retired anonymous sessions', async () => {
  for (const role of ['admin', 'viewer', null, 'anonymous']) {
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
    if (role === 'anonymous') {
      assert.equal(h.state[0], null);
      assert.equal(signOuts, 1);
      assert.equal(clears, 1);
      assert.equal(reads, 0);
    } else {
      assert.equal(h.state[0].role, role ?? 'guest');
      assert.equal(signOuts, 0);
    }
  }
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
