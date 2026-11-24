'use client';
import { useState } from 'react';
import { toast } from '@/components/Toaster';
import { api } from '@/lib/api';

const REASONS = [
  { id: 'spam', label: 'Spam or an ad' },
  { id: 'offensive', label: 'Rude or hateful' },
  { id: 'inappropriate', label: 'Not appropriate' },
  { id: 'not-a-look', label: 'Not a real look' },
  { id: 'other', label: 'Something else' },
] as const;

/**
 * A small "Report" option for a look or a comment. It opens a short form right there (no pop-up):
 * pick a reason, add a note if you like, send. An admin reviews it on /admin.
 */
export default function ReportButton({ target, id, className = '' }: { target: 'look' | 'comment'; id: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]['id'] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    try {
      await api('/reports', { body: { target, id, reason, ...(note.trim() ? { note: note.trim() } : {}) } });
      setSent(true);
      setOpen(false);
      toast('Thank you. We’ll take a look.', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
    setBusy(false);
  }

  if (sent) return <span className={`inline-flex min-h-[24px] items-center text-ink/65 ${className}`}>Reported</span>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex min-h-[24px] items-center underline-offset-2 hover:text-red-700 hover:underline ${className}`}>
        Report
      </button>
    );
  const what = target === 'look' ? 'this look' : 'this comment';
  return (
    <form onSubmit={send} className="mt-2 w-full basis-full rounded-2xl border border-line bg-white p-3 text-sm text-ink" aria-label={`Report ${what}`}>
      <p className="font-semibold">Why are you reporting {what}?</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
        {REASONS.map((r) => (
          <button
            key={r.id}
            type="button"
            role="radio"
            aria-checked={reason === r.id}
            onClick={() => setReason(r.id)}
            className={`chip !min-h-[36px] !py-1 text-xs ${reason === r.id ? 'chip-on' : ''}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <label className="mt-2 block text-xs text-ink/70">
        Anything else? (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="input mt-1 !min-h-0 !py-2 text-sm" />
      </label>
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={!reason || busy} className="btn btn-primary !min-h-[40px] !px-4 !py-1.5 text-sm">
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !min-h-[40px] !px-4 !py-1.5 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
