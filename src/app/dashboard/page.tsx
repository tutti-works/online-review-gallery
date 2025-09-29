'use client';

import { useAuth } from '@/context/AuthContext';
import withAuth from '@/components/withAuth';

function DashboardPage() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
      alert('ログアウトに失敗しました。');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">
              オンライン講評会ギャラリー
            </h1>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="h-8 w-8 rounded-full"
                  />
                )}
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{user?.displayName}</p>
                  <p className="text-gray-500">
                    {user?.role === 'admin' ? '管理者' : '閲覧者'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                ダッシュボード
              </h2>
              <p className="text-gray-600 mb-6">
                ようこそ、{user?.displayName}さん！
              </p>

              <div className="bg-white rounded-lg shadow p-6 max-w-md mx-auto">
                <h3 className="text-lg font-semibold mb-4">アカウント情報</h3>
                <dl className="space-y-2 text-left">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">名前:</dt>
                    <dd className="text-sm text-gray-900">{user?.displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      メールアドレス:
                    </dt>
                    <dd className="text-sm text-gray-900">{user?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">ロール:</dt>
                    <dd className="text-sm text-gray-900">
                      {user?.role === 'admin' ? '管理者' : '閲覧者'}
                    </dd>
                  </div>
                </dl>
              </div>

              {user?.role === 'admin' && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">管理者機能</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">
                        データインポート
                      </h4>
                      <p className="text-sm text-blue-700 mb-4">
                        Google Classroom から課題の提出物をインポートします。
                      </p>
                      <a
                        href="/admin/import"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        インポート開始
                      </a>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h4 className="font-medium text-green-900 mb-2">
                        ギャラリー管理
                      </h4>
                      <p className="text-sm text-green-700 mb-4">
                        作品ギャラリーの表示・管理を行います。
                      </p>
                      <a
                        href="/gallery"
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        ギャラリー表示
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {user?.role === 'viewer' && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">閲覧者機能</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">
                      ギャラリー閲覧
                    </h4>
                    <p className="text-sm text-gray-700 mb-4">
                      あなたが所属する授業の作品ギャラリーを閲覧できます。
                    </p>
                    <a
                      href="/gallery"
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      ギャラリー表示
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default withAuth(DashboardPage);