'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import { api } from '@/lib/api';
import { hasSavedLook } from '@/lib/savedLook';
import { DEV_VERIFY_LINK, EMAIL_VERIFIED } from '@/lib/verifyEmail';

/** Opened from the "confirm your email" link (?token=…): it confirms the email and signs the player in. */
export default function Verify() {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState('');
  /** A look left unfinished on this device, to go straight back to */
  const [backToLook, setBackToLook] = useState(false);
  // A link works once: never send it twice (React runs effects twice while developing).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setError('This page needs the link from your email.');
      setState('failed');
      return;
    }
    api<{ user: { id: string } }>('/auth/verify', { body: { token } })
      .then((r) => {
        setBackToLook(hasSavedLook(r.user.id));
        try {
          sessionStorage.removeItem(DEV_VERIFY_LINK);
        } catch { /* storage blocked */ }
        setState('done');
        window.dispatchEvent(new Event(EMAIL_VERIFIED));
      })
      .catch((e) => {
        setError((e as Error).message);
        setState('failed');
      });
  }, []);

  return (
    <>
      <Header />
      <AuthShell>
        {state === 'working' && (
          <p className="text-ink/80" role="status">
            Confirming your email…
          </p>
        )}
        {state === 'done' && (
          <div role="status">
            <p className="text-3xl" aria-hidden="true">✨</p>
            <h1 className="mt-2 text-3xl font-bold">Email confirmed</h1>
            <p className="mt-2 text-ink/75">
              You’re signed in, and your free AI previews are unlocked: see your look on a model before you publish it.
            </p>
            {backToLook ? (
              <>
                <Link className="btn btn-primary mt-6 w-full" href="/studio?continue=1">Back to my look</Link>
                <Link className="btn btn-ghost mt-3 w-full" href="/studio">Start a new look</Link>
              </>
            ) : (
              <Link className="btn btn-primary mt-6 w-full" href="/studio">Start styling</Link>
            )}
          </div>
        )}
        {state === 'failed' && (
          <div>
            <h1 className="text-3xl font-bold">That link did not work</h1>
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
            <p className="mt-4 text-sm text-ink/75">Already confirmed? Just sign in. Otherwise, sign in and press “Resend email” at the top of the page for a new link.</p>
            <Link className="btn btn-primary mt-6 w-full" href="/login">Sign in</Link>
          </div>
        )}
      </AuthShell>
    </>
  );
}
