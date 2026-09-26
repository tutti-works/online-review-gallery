'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
export default function LoginPage() {
  const { user, signInWithGoogle, loading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (user && !loading) router.replace('/dashboard');
  }, [user, loading, router]);
  const signIn = async () => {
    setError('');
    setPending(true);
    try {
      await signInWithGoogle();
    } catch {
      setError('ログインできませんでした。もう一度お試しください。');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="login-composition">
      <section className="login-art">
        <div>
          <p className="atelier-eyebrow">ATRIA / DESIGN COMMUNITY</p>
          <h2>
            Different ideas.
            <br />
            New perspectives.
          </h2>
        </div>
        <div className="login-sculpture" aria-hidden="true" />
        <p>
          かたちにした想いを、ひらこう。
          <br />
          作品と対話から、新しい視点が生まれる場所。
        </p>
      </section>
      <section className="login-panel">
        <span className="atelier-eyebrow">WELCOME TO ATRIA</span>
        <h1>
          あなたの視点を、
          <br />
          ギャラリーへ。
        </h1>
        <p>
          授業で生まれた作品を見つめ、学びを共有する。
          <br />
          アカウントでログインして、はじめましょう。
        </p>
        {loading || user ? (
          <p role="status">
            {loading
              ? 'アカウントを確認しています…'
              : 'ダッシュボードへ移動しています…'}
          </p>
        ) : (
          <>
            <button onClick={signIn} disabled={pending}>
              {pending ? 'ログインしています…' : 'Googleでログイン　↗'}
            </button>
          </>
        )}
        {error && (
          <div role="alert" className="login-error">
            {error}
          </div>
        )}
        <small>
          オンライン講評会ギャラリー
          <br />
          大学設計課題のための作品閲覧・講評スペース
        </small>
      </section>
    </div>
  );
}
