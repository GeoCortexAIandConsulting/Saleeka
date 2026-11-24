/**
 * Invites: a share link carries ?ref=<the sharer's id>. The visitor may look around before signing
 * up, so the id is kept on this device for 30 days (and for this visit, in case long-term storage is
 * blocked) and sent with the sign-up.
 */
const KEY = 'saleeqa:ref';
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
const valid = (ref: string | null): ref is string => Boolean(ref && /^[\w-]{6,80}$/.test(ref));
const fromUrl = () => {
  const ref = new URLSearchParams(window.location.search).get('ref');
  return valid(ref) ? ref : undefined;
};

export function rememberRef() {
  const ref = fromUrl();
  if (!ref) return;
  const saved = JSON.stringify({ ref, at: Date.now() });
  try {
    localStorage.setItem(KEY, saved);
  } catch { /* storage blocked */ }
  try {
    sessionStorage.setItem(KEY, saved);
  } catch { /* storage blocked: the invite is not kept */ }
}

/** The invite to send with a sign-up: from the address itself, else as kept on this device. */
export function readRef(): string | undefined {
  const now = fromUrl();
  if (now) return now;
  for (const store of ['localStorage', 'sessionStorage'] as const) {
    try {
      const saved = JSON.parse(window[store].getItem(KEY) ?? 'null') as { ref: string; at: number } | null;
      if (saved && valid(saved.ref) && Date.now() - saved.at < DAYS_30) return saved.ref;
    } catch {
      /* nothing kept, or storage blocked */
    }
  }
  return undefined;
}

/** A link to a look that brings the sharer credit when a friend joins from it. */
export const shareUrl = (lookId: string, myId?: string | null) => `${window.location.origin}/runway/${lookId}${myId ? `?ref=${encodeURIComponent(myId)}` : ''}`;
