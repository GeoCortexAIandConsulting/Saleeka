'use client';
import Link from 'next/link';
import { useState } from 'react';
import DevLink from '@/components/DevLink';
import { BrandAuthFrame } from '@/components/brand/BrandShell';
import { api } from '@/lib/api';

export default function BrandForgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await api<{ devLink?: string }>('/brand/forgot', { body: { email } });
      setDevLink(r.devLink ?? null);
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <BrandAuthFrame title="Forgot your password?">
      {sent ? (
        <div role="status" className="mt-4 text-ink/80">
          <p>If <strong>{email}</strong> belongs to an approved brand, we sent it a link to choose a new password. It works for one hour.</p>
          <DevLink href={devLink} label="Open the reset link" />
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Your brand account's email
            <input className="input mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full">Send me a link</button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link className="text-plum" href="/login">
          Back to sign in
        </Link>
      </p>
    </BrandAuthFrame>
  );
}
