import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:4000';

// Rebuilt at most once an hour (the look list from the API is cached for an hour too).
export const revalidate = 3600;

/** The newest 5,000 published looks: only ids and dates come from the API, nothing personal. */
async function looks(): Promise<Array<{ id: string; at: string }>> {
  try {
    const res = await fetch(`${API_URL}/api/sitemap/looks`, { next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as { looks: Array<{ id: string; at: string }> }).looks : [];
  } catch {
    return []; // the API is down: the sitemap still lists the main pages
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/runway`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/signup`, changeFrequency: 'yearly', priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/credits`, changeFrequency: 'yearly', priority: 0.2 },
    ...(await looks()).map((l) => ({ url: `${SITE_URL}/runway/${l.id}`, lastModified: new Date(l.at), changeFrequency: 'weekly' as const, priority: 0.5 })),
  ];
}
