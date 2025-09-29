'use client';

import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            オンライン講評会ギャラリー
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            大学設計課題のための講評会支援アプリケーション
          </p>

          <div className="bg-white rounded-lg shadow-md p-8 max-w-md mx-auto">
            {user ? (
              <>
                <h2 className="text-xl font-semibold mb-4">
                  ようこそ、{user.displayName}さん！
                </h2>
                <p className="text-gray-600 mb-6">
                  ダッシュボードでアプリケーションを利用できます。
                </p>
                <Link
                  href="/dashboard"
                  className="inline-block bg-primary-500 text-white px-6 py-3 rounded-lg hover:bg-primary-600 transition-colors"
                >
                  ダッシュボードへ
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-4">始めてください</h2>
                <p className="text-gray-600 mb-6">
                  Googleアカウントでログインしてアプリケーションを利用できます。
                </p>
                <Link
                  href="/login"
                  className="inline-block bg-primary-500 text-white px-6 py-3 rounded-lg hover:bg-primary-600 transition-colors"
                >
                  ログイン
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}