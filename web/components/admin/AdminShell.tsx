'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { api } from '@/lib/api';

const NAV: Array<{ href: string; label: string; badge?: 'brands' | 'items' }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Players' },
  { href: '/admin/invites', label: 'Invites' },
  { href: '/admin/looks', label: 'Looks' },
  { href: '/admin/comments', label: 'Comments' },
  { href: '/admin/brands', label: 'Brands' },
  { href: '/admin/brand-accounts', label: 'Brand accounts', badge: 'brands' as const },
  { href: '/admin/review', label: 'Item review', badge: 'items' as const },
  { href: '/admin/challenges', label: 'Challenges' },
  { href: '/admin/winners', label: 'Week winners' },
  { href: '/admin/previews', label: 'AI previews' },
];

/**
 * The admin portal's frame: its own menu (no player header), and a check that the admin is signed in.
 * The sign-in page renders without the menu.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const onLogin = path === '/admin/login';
  const [ok, setOk] = useState(false);
  // What waits for the admin: brand applications and uploaded pieces (refreshed on every page change).
  const [waiting, setWaiting] = useState<{ brands: number; items: number }>({ brands: 0, items: 0 });
  useEffect(() => {
    if (!ok) return;
    api<{ brands: number; items: number }>('/admin/waiting').then(setWaiting).catch(() => {});
  }, [ok, path]);

  useEffect(() => {
    if (onLogin) return;
    api<{ signedIn: boolean }>('/admin/session')
      .then((s) => (s.signedIn ? setOk(true) : router.replace('/admin/login')))
      .catch(() => router.replace('/admin/login'));
  }, [onLogin, router]);

  if (onLogin) return <>{children}</>;
  if (!ok) return <p className="py-20 text-center text-sm text-ink/70">Checking your admin session…</p>;

  const active = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`));
  async function signOut() {
    await api('/admin/logout', { method: 'POST', body: {} }).catch(() => {});
    router.replace('/admin/login');
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-white print:hidden lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-6">
          <Link href="/admin" className="flex items-center gap-2" aria-label="Admin overview">
            <Logo />
          </Link>
          <span className="eyebrow lg:mt-2 lg:block">Admin</span>
        </div>
        {/* Phones: one row that scrolls inside itself; computers: a column. */}
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={`flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm lg:rounded-xl ${active(n.href) ? 'bg-plum text-white' : 'text-ink hover:bg-sand'}`}
            >
              {n.label}
              {n.badge && waiting[n.badge] > 0 && (
                <span className={`ml-2 rounded-full px-2 text-xs font-bold ${active(n.href) ? 'bg-white text-plum' : 'bg-gold-light text-night'}`} aria-label={`${waiting[n.badge]} waiting`}>
                  {waiting[n.badge]}
                </span>
              )}
            </Link>
          ))}
          <button onClick={signOut} className="flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm text-ink/80 hover:bg-sand lg:mt-4 lg:rounded-xl">
            Sign out
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
