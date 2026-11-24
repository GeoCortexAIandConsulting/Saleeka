/**
 * A product photo at the size it is shown. Brand shops serve full-size originals (often 400-500 KB);
 * their Shopify image CDN resizes on request (`width=`), so a 64-pixel thumbnail downloads a few
 * kilobytes instead. Ask for about twice the size on screen (sharp on phones). Photos on other hosts,
 * and our own images, are left as they are.
 */
export function photo(url: string | undefined | null, width: number): string {
  if (!url) return '';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url; // our own images ("/api/previews/…")
  }
  const shopify = u.hostname === 'cdn.shopify.com' || u.pathname.startsWith('/cdn/shop/');
  if (!shopify) return url;
  u.searchParams.set('width', String(Math.round(width)));
  return u.toString();
}

/** A srcset for a photo shown at different widths (`sizes` tells the browser which it needs). */
export const photoSet = (url: string | undefined | null, widths: number[]) =>
  url && photo(url, widths[0]) !== url ? widths.map((w) => `${photo(url, w)} ${w}w`).join(', ') : undefined;
