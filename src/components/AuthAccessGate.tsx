'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLES } from '@/utils/roles';

// Temporary application admission policy (Issue #22). Keep page/API role checks.
export default function AuthAccessGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        role="status"
      >
        アカウントを確認しています…
      </main>
    );
  }
  if (user && user.role !== ROLES.ADMIN) return <AccessDenied />;
  return <>{children}</>;
}

function AccessDenied() {
  const { logout } = useAuth();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const confirm = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await logout();
      router.replace('/');
    } catch {
      setError('ログアウトできませんでした。もう一度OKを押してください。');
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50">
      <dialog
        ref={dialog}
        aria-labelledby="access-denied-title"
        aria-describedby="access-denied-description"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-stone-900 shadow-xl backdrop:bg-black/30"
        onCancel={(event) => event.preventDefault()}
      >
        <h1
          id="access-denied-title"
          className="text-xl font-semibold leading-relaxed"
        >
          現在、このサービスは管理者のみ利用できます。
        </h1>
        <p
          id="access-denied-description"
          className="mt-4 text-sm leading-relaxed text-stone-600"
        >
          管理者権限が必要な場合は、管理者にお問い合わせください。
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          autoFocus
          disabled={busy}
          onClick={() => void confirm()}
          className="mt-8 rounded-full bg-stone-900 px-8 py-3 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'ログアウトしています…' : 'OK'}
        </button>
      </dialog>
    </main>
  );
}
