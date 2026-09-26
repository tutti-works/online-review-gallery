import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import Script from 'next/script';
import DesignShell from '@/components/DesignShell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ATRIA — DESIGN REVIEW GALLERY',
  icons: { icon: { url: '/brand/atria-mark.svg', type: 'image/svg+xml' } },
  description: '大学設計課題のための講評会支援アプリケーション',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-Z0GDWHZBPQ"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-Z0GDWHZBPQ');
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <AuthProvider><DesignShell>{children}</DesignShell></AuthProvider>
      </body>
    </html>
  );
}
