'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import AuthShell from '@/components/AuthShell';
import PasswordInput from '@/components/PasswordInput';
import { api, nextPath } from '@/lib/api';
import type { Me } from '@/lib/types';

export default function Login() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  // Keep ?next= when switching between sign-up and sign-in (a guest's look waits in the Studio).
  const [qs, setQs] = useState('');
  useEffect(() => setQs(window.location.search), []);

  const [busy, setBusy] = useState(false);

  // An email not confirmed yet does not stop sign-in: the banner under the header asks for it.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/login', { body: form });
      const me = await api<Me>('/me');
      router.replace(nextPath(me.hasProfile ? '/studio' : '/quiz'));
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Header signedIn={false} />
      <AuthShell>
        <h1 className="text-3xl font-bold">Welcome back</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Email
            <input className="input mt-1" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <PasswordInput autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <p className="-mt-2 text-right text-sm">
            <Link className="text-plum underline-offset-2 hover:underline" href="/forgot">Forgot password?</Link>
          </p>
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="mt-6 text-center text-sm">New here? <Link className="font-semibold text-plum" href={`/signup${qs}`}>Create an account</Link></p>
      </AuthShell>
    </>
  );
}
