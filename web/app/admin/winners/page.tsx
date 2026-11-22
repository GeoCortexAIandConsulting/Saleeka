'use client';
import Link from 'next/link';
import { Badge, Loading, type LookRow, PageTitle, Thumb, act, ago, num, qs, useAdmin, useUrlState } from '@/components/admin/ui';

type Row = LookRow & { trustedLikes: number; friendLikes: number; newAccountLikes: number; flaggedLikes: number; otherComments: number; merit: number };
type Board = {
  period: { key: string; label: string; start: string | null; end: string | null };
  periods: Array<{ key: string; label: string }>;
  winner: string | null;
  total: number;
  looks: Row[];
};

const DEFAULTS = { period: '', challenges: 'all' };

export default function AdminWinners() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, setData, error, loading } = useAdmin<Board>(ready ? `/admin/winners${qs(s)}` : null);

  async function crown(lookId: string | null) {
    if (!data) return;
    if (await act('/admin/winners', { method: 'PUT', body: { period: data.period.key, lookId } }, lookId ? 'Winner saved' : 'Winner cleared')) setData({ ...data, winner: lookId });
  }

  return (
    <>
      <PageTitle
        title="Week winners"
        intro="The best looks of a week, ranked by trusted likes: likes from other players with a confirmed email, given before the week ended. The designer's own like, unconfirmed or suspended accounts, and late likes do not count."
      />
      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          Week
          <select className="input mt-1 w-auto" value={data?.period.key ?? s.period} onChange={(e) => set({ period: e.target.value })}>
            {(data?.periods ?? []).map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Looks for
          <select className="input mt-1 w-auto" value={s.challenges} onChange={(e) => set({ challenges: e.target.value })}>
            <option value="all">Every challenge</option>
            <option value="featured">That week's featured challenges</option>
          </select>
        </label>
      </div>

      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.looks.length ? (
          <p className="card text-sm text-ink/70">No looks were published in this period.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-ink/70">
              {num(data.total)} looks in this period. Yellow flags (friends, brand-new accounts) still count, but check them before you choose.
            </p>
            <ol className="space-y-2">
              {data.looks.map((l, i) => {
                const won = data.winner === l.id;
                return (
                  <li key={l.id} className={`card flex flex-col gap-3 sm:flex-row sm:items-center ${won ? 'border-gold bg-gold-light/10' : ''}`}>
                    <div className="flex items-center gap-3 sm:w-80">
                      <span className="w-8 shrink-0 font-display text-2xl font-bold text-plum-dark">{i + 1}</span>
                      <Link href={`/admin/looks/${l.id}`}>
                        <Thumb src={l.previewUrl ?? l.image} alt={`Look by ${l.by}`} className="h-24 w-16" />
                      </Link>
                      <div className="min-w-0 text-sm">
                        <Link href={`/admin/looks/${l.id}`} className="font-semibold text-plum">
                          {l.challenge}
                        </Link>
                        <div className="truncate">
                          by{' '}
                          <Link className="text-plum" href={`/admin/users/${l.userId}`}>
                            @{l.by}
                          </Link>
                        </div>
                        <div className="text-xs text-ink/65">{ago(l.createdAt)}</div>
                        {won && <Badge tone="gold">🏆 Winner</Badge>}
                        {l.hidden && <Badge tone="bad">Hidden</Badge>}
                      </div>
                    </div>
                    <dl className="grid flex-1 grid-cols-3 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
                      <div>
                        <dt className="text-xs text-ink/65">Trusted likes</dt>
                        <dd className="text-lg font-bold text-plum-dark">{l.trustedLikes}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink/65">All likes</dt>
                        <dd className="font-semibold">{l.up}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink/65">Comments</dt>
                        <dd className="font-semibold">{l.otherComments}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink/65">From friends</dt>
                        <dd className={`font-semibold ${l.friendLikes ? 'text-amber-800' : ''}`}>{l.friendLikes}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink/65">Not counted</dt>
                        <dd className={`font-semibold ${l.flaggedLikes ? 'text-red-700' : ''}`}>{l.flaggedLikes}</dd>
                      </div>
                      {l.newAccountLikes > 0 && <dd className="col-span-3 text-xs text-amber-800 sm:col-span-5">{l.newAccountLikes} like(s) from accounts made the same day</dd>}
                    </dl>
                    <button className={`btn px-4 ${won ? 'btn-ghost' : 'btn-primary'}`} onClick={() => crown(won ? null : l.id)}>
                      {won ? 'Remove winner' : 'Choose as winner'}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </>
  );
}
