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
      alert('ログインに失敗しました。');
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-white"></div>
      </div>
    );
  }

  // Access Denied / Invalid Domain View
  if (user && !isAllowed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center animate-fade-in">
        <div className="glass-panel w-full max-w-md rounded-xl p-10 shadow-2xl">
          <h1 className="font-serif text-2xl font-light text-white" style={{ fontFamily: 'var(--font-serif)' }}>
            Access Restricted
          </h1>
          <div className="my-6 h-px w-full bg-gradient-to-r from-transparent via-gray-500 to-transparent opacity-50"></div>
          <p className="text-sm font-light leading-relaxed text-gray-300">
            申し訳ありませんが、ご利用のアカウント（{user.email}）からはアクセスできません。<br />
            大学指定のアカウント（musashino-u.ac.jp）でログインしてください。
          </p>
          <div className="mt-8 flex flex-col gap-4">
            <button
              type="button"
              onClick={handleLogout}
              className="group relative flex w-full items-center justify-center overflow-hidden rounded-full border border-gray-600 bg-transparent px-8 py-3 text-sm font-medium text-white transition duration-300 hover:border-white hover:bg-white hover:text-black"
            >
              <span className="relative z-10">別のアカウントでログイン</span>
            </button>
            <Link
              href="/"
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              トップページに戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Main Login View
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-blue-900/10 blur-[120px]"></div>
        <div className="absolute bottom-[-20%] right-[-10%] h-[600px] w-[600px] rounded-full bg-purple-900/10 blur-[120px]"></div>
      </div>

      <div className="glass-panel relative z-10 w-full max-w-md rounded-xl p-12 text-center shadow-2xl animate-fade-in">
        <h1 className="font-serif text-3xl font-light tracking-wider text-white" style={{ fontFamily: 'var(--font-serif)' }}>
          MU DESIGN<br />SHOWCASE
        </h1>
        
        <p className="mt-2 text-[10px] tracking-[0.2em] text-gray-400 uppercase">
          Musashino University
        </p>

        <div className="my-8 flex justify-center">
             <div className="h-px w-16 bg-white/20"></div>
        </div>

        <p className="mb-8 text-sm font-light leading-relaxed text-gray-400">
            当ギャラリーは学内関係者限定で公開されています。<br />
            ご自身の大学アカウントでログインしてください。
        </p>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          className="group relative w-full overflow-hidden rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSigningIn ? (
            <span className="flex items-center justify-center gap-2">
               <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-black"></span>
               Connecting...
            </span>
          ) : (
            <span>Enter Gallery</span>
          )}
        </button>

        <div className="mt-8 text-[10px] text-gray-600">
          <p>© 2024 Department of Architecture</p>
        </div>
      </div>
    </div>
  );
};

export default ShowcaseLoginPage;
