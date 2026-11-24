'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { DEV_VERIFY_LINK, EMAIL_VERIFIED, resendConfirmation } from '@/lib/verifyEmail';

/** Closing the banner hides it for this visit (this browser tab) only. */
const CLOSED_KEY = 'saleeqa:verify-banner-closed';

/**
 * A slim note under the header for signed-in players whose email is not confirmed yet: confirming
 * unlocks their free AI previews. It checks again whenever the player comes back to the tab (the
 * link is usually opened in another tab or on the phone), and goes away once confirmed.
 */
export default function VerifyBanner() {
  const [show, setShow] = useState(false);
  const [free, setFree] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /** Laptop testing only: the link the email carries */
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    let closed = false;
    try {
      closed = sessionStorage.getItem(CLOSED_KEY) === '1';
    } catch { /* storage blocked: show it */ }
    if (closed) return;
    try {
      setDevLink(sessionStorage.getItem(DEV_VERIFY_LINK));
    } catch { /* storage blocked */ }
    const check = () =>
      api<Me>('/me')
        .then((m) => {
          const pending = m.user.emailVerified === false;
          setShow(pending);
          if (pending)
            api<{ status?: { left: number } }>('/game/preview')
              .then((r) => setFree(r.status ? r.status.left : null))
              .catch(() => {});
        })
        .catch(() => setShow(false)); // signed out
    check();
    const again = () => document.visibilityState === 'visible' && check();
    const gone = () => setShow(false);
    document.addEventListener('visibilitychange', again);
    window.addEventListener(EMAIL_VERIFIED, gone);
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener(EMAIL_VERIFIED, gone);
    };
  }, []);

  if (!show) return null;

  function close() {
    setShow(false);
    try {
      sessionStorage.setItem(CLOSED_KEY, '1');
    } catch { /* closes for now anyway */ }
  }

  async function resend() {
    setBusy(true);
    const r = await resendConfirmation();
    if (r?.devLink) setDevLink(r.devLink);
    setBusy(false);
  }

  const unlock = free && free > 0 ? `your ${free} free AI preview${free === 1 ? '' : 's'}` : 'your free AI previews';
  return (
    <div className="border-b border-gold/40 bg-plum-soft" role="region" aria-label="Confirm your email">
      <div className="page flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
        <p className="min-w-0 flex-1 basis-48 text-sm text-ink">
          <span aria-hidden="true">✉️ </span>
          Confirm your email to unlock {unlock}
        </p>
        <div className="flex items-center gap-1">
          {devLink && (
            <a href={devLink} className="inline-flex min-h-[40px] items-center rounded-full px-3 text-sm font-semibold text-plum-dark underline underline-offset-2">
              Open link (testing)
            </a>
          )}
          <button type="button" onClick={resend} disabled={busy} className="btn btn-primary !min-h-[40px] !px-4 !py-1.5 text-sm">
            {busy ? 'Sending…' : 'Resend email'}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Close this note for now"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-ink/70 hover:bg-white/70 hover:text-ink"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
