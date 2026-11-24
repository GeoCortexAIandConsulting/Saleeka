'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import PasswordInput from '@/components/PasswordInput';
import { useRouter } from 'next/navigation';
import UsernameField, { type UsernameState } from '@/components/UsernameField';
import { toast } from '@/components/Toaster';
import { api, nextPath } from '@/lib/api';
import { readRef } from '@/lib/ref';
import { DEV_VERIFY_LINK } from '@/lib/verifyEmail';

/**
 * Creating an account: name, username, email, password. The player is signed in straight away and
 * goes on playing; the link in the confirmation email unlocks their free AI previews.
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api<{ email: string; devLink?: string }>('/auth/signup', { body: { ...form, username: form.username.trim().replace(/^@/, ''), consent, ref: readRef() } });
      // Laptop testing only: hand the link to the banner, so it can be opened without an inbox.
      if (r.devLink) {
        try {
          sessionStorage.setItem(DEV_VERIFY_LINK, r.devLink);
        } catch { /* storage blocked: "Resend email" shows it too */ }
      }
      toast(`Welcome! We sent a link to ${r.email}: open it to unlock your free AI previews.`, 'success');
      router.replace(nextPath('/studio'));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
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
            <PasswordInput autoComplete="new-password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
