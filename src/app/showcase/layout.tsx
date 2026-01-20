'use client';

import './showcase.css';
import { Noto_Serif_JP, Noto_Sans_JP } from 'next/font/google';

const notoSerifJP = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
  variable: '--font-noto-serif-jp',
  display: 'swap',
});

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`showcase-theme min-h-screen ${notoSerifJP.variable} ${notoSansJP.variable} font-sans`}>
      <style jsx global>{`
        body {
          background-color: #121212; /* Force dark background at body level for overscroll */
        }
        :root {
          --font-serif: ${notoSerifJP.style.fontFamily};
          --font-sans: ${notoSansJP.style.fontFamily};
        }
      `}</style>
      {children}
    </div>
  );
}
