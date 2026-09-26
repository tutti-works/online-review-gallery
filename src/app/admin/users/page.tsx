'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import withAuth from '@/components/withAuth';
import { useAuth } from '@/context/AuthContext';
import { adminUsersRequest, type AdminUser } from '@/lib/adminUsersClient';
import { blockPreviewWrite, isLocalPreview } from '@/lib/localPreview';

function AdminUsersPage() {
  const { user, refreshRole } = useAuth();
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const self = target?.email.toLowerCase() === user?.email?.toLowerCase();
  const lastAdmin = new Set(admins.map((admin) => admin.email.toLowerCase())).size <= 1;
  const preview = isLocalPreview();

  const reload = useCallback(async () => {
    setLoaded(false);
    try {
      const data = await adminUsersRequest();
      setAdmins(data.admins ?? []);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '一覧を取得できませんでした。');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (target) dialog.current?.showModal();
    else dialog.current?.close();
  }, [target]);

  async function change(action: 'add' | 'remove') {
    if (blockPreviewWrite() || busy || !loaded) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await adminUsersRequest({
        action, email: action === 'add' ? email : target!.email,
        confirmSelf: action === 'remove' && self && confirmed,
      });
      setMessage(result.message ?? '保存しました。');
      setEmail('');
      setTarget(null);
      if (result.selfRemoved) {
        // Refresh shared auth state before leaving, even if the role listener is delayed.
        await refreshRole();
        router.replace('/gallery?adminRemoved=1');
      } else {
        await reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました。');
      setTarget(null);
      await reload();
    } finally { setBusy(false); }
  }

  return (
    <main className="admin-users-page">
      <header className="admin-users-heading import-heading">
        <div>
          <p className="admin-users-eyebrow">ADMINISTRATION</p>
          <h1>管理者管理</h1>
          <p className="admin-users-description">アプリを管理できるユーザーを追加・削除します。</p>
        </div>
        <Link href="/dashboard" className="import-back"><ArrowLeft size={15} aria-hidden="true" />ダッシュボード</Link>
      </header>
      <div role="status" aria-live="polite">{message && <p className="admin-users-notice">{message}</p>}</div>
      {error && <p role="alert" className="admin-users-notice text-red-700">{error}</p>}
      <section className="dashboard-panel" aria-labelledby="admin-list-title">
        <div className="admin-users-section-heading">
          <h2 id="admin-list-title">管理者 {loaded && <span>／ {admins.length}名</span>}</h2>
          <button className="admin-users-button" disabled={busy} onClick={() => { setError(''); void reload(); }}>再読み込み</button>
        </div>
        {!loaded ? <p className="text-sm text-gray-500">{error ? '一覧を読み込めませんでした。再読み込みしてください。' : '読み込み中…'}</p> : (
          <ul className="admin-users-list">
            {admins.map((admin) => (
              <li key={admin.email}>
                <div className="admin-users-identity">
                  {admin.displayName && <p className="font-medium">{admin.displayName}</p>}
                  <p>{admin.email} {admin.email.toLowerCase() === user?.email?.toLowerCase() && <span className="admin-users-badge">自分</span>}</p>
                </div>
                <button className="admin-users-button" disabled={busy || lastAdmin || preview} onClick={() => { setConfirmed(false); setTarget(admin); }}>管理者から削除</button>
              </li>
            ))}
          </ul>
        )}
        {loaded && lastAdmin && <p className="mt-4 text-sm text-gray-600">最後の管理者は削除できません。</p>}
      </section>
      <section className="dashboard-panel" aria-labelledby="admin-add-title">
        <h2 id="admin-add-title">管理者を追加</h2>
        <p className="mt-2 text-sm text-gray-600">Googleログインで利用するメールアドレスを入力してください。</p>
        <form className="admin-users-form" onSubmit={(event) => { event.preventDefault(); void change('add'); }}>
          <label htmlFor="admin-email">メールアドレス</label>
          <div>
            <input id="admin-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" disabled={busy || preview} />
            <button className="admin-users-button admin-users-primary" disabled={busy || !loaded || preview || !email.trim()}>{busy ? '保存中…' : '管理者を追加'}</button>
          </div>
        </form>
      </section>
      {preview && <p className="text-sm text-gray-600">プレビューのため追加・削除はできません。</p>}
      <dialog ref={dialog} className="admin-users-dialog" aria-labelledby="remove-admin-title" onCancel={(event) => { if (busy) event.preventDefault(); else setTarget(null); }}>
        <h2 id="remove-admin-title">{self ? '自分自身の管理者権限を削除' : '管理者から削除'}</h2>
        <p>{target?.email} を管理者から削除しますか？</p>
        <p className="text-sm text-gray-600">削除後のロールはゲストになります。作品やアカウントは削除されません。</p>
        {self && <label className="admin-users-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} /><span>自分自身の管理者権限を削除すると、この画面や他の管理者機能が利用できなくなることを理解しました。</span></label>}
        <div className="admin-users-dialog-actions">
          <button className="admin-users-button" autoFocus disabled={busy} onClick={() => setTarget(null)}>キャンセル</button>
          <button className="admin-users-button admin-users-primary" disabled={busy || (self && !confirmed)} onClick={() => void change('remove')}>{busy ? '削除中…' : '管理者権限を削除'}</button>
        </div>
      </dialog>
    </main>
  );
}

export default withAuth(AdminUsersPage, 'admin');
