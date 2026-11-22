'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { toast } from '@/components/Toaster';
import { api, ApiError } from '@/lib/api';

const NAV = [
  { href: '/brand', label: 'Dashboard' },
  { href: '/brand/items', label: 'My pieces' },
  { href: '/brand/items/new', label: 'Add a piece' },
  { href: '/brand/upload', label: 'Upload a spreadsheet' },
  { href: '/brand/account', label: 'Account' },
];
/** Pages a brand without a session can open. */
const PUBLIC = ['/brand/login', '/brand/apply', '/brand/forgot', '/brand/reset'];

export type BrandAccount = {
  id: string;
  email: string;
  contactName: string;
  phone: string;
  brandName: string;
  website: string | null;
  instagram: string | null;
  city: string | null;
  about: string | null;
  tier: string;
  sells: 'female' | 'male' | 'both';
  status: string;
  brandId: string | null;
  createdAt: string;
};

const AccountContext = createContext<{ account: BrandAccount; setAccount: (a: BrandAccount) => void } | null>(null);

/** The signed-in brand account (inside the brand portal's pages). */
export function useBrandAccount() {
  return useContext(AccountContext)!;
}

/** The brand portal's frame: its own menu, and a check that an approved brand is signed in. */
export default function BrandShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const open = PUBLIC.includes(path);
  const [account, setAccount] = useState<BrandAccount | null>(null);

  useEffect(() => {
    if (open) return;
    api<{ account: BrandAccount }>('/brand/me')
      .then((r) => setAccount(r.account))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 403) toast(e.message, 'error');
        router.replace('/login');
      });
  }, [open, router]);

  if (open) return <>{children}</>;
  if (!account) return <p className="py-20 text-center text-sm text-ink/70">Opening your brand dashboard…</p>;

  const active = (href: string) => (href === '/brand' ? path === '/brand' : href === '/brand/items' ? path === '/brand/items' || /^\/brand\/items\/(?!new)/.test(path) : path.startsWith(href));
  async function signOut() {
    await api('/brand/logout', { method: 'POST', body: {} }).catch(() => {});
    router.replace('/login');
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-white print:hidden lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block lg:px-5 lg:py-6">
          <Link href="/brand" className="flex items-center gap-2" aria-label="Brand dashboard">
            <Logo />
          </Link>
          <div className="min-w-0 text-right lg:mt-3 lg:text-left">
            <span className="eyebrow block">For brands</span>
            <span className="block truncate text-sm font-semibold">{account.brandName}</span>
          </div>
        </div>
        <nav aria-label="Brand dashboard" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={`flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm lg:rounded-xl ${active(n.href) ? 'bg-plum text-white' : 'text-ink hover:bg-sand'}`}
            >
              {n.label}
            </Link>
          ))}
          <button onClick={signOut} className="flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm text-ink/80 hover:bg-sand lg:mt-4 lg:rounded-xl">
            Sign out
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <AccountContext.Provider value={{ account, setAccount }}>{children}</AccountContext.Provider>
      </main>
    </div>
  );
}

/** The plum frame of the sign-in, apply and password pages. */
export function BrandAuthFrame({ title, children, wide = false }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-plum to-plum-dark px-4 py-10">
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-3xl bg-ivory p-6 sm:p-8`}>
        <Link href="/" aria-label="Saleeqa home">
          <Logo />
        </Link>
        <p className="eyebrow mt-4">Saleeqa for brands</p>
        <h1 className="mt-1 text-3xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
