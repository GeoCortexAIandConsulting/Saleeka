/**
 * A brand link with Saleeqa's tracking tags (utm_source=saleeqa, utm_medium=referral,
 * utm_campaign=<campaign>), keeping the link's own query string and #anchor. Tags already on the
 * link are replaced, never doubled. A link that is not a web address is left as it is.
 */
export function withUtm(link: string, campaign: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return link;
  url.searchParams.set('utm_source', 'saleeqa');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', campaign);
  return url.toString();
}
