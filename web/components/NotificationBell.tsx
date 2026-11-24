'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ago } from '@/components/LookComments';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/types';

/**
 * The bell in the header: a count of new likes, comments and replies (checked every minute and
 * whenever the tab comes back into view), and a panel listing them. Opening it marks them read.
 */
const WHAT: Record<AppNotification['type'], string> = {
  like: 'liked your look',
  comment: 'commented on your look',
  reply: 'replied to your comment',
  friend: 'joined from your link and published a look',
  credit: 'and others liked your look',
};

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<AppNotification[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const check = useCallback(() => {
    api<{ unread: number }>('/notifications/unread')
      .then((r) => setUnread(r.unread))
      .catch(() => {});
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 20_000); // new likes and comments show within 20 seconds
    const onShow = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [check]);

  // Close on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    try {
      const r = await api<{ notifications: AppNotification[]; unread: number }>('/notifications');
      setList(r.notifications);
      if (r.unread) {
        await api('/notifications/read', { method: 'POST' });
        setUnread(0);
      }
    } catch {
      setList([]);
    }
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread ? `Notifications: ${unread} new` : 'Notifications'}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink/70 hover:bg-sand"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
          <path strokeLinecap="round" d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-plum px-1 text-[11px] font-bold text-white ring-2 ring-ivory">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[64px] z-40 max-h-[70vh] overflow-y-auto rounded-3xl border border-line bg-white p-2 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]" role="dialog" aria-label="Notifications">
          <p className="px-3 pb-1 pt-2 text-sm font-semibold">Notifications</p>
          {!list ? (
            <p className="px-3 py-6 text-center text-sm text-ink/65">Loading…</p>
          ) : list.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium">Nothing yet</p>
              <p className="mt-1 text-xs text-ink/65">When someone likes or comments on your looks, you’ll see it here.</p>
            </div>
          ) : (
            <ul>
              {list.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/runway/${n.lookId}${n.type === 'like' || n.type === 'friend' || n.type === 'credit' ? '' : '#comments'}`}
                    onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-ivory ${n.read ? '' : 'bg-plum-soft/50'}`}
                  >
                    {n.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.previewUrl} alt="" className="h-12 w-10 shrink-0 rounded-lg bg-sand object-cover object-top" />
                    ) : (
                      <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-plum-soft text-sm font-semibold text-plum-dark" aria-hidden="true">
                        {n.by.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 text-sm">
                      {n.type === 'friend' && n.text ? (
                        // The server writes the whole line: "Ayesha joined from your link: +1 preview"
                        <span className="font-semibold text-plum-dark">{n.text}</span>
                      ) : (
                        <>
                          <span className="font-semibold">{n.by}</span> {WHAT[n.type]}
                        </>
                      )}
                      {n.text && n.type !== 'friend' && <span className={`mt-0.5 block truncate ${n.type === 'credit' ? 'font-medium text-plum' : 'text-ink/70'}`}>{n.type === 'credit' ? n.text : `“${n.text}”`}</span>}
                      <span className="mt-0.5 block truncate text-xs text-ink/65">
                        {n.lookTitle} · {ago(n.at)}
                      </span>
                    </span>
                    {n.type === 'like' && <span className="text-plum" aria-hidden="true">♥</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
