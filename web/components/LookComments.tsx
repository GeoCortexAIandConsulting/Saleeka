'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { FeedLook, LookComment } from '@/lib/types';

/** A look's comments, with one level of replies: used on the Runway and on a look's own page. */

export function ago(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
}

/** `joinHref`: for visitors who are not signed in, comments are read-only with a link to join. */
export default function LookComments({ look, onCount, joinHref }: { look: FeedLook; onCount: (n: number) => void; joinHref?: string }) {
  const [list, setList] = useState<LookComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** The comment being replied to, if any */
  const [replyTo, setReplyTo] = useState<LookComment | null>(null);
  const inputId = `c-${look.id}`;

  useEffect(() => {
    api<{ comments: LookComment[] }>(`/game/designs/${look.id}/comments`)
      .then((r) => setList(r.comments))
      .catch((e) => setError(e.message));
  }, [look.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = replyTo ? { text, parentId: replyTo.id } : { text };
      const r = await api<{ comments: LookComment[] }>(`/game/designs/${look.id}/comments`, { body });
      setList(r.comments);
      onCount(r.comments.length);
      setText('');
      setReplyTo(null);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function remove(id: string) {
    try {
      await api(`/game/comments/${id}`, { method: 'DELETE' });
      // A deleted comment takes its replies with it.
      const next = (list ?? []).filter((c) => c.id !== id && c.parentId !== id);
      setList(next);
      onCount(next.length);
      if (replyTo && (replyTo.id === id || replyTo.parentId === id)) setReplyTo(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startReply(c: LookComment) {
    setReplyTo(c);
    document.getElementById(inputId)?.focus();
  }

  const tops = (list ?? []).filter((c) => !c.parentId);
  const repliesTo = (id: string) => (list ?? []).filter((c) => c.parentId === id);
  const line = (c: LookComment) => (
    <>
      <span className="font-semibold">{c.by}</span>{' '}
      <span className="break-words text-ink/85">{c.text}</span>
      <span className="mt-0.5 flex gap-3 text-[11px] text-ink/65">
        <span>{ago(c.at)}</span>
        {!joinHref && (
          <button type="button" onClick={() => startReply(c)} className="font-semibold underline-offset-2 hover:text-plum hover:underline">
            Reply
          </button>
        )}
        {c.canDelete && (
          <button type="button" onClick={() => remove(c.id)} className="underline-offset-2 hover:text-red-700 hover:underline">
            Delete
          </button>
        )}
      </span>
    </>
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      {!list ? (
        <p className="text-xs text-ink/65">Loading comments…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-ink/65">No comments yet. Say what you love about it.</p>
      ) : (
        <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {tops.map((c) => (
            <li key={c.id} className="text-sm">
              {line(c)}
              {repliesTo(c.id).length > 0 && (
                <ul className="mt-2 space-y-2 border-l-2 border-line pl-3">
                  {repliesTo(c.id).map((r) => (
                    <li key={r.id}>{line(r)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {joinHref ? (
        <p className="mt-3 rounded-2xl bg-ivory px-4 py-3 text-sm text-ink/75">
          <Link href={joinHref} className="font-semibold text-plum underline">Join Saleeqa</Link> to like this look and join the conversation.
        </p>
      ) : (
        <>
          {replyTo && (
            <p className="mt-2.5 flex items-center gap-2 text-xs text-ink/65">
              Replying to <span className="font-semibold text-ink/80">{replyTo.by}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="underline underline-offset-2 hover:text-ink">Cancel</button>
            </p>
          )}
          <form onSubmit={send} className="mt-2.5 flex gap-2">
            <label className="sr-only" htmlFor={inputId}>{replyTo ? `Reply to ${replyTo.by}` : 'Add a comment'}</label>
            <input
              id={inputId}
              className="input !min-h-[40px] !rounded-full !py-2 text-sm"
              placeholder={replyTo ? `Reply to ${replyTo.by}…` : 'Add a comment…'}
              maxLength={300}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-primary !min-h-[40px] !px-4 !py-2" disabled={busy || !text.trim()}>Post</button>
          </form>
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-700" role="alert">{error}</p>}
    </div>
  );
}
