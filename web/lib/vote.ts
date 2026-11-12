import { toast } from '@/components/Toaster';
import { api } from '@/lib/api';
import type { FeedLook } from '@/lib/types';

/**
 * Likes are public (a count on every look); "not my style" is private: it teaches the stylist but
 * is never shown as a number, so new players are not put off by public dislikes.
 * Tapping the same choice again takes it back. The screen updates straight away and is undone if
 * the server says no.
 */
export async function castVote(look: FeedLook, choice: 'up' | 'down', onChange: (l: FeedLook) => void) {
  const next = look.myVote === choice ? null : choice;
  const was = (v: FeedLook['myVote'], side: 'up' | 'down') => (v === side ? 1 : 0);
  onChange({
    ...look,
    myVote: next,
    up: look.up - was(look.myVote, 'up') + was(next, 'up'),
    down: look.down - was(look.myVote, 'down') + was(next, 'down'),
  });
  try {
    await api(`/game/designs/${look.id}/vote`, { body: { up: next === null ? null : next === 'up' } });
  } catch (e) {
    onChange(look);
    toast((e as Error).message || 'Your like was not saved. Please try again.', 'error');
  }
}
