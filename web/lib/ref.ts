/**
 * Invites: a share link carries ?ref=<the sharer's id>. The visitor may look around before signing
 * up, so the id is kept on this device for 30 days and sent with the sign-up.
 */
const KEY = 'saleeqa:ref';
const DAYS_30 = 30 * 24 * 60 * 60 * 1000;

export function rememberRef() {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[\w-]{6,80}$/.test(ref)) localStorage.setItem(KEY, JSON.stringify({ ref, at: Date.now() }));
  } catch {
    /* storage blocked: the invite is not kept */
  }
}

export function readRef(): string | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { ref: string; at: number } | null;
    return saved && Date.now() - saved.at < DAYS_30 ? saved.ref : undefined;
  } catch {
    return undefined;
  }
}

/** A link to a look that brings the sharer credit when a friend joins from it. */
export const shareUrl = (lookId: string, myId?: string | null) => `${window.location.origin}/runway/${lookId}${myId ? `?ref=${encodeURIComponent(myId)}` : ''}`;
