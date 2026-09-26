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
            state[index] = value;
          },
        ];
      },
      useRef: (current) => ({ current }),
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
