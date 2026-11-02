'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const LINKS = [
  { href: '/stylist', label: 'Stylist' },
  { href: '/rounds', label: 'My taste' },
  { href: '/saved', label: 'Saved' },
  { href: '/account', label: 'Account' },
];

export default function Header({ signedIn = true }: { signedIn?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ivory/95 backdrop-blur">
      <div className="page flex items-center justify-between gap-2 py-3">
        <Link href={signedIn ? '/stylist' : '/'} className="font-display text-2xl font-bold tracking-tight text-plum">
          Saleeqa
        </Link>
        {signedIn ? (
          <nav className="flex items-center gap-0.5 text-sm sm:gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-full px-2.5 py-2 sm:px-3 ${path === l.href ? 'bg-plum-soft font-semibold text-plum-dark' : 'text-ink/70 hover:bg-sand'}`}
              >
                {l.label}
              </Link>
            ))}
            <button
              className="ml-1 hidden rounded-full px-3 py-2 text-ink/60 hover:bg-sand sm:block"
              onClick={async () => {
                await api('/auth/logout', { method: 'POST', body: {} });
                router.replace('/');
              }}
            >
              Sign out
            </button>
          </nav>
        ) : (
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-full px-3 py-2 hover:bg-sand">Sign in</Link>
            <Link href="/signup" className="btn btn-primary !py-2">Get started</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
