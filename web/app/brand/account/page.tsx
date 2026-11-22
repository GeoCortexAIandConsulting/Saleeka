'use client';
import { useState } from 'react';
import { PageTitle, Section, act, date } from '@/components/admin/ui';
import { useBrandAccount, type BrandAccount } from '@/components/brand/BrandShell';

export default function BrandAccountPage() {
  const { account, setAccount } = useBrandAccount();
  const [form, setForm] = useState({
    contactName: account.contactName,
    phone: account.phone,
    website: account.website ?? '',
    instagram: account.instagram ?? '',
    city: account.city ?? '',
    about: account.about ?? '',
  });
  const [pw, setPw] = useState({ current: '', next: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await act<{ account: BrandAccount }>('/brand/me', { method: 'PATCH', body: form }, 'Saved');
    if (r) setAccount(r.account);
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (await act('/brand/password', { body: pw }, 'Password changed')) setPw({ current: '', next: '' });
  }

  return (
    <>
      <PageTitle title="Account" intro={`${account.brandName} · ${account.email} · member since ${date(account.createdAt)}. To change the brand name or email, email the Saleeqa team.`} />
      <form onSubmit={save} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">
          Your name
          <input className="input mt-1" required maxLength={80} value={form.contactName} onChange={set('contactName')} />
        </label>
        <label className="block text-sm font-medium">
          Phone (WhatsApp)
          <input className="input mt-1" required type="tel" minLength={7} maxLength={30} value={form.phone} onChange={set('phone')} />
        </label>
        <label className="block text-sm font-medium">
          Website
          <input className="input mt-1" type="url" placeholder="https://" value={form.website} onChange={set('website')} />
        </label>
        <label className="block text-sm font-medium">
          Instagram
          <input className="input mt-1" value={form.instagram} onChange={set('instagram')} />
        </label>
        <label className="block text-sm font-medium">
          City
          <input className="input mt-1" maxLength={60} value={form.city} onChange={set('city')} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          About your brand
          <textarea className="input mt-1 min-h-[96px]" maxLength={1000} value={form.about} onChange={set('about')} />
        </label>
        <button className="btn btn-primary sm:col-span-2 sm:justify-self-start">Save</button>
      </form>

      <Section title="Password">
        <form onSubmit={changePassword} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Current password
            <input className="input mt-1" type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            New password (8+ characters)
            <input className="input mt-1" type="password" autoComplete="new-password" minLength={8} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <button className="btn btn-ghost sm:col-span-2 sm:justify-self-start">Change password</button>
        </form>
      </Section>
    </>
  );
}
