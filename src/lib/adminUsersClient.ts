import { auth } from './firebase';
import { previewFetch } from './previewFetch';

export type AdminUser = { email: string; displayName: string };

export async function adminUsersRequest(body?: { action: 'add' | 'remove'; email: string; confirmSelf?: boolean }) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('ログインし直してください。');
  const response = await previewFetch('/api/admin/users', {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '処理に失敗しました。');
  return data as { admins?: AdminUser[]; message?: string; selfRemoved?: boolean };
}
