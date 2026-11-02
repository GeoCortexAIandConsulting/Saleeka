'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import { api } from '@/lib/api';

export default function Signup() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/signup', { body: { ...form, consent } });
      router.replace('/quiz');
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
        <p className="mt-1 text-ink/70">Then a 3-minute taste quiz. No photos needed.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Your name
            <input className="input mt-1" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
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
          <button className="btn btn-primary w-full" disabled={busy || !consent}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="mt-6 text-center text-sm">Already have an account? <Link className="font-semibold text-plum" href="/login">Sign in</Link></p>
      </AuthShell>
    </>
  );
}
