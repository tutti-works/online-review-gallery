'use client';

import { useEffect, ComponentType } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/utils/roles';

const withAuth = <P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredRole: UserRole = 'viewer'
) => {
  const AuthenticatedComponent = (props: P) => {
    const { user, loading } = useAuth();

    useEffect(() => {
      if (!loading && !user) {
        window.location.href = '/login';
        return;
      }

      if (!loading && user && requiredRole !== 'guest' && user.role === 'guest') {
        alert('ゲストアカウントではギャラリーページのみ閲覧できます。');
        window.location.href = '/gallery';
        return;
      }

      if (!loading && user && requiredRole === 'admin' && user.role !== 'admin') {
        alert('このページにアクセスする権限がありません。');
        window.location.href = '/';
        return;
      }
    }, [user, loading, requiredRole]);

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">ログインが必要です</h2>
            <p>このページを表示するにはログインしてください。</p>
          </div>
        </div>
      );
    }

    if (requiredRole !== 'guest' && user.role === 'guest') {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">ゲスト権限では利用できません</h2>
            <p>このページの利用には権限が必要です。管理者にアクセス権の付与を依頼してください。</p>
          </div>
        </div>
      );
    }

    if (requiredRole === 'admin' && user.role !== 'admin') {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">アクセス権限がありません</h2>
            <p>このページにアクセスする権限がありません。</p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };

  AuthenticatedComponent.displayName = `withAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return AuthenticatedComponent;
};

export default withAuth;
