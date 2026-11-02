/**
 * Credits for photos in web/public/silhouettes/<women|men>/<style>/, keyed by the photo's URL.
 * The quiz shows whatever is in those folders; this list adds the author and licence, shown on
 * hover and on /credits (CC BY and CC BY-SA require crediting the author).
 * Add an entry here whenever you drop in a photo that needs credit.
 * Wikimedia Commons photos (with credits) are parked in web/silhouette-archive/ and not served.
 */
export interface PhotoCredit {
  title?: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
}

export const PHOTO_CREDITS: Record<string, PhotoCredit> = {};
