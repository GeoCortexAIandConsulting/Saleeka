import { toast } from '@/components/Toaster';
import { api, ApiError } from './api';

/** Sent when the player's email turns out to be confirmed, so every "confirm your email" note can go. */
export const EMAIL_VERIFIED = 'saleeqa:email-verified';
/** Laptop testing only (no email service): the link from sign-up, for the banner to offer. */
export const DEV_VERIFY_LINK = 'saleeqa:dev-verify-link';

/**
 * Sends the signed-in player a new "confirm your email" link and tells them how it went. Tapping
 * twice within a minute gets the server's friendly "we just sent one". Returns the link only on the
 * owner's laptop (no email service), so it can be opened without an inbox.
 */
export async function resendConfirmation(): Promise<{ devLink?: string } | null> {
  try {
    const r = await api<{ ok: true; verified?: boolean; devLink?: string }>('/me/verify/resend', { method: 'POST' });
    if (r.verified) {
      toast('Your email is already confirmed.', 'success');
      window.dispatchEvent(new Event(EMAIL_VERIFIED));
      return null;
    }
    toast('Sent! Check your inbox (and spam) for the link.', 'success');
    return r;
  } catch (e) {
    toast((e as Error).message, e instanceof ApiError && e.status === 429 ? 'info' : 'error');
    return null;
  }
}
