'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Phones: the main places in an app-style bar at the bottom, within thumb's reach (the header
 * keeps the logo and the bell). Hidden from small tablets up, where the header has room for links.
 */
const TABS: Array<{ href: string; label: string; match: (p: string) => boolean; icon: React.ReactNode }> = [
  {
    href: '/studio',
    label: 'Studio',
    match: (p) => p.startsWith('/studio'),
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.5c1.1 0 2 .9 2 2 0 .8-.5 1.4-1.1 1.8L12 8v1.2m0 0L3.6 15a1.3 1.3 0 0 0 .7 2.4h15.4a1.3 1.3 0 0 0 .7-2.4L12 9.2Z" />,
  },
  {
    href: '/runway',
    label: 'Runway',
    match: (p) => p.startsWith('/runway'),
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" />,
  },
  {
    href: '/u/me',
    label: 'My looks',
    match: (p) => p === '/u/me',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5s-7.5-4.6-9.6-9.2C1 8 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2C21 4.5 23 8 21.6 11.3c-2.1 4.6-9.6 9.2-9.6 9.2Z" />,
  },
  {
    href: '/account',
    label: 'Account',
    match: (p) => p.startsWith('/account'),
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" />
        <path strokeLinecap="round" d="M5 19.5c1.3-3.2 4-4.8 7-4.8s5.7 1.6 7 4.8" />
      </>
    ),
  },
];

export default function TabBar() {
  const path = usePathname() ?? '';
  return (
    <nav className="tabbar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Main">
      <ul className="grid grid-cols-4">
        {TABS.map((t) => {
          const on = t.match(path);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${on ? 'text-plum' : 'text-ink/65'}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill={on && t.href === '/u/me' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                  {t.icon}
                </svg>
                {t.label}
                <span className={`mt-0.5 h-1 w-5 rounded-full ${on ? 'bg-plum' : 'bg-transparent'}`} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
