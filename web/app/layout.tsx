import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Saleeqa: your personal stylist for Pakistani fashion',
  description:
    'Tell us your taste once. Saleeqa builds complete head-to-toe looks from your favourite brands, modest-friendly and in PKR.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#6B2D5C' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before React loads; ignore just those. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
