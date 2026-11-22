'use client';
import Link from 'next/link';
import { Badge, Chips, Loading, PageTitle, Pager, SearchBox, ago, date, num, qs, useAdmin, useUrlState } from '@/components/admin/ui';

type Row = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  createdAt: string;
  verified: boolean;
  suspended: boolean;
  lastSeen: string | null;
  looks: number;
  drafts: number;
  likes: number;
  invited: number;
  invitedPublished: number;
  invitedBy: string | null;
  previewsUsed: number;
  previewCredits: number;
};
type List = { counts: Record<string, number>; total: number; page: number; pages: number; users: Row[] };

const DEFAULTS = { filter: 'all', sort: 'new', search: '', page: '0' };
const FILTERS = [
  { value: 'all', label: 'Everyone' },
  { value: 'active', label: 'Active (30 days)' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'no-looks', label: 'No looks yet' },
  { value: 'invited', label: 'Came from an invite' },
  { value: 'unverified', label: 'Email not confirmed' },
  { value: 'suspended', label: 'Suspended' },
];
const SORTS = [
  { value: 'new', label: 'Newest' },
  { value: 'old', label: 'Oldest' },
  { value: 'active', label: 'Last active' },
  { value: 'looks', label: 'Most looks' },
  { value: 'likes', label: 'Most likes' },
  { value: 'invites', label: 'Most invites' },
];

export default function AdminUsers() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, error, loading } = useAdmin<List>(ready ? `/admin/users${qs({ filter: s.filter, sort: s.sort, search: s.search, page: Number(s.page) })}` : null);

  return (
    <>
      <PageTitle title="Players" intro="Every account, with email, activity, looks and invites. Open a player to suspend, delete or give extra previews.">
        <a className="btn btn-ghost" href="/api/admin/users.csv" download>
          Download all (Excel / CSV)
        </a>
      </PageTitle>

      <div className="space-y-3">
        <SearchBox value={s.search} onChange={(search) => set({ search, page: '0' })} placeholder="Search by email, name or username" />
        <Chips
          label="Show"
          value={s.filter}
          options={FILTERS.map((f) => ({ ...f, label: data ? `${f.label} (${num(data.counts[f.value])})` : f.label }))}
          onChange={(filter) => set({ filter, page: '0' })}
        />
        <label className="flex items-center gap-2 text-sm">
          Sort by
          <select className="input w-auto py-2" value={s.sort} onChange={(e) => set({ sort: e.target.value, page: '0' })}>
            {SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.users.length ? (
          <p className="card text-sm text-ink/70">No players match.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink/70">{num(data.total)} players</p>
            <ul className="space-y-2">
              {data.users.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="card flex flex-col gap-3 transition-colors hover:border-gold md:flex-row md:items-center">
                    <div className="min-w-0 md:w-80">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{u.username ? `@${u.username}` : u.name}</span>
                        {u.suspended && <Badge tone="bad">Suspended</Badge>}
                        {!u.verified && <Badge tone="warn">Email not confirmed</Badge>}
                      </div>
                      <div className="truncate text-sm text-ink/70">
                        {u.name} · {u.email}
                      </div>
                    </div>
                    <dl className="grid flex-1 grid-cols-3 gap-x-4 gap-y-1 text-sm sm:grid-cols-6">
                      <Fact label="Joined" value={date(u.createdAt)} />
                      <Fact label="Last active" value={ago(u.lastSeen)} />
                      <Fact label="Looks" value={num(u.looks)} />
                      <Fact label="Likes got" value={num(u.likes)} />
                      <Fact label="Invited" value={`${u.invited}${u.invitedPublished ? ` (${u.invitedPublished} posted)` : ''}`} />
                      <Fact label="Previews" value={num(u.previewsUsed)} />
                    </dl>
                  </Link>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink/65">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
