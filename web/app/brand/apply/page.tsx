'use client';
import Link from 'next/link';
import { useState } from 'react';
import { BrandAuthFrame } from '@/components/brand/BrandShell';
import { api } from '@/lib/api';

const EMPTY = { brandName: '', contactName: '', email: '', phone: '', password: '', website: '', instagram: '', city: '', about: '', tier: 'mid', sells: 'female' };

/** A brand applies for an account; the Saleeqa team approves it before the brand can sign in. */
export default function BrandApply() {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/brand/apply', { body: form });
      setSent(form.email);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <BrandAuthFrame title="Application sent">
        <div role="status">
          <p className="mt-3 text-ink/80">
            Thank you! Our team will review <strong>{form.brandName}</strong> and email <strong>{sent}</strong> as soon as it is approved, usually within two working days.
          </p>
          <p className="mt-3 text-sm text-ink/70">Once approved, sign in with the email and password you chose to add your pieces.</p>
          <Link className="btn btn-primary mt-6 w-full" href="/login">
            Go to sign in
          </Link>
        </div>
      </BrandAuthFrame>
    );
  }

  return (
    <BrandAuthFrame title="Apply as a brand" wide>
      <p className="mt-2 text-sm text-ink/75">
        Put your pieces in front of shoppers who style complete looks, and see how they style them. Applications are checked by our team before your account opens.
      </p>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Brand name" className="sm:col-span-2">
          <input className="input mt-1" required minLength={2} maxLength={60} value={form.brandName} onChange={set('brandName')} />
        </Field>
        <Field label="Your name">
          <input className="input mt-1" required autoComplete="name" maxLength={80} value={form.contactName} onChange={set('contactName')} />
        </Field>
        <Field label="Phone (WhatsApp)">
          <input className="input mt-1" required type="tel" autoComplete="tel" minLength={7} maxLength={30} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <input className="input mt-1" required type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password (8+ characters)">
          <input className="input mt-1" required type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        <Field label="Website (optional)">
          <input className="input mt-1" type="url" placeholder="https://" value={form.website} onChange={set('website')} />
        </Field>
        <Field label="Instagram (optional)">
          <input className="input mt-1" placeholder="@yourbrand" value={form.instagram} onChange={set('instagram')} />
        </Field>
        <Field label="City (optional)">
          <input className="input mt-1" maxLength={60} value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Your prices">
          <select className="input mt-1" value={form.tier} onChange={set('tier')}>
            <option value="budget">Budget (most pieces under Rs 4,000)</option>
            <option value="mid">Mid-range</option>
            <option value="premium">Premium (most pieces over Rs 15,000)</option>
          </select>
        </Field>
        <Field label="You sell" className="sm:col-span-2">
          <select className="input mt-1" value={form.sells} onChange={set('sells')}>
            <option value="female">Women's wear</option>
            <option value="male">Men's wear</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="About your brand (optional)" className="sm:col-span-2">
          <textarea className="input mt-1 min-h-[96px]" maxLength={1000} value={form.about} onChange={set('about')} />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <button className="btn btn-primary sm:col-span-2" disabled={busy}>
          {busy ? 'Sending…' : 'Send my application'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        Already approved?{' '}
        <Link className="font-semibold text-plum" href="/login">
          Sign in
        </Link>
      </p>
    </BrandAuthFrame>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium ${className}`}>{label}{children}</label>;
}
