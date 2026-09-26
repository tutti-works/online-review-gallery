'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
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
  const [keyboardFocus, setKeyboardFocus] = useState(false);
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
    <div
      className="atelier"
      data-keyboard-focus={keyboardFocus}
      onPointerDownCapture={() => setKeyboardFocus(false)}
      onKeyDownCapture={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.altKey) {
          setKeyboardFocus(true);
        }
      }}
    >
      <a className="atelier-skip" href="#atelier-content">
        コンテンツへ移動
      </a>
      <header className="atelier-top">
        <Link
          href="/gallery"
          className="atelier-brand"
          aria-label="ATRIA ホーム"
        >
          <Image
            src="/brand/atria-logo.svg"
            alt="ATRIA — DESIGN REVIEW GALLERY"
            width={970}
            height={240}
            className="atelier-brand-image"
            priority
            unoptimized
          />
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
        <span>ATRIA — DESIGN REVIEW GALLERY</span>
        <span>Ideas deserve a little more space.</span>
      </footer>
    </div>
  );
}
