'use client';
import Link from 'next/link';
import { Badge, Chips, Loading, PageTitle, act, ago, date, num, qs, useAdmin, useUrlState } from '@/components/admin/ui';

type Account = {
  id: string;
  email: string;
  contactName: string;
  phone: string;
  brandName: string;
  website: string | null;
  instagram: string | null;
  city: string | null;
  about: string | null;
  tier: string;
  sells: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  brandId: string | null;
  createdAt: string;
  note: string | null;
  reviewedAt: string | null;
  lastLoginAt: string | null;
  items: { total: number; pending: number; approved: number };
  sameName: boolean;
};
type List = { counts: Record<string, number>; accounts: Account[] };

const DEFAULTS = { status: 'pending' };
const SELLS: Record<string, string> = { female: "Women's wear", male: "Men's wear", both: "Women's and men's" };
const TIER: Record<string, string> = { budget: 'Budget', mid: 'Mid-range', premium: 'Premium' };

export default function AdminBrandAccounts() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, error, loading, reload } = useAdmin<List>(ready ? `/admin/brand-accounts${qs({ status: s.status === 'all' ? '' : s.status })}` : null);

  async function run(a: Account, action: 'approve' | 'reject' | 'suspend') {
    let note = '';
    if (action === 'reject') {
      const r = prompt(`Turn down ${a.brandName}? Write a short reason for the brand (it is emailed to them), or leave it empty.`);
      if (r === null) return;
      note = r;
    }
    if (action === 'suspend') {
      const r = prompt(`Suspend ${a.brandName}? They are signed out and all their pieces leave the Studio until you approve them again. Reason (shown to the brand):`);
      if (r === null) return;
      note = r;
    }
    if (action === 'approve' && a.status === 'pending' && !confirm(`Approve ${a.brandName}? They get an email and can sign in and add pieces.`)) return;
    const done = { approve: `${a.brandName} approved`, reject: 'Application turned down', suspend: `${a.brandName} suspended` }[action];
    if (await act(`/admin/brand-accounts/${a.id}`, { body: { action, note } }, done)) reload();
  }
  async function remove(a: Account) {
    const typed = prompt(`Delete ${a.brandName}'s account, with all ${a.items.total} of its pieces and photos? Looks already made keep the pieces, shown as sold out. This cannot be undone.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    if (await act(`/admin/brand-accounts/${a.id}`, { method: 'DELETE' }, 'Brand account deleted')) reload();
  }

  return (
    <>
      <PageTitle title="Brand accounts" intro="Brands apply at /brand/apply. Nobody can sign in until you approve them. Approved brands add pieces, which you check under Item review." />
      <Chips
        label="Show"
        value={s.status}
        options={[
          { value: 'pending', label: `Waiting (${num(data?.counts.pending)})` },
          { value: 'approved', label: `Approved (${num(data?.counts.approved)})` },
          { value: 'suspended', label: `Suspended (${num(data?.counts.suspended)})` },
          { value: 'rejected', label: `Turned down (${num(data?.counts.rejected)})` },
          { value: 'all', label: 'All' },
        ]}
        onChange={(status) => set({ status })}
      />
      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.accounts.length ? (
          <p className="card text-sm text-ink/70">Nothing here.</p>
        ) : (
          <ul className="space-y-3">
            {data.accounts.map((a) => (
              <li key={a.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold">{a.brandName}</h2>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.status === 'pending' && <Badge tone="warn">Waiting for you</Badge>}
                      {a.status === 'approved' && <Badge tone="good">Approved</Badge>}
                      {a.status === 'suspended' && <Badge tone="bad">Suspended</Badge>}
                      {a.status === 'rejected' && <Badge tone="bad">Turned down</Badge>}
                      <Badge>{TIER[a.tier] ?? a.tier}</Badge>
                      <Badge>{SELLS[a.sells] ?? a.sells}</Badge>
                      {a.sameName && <Badge tone="warn">A brand with this name is already on Saleeqa</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(a.status === 'pending' || a.status === 'suspended' || a.status === 'rejected') && (
                      <button className="btn btn-primary px-4" onClick={() => run(a, 'approve')}>
                        {a.status === 'suspended' ? 'Lift the suspension' : 'Approve'}
                      </button>
                    )}
                    {a.status === 'pending' && (
                      <button className="btn btn-ghost px-4" onClick={() => run(a, 'reject')}>
                        Turn down
                      </button>
                    )}
                    {a.status === 'approved' && (
                      <button className="btn btn-ghost px-4" onClick={() => run(a, 'suspend')}>
                        Suspend
                      </button>
                    )}
                    <button className="btn border border-red-200 bg-white px-4 text-red-700 hover:bg-red-50" onClick={() => remove(a)}>
                      Delete
                    </button>
                  </div>
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Fact label="Contact" value={a.contactName} />
                  <Fact label="Email" value={<a className="break-all text-plum" href={`mailto:${a.email}`}>{a.email}</a>} />
                  <Fact label="Phone" value={<a className="text-plum" href={`tel:${a.phone}`}>{a.phone}</a>} />
                  <Fact label="Website" value={a.website ? <a className="break-all text-plum" href={a.website} target="_blank" rel="noreferrer">{a.website}</a> : '—'} />
                  <Fact label="Instagram" value={a.instagram ?? '—'} />
                  <Fact label="City" value={a.city ?? '—'} />
                  <Fact label="Applied" value={date(a.createdAt)} />
                  <Fact label="Last signed in" value={ago(a.lastLoginAt)} />
                  <Fact
                    label="Pieces"
                    value={
                      a.items.total ? (
                        <>
                          {num(a.items.approved)} approved
                          {a.items.pending ? (
                            <>
                              {' · '}
                              <Link className="font-semibold text-plum" href={`/admin/review?brand=${a.id}`}>
                                {num(a.items.pending)} to review
                              </Link>
                            </>
                          ) : null}
                        </>
                      ) : (
                        'none yet'
                      )
                    }
                  />
                </dl>
                {a.about && <p className="mt-3 whitespace-pre-line text-sm text-ink/80">{a.about}</p>}
                {a.note && <p className="mt-3 text-sm text-red-800">Your note to them: {a.note}</p>}
                {a.brandId && a.status === 'approved' && (
                  <p className="mt-3 text-sm">
                    <Link className="font-semibold text-plum" href={`/admin/brands/${a.brandId}`}>
                      Brand report →
                    </Link>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink/65">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
