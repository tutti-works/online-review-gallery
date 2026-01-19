'use client';

import { useEffect, ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLES, type UserRole } from '@/utils/roles';

const withShowcaseAuth = <P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredRole: UserRole = ROLES.VIEWER,
) => {
  const AuthenticatedComponent = (props: P) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (loading) {
        return;
      }

      if (!user) {
        router.replace('/showcase/login');
        return;
      }

      if (requiredRole !== ROLES.GUEST && user.role === ROLES.GUEST) {
        router.replace('/showcase/login');
        return;
      }

      if (requiredRole === ROLES.ADMIN && user.role !== ROLES.ADMIN) {
        router.replace('/showcase');
      }
    }, [loading, router, user]);

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
            <p>専用ギャラリーを表示するにはログインしてください。</p>
          </div>
        </div>
      );
    }

    if (requiredRole !== ROLES.GUEST && user.role === ROLES.GUEST) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">ゲスト権限では利用できません</h2>
            <p>学内アカウントでログインしてください。</p>
          </div>
        </div>
      );
    }

    if (requiredRole === ROLES.ADMIN && user.role !== ROLES.ADMIN) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">アクセス権限がありません</h2>
            <p>管理者権限が必要です。</p>
          </div>
        </div>
      );
    }

    return <WrappedComponent {...props} />;
  };

  AuthenticatedComponent.displayName = `withShowcaseAuth(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return AuthenticatedComponent;
};

export default withShowcaseAuth;
