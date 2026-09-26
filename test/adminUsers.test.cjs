const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./helpers/loadTs.cjs');
const { normalizeAdminEmail, AdminUsersError } = load('src/lib/server/adminUsers.ts');
const { createAdminUsersHandler } = load('src/lib/server/adminUsersHandler.ts');

test('email normalization rejects invalid input and trims/case-folds addresses', () => {
  assert.equal(normalizeAdminEmail('  Admin@Example.COM '), 'admin@example.com');
  for (const input of [null, '', 'no-at', 'a/b@example.com', 'a@b', 'a b@example.com', 'a'.repeat(260) + '@example.com']) {
    assert.throws(() => normalizeAdminEmail(input), AdminUsersError);
  }
});

const request = (token, body) => new Request('http://localhost/api/admin/users', {
  method: body === undefined ? 'GET' : 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('API refuses missing/invalid tokens and unverified email before accessing roles', async () => {
  for (const [token, identity, status] of [[null, {}, 401], ['expired', null, 401], ['valid', {}, 403], ['valid', { email: 'a@example.com', email_verified: false }, 403]]) {
    const handler = createAdminUsersHandler({
      verify: async () => { if (!identity) throw new Error('expired'); return identity; },
      service: () => { assert.fail('must not access Firestore'); }, readOnly: () => false,
    });
    assert.equal((await handler(request(token))).status, status);
  }
});

test('API authenticates actor from token, never from request body; no-store response', async () => {
  let args;
  const handler = createAdminUsersHandler({
    verify: async () => ({ email: 'admin@example.com', email_verified: true }),
    service: () => ({ change: async (...values) => { args = values; return { selfRemoved: false }; } }),
    readOnly: () => false,
  });
  const response = await handler(request('valid', { actor: 'forged@example.com', action: 'remove', email: 'target@example.com', confirmSelf: 'true' }));
  assert.equal(response.status, 200);
  assert.deepEqual(args, ['admin@example.com', 'remove', 'target@example.com', false]);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('server preview guard blocks mutation before service creation', async () => {
  const handler = createAdminUsersHandler({
    verify: async () => ({ email: 'admin@example.com', email_verified: true }),
    service: () => assert.fail('must not write in preview'), readOnly: () => true,
  });
  const response = await handler(request('valid', { action: 'add', email: 'new@example.com' }));
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /プレビュー/);
});

test('API returns authorization/conflict errors and rejects malformed actions', async () => {
  for (const status of [403, 409]) {
    const handler = createAdminUsersHandler({
      verify: async () => ({ email: 'viewer@example.com', email_verified: true }),
      service: () => ({ list: async () => { throw new AdminUsersError(status, '理由'); } }),
      readOnly: () => false,
    });
    assert.equal((await handler(request('valid'))).status, status);
    assert.equal((await handler(request('valid', { action: 'set-role' }))).status, 400);
  }
});
