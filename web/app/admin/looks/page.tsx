'use client';
import Link from 'next/link';
import { Badge, Chips, type LookRow, Loading, PageTitle, Pager, SearchBox, Thumb, act, ago, num, pkr, qs, useAdmin, useUrlState } from '@/components/admin/ui';

type List = { total: number; page: number; pages: number; looks: LookRow[] };

const DEFAULTS = { filter: 'published', sort: 'new', search: '', challenge: '', page: '0' };

export default function AdminLooks() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, error, loading, reload } = useAdmin<List>(ready ? `/admin/looks${qs({ filter: s.filter, sort: s.sort, search: s.search, challengeId: s.challenge, page: Number(s.page) })}` : null);

  async function toggle(l: LookRow) {
    if (await act(`/admin/looks/${l.id}`, { body: { hidden: !l.hidden } }, l.hidden ? 'Look is back on the Runway' : 'Look hidden from the Runway')) reload();
  }
  async function remove(l: LookRow) {
    if (!confirm(`Delete this look by @${l.by}, with its likes and comments? It cannot be undone. (Hiding keeps it, out of sight.)`)) return;
    if (await act(`/admin/looks/${l.id}`, { method: 'DELETE' }, 'Look deleted')) reload();
  }

  return (
    <>
      <PageTitle title="Looks" intro="Every look players made. Hide a look to take it off the Runway (you can bring it back); delete removes it for good." />
      <div className="space-y-3">
        <SearchBox value={s.search} onChange={(search) => set({ search, page: '0' })} placeholder="Find looks by a player's email or username" />
        <Chips
          label="Show"
          value={s.filter}
          options={[
            { value: 'published', label: 'On the Runway' },
            { value: 'hidden', label: 'Hidden' },
            { value: 'draft', label: 'Drafts' },
            { value: 'all', label: 'All' },
          ]}
          onChange={(filter) => set({ filter, page: '0' })}
        />
        <Chips
          label="Sort"
          value={s.sort}
          options={[
            { value: 'new', label: 'Newest' },
            { value: 'likes', label: 'Most liked' },
            { value: 'old', label: 'Oldest' },
          ]}
          onChange={(sort) => set({ sort, page: '0' })}
        />
      </div>

      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.looks.length ? (
          <p className="card text-sm text-ink/70">No looks here.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink/70">{num(data.total)} looks</p>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.looks.map((l) => (
                <li key={l.id} className="card flex gap-3">
                  <Link href={`/admin/looks/${l.id}`} className="shrink-0">
                    <Thumb src={l.previewUrl ?? l.image} alt={`Look by ${l.by}`} className="h-32 w-24" />
                  </Link>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/admin/looks/${l.id}`} className="font-semibold text-plum">
                      {l.challenge}
                    </Link>
                    <p className="truncate text-ink/70">
                      by{' '}
                      <Link className="text-plum" href={`/admin/users/${l.userId}`}>
                        @{l.by}
                      </Link>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {l.status === 'draft' ? <Badge>Draft</Badge> : l.hidden ? <Badge tone="bad">Hidden</Badge> : <Badge tone="good">On the Runway</Badge>}
                      {l.previewUrl && <Badge tone="gold">AI preview</Badge>}
                    </div>
                    <p className="mt-1 text-ink/70">
                      ♥ {l.up} · 💬 {l.comments} · {pkr(l.total)}
                    </p>
                    <p className="truncate text-xs text-ink/65">{l.brands.join(', ')}</p>
                    <p className="text-xs text-ink/65">{ago(l.createdAt)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4">
                      {l.status !== 'draft' && (
                        <button className="min-h-[32px] font-semibold text-plum" onClick={() => toggle(l)}>
                          {l.hidden ? 'Show again' : 'Hide'}
                        </button>
                      )}
                      <button className="min-h-[32px] font-semibold text-red-700" onClick={() => remove(l)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={data.page} pages={data.pages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </>
  );
}
