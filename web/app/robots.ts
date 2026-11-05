import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    // The signed-in pages are private to each shopper and have nothing to index.
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/account', '/saved', '/stylist', '/rounds', '/quiz'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
