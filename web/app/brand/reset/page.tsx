'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BrandAuthFrame } from '@/components/brand/BrandShell';
import { api } from '@/lib/api';

export default function BrandReset() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const token = new URLSearchParams(window.location.search).get('token') ?? '';
      await api('/brand/reset', { body: { token, password } });
      router.replace('/brand');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <BrandAuthFrame title="Choose a new password">
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          New password (8+ characters)
          <input className="input mt-1" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </BrandAuthFrame>
  );
}
