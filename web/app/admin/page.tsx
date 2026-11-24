'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import PasswordInput from '@/components/PasswordInput';
import { toast } from '@/components/Toaster';

/** The admin key is kept for this browser tab only (gone when the tab closes), never in the address. */
const KEY = 'saleeqa:admin-key';

type Brand = { id: string; name: string; tier: string; enabled: boolean; inStock: number };
type Report = {
  id: string;
  target: 'look' | 'comment';
  targetId: string;
  reason: string;
  note: string | null;
  status: 'open' | 'closed';
  outcome: 'hidden' | 'deleted' | 'no-action' | null;
  at: string;
  reportedBy: string;
  reports: number;
  look: { id: string; title: string; by: string; hidden: boolean; previewUrl: string | null } | null;
  comment?: { text: string; by: string } | null;
};

const REASON: Record<string, string> = { spam: 'Spam or an ad', offensive: 'Rude or hateful', inappropriate: 'Not appropriate', 'not-a-look': 'Not a real look', other: 'Something else' };
const OUTCOME: Record<string, string> = { hidden: 'Look hidden', deleted: 'Comment deleted', 'no-action': 'Closed, no action' };
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

class Forbidden extends Error {}

export default function Admin() {
  const [key, setKey] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [tab, setTab] = useState<'brands' | 'reports'>('reports');

  useEffect(() => {
    try {
      setKey(sessionStorage.getItem(KEY));
    } catch { /* storage blocked: ask each time */ }
  }, []);

  const call = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
      const res = await fetch(`/api/admin${path}`, {
        method: init.method ?? (init.body ? 'POST' : 'GET'),
        headers: { 'x-admin-key': key ?? '', ...(init.body ? { 'content-type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) throw new Forbidden('That admin key is not right.');
      if (!res.ok) throw new Error(data?.error ?? 'Something went wrong');
      return data as T;
    },
    [key],
  );

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    const k = draftKey.trim();
    if (!k) return;
    try {
      sessionStorage.setItem(KEY, k);
    } catch { /* kept for now only */ }
    setKey(k);
    setDraftKey('');
  }
  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch { /* nothing kept */ }
    setKey(null);
  }, []);
  /** A wrong key sends you back to the key box. */
  const failed = useCallback(
    (e: unknown) => {
      toast((e as Error).message, 'error');
      if (e instanceof Forbidden) signOut();
    },
    [signOut],
  );

  return (
    <div className="min-h-screen bg-ivory">
      <header className="border-b border-line bg-ivory">
        <div className="page flex items-center justify-between gap-2 py-3">
          <Link href="/" aria-label="Saleeqa">
            <Logo />
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-plum-dark">Admin</span>
            {key && (
              <button type="button" onClick={signOut} className="rounded-full px-3 py-2 text-ink/70 hover:bg-sand">
                Lock
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="page py-6">
        {!key ? (
          <form onSubmit={signIn} className="card mx-auto max-w-sm">
            <h1 className="text-2xl font-bold">Admin</h1>
            <p className="mt-1 text-sm text-ink/70">Enter the admin key (ADMIN_KEY on the server). It is kept in this tab only.</p>
            <label className="mt-4 block text-sm font-medium">
              Admin key
              <PasswordInput autoComplete="off" required value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
            </label>
            <button className="btn btn-primary mt-4 w-full">Open</button>
          </form>
        ) : (
          <>
            <div role="tablist" aria-label="Admin sections" className="flex gap-2">
              {(['reports', 'brands'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`panel-${t}`}
                  id={`tab-${t}`}
                  onClick={() => setTab(t)}
                  className={`chip !min-h-[40px] ${tab === t ? 'chip-on' : ''}`}
                >
                  {t === 'reports' ? 'Reports' : 'Brands'}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-5">
              {tab === 'brands' ? <BrandsTab call={call} failed={failed} /> : <ReportsTab call={call} failed={failed} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

type Call = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

function BrandsTab({ call, failed }: { call: Call; failed: (e: unknown) => void }) {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    call<{ brands: Brand[] }>('/brands')
      .then((r) => setBrands(r.brands))
      .catch(failed);
  }, [call, failed]);

  async function toggle(b: Brand) {
    setBusy(b.id);
    try {
      await call(`/brands/${encodeURIComponent(b.id)}`, { method: 'PATCH', body: { enabled: !b.enabled } });
      setBrands((list) => list?.map((x) => (x.id === b.id ? { ...x, enabled: !b.enabled } : x)) ?? null);
      toast(b.enabled ? `${b.name} is off: its pieces leave the site within a minute.` : `${b.name} is back on.`, 'success');
    } catch (e) {
      failed(e);
    }
    setBusy(null);
  }

  if (!brands) return <p className="text-sm text-ink/70">Loading brands…</p>;
  const off = brands.filter((b) => !b.enabled).length;
  return (
    <section aria-labelledby="brands-title">
      <h2 id="brands-title" className="text-xl font-semibold">Brands</h2>
      <p className="mt-1 text-sm text-ink/70">
        Switch a brand off and its pieces disappear from the Studio, briefs, the landing page and look pages within a minute. {off ? `${off} switched off.` : 'All brands are on.'}
      </p>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-white">
        {brands.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className={`block font-medium ${b.enabled ? '' : 'text-ink/65 line-through'}`}>{b.name}</span>
              <span className="block text-xs text-ink/65">
                {b.inStock.toLocaleString('en-PK')} in stock · {b.tier}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={b.enabled}
              aria-label={`${b.name}: ${b.enabled ? 'on' : 'off'}`}
              disabled={busy === b.id}
              onClick={() => toggle(b)}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${b.enabled ? 'bg-plum' : 'bg-ink/25'}`}
            >
              <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${b.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportsTab({ call, failed }: { call: Call; failed: (e: unknown) => void }) {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [reports, setReports] = useState<Report[] | null>(null);
  /** The action waiting for a second tap ("Yes, delete"), as `${reportId}:${action}` */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setReports(null);
    call<{ reports: Report[] }>(`/reports?status=${status}`)
      .then((r) => setReports(r.reports))
      .catch(failed);
  }, [call, failed, status]);
  useEffect(load, [load]);

  async function act(r: Report, action: 'hide' | 'unhide' | 'delete' | 'close') {
    if (action !== 'unhide' && action !== 'close' && confirming !== `${r.id}:${action}`) return setConfirming(`${r.id}:${action}`);
    setConfirming(null);
    setBusy(true);
    try {
      if (action === 'hide' || action === 'unhide') await call(`/looks/${encodeURIComponent(r.look!.id)}/hide`, { body: { hidden: action === 'hide' } });
      else if (action === 'delete') await call(`/comments/${encodeURIComponent(r.targetId)}`, { method: 'DELETE' });
      else await call(`/reports/${encodeURIComponent(r.id)}/close`, { method: 'POST' });
      toast({ hide: 'Look hidden.', unhide: 'Look is back on show.', delete: 'Comment deleted.', close: 'Report closed.' }[action], 'success');
      load();
    } catch (e) {
      failed(e);
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="reports-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reports-title" className="text-xl font-semibold">Reports</h2>
        <div className="flex gap-2" role="group" aria-label="Which reports">
          {(['open', 'closed'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`chip !min-h-[40px] ${status === s ? 'chip-on' : ''}`}>
              {s === 'open' ? 'Open' : 'Closed'}
            </button>
          ))}
        </div>
      </div>
      {!reports ? (
        <p className="mt-4 text-sm text-ink/70">Loading reports…</p>
      ) : !reports.length ? (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-ink/70">{status === 'open' ? 'No open reports. All quiet.' : 'No closed reports yet.'}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="card flex gap-3 !p-4">
              {r.look?.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.look.previewUrl} alt="" className="h-24 w-[72px] shrink-0 rounded-xl bg-sand object-cover object-top" />
              ) : (
                <span className="h-24 w-[72px] shrink-0 rounded-xl bg-sand" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {r.target === 'look' ? 'Look' : 'Comment'}: {REASON[r.reason] ?? r.reason}
                  {r.reports > 1 && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{r.reports} reports</span>}
                </p>
                <p className="mt-0.5 text-xs text-ink/70">
                  By {r.reportedBy} · {when(r.at)}
                  {r.outcome && ` · ${OUTCOME[r.outcome]}`}
                </p>
                {r.note && <p className="mt-1 text-ink/80">“{r.note}”</p>}
                {r.target === 'comment' && (
                  <p className="mt-2 rounded-xl bg-ivory px-3 py-2 text-ink/85">{r.comment ? <><span className="font-semibold">{r.comment.by}:</span> {r.comment.text}</> : <em>Comment already deleted</em>}</p>
                )}
                {r.look && (
                  <p className="mt-2 text-xs text-ink/70">
                    {r.target === 'comment' ? 'On ' : ''}
                    <Link href={`/runway/${r.look.id}`} target="_blank" className="font-semibold text-plum underline-offset-2 hover:underline">
                      {r.look.title}
                    </Link>{' '}
                    by {r.look.by}
                    {r.look.hidden && <span className="ml-1 font-semibold text-red-700">(hidden)</span>}
                  </p>
                )}
                {r.status === 'open' || r.look?.hidden ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.target === 'look' && r.look && !r.look.hidden && r.status === 'open' && (
                      <button type="button" disabled={busy} onClick={() => act(r, 'hide')} className="btn !min-h-[40px] !px-4 !py-1.5 text-sm bg-red-700 text-white hover:bg-red-800">
                        {confirming === `${r.id}:hide` ? 'Yes, hide it' : 'Hide look'}
                      </button>
                    )}
                    {r.look?.hidden && r.target === 'look' && (
                      <button type="button" disabled={busy} onClick={() => act(r, 'unhide')} className="btn btn-ghost !min-h-[40px] !px-4 !py-1.5 text-sm">
                        Show look again
                      </button>
                    )}
                    {r.target === 'comment' && r.comment && r.status === 'open' && (
                      <button type="button" disabled={busy} onClick={() => act(r, 'delete')} className="btn !min-h-[40px] !px-4 !py-1.5 text-sm bg-red-700 text-white hover:bg-red-800">
                        {confirming === `${r.id}:delete` ? 'Yes, delete it' : 'Delete comment'}
                      </button>
                    )}
                    {r.status === 'open' && (
                      <button type="button" disabled={busy} onClick={() => act(r, 'close')} className="btn btn-ghost !min-h-[40px] !px-4 !py-1.5 text-sm">
                        Close, no action
                      </button>
                    )}
                    {confirming?.startsWith(`${r.id}:`) && (
                      <button type="button" onClick={() => setConfirming(null)} className="min-h-[40px] px-2 text-sm text-ink/70 underline-offset-2 hover:underline">
                        Cancel
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
