'use client';

import { useEffect, ComponentType } from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/utils/roles';

interface WithAuthProps {
  requiredRole?: UserRole;
}

const withAuth = <P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredRole: UserRole = 'viewer'
) => {
  const AuthenticatedComponent = (props: P) => {
    const { user, loading } = useAuth();

    useEffect(() => {
      if (!loading && !user) {
        // Redirect to login page
        window.location.href = '/login';
        return;
      }

      if (!loading && user && requiredRole === 'admin' && user.role !== 'admin') {
        // User doesn't have required permissions
        alert('このページにアクセスする権限がありません。');
        window.location.href = '/';
        return;
      }
    }, [user, loading]);

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

  AuthenticatedComponent.displayName = `withAuth(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return AuthenticatedComponent;
};

export default withAuth;