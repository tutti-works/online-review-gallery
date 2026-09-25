'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import ReadOnlyBadge from '@/components/ui/ReadOnlyBadge';

export default function LoginPage() {
  const { user, signInWithGoogle, signInAsGuest, loading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isGuestSigningIn, setIsGuestSigningIn] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      if (user.role === 'guest') {
        window.location.href = '/gallery';
      } else {
        window.location.href = '/dashboard';
      }
    }
  }, [user, loading]);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign-in error:', error);
      alert('Googleでのログインに失敗しました。再度お試しください。');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGuestSignIn = async () => {
    try {
      setIsGuestSigningIn(true);
      await signInAsGuest();
      window.location.href = '/gallery';
    } catch (error) {
      console.error('Guest sign-in error:', error);
      alert('ゲストでのログインに失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsGuestSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f17] architectural-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-orange-500/20 animate-ping"></div>
            <div className="w-12 h-12 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></div>
          </div>
          <span className="text-xs uppercase tracking-widest text-slate-500 font-mono">Initializing</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b0f17] architectural-bg">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-slate-400 tracking-wide">ダッシュボードへリダイレクト中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-[#0b0f17] architectural-bg overflow-hidden px-4">
      {/* Abstract Architectural Geometric Accents */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Ambient warm glow */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-orange-500/10 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-40 right-10 w-[450px] h-[350px] bg-blue-600/10 blur-[140px] rounded-full"></div>

        {/* Subtle structural lines */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
          <line x1="10%" y1="0" x2="10%" y2="100%" stroke="white" strokeWidth="1" strokeDasharray="6 6" />
          <line x1="90%" y1="0" x2="90%" y2="100%" stroke="white" strokeWidth="1" strokeDasharray="6 6" />
          <line x1="0" y1="20%" x2="100%" y2="20%" stroke="white" strokeWidth="1" strokeDasharray="6 6" />
          <line x1="0" y1="80%" x2="100%" y2="80%" stroke="white" strokeWidth="1" strokeDasharray="6 6" />
        </svg>
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        {/* Top Indicator */}
        <div className="flex justify-center mb-4">
          <ReadOnlyBadge />
        </div>

        {/* Main Card */}
        <div className="glass-panel rounded-2xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
          {/* Subtle accent line on top */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-orange-500 to-transparent"></div>

          {/* Logo & Heading */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-5">
              <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>

            <div className="text-[11px] font-semibold tracking-[0.25em] text-orange-400/90 uppercase mb-1.5 font-mono">
              Architectural Review
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              オンライン講評会ギャラリー
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
              建築設計課題の講評・提出作品レビューのためのプラットフォーム
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleSignIn}
              disabled={isSigningIn || isGuestSigningIn}
              className="w-full relative group flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 hover:border-white/20 text-white font-medium text-sm transition-all duration-200 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg"
            >
              {isSigningIn ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              <span>{isSigningIn ? 'ログイン中...' : 'Googleアカウントでログイン'}</span>
            </button>

            <button
              onClick={handleGuestSignIn}
              disabled={isGuestSigningIn || isSigningIn}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-transparent hover:bg-white/[0.04] border border-white/[0.08] hover:border-white/15 text-slate-300 hover:text-white font-medium text-sm transition-all duration-200 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGuestSigningIn ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
              <span>{isGuestSigningIn ? '接続中...' : 'ゲストとして閲覧（ログイン不要）'}</span>
            </button>
          </div>

          {/* Footer note */}
          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-[11px] text-slate-500 leading-normal">
              ログインすることで利用規約およびプライバシー方針に同意したものとみなされます。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
