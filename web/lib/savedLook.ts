/** Where the Studio keeps a look in progress on this device (see app/studio/page.tsx). */
export const GUEST_LOOK_KEY = 'saleeqa:studio:guest';
export const lookKey = (userId: string) => `saleeqa:studio:${userId}`;
/** A look left unfinished is offered again for a week. */
export const LOOK_KEPT_FOR = 7 * 24 * 60 * 60 * 1000;

/** Is there an unfinished look on this device the player can go back to? */
export function hasSavedLook(userId: string | null): boolean {
  for (const key of userId ? [lookKey(userId), GUEST_LOOK_KEY] : [GUEST_LOOK_KEY]) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as { look?: Record<string, unknown>; at?: number } | null;
      if (saved?.at && Date.now() - saved.at < LOOK_KEPT_FOR && Object.values(saved.look ?? {}).some(Boolean)) return true;
    } catch {
      /* nothing saved, or storage blocked */
    }
  }
  return false;
}
