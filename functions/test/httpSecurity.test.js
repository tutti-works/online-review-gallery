const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ALLOWED_CORS_ORIGINS,
  HttpAuthError,
  requireAdmin,
  requireGoogleOAuthToken,
  toImportStatusResponse,
} = require('../lib/httpSecurity');

const requestWithAuthorization = (authorization) => ({
  get: (name) => name.toLowerCase() === 'authorization' ? authorization : undefined,
});

const dependencies = (verifyIdToken, role) => ({
  verifyIdToken,
  getRole: async () => role,
});

const expectAuthError = async (action, status, code) => {
  await assert.rejects(action, (error) => {
    return error instanceof HttpAuthError && error.status === status && error.code === code;
  });
};

test('Authorization がなければ 401', async () => {
  await expectAuthError(
    () => requireAdmin(requestWithAuthorization(), dependencies(async () => ({ uid: 'unused' }), 'admin')),
    401,
    'authentication_required'
  );
});

test('不正または期限切れ token は 401', async () => {
  for (const code of ['auth/argument-error', 'auth/id-token-expired']) {
    await expectAuthError(
      () => requireAdmin(
        requestWithAuthorization('Bearer not-a-firebase-id-token'),
        dependencies(async () => {
          throw Object.assign(new Error('rejected'), { code });
        }, 'admin')
      ),
      401,
      'invalid_token'
    );
  }
});

test('Google OAuth token だけでは Firebase 管理者認証を通過しない', async () => {
  await expectAuthError(
    () => requireAdmin(
      requestWithAuthorization('Bearer google-oauth-access-token'),
      dependencies(async () => {
        throw Object.assign(new Error('not an ID token'), { code: 'auth/argument-error' });
      }, 'admin')
    ),
    401,
    'invalid_token'
  );
});

test('Google OAuth token は Firebase Authorization と別ヘッダーから取得する', () => {
  const request = {
    get: (name) => {
      if (name.toLowerCase() === 'authorization') return 'Bearer firebase-id-token';
      if (name.toLowerCase() === 'x-classroom-oauth-token') return 'google-oauth-access-token';
      return undefined;
    },
  };

  assert.equal(requireGoogleOAuthToken(request), 'google-oauth-access-token');
});

test('Google Cloud に除去される予約済み X-Google-* ヘッダーを使わない', () => {
  const request = {
    get: (name) => name.toLowerCase() === 'x-google-oauth-token'
      ? 'google-oauth-access-token'
      : undefined,
  };

  assert.throws(
    () => requireGoogleOAuthToken(request),
    (error) => error instanceof HttpAuthError
      && error.status === 401
      && error.code === 'authentication_required'
  );
});

test('viewer と未登録ユーザーは 403 で admin は許可される', async () => {
  const verified = async () => ({ uid: 'firebase-uid', email: 'admin@example.com' });

  await expectAuthError(
    () => requireAdmin(requestWithAuthorization('Bearer firebase-id-token'), dependencies(verified, 'viewer')),
    403,
    'admin_required'
  );
  await expectAuthError(
    () => requireAdmin(requestWithAuthorization('Bearer firebase-id-token'), dependencies(verified, undefined)),
    403,
    'admin_required'
  );

  assert.deepEqual(
    await requireAdmin(requestWithAuthorization('Bearer firebase-id-token'), dependencies(verified, 'admin')),
    { uid: 'firebase-uid', email: 'admin@example.com', role: 'admin' }
  );
});

test('権限判定は body の userEmail ではなく検証済み token の email を使う', async () => {
  let checkedEmail = '';
  const request = {
    body: { userEmail: 'forged-admin@example.com' },
    get: (name) => name.toLowerCase() === 'authorization' ? 'Bearer firebase-id-token' : undefined,
  };

  await expectAuthError(
    () => requireAdmin(request, {
      verifyIdToken: async () => ({ uid: 'viewer-uid', email: 'viewer@example.com' }),
      getRole: async (email) => {
        checkedEmail = email;
        return email === request.body.userEmail ? 'admin' : 'viewer';
      },
    }),
    403,
    'admin_required'
  );

  assert.equal(checkedEmail, 'viewer@example.com');
});

test('import status は UI に必要な進捗情報だけを返す', () => {
  assert.deepEqual(toImportStatusResponse({
    status: 'processing',
    progress: 42,
    processedFiles: 3,
    totalFiles: 7,
    createdBy: 'private@example.com',
    errorFiles: ['private-file.pdf'],
    internalError: 'secret details',
  }), {
    status: 'processing',
    progress: 42,
    processedFiles: 3,
    totalFiles: 7,
  });
});

test('new import status exposes submission counters but not student details', () => {
  assert.deepEqual(toImportStatusResponse({
    status: 'processing', progress: 42, totalSubmissions: 7,
    completedSubmissions: 3, succeededSubmissions: 2, failedSubmissions: 1,
    failedFileCount: 4, studentEmail: 'private@example.com',
  }), {
    status: 'processing', progress: 42, processedFiles: 0, totalFiles: 0,
    totalSubmissions: 7, completedSubmissions: 3, succeededSubmissions: 2,
    failedSubmissions: 1, failedFileCount: 4,
  });
});

test('CORS は本番 Hosting と既定ローカル開発 origin だけを許可する', () => {
  assert.deepEqual(ALLOWED_CORS_ORIGINS, [
    'https://online-review-gallery.web.app',
    'https://online-review-gallery.firebaseapp.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
  assert.equal(ALLOWED_CORS_ORIGINS.includes('https://attacker.example'), false);
});
