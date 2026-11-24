import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, Noto_Nastaliq_Urdu } from 'next/font/google';
import './globals.css';
import RefCapture from '@/components/RefCapture';
import Toaster from '@/components/Toaster';
import { preconnect } from 'react-dom';

// Headings only: its 8 files are fetched when a page uses them (not preloaded), so they never hold up the main image.
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--font-display', display: 'swap', preload: false });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
// Only the one Urdu word uses this large font, so it is not preloaded.
const urdu = Noto_Nastaliq_Urdu({ subsets: ['arabic'], weight: ['500'], variable: '--font-urdu', display: 'swap', preload: false });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TITLE = 'Saleeqa: build your wedding look, free';
const DESCRIPTION =
  'A free wedding-season styling game: build your full wedding look from 20+ Pakistani brands, within your budget, in 2 minutes. Real products and prices, mix brands in one look, and see it on a model with AI.';

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
  // Product photos come from the brands' Shopify image CDN: connect to it early.
  preconnect('https://cdn.shopify.com');
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
