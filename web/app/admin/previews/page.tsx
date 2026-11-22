'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, DailyBars, Loading, PageTitle, Section, Stat, act, num, usd, useAdmin } from '@/components/admin/ui';

type Stats = {
  enabled: boolean;
  costEach: number;
  total: number;
  today: number;
  week: number;
  month: number;
  costTotal: number;
  costToday: number;
  costWeek: number;
  costMonth: number;
  daily: { days: string[]; previews: number[] };
  top: Array<{ id: string; n: number; username: string; email: string | null }>;
  limits: {
    off: boolean;
    offInEnv: boolean;
    free: number;
    dailyLimit: number;
    globalDailyCap: number;
    friendsForCredit: number;
    friendCreditCap: number;
    fromAdmin: { off: boolean; free: boolean; dailyLimit: boolean; globalDailyCap: boolean };
    env: { free: number; dailyLimit: number; globalDailyCap: number };
    maxDailySpend: number;
  };
};

type Field = 'free' | 'dailyLimit' | 'globalDailyCap';
const FIELDS: Array<{ key: Field; label: string; help: string }> = [
  { key: 'globalDailyCap', label: 'Most previews per day, all players together', help: 'Your daily spending limit. 0 stops new previews.' },
  { key: 'dailyLimit', label: 'Most previews per day, per player', help: 'Stops one player from making many in a row.' },
  { key: 'free', label: 'Free previews every account gets', help: 'For life, before any earned by inviting friends.' },
];

export default function AdminPreviews() {
  const { data: s, setData, error, loading } = useAdmin<Stats>('/admin/previews');
  const [draft, setDraft] = useState<Record<Field, string>>({ free: '', dailyLimit: '', globalDailyCap: '' });
  useEffect(() => {
    if (s) setDraft({ free: String(s.limits.free), dailyLimit: String(s.limits.dailyLimit), globalDailyCap: String(s.limits.globalDailyCap) });
  }, [s]);

  if (!s) return <Loading error={error} loading={loading} />;
  const l = s.limits;

  async function save(body: Record<string, unknown>, done: string) {
    const r = await act<Stats>('/admin/previews', { method: 'PUT', body }, done);
    if (r) setData(r);
  }
  async function toggleOff() {
    if (!l.off && !confirm('Stop all new AI previews now? Players can still publish their looks, and previews already made still show.')) return;
    await save({ off: !l.off }, l.off ? 'AI previews are on again' : 'AI previews are stopped');
  }

  return (
    <>
      <PageTitle title="AI previews" intro={`Each new preview image costs about ${usd(s.costEach)} (Gemini on Google Cloud). A look already previewed is shown again for free.`} />

      <div className={`card mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${l.off ? 'border-red-200 bg-red-50' : ''}`}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-sans text-lg font-semibold">AI previews are {l.off ? 'stopped' : 'on'}</h2>
            {!s.enabled && <Badge tone="warn">No Google key on this server</Badge>}
          </div>
          <p className="text-sm text-ink/70">
            {l.offInEnv
              ? 'They are switched off in the server settings (PREVIEWS_OFF=true), so this switch cannot turn them on.'
              : 'The emergency switch: stop every new preview at once if spending runs high.'}
          </p>
        </div>
        {!l.offInEnv && (
          <button className={`btn ${l.off ? 'btn-primary' : 'border border-red-200 bg-white text-red-700 hover:bg-red-50'}`} onClick={toggleOff}>
            {l.off ? 'Turn previews back on' : 'Stop all previews'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Last 24 hours" value={num(s.today)} note={`${usd(s.costToday)} of ${l.globalDailyCap} allowed`} />
        <Stat label="Last 7 days" value={num(s.week)} note={usd(s.costWeek)} />
        <Stat label="Last 30 days" value={num(s.month)} note={usd(s.costMonth)} />
        <Stat label="All time" value={num(s.total)} note={usd(s.costTotal)} />
      </div>
      <div className="mt-4 md:w-1/2">
        <DailyBars title="Previews per day" days={s.daily.days} values={s.daily.previews} />
      </div>

      <Section title="Limits">
        <div className="card space-y-4">
          {FIELDS.map((f) => (
            <form
              key={f.key}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                save({ [f.key]: Number(draft[f.key]) }, 'Saved');
              }}
            >
              <label className="block flex-1 text-sm font-medium">
                {f.label}
                <span className="block text-xs font-normal text-ink/70">
                  {f.help} {l.fromAdmin[f.key] ? `Set here (server setting: ${l.env[f.key]}).` : 'From the server settings.'}
                </span>
                <input className="input mt-1 max-w-[10rem]" type="number" min={0} max={10000} required value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              </label>
              <div className="flex gap-2">
                <button className="btn btn-primary px-4">Save</button>
                {l.fromAdmin[f.key] && (
                  <button type="button" className="btn btn-ghost px-4" onClick={() => save({ [f.key]: null }, 'Back to the server setting')}>
                    Use server setting
                  </button>
                )}
              </div>
            </form>
          ))}
          <p className="text-sm text-ink/70">
            With these limits, the most you can spend in one day is <strong>{usd(l.maxDailySpend)}</strong>. Players also earn 1 preview for every {l.friendsForCredit} friends who join and publish
            (up to {l.friendCreditCap}). You can give a player extra previews on their page under <Link className="text-plum" href="/admin/users">Players</Link>.
          </p>
        </div>
      </Section>

      <Section title="Who made the most previews (30 days)">
        {!s.top.length ? (
          <p className="text-sm text-ink/70">No previews yet.</p>
        ) : (
          <ol className="card divide-y divide-line text-sm">
            {s.top.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link className="font-semibold text-plum" href={`/admin/users/${t.id}`}>
                  @{t.username} <span className="font-normal text-ink/70">{t.email}</span>
                </Link>
                <span>
                  {t.n} · {usd(t.n * s.costEach)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
