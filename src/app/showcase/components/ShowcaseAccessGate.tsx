'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { isShowcaseDomainAllowed } from '@/utils/showcaseAccess';

type ShowcaseAccessGateProps = {
  children: React.ReactNode;
};

const ShowcaseAccessGate = ({ children }: ShowcaseAccessGateProps) => {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  if (!isShowcaseDomainAllowed(user.email)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">専用ギャラリーは学内ドメイン限定です</h1>
          <p className="mt-3 text-sm text-gray-600">
            musashino-u.ac.jp またはサブドメインのメールアドレスでログインしてください。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void logout()}
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

  return <>{children}</>;
};

export default ShowcaseAccessGate;
