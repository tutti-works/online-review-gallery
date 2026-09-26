'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  ArrowUpRight,
  Grid2X2,
  LayoutDashboard,
  LogIn,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isLocalPreview } from '@/lib/localPreview';
import '@/app/design.css';

export default function DesignShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const { user } = useAuth();
  if (path.startsWith('/showcase')) return <>{children}</>;
  const links = [
    { href: '/gallery', label: '作品ギャラリー', icon: Grid2X2 },
    { href: '/archive', label: 'アーカイブ', icon: Archive },
    { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
    ...(user?.role === 'admin'
      ? [{ href: '/admin/import', label: 'インポート', icon: Upload }]
      : []),
  ];
  return (
    <div className="atelier">
      <a className="atelier-skip" href="#atelier-content">
        コンテンツへ移動
      </a>
      <header className="atelier-top">
        <Link
          href="/gallery"
          className="atelier-brand"
          aria-label="オンライン講評会ギャラリー ホーム"
        >
          <span className="atelier-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            FORM<span className="atelier-brand-sub">DESIGN REVIEW GALLERY</span>
          </span>
        </Link>
        <div className="atelier-account">
          <span className="atelier-edition">A space for ideas.</span>
          {user ? (
            <Link href="/dashboard" className="atelier-person">
              <span className="atelier-avatar">
                {user.displayName?.slice(0, 1) || 'G'}
              </span>
              {user.displayName}
            </Link>
          ) : (
            <Link href="/" className="atelier-person">
              <LogIn size={16} />
              ログイン
            </Link>
          )}
        </div>
      </header>
      <div className="atelier-frame">
        <nav className="atelier-rail" aria-label="メインナビゲーション">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              aria-current={path === href ? 'page' : undefined}
            >
              <Icon size={21} strokeWidth={1.7} />
              <span>{label}</span>
            </Link>
          ))}
          <Link href="/showcase" title="ショーケース" aria-label="ショーケース">
            <ArrowUpRight size={21} />
            <span>ショーケース</span>
          </Link>
        </nav>
        <div id="atelier-content" className="atelier-content">
          {isLocalPreview() && (
            <div className="atelier-preview">
              LOCAL PREVIEW <span>実データを閲覧中 · 変更は保存されません</span>
            </div>
          )}
          {children}
        </div>
      </div>
      <footer className="atelier-footer">
        <span>FORM / オンライン講評会ギャラリー</span>
        <span>Ideas deserve a little more space.</span>
      </footer>
    </div>
  );
}
