'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { api } from '@/lib/api';

/** The admin portal's own sign-in: the admin username and password from the server settings. */
export default function AdminLogin() {
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    api<{ configured: boolean; signedIn: boolean }>('/admin/session')
      .then((s) => {
        if (s.signedIn) router.replace('/admin');
        setConfigured(s.configured);
      })
      .catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/admin/login', { body: form });
      router.replace('/admin');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-plum to-plum-dark px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-ivory p-6 sm:p-8">
        <Logo />
        <p className="eyebrow mt-4">Admin portal</p>
        <h1 className="mt-1 text-3xl font-bold">Sign in</h1>
        {!configured && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            The admin login is not set up yet. Add ADMIN_USERNAME and ADMIN_PASSWORD to the server settings, then restart the server.
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Username
            <input className="input mt-1" autoComplete="username" autoCapitalize="none" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input className="input mt-1" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-6 text-xs text-ink/70">This is separate from player accounts. You stay signed in for 12 hours.</p>
      </div>
    </main>
  );
}
