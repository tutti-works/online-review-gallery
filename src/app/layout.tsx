import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/context/AuthContext';
import Script from 'next/script';

import ToastNotification from '@/components/ui/ToastNotification';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'オンライン講評会ギャラリー',
  description: '大学設計課題のための講評会支援アプリケーション',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className="dark">
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
      <body className={`${inter.className} min-h-screen bg-[#0b0f17] text-slate-100 antialiased selection:bg-orange-500/30 selection:text-orange-200`}>
        <AuthProvider>
          {children}
          <ToastNotification />
        </AuthProvider>
      </body>
    </html>
  );
}