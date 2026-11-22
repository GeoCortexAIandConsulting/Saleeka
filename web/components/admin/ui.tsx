'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/Toaster';
import { api, ApiError } from '@/lib/api';

/* --------------------------------- data loading --------------------------------- */

/** Loads an admin API path; sends the admin to the sign-in page when the session has ended. */
export function useAdmin<T>(path: string | null) {
  return useApi<T>(path, '/admin/login');
}

/** Loads a brand portal API path; a signed-out (or no longer approved) brand goes to the brand sign-in page. */
export function useBrand<T>(path: string | null) {
  return useApi<T>(path, '/login');
}

function useApi<T>(path: string | null, loginPath: string) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError('');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || (e.status === 403 && loginPath === '/login'))) {
        if (e.status === 403) toast(e.message, 'error');
        return router.replace(loginPath);
      }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path, router, loginPath]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, setData, error, loading, reload: load };
}

/** Runs an admin action with a toast for the result. Returns the answer, or null if it failed. */
export async function act<T = unknown>(path: string, init: { method?: string; body?: unknown }, done?: string): Promise<T | null> {
  try {
    const r = await api<T>(path, init);
    if (done) toast(done, 'success');
    return r;
  } catch (e) {
    toast((e as Error).message, 'error');
    return null;
  }
}

/* ---------------------------------- formatting ---------------------------------- */

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-PK');
export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pkr = (n: number) => `Rs ${n.toLocaleString('en-PK')}`;
export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** "3 hours ago", "5 days ago" */
export function ago(iso: string | null | undefined) {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`;
  return date(iso);
}

/* ----------------------------------- pieces ----------------------------------- */

export function PageTitle({ title, intro, children }: { title: string; intro?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <p className="mt-1 max-w-2xl text-sm text-ink/70">{intro}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, note, href }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-xs font-semibold uppercase tracking-wider text-ink/65">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-plum-dark">{value}</div>
      {note && <div className="mt-1 text-xs text-ink/70">{note}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition-colors hover:border-gold">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * One number per day as thin bars (one series, one colour). Hover or focus a bar for its value;
 * screen readers get the numbers as a table.
 */
export function DailyBars({ title, days, values, unit = '' }: { title: string; days: string[]; values: number[]; unit?: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const [hover, setHover] = useState<number | null>(null);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const shown = hover ?? values.length - 1;
  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-sans text-sm font-semibold">{title}</h3>
        <span className="text-xs text-ink/70">
          {num(total)} in 30 days
        </span>
      </div>
      <div className="mt-1 h-5 text-xs text-ink/70" aria-hidden>
        {label(days[shown])}: <strong className="text-ink">{num(values[shown])}{unit}</strong>
      </div>
      <div className="relative mt-2 flex h-28 items-end gap-[2px] border-b border-line" aria-hidden onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div key={days[i]} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <div
              className={`w-full rounded-t-[4px] ${hover === i ? 'bg-gold' : 'bg-plum'}`}
              style={{ height: v ? `${Math.max(3, (v / max) * 100)}%` : '0%' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink/65" aria-hidden>
        <span>{label(days[0])}</span>
        <span>{label(days[days.length - 1])}</span>
      </div>
      <table className="sr-only">
        <caption>{title}, per day</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <th>{label(d)}</th>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled horizontal bar, for "share of" lists (occasions, slots, ages). */
export function Meter({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
  return (
    <div className="text-sm">
      <div className="flex justify-between gap-2">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-semibold">{note ?? num(value)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-sand">
        <div className="h-2 rounded-full bg-plum" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={`chip ${value === o.value ? 'chip-on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3">
      <button className="btn btn-ghost px-4" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        ← Previous
      </button>
      <span className="text-sm text-ink/70">
        Page {page + 1} of {pages}
      </span>
      <button className="btn btn-ghost px-4" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </nav>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  // Waits until typing pauses, so each key press does not reload the list.
  useEffect(() => {
    const t = setTimeout(() => text !== value && onChange(text), 350);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return <input className="input max-w-md" type="search" aria-label={placeholder} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />;
}

export function Badge({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' | 'warn' | 'bad' | 'gold' }) {
  const tones = {
    plain: 'bg-sand text-ink',
    good: 'bg-emerald-50 text-emerald-800',
    warn: 'bg-amber-50 text-amber-900',
    bad: 'bg-red-50 text-red-800',
    gold: 'bg-gold-light/40 text-gold-deep',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Loading({ error, loading }: { error?: string; loading?: boolean }) {
  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (loading) return <p className="py-10 text-center text-sm text-ink/70">Loading…</p>;
  return null;
}

/** A product or look picture from a brand's site (or our preview), or a soft placeholder. */
export function Thumb({ src, alt, className = 'h-16 w-12' }: { src: string | null | undefined; alt: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={`${className} shrink-0 rounded-lg bg-sand object-cover`} />
  ) : (
    <div className={`${className} shrink-0 rounded-lg bg-sand`} aria-hidden />
  );
}

export const OCCASION_LABEL: Record<string, string> = {
  office: 'Office',
  university: 'University',
  casual: 'Everyday',
  eid: 'Eid',
  mehndi: 'Mehndi',
  baraat: 'Baraat',
  walima: 'Walima',
  party: 'Party',
};

export const SLOT_LABEL: Record<string, string> = {
  main: 'Outfit',
  bottom: 'Bottom',
  dupatta: 'Dupatta',
  footwear: 'Shoes',
  bag: 'Bag',
  jewelry: 'Jewellery',
  waistcoat: 'Waistcoat',
  accessory: 'Accessory',
  layer: 'Coat / layer',
};

/**
 * Page state kept in the address (?filter=active&page=2), so a link or a refresh opens the same view.
 * Read after the page loads (the server render uses the defaults).
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [state, setState] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    for (const k of Object.keys(defaults)) {
      const v = q.get(k);
      if (v !== null) (next as Record<string, string>)[k] = v;
    }
    setState(next);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = useCallback(
    (patch: Partial<T>) => {
      setState((s) => {
        const next = { ...s, ...patch };
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(next)) if (v && v !== defaults[k]) q.set(k, v);
        window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`);
        return next;
      });
    },
    [defaults],
  );
  return [state, update, ready] as const;
}

/** The query string for an API call, without empty values. */
export const qs = (o: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== 0) q.set(k, String(v));
  return q.size ? `?${q}` : '';
};

/** A look as the admin lists show it. */
export type LookRow = {
  id: string;
  status: 'draft' | 'published';
  hidden: boolean;
  userId: string;
  by: string;
  email: string | null;
  challenge: string;
  brands: string[];
  pieces: number;
  total: number;
  up: number;
  down: number;
  comments: number;
  createdAt: string;
  previewUrl: string | null;
  image: string | null;
};
