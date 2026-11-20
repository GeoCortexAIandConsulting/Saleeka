import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, Noto_Nastaliq_Urdu } from 'next/font/google';
import './globals.css';
import RefCapture from '@/components/RefCapture';
import Toaster from '@/components/Toaster';

const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
// Only the one Urdu word uses this large font, so it is not preloaded.
const urdu = Noto_Nastaliq_Urdu({ subsets: ['arabic'], weight: ['500'], variable: '--font-urdu', display: 'swap', preload: false });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TITLE = 'Saleeqa: style the look, walk the Runway';
const DESCRIPTION =
  'A styling game for Pakistani fashion: build complete head-to-toe looks from real pieces by your favourite brands, then share them on the Runway.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Saleeqa',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/videos/hero-poster.jpg', width: 1280, height: 720, alt: 'A cream dupatta with gold embroidery floating in warm light' }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/videos/hero-poster.jpg'] },
};

// Browser tab and home-screen icons come from app/icon.png and app/apple-icon.png.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#6B2D5C' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${urdu.variable}`}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before React loads; ignore just those. */}
      <body suppressHydrationWarning>
        {children}
        <Toaster />
        <RefCapture />
      </body>
    </html>
  );
}
