import type { Firestore } from 'firebase-admin/firestore';

export class AdminUsersError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function normalizeAdminEmail(value: unknown): string {
  if (typeof value !== 'string') throw new AdminUsersError(400, 'メールアドレスを入力してください。');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(email)) {
    throw new AdminUsersError(400, '有効なメールアドレスを入力してください。');
  }
  return email;
}

export function createAdminUsersService(db: Firestore) {
  const roles = db.collection('userRoles');
  // Every mutation locks the same document; no pre-existing counter or migration is needed.
  const lock = db.doc('_adminManagement/roles');
  return {
    async list(actor: string) {
      return db.runTransaction(async (tx) => {
        const caller = await tx.get(roles.doc(actor));
        if (caller.data()?.role !== 'admin') throw new AdminUsersError(403, '管理者権限が必要です。');
        const admins = await tx.get(roles.where('role', '==', 'admin'));
        return admins.docs.map((entry) => ({
          email: entry.id,
          displayName: typeof entry.data().displayName === 'string' ? entry.data().displayName as string : '',
        })).sort((a, b) => a.email.localeCompare(b.email));
      });
    },
    async change(actor: string, action: 'add' | 'remove', input: unknown, confirmSelf: boolean) {
      const email = normalizeAdminEmail(input);
      return db.runTransaction(async (tx) => {
        await tx.get(lock);
        const caller = await tx.get(roles.doc(actor));
        if (caller.data()?.role !== 'admin') throw new AdminUsersError(403, '管理者権限が必要です。');
        const all = await tx.get(roles);
        const matches = all.docs.filter((entry) => entry.id.toLowerCase() === email);
        if (matches.length > 1) throw new AdminUsersError(409, '同じメールアドレスのロールが複数あります。既存データを確認してください。');
        const existing = matches[0];
        const self = actor.toLowerCase() === email;
        if (action === 'add' && existing?.data().role === 'admin') {
          throw new AdminUsersError(409, 'このユーザーは既に管理者です。');
        }
        if (action === 'remove') {
          if (existing?.data().role !== 'admin') throw new AdminUsersError(409, 'このユーザーは既に管理者ではありません。');
          const admins = new Set(all.docs.filter((entry) => entry.data().role === 'admin').map((entry) => entry.id.toLowerCase()));
          if (admins.size <= 1) throw new AdminUsersError(409, '最後の管理者は削除できません。');
          if (self && !confirmSelf) throw new AdminUsersError(400, '自分自身の管理者権限の削除には追加の確認が必要です。');
        }
        const now = new Date();
        tx.set(existing?.ref ?? roles.doc(email), {
          role: action === 'add' ? 'admin' : 'guest',
          updatedAt: now,
          ...(!existing ? { email, createdAt: now } : {}),
        }, { merge: true });
        tx.set(lock, { updatedAt: now });
        return { selfRemoved: self && action === 'remove' };
      });
    },
  };
}
