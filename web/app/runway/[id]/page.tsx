import type { Metadata } from 'next';
import LookView from './LookView';

/**
 * A look's own page. The page itself runs in the browser (LookView); this server part only gives
 * shared links their preview: WhatsApp and others show the look's title, who styled it, and its image.
 */
const API_URL = process.env.API_URL || 'http://localhost:4000';

type Look = { by: string; total: number; previewUrl: string | null; challenge: { title: string } | null; items: Array<{ product: { brandName: string } }> };

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
  if (!look) return { title: 'A look on Saleeqa' };
  const title = `${look.by}’s ${look.challenge?.title ?? 'look'}`;
  const brands = [...new Set(look.items.map((i) => i.product.brandName))].slice(0, 4).join(', ');
  const description = `Styled on Saleeqa from real pieces${brands ? ` by ${brands}` : ''}. Total Rs. ${look.total.toLocaleString('en-PK')}. Like it, or style your own.`;
  const images = look.previewUrl ? [{ url: look.previewUrl, width: 896, height: 1200, alt: title }] : undefined;
  return {
    title: `${title} · Saleeqa`,
    description,
    openGraph: { title, description, type: 'article', url: `/runway/${id}`, ...(images ? { images } : {}) },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description },
  };
}

export default async function LookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LookView id={id} />;
}
