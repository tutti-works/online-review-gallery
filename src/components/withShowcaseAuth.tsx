'use client';

import { useEffect, ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ROLES, type UserRole } from '@/utils/roles';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';

const withShowcaseAuth = <P extends object>(
  WrappedComponent: ComponentType<P>,
  requiredRole: UserRole = ROLES.VIEWER,
) => {
  const AuthenticatedComponent = (props: P) => {
    const { user, loading } = useAuth();
    const router = useRouter();
    const isAllowedDomain = isShowcaseDomainAllowed(user?.email);

    useEffect(() => {
      if (loading) {
        return;
      }

      if (!user) {
        router.replace('/showcase/login');
        return;
      }

      if (requiredRole !== ROLES.GUEST && user.role === ROLES.GUEST && !isAllowedDomain) {
        router.replace('/showcase/login');
        return;
      }

      if (requiredRole === ROLES.ADMIN && user.role !== ROLES.ADMIN) {
        router.replace('/showcase');
      }
    }, [isAllowedDomain, loading, router, user]);

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
            <h2 className="text-xl font-semibold mb-4">{'\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059'}</h2>
            <p>{'\u753b\u9762\u3092\u8868\u793a\u3059\u308b\u306b\u306f\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u304f\u3060\u3055\u3044\u3002'}</p>
          </div>
        </div>
      );
    }

    if (requiredRole !== ROLES.GUEST && user.role === ROLES.GUEST && !isAllowedDomain) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">{'\u30b2\u30b9\u30c8\u6a29\u9650\u3067\u306f\u5229\u7528\u3067\u304d\u307e\u305b\u3093'}</h2>
            <p>{'\u5b66\u5185\u30a2\u30ab\u30a6\u30f3\u30c8\u3067\u30ed\u30b0\u30a4\u30f3\u3057\u3066\u304f\u3060\u3055\u3044\u3002'}</p>
          </div>
        </div>
      );
    }

    if (requiredRole === ROLES.ADMIN && user.role !== ROLES.ADMIN) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-4">{'\u30a2\u30af\u30bb\u30b9\u6a29\u9650\u304c\u3042\u308a\u307e\u305b\u3093'}</h2>
            <p>{'\u7ba1\u7406\u8005\u6a29\u9650\u304c\u5fc5\u8981\u3067\u3059\u3002'}</p>
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
