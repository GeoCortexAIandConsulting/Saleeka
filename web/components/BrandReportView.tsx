'use client';
import { toast } from '@/components/Toaster';
import { Meter, OCCASION_LABEL, SLOT_LABEL, Section, Stat, Thumb, ago, num, pkr } from '@/components/admin/ui';

export type BrandReport = {
  brand: { id: string; name: string; tier: string; hidden: boolean };
  catalog: { total: number; inStock: number; newIn: number; women: number; men: number; hiddenProducts: number; lastChecked: string | null; priceMin: number | null; priceMedian: number | null; priceMax: number | null; bySlot: Array<{ key: string; n: number }> };
  reach: { looks: number; share: number; rank: number | null; brandsRanked: number; picks: number; players: number; likes: number; comments: number; withPreview: number; clicks: number; clickers: number; impressions: number; looks30: number; players30: number; clicks30: number };
  bySlot: Array<{ slot: string; n: number }>;
  byOccasion: Array<{ occasion: string; n: number }>;
  byGender: { female: number; male: number };
  ages: Array<{ range: string; n: number }>;
  pairedWith: Array<{ name: string; n: number }>;
  weeks: Array<{ start: string; looks: number; clicks: number }>;
  top: Array<{ id: string; title: string; slot: string; price: number; image: string | null; inStock: boolean; url: string; picks: number; looks: number; clicks: number }>;
  summary: string;
};

const AGE: Record<string, string> = { 'under-18': 'Under 18', '18-24': '18–24', '25-34': '25–34', '35-44': '35–44', '45-54': '45–54', '55-plus': '55+' };

/**
 * A brand's report: reach on Saleeqa, the last 8 weeks, most picked pieces, occasions, pairings and
 * ages. Used by the admin (to pitch the brand) and by the brand itself (`own`: worded for the brand).
 */
export default function BrandReportView({ r, own = false }: { r: BrandReport; own?: boolean }) {
  const reach = r.reach;
  const your = own ? 'your' : 'their';
  const maxWeek = Math.max(1, ...r.weeks.map((w) => Math.max(w.looks, w.clicks)));
  function copySummary() {
    navigator.clipboard?.writeText(r.summary).then(
      () => toast('Summary copied', 'success'),
      () => toast('Could not copy: select the text and copy it instead', 'error'),
    );
  }
  const week = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <>
      <div className="card border-gold bg-ivory">
        <p className="eyebrow">In one sentence</p>
        <p className="mt-2 text-lg">{r.summary}</p>
        <button className="btn btn-ghost mt-3 print:hidden" onClick={copySummary}>
          Copy this summary
        </button>
      </div>

      <Section title="Reach on Saleeqa">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={`Looks with ${your} pieces`} value={num(reach.looks)} note={`${reach.share}% of all Runway looks`} />
          <Stat label="Pieces picked" value={num(reach.picks)} note={reach.rank ? `#${reach.rank} of ${reach.brandsRanked} brands` : 'Not picked yet'} />
          <Stat label="Players who styled them" value={num(reach.players)} note={`${num(reach.players30)} in the last 30 days`} />
          <Stat label="Likes on those looks" value={num(reach.likes)} note={`${num(reach.comments)} comments`} />
          <Stat label={`Clicks to ${your} shop`} value={num(reach.clicks)} note={`${num(reach.clicks30)} in 30 days · ${num(reach.clickers)} different players`} />
          <Stat label="Shown on an AI model" value={num(reach.withPreview)} note="Looks with an AI preview" />
          <Stat label="Looks in the last 30 days" value={num(reach.looks30)} />
          <Stat label="Pieces players can pick" value={num(r.catalog.inStock)} note={`${num(r.catalog.newIn)} new in`} />
        </div>
      </Section>

      <Section title="The last 8 weeks">
        <div className="card">
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink/70">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-plum" aria-hidden /> Looks with {your} pieces
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm bg-gold" aria-hidden /> Shop clicks
            </span>
          </div>
          <div className="flex h-36 items-end gap-2 border-b border-line" aria-hidden>
            {r.weeks.map((w) => (
              <div key={w.start} className="flex h-full flex-1 items-end justify-center gap-[2px]" title={`Week of ${week(w.start)}: ${w.looks} looks, ${w.clicks} clicks`}>
                <div className="w-1/2 max-w-[18px] rounded-t-[4px] bg-plum" style={{ height: `${(w.looks / maxWeek) * 100}%` }} />
                <div className="w-1/2 max-w-[18px] rounded-t-[4px] bg-gold" style={{ height: `${(w.clicks / maxWeek) * 100}%` }} />
              </div>
            ))}
          </div>
          {/* Phones label every other week, so the dates never run into each other. */}
          <div className="mt-1 flex gap-2 text-[11px] text-ink/65" aria-hidden>
            {r.weeks.map((w, i) => (
              <span key={w.start} className="flex-1 text-center">
                <span className={i % 2 ? 'hidden sm:inline' : ''}>{week(w.start)}</span>
              </span>
            ))}
          </div>
          <table className="sr-only">
            <caption>Looks and shop clicks per week</caption>
            <thead>
              <tr>
                <th>Week</th>
                <th>Looks</th>
                <th>Clicks</th>
              </tr>
            </thead>
            <tbody>
              {r.weeks.map((w) => (
                <tr key={w.start}>
                  <td>{week(w.start)}</td>
                  <td>{w.looks}</td>
                  <td>{w.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Most picked pieces">
        {!r.top.length ? (
          <p className="text-sm text-ink/70">No pieces picked yet.</p>
        ) : (
          <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {r.top.map((p, i) => (
              <li key={p.id} className="card flex gap-3 text-sm">
                <Thumb src={p.image} alt="" />
                <div className="min-w-0">
                  <div className="text-xs text-ink/65">
                    #{i + 1} · {SLOT_LABEL[p.slot] ?? p.slot}
                  </div>
                  <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold text-plum">
                    {p.title}
                  </a>
                  <div className="text-ink/70">
                    {pkr(p.price)}
                    {!p.inStock && ' · sold out'}
                  </div>
                  <div>
                    {p.picks} pick{p.picks === 1 ? '' : 's'} · {p.clicks} click{p.clicks === 1 ? '' : 's'}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Breakdown title="Occasions styled" rows={r.byOccasion.map((x) => ({ label: OCCASION_LABEL[x.occasion] ?? x.occasion, n: x.n }))} />
        <Breakdown title="Which pieces" rows={r.bySlot.map((x) => ({ label: SLOT_LABEL[x.slot] ?? x.slot, n: x.n }))} />
        <Breakdown title="Styled with these brands" rows={r.pairedWith.map((x) => ({ label: x.name, n: x.n }))} />
        <Breakdown title="Players' ages (from the taste quiz)" rows={r.ages.map((x) => ({ label: AGE[x.range] ?? x.range, n: x.n }))} />
      </div>

      <Section title={own ? 'Your pieces on Saleeqa' : 'Their catalogue on Saleeqa'}>
        <div className="card grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-ink/65">Prices in stock</div>
            <div className="font-semibold">{r.catalog.priceMin !== null ? `${pkr(r.catalog.priceMin)} – ${pkr(r.catalog.priceMax!)}` : '—'}</div>
            {r.catalog.priceMedian !== null && <div className="text-ink/70">typical {pkr(r.catalog.priceMedian)}</div>}
          </div>
          <div>
            <div className="text-ink/65">Women · men</div>
            <div className="font-semibold">
              {num(r.catalog.women)} · {num(r.catalog.men)}
            </div>
          </div>
          <div>
            <div className="text-ink/65">Stock last updated</div>
            <div className="font-semibold">{ago(r.catalog.lastChecked)}</div>
          </div>
          <div>
            <div className="text-ink/65">{own ? 'Hidden by the Saleeqa team' : 'Hidden by you'}</div>
            <div className="font-semibold">{num(r.catalog.hiddenProducts)} pieces</div>
          </div>
        </div>
      </Section>
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; n: number }> }) {
  const max = Math.max(0, ...rows.map((r) => r.n));
  return (
    <div className="card">
      <h3 className="mb-3 font-sans text-sm font-semibold">{title}</h3>
      {!rows.length ? (
        <p className="text-sm text-ink/70">Not enough data yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Meter key={r.label} label={r.label} value={r.n} max={max} />
          ))}
        </div>
      )}
    </div>
  );
}
