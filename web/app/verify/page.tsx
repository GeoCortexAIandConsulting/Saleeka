'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import { api } from '@/lib/api';

/** Opened from the "confirm your email" link (?token=…): it finishes the account and signs the player in. */
export default function Verify() {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState('');
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
    api('/auth/verify', { body: { token } })
      .then(() => setState('done'))
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
            <h1 className="mt-2 text-3xl font-bold">Your account is ready</h1>
            <p className="mt-2 text-ink/75">Email confirmed, and you’re signed in. Style your first look: you also get a free AI preview to see it on a model.</p>
            <Link className="btn btn-primary mt-6 w-full" href="/studio">Start styling</Link>
          </div>
        )}
        {state === 'failed' && (
          <div>
            <h1 className="text-3xl font-bold">That link did not work</h1>
            <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
            <p className="mt-4 text-sm text-ink/75">Already confirmed? Just sign in. Otherwise, sign in and press “Send the link again” for a new one.</p>
            <Link className="btn btn-primary mt-6 w-full" href="/login">Sign in</Link>
          </div>
        )}
      </AuthShell>
    </>
  );
}
