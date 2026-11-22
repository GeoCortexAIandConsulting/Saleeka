'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import DevLink from '@/components/DevLink';
import UsernameField, { type UsernameState } from '@/components/UsernameField';
import { toast } from '@/components/Toaster';
import { api, nextPath } from '@/lib/api';
import { readRef } from '@/lib/ref';

/**
 * Creating an account: name, username, email, password. The last step is the link in the
 * confirmation email, which finishes the account and signs the player in (once, never again).
 */
export default function Signup() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [nameState, setNameState] = useState<UsernameState>('empty');
  // Keep ?next= when switching between sign-up and sign-in.
  const [qs, setQs] = useState('');
  useEffect(() => setQs(window.location.search), []);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** The address the confirmation link went to, once the form is sent */
  const [sentTo, setSentTo] = useState('');
  const [resent, setResent] = useState(false);
  /** Laptop testing only: the link the email carries */
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ email?: string; devLink?: string; user?: unknown }>('/auth/signup', { body: { ...form, username: form.username.trim().replace(/^@/, ''), consent, ref: readRef() } });
      // Email confirmation switched off: the account is ready and signed in.
      if (r.user) {
        router.replace(nextPath('/studio'));
        return;
      }
      setSentTo(r.email ?? form.email);
      setDevLink(r.devLink ?? null);
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function resend() {
    try {
      const r = await api<{ devLink?: string }>('/auth/verify/resend', { body: { email: sentTo } });
      if (r.devLink) setDevLink(r.devLink);
      setResent(true);
      toast('We sent the link again. Check your inbox (and spam).', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (sentTo) {
    return (
      <>
        <Header signedIn={false} />
        <AuthShell>
          <div role="status">
            <p className="text-4xl" aria-hidden="true">📩</p>
            <h1 className="mt-2 text-3xl font-bold">Check your email</h1>
            <p className="mt-2 text-ink/75">
              We sent a link to <strong>{sentTo}</strong>. Open it to finish creating your account: it signs you in straight away.
            </p>
            <DevLink href={devLink} label="Open the confirmation link" />
            <p className="mt-3 text-sm text-ink/70">You only do this once. The link works for 7 days. Can’t find it? Look in spam or promotions.</p>
            <button type="button" className="btn btn-ghost mt-6 w-full" disabled={resent} onClick={resend}>
              {resent ? 'Link sent again' : 'Send the link again'}
            </button>
            <p className="mt-4 text-center text-sm">
              Wrong address?{' '}
              <button type="button" className="font-semibold text-plum underline-offset-2 hover:underline" onClick={() => setSentTo('')}>
                Go back
              </button>
            </p>
          </div>
        </AuthShell>
      </>
    );
  }

  return (
    <>
      <Header signedIn={false} />
      <AuthShell>
        <h1 className="text-3xl font-bold">Create your account</h1>
        <p className="mt-1 text-ink/70">Free. Then style your first look in the Studio.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Your name
            <input className="input mt-1" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <UsernameField value={form.username} onChange={(username) => setForm({ ...form, username })} onState={setNameState} />
          <label className="block text-sm font-medium">
            Email
            <input className="input mt-1" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Password (8+ characters)
            <input className="input mt-1" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="flex items-start gap-3 text-sm text-ink/80">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[#6B2D5C]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree that Saleeqa stores my style answers to personalise looks. I can delete all my data any time from Account.</span>
          </label>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy || !consent || nameState === 'bad' || nameState === 'checking'}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="mt-6 text-center text-sm">Already have an account? <Link className="font-semibold text-plum" href={`/login${qs}`}>Sign in</Link></p>
      </AuthShell>
    </>
  );
}
