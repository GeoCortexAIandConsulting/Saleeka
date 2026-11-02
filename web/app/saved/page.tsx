'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import LookCard from '@/components/LookCard';
import { api } from '@/lib/api';
import { useRequireUser } from '@/lib/useMe';
import type { Look } from '@/lib/types';

export default function Saved() {
  const me = useRequireUser({ needProfile: true });
  const [looks, setLooks] = useState<Look[] | null>(null);

  useEffect(() => {
    if (me) api<{ looks: Look[] }>('/looks/saved').then((d) => setLooks(d.looks));
  }, [me]);

  async function remove(look: Look) {
    await api(`/looks/${look.id}/save`, { body: { saved: false } });
    setLooks((ls) => (ls ?? []).filter((l) => l.id !== look.id));
  }

  return (
    <>
      <Header />
      <main className="page py-6 lg:py-10">
        <h1 className="text-3xl font-bold">Saved looks</h1>
        {looks === null ? (
          <p className="mt-6 text-ink/60">Loading…</p>
        ) : looks.length === 0 ? (
          <div className="card mt-6 text-center">
            <p className="text-ink/70">Nothing saved yet.</p>
            <Link href="/stylist" className="btn btn-primary mt-3">Find a look</Link>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 landscape:grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 lg:gap-6">
            {looks.map((l) => (
              <LookCard key={l.id} look={l} onSave={() => remove(l)} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
