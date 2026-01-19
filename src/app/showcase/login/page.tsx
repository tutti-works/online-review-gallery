'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';

const ShowcaseLoginPage = () => {
  const { user, signInWithGoogle, logout, loading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const isAllowed = isShowcaseDomainAllowed(user?.email);

  useEffect(() => {
    if (user && !loading && isAllowed) {
      window.location.href = '/showcase';
    }
  }, [user, loading, isAllowed]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (error) {
      console.error('Showcase sign-in error:', error);
      alert('Googleでのログインに失敗しました。もう一度お試しください。');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Showcase logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-20 w-20 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (user && !isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">学内ドメイン限定</h1>
          <p className="mt-3 text-sm text-gray-600">
            musashino-u.ac.jp またはサブドメインのアカウントでログインしてください。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              ログアウト
            </button>
            <Link
              href="/"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              トップへ戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">MU展専用ギャラリー</h1>
        <p className="mt-2 text-sm text-gray-600">
          学内アカウント（musashino-u.ac.jp / サブドメイン）でログインしてください。
        </p>
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          className="mt-6 w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigningIn ? 'ログイン中...' : 'Googleでログイン'}
        </button>
        <div className="mt-6 text-xs text-gray-500">
          <p>ログインすると利用規約・プライバシーポリシーに同意したものとみなします。</p>
        </div>
      </div>
    </div>
  );
};

export default ShowcaseLoginPage;
