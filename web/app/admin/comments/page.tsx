'use client';
import Link from 'next/link';
import { Loading, PageTitle, Pager, SearchBox, act, ago, num, qs, useAdmin, useUrlState } from '@/components/admin/ui';

type List = {
  total: number;
  page: number;
  pages: number;
  comments: Array<{ id: string; text: string; at: string; by: string; userId: string; email: string | null; lookId: string; lookTitle: string; reply: boolean }>;
};

const DEFAULTS = { search: '', page: '0' };

export default function AdminComments() {
  const [s, set, ready] = useUrlState(DEFAULTS);
  const { data, error, loading, reload } = useAdmin<List>(ready ? `/admin/comments${qs({ search: s.search, page: Number(s.page) })}` : null);

  async function remove(id: string) {
    if (!confirm('Delete this comment (and any replies under it)? It cannot be undone.')) return;
    if (await act(`/admin/comments/${id}`, { method: 'DELETE' }, 'Comment deleted')) reload();
  }

  return (
    <>
      <PageTitle title="Comments" intro="Every comment and reply on the Runway, newest first. Deleting a comment also deletes the replies under it." />
      <SearchBox value={s.search} onChange={(search) => set({ search, page: '0' })} placeholder="Search comment text" />
      <div className="mt-6">
        {!data ? (
          <Loading error={error} loading={loading} />
        ) : !data.comments.length ? (
          <p className="card text-sm text-ink/70">No comments here.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-ink/70">{num(data.total)} comments</p>
            <ul className="card divide-y divide-line text-sm">
              {data.comments.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="break-words">{c.text}</p>
                    <p className="mt-1 text-xs text-ink/70">
                      <Link className="font-semibold text-plum" href={`/admin/users/${c.userId}`}>
                        @{c.by}
                      </Link>{' '}
                      {c.reply ? 'replied on' : 'on'}{' '}
                      <Link className="text-plum" href={`/admin/looks/${c.lookId}`}>
                        {c.lookTitle}
                      </Link>{' '}
                      · {ago(c.at)}
                    </p>
                  </div>
                  <button className="min-h-[32px] shrink-0 font-semibold text-red-700" onClick={() => remove(c.id)}>
                    Delete
                  </button>
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
