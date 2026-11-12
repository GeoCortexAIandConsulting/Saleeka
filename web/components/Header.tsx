'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/api';
import Logo from '@/components/Logo';
import NotificationBell from '@/components/NotificationBell';
import TabBar from '@/components/TabBar';

const LINKS = [
  // Studio: design looks · Runway: everyone's published looks. (The AI stylist is hidden for now:
  // it comes back once players' looks and rankings give it enough data.)
  { href: '/studio', label: 'Studio' },
  { href: '/runway', label: 'Runway' },
  { href: '/account', label: 'Account' },
];

export default function Header({ signedIn = true }: { signedIn?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-ivory/95 backdrop-blur">
        <div className="page flex items-center justify-between gap-2 py-3">
          <Link href={signedIn ? '/studio' : '/'} aria-label="Saleeqa" className="flex shrink-0 items-center">
            {/* The signed-in menu fills a phone's width, so there the emblem stands alone. */}
            {signedIn ? (
              <>
                <Logo variant="mark" className="sm:hidden" />
                <Logo className="hidden sm:inline-flex" />
              </>
            ) : (
              <Logo />
            )}
          </Link>
          {signedIn ? (
            // On narrow phones the five tabs can be wider than the screen, so the menu scrolls sideways
            // (and the current tab is scrolled into view) instead of running off the edge.
            <div className="flex min-w-0 items-center gap-1">
              <nav className="no-scrollbar hidden min-w-0 items-center gap-0 overflow-x-auto text-sm sm:flex sm:gap-1">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    ref={
                      path === l.href
                        ? (el) =>
                            el?.scrollIntoView({
                              block: 'nearest',
                              inline: 'nearest',
                            })
                        : undefined
                    }
                    className={`shrink-0 whitespace-nowrap rounded-full px-2 py-2 sm:px-3 ${path === l.href ? 'bg-plum-soft font-semibold text-plum-dark' : 'text-ink/70 hover:bg-sand'}`}
                  >
                    {l.label}
                  </Link>
                ))}
                <button
                  className="ml-1 hidden rounded-full px-3 py-2 text-ink/65 hover:bg-sand sm:block"
                  onClick={async () => {
                    await signOut();
                    router.replace('/');
                  }}
                >
                  Sign out
                </button>
              </nav>
              <NotificationBell />
            </div>
          ) : (
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/login" className="rounded-full px-3 py-2 hover:bg-sand">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary !py-2">
                Get started
              </Link>
            </nav>
          )}
        </div>
      </header>
      {/* Outside the header: its blur would pin a fixed bar to the header instead of the screen. */}
      {signedIn && <TabBar />}
    </>
  );
}
