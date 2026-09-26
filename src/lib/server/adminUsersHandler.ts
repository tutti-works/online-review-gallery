import { AdminUsersError } from './adminUsers';
import type { createAdminUsersService } from './adminUsers';

type Dependencies = {
  verify: (token: string) => Promise<{ email?: string; email_verified?: boolean }>;
  service: () => ReturnType<typeof createAdminUsersService>;
  readOnly: () => boolean;
};

export function createAdminUsersHandler(deps: Dependencies) {
  return async (request: Request) => {
    const reply = (body: object, status = 200) => Response.json(body, {
      status, headers: { 'Cache-Control': 'private, no-store' },
    });
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
      if (!token) throw new AdminUsersError(401, 'ログインし直してください。');
      const identity = await deps.verify(token).catch(() => { throw new AdminUsersError(401, 'ログインし直してください。'); });
      if (!identity.email || !identity.email_verified) throw new AdminUsersError(403, '確認済みのメールアドレスが必要です。');
      if (request.method === 'GET') return reply({ admins: await deps.service().list(identity.email) });
      if (request.method !== 'POST') return reply({ error: '許可されていない操作です。' }, 405);
      if (deps.readOnly()) throw new AdminUsersError(403, 'プレビューのため変更は保存されません。');
      const body = await request.json().catch(() => { throw new AdminUsersError(400, '入力内容を確認してください。'); });
      if (!body || (body.action !== 'add' && body.action !== 'remove')) throw new AdminUsersError(400, '操作を確認してください。');
      const result = await deps.service().change(identity.email, body.action, body.email, body.confirmSelf === true);
      return reply({ ...result, message: body.action === 'add' ? '管理者を追加しました。' : '管理者から削除しました。' });
    } catch (error) {
      if (error instanceof AdminUsersError) return reply({ error: error.message }, error.status);
      console.error('Admin management request failed:', error);
      return reply({ error: '処理に失敗しました。時間をおいて再度お試しください。' }, 500);
    }
  };
}
