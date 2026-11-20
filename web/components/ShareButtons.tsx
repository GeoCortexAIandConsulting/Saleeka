'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { shareUrl } from '@/lib/ref';
import type { Me } from '@/lib/types';

/**
 * Share a look: straight to WhatsApp (the way most people in Pakistan share), or through the phone's
 * own share sheet, or by copying the link. The link opens the look for anyone, even without an account,
 * and carries the sharer's invite: friends who join from it and publish a look earn the sharer previews.
 */
export default function ShareButtons({ lookId, text, compact = false }: { lookId: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  useEffect(() => {
    api<Me>('/me')
      .then((m) => setMyId(m.user.id))
      .catch(() => {}); // a visitor shares the plain link
  }, []);
  const url = () => shareUrl(lookId, myId);

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url()}`)}`, '_blank', 'noopener,noreferrer');
  }

  async function other() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Saleeqa', text, url: url() });
      } catch {
        /* closed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link', url());
    }
  }

  const h = compact ? '!min-h-[40px] !py-2 text-sm' : '!min-h-[44px]';
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={whatsapp} className={`btn ${h} gap-2 border border-transparent bg-[#25D366] text-[#073b1d] hover:bg-[#1fbe5b]`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.9-.9-2.9-2.6-.2-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.6 2.5 4 3.5 1.5.6 2 .7 2.8.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3Z" />
        </svg>
        WhatsApp
      </button>
      <button type="button" onClick={other} className={`btn btn-ghost ${h}`} aria-live="polite">
        {copied ? 'Link copied ✓' : 'Share link'}
      </button>
    </div>
  );
}
