'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import ShareButtons from '@/components/ShareButtons';
import { shareMessage, type ShareLang } from '@/lib/shareText';

const LANG_KEY = 'saleeqa:share-lang';

/**
 * Right after publishing: the look full-screen with sharing first, since friends joining from the
 * link is how Saleeqa grows (each one who publishes a look earns the player a free preview).
 * WhatsApp comes first and biggest; its message is written for them, in English or Roman Urdu.
 */
export default function LookLive({
  lookId,
  challengeTitle,
  total,
  imageUrl,
  fallback,
  canEarn,
  onClose,
}: {
  lookId: string;
  challengeTitle?: string | null;
  total: number;
  /** The AI preview of the look, if there is one */
  imageUrl?: string | null;
  /** Shown instead when there is no preview (the look's pieces) */
  fallback: ReactNode;
  /** False once the player has earned all the previews there are */
  canEarn: boolean;
  onClose: () => void;
}) {
  const [lang, setLang] = useState<ShareLang>('en');
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === 'ur') setLang('ur');
    } catch { /* storage blocked: English */ }
    heading.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', esc);
    // The page behind stays put while this is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
    };
  }, []);

  function pick(l: ShareLang) {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch { /* kept for now only */ }
  }

  const message = shareMessage(lang, challengeTitle, total);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="look-live-title" className="fixed inset-0 z-50 overflow-y-auto bg-ivory">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-4 pb-8 pt-4">
        <div className="flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-2xl text-ink/70 hover:bg-sand hover:text-ink">
            ×
          </button>
        </div>
        <p className="text-center text-3xl" aria-hidden="true">✨</p>
        <h1 ref={heading} tabIndex={-1} id="look-live-title" className="mt-1 text-center text-3xl font-semibold outline-none">
          Your look is live!
        </h1>
        <p className="mt-1 text-center text-sm text-ink/70">Send it to your friends and ask them to vote.</p>

        <div className="mx-auto mt-5 w-full max-w-[280px]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Your look on a model (AI preview)" className="aspect-[3/4] w-full rounded-3xl bg-sand object-cover shadow-lg" />
          ) : (
            fallback
          )}
        </div>

        {/* Which language the WhatsApp message is in */}
        <div className="mx-auto mt-5 flex rounded-full border border-line bg-white p-1 text-sm" role="group" aria-label="Message language">
          {(['en', 'ur'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => pick(l)}
              className={`min-h-[40px] rounded-full px-4 font-medium ${lang === l ? 'bg-plum text-white' : 'text-ink/75 hover:bg-sand'}`}
            >
              {l === 'en' ? 'English' : 'Roman Urdu'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-ink/70">“{message}”</p>

        <div className="mt-4">
          <ShareButtons lookId={lookId} text={message} stacked />
          <Link href={`/runway/${lookId}`} className="btn btn-ghost mt-3 w-full !min-h-[48px] text-base">
            See it on the Runway
          </Link>
        </div>
        <p className="mt-4 text-center text-sm text-ink/75">
          {canEarn ? 'Each friend who joins and publishes a look gives you +1 free preview (up to 5).' : 'You’ve earned all your free previews. Thank you for sharing!'}
        </p>
      </div>
    </div>
  );
}
