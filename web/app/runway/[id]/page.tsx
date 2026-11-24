import type { Metadata } from 'next';
import { preload } from 'react-dom';
import { photo } from '@/lib/photo';
import LookView from './LookView';

/**
 * A look's own page. The page itself runs in the browser (LookView); this server part only gives
 * shared links their preview: WhatsApp and others show the look's title, who styled it, and its image.
 */
const API_URL = process.env.API_URL || 'http://localhost:4000';

type Look = { by: string; total: number; previewUrl: string | null; challenge: { title: string } | null; items: Array<{ slot: string; product: { brandName: string; images?: string[] } }> };

async function publicLook(id: string): Promise<Look | null> {
  try {
    const res = await fetch(`${API_URL}/api/feed/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as { look: Look }).look : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const look = await publicLook(id);
  // A look that is gone (or hidden after a report) stays out of search results.
  if (!look) return { title: 'A look on Saleeqa', robots: { index: false } };
  // What the look is first (what people search for), then who styled it: "Mehndi look under PKR 20,000 by ayesha_7".
  const title = `${look.challenge?.title ?? 'A look'} by ${look.by}`;
  const brands = [...new Set(look.items.map((i) => i.product.brandName))].slice(0, 4).join(', ');
  const description = `Styled on Saleeqa from real pieces${brands ? ` by ${brands}` : ''}. Total Rs. ${look.total.toLocaleString('en-PK')}. Like it, or style your own.`;
  // WhatsApp shows small JPEGs reliably (not WebP), so link previews get a JPEG copy of the look's
  // image; a look without one gets the site's picture. The tags never depend on ?ref=, so invite
  // links preview exactly like plain ones (og:url stays the plain look address).
  const images = look.previewUrl
    ? [{ url: `${look.previewUrl}?format=jpg`, width: 600, height: 800, type: 'image/jpeg', alt: title }]
    : [{ url: '/videos/hero-poster.jpg', width: 1280, height: 720, type: 'image/jpeg', alt: 'Saleeqa' }];
  return {
    title: `${title} · Saleeqa`,
    description,
    // Shared links carry ?ref= (invites): they are all this one page to search engines.
    alternates: { canonical: `/runway/${id}` },
    openGraph: { title, description, type: 'article', siteName: 'Saleeqa', url: `/runway/${id}`, images },
    twitter: { card: 'summary_large_image', title, description, images: images.map((i) => i.url) },
  };
}

export default async function LookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The biggest picture on the page (the AI preview, else the outfit's photo) starts loading with the page,
  // not after the page's script has asked for the look (the same request generateMetadata made: cached).
  const look = await publicLook(id);
  const hero = look?.previewUrl ?? photo(look?.items.find((i) => i.slot === 'main')?.product.images?.[0], 640);
  // Brand photos are fetched with no referrer (as the img does), so the early copy is the one the page uses.
  if (hero) preload(hero, { as: 'image', fetchPriority: 'high', ...(look?.previewUrl ? {} : { referrerPolicy: 'no-referrer' as const }) });
  return <LookView id={id} />;
}
