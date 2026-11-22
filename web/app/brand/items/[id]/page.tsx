'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Loading, PageTitle, act, useBrand } from '@/components/admin/ui';
import { useBrandAccount } from '@/components/brand/BrandShell';
import ItemForm, { type ItemValues } from '@/components/brand/ItemForm';

type Item = ItemValues & { id: string; status: 'pending' | 'approved' | 'rejected'; note?: string };

export default function EditItem() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { account } = useBrandAccount();
  const { data, error, loading } = useBrand<{ item: Item }>(`/brand/items/${id}`);
  if (!data) return <Loading error={error} loading={loading} />;
  const i = data.item;
  // Only the fields the form edits (the rest are dates and review details).
  const initial: ItemValues = {
    title: i.title,
    slot: i.slot,
    gender: i.gender,
    price: i.price,
    colors: i.colors,
    fabric: i.fabric,
    sizes: i.sizes,
    inStock: i.inStock,
    url: i.url,
    images: i.images,
    description: i.description,
    occasions: i.occasions,
    season: i.season,
    embellishment: i.embellishment,
    stitched: i.stitched,
    includesDupatta: i.includesDupatta,
    includesBottom: i.includesBottom,
    sleeve: i.sleeve,
    length: i.length,
    neckline: i.neckline,
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link className="text-plum" href="/brand/items">
          ← My pieces
        </Link>
      </p>
      <PageTitle title="Edit piece">
        {i.status === 'pending' && <Badge tone="warn">Waiting for approval</Badge>}
        {i.status === 'approved' && <Badge tone="good">Approved</Badge>}
        {i.status === 'rejected' && <Badge tone="bad">Not approved</Badge>}
      </PageTitle>
      {i.status === 'rejected' && i.note && <p className="card mb-4 border-red-200 bg-red-50 text-sm text-red-800">Our team's note: {i.note}. Fix it below and send it again.</p>}
      {i.status === 'approved' && (
        <p className="card mb-4 text-sm text-ink/75">
          Changing the price, sizes or stock? Do it from <Link className="font-semibold text-plum" href="/brand/items">My pieces</Link>: it goes live at once. Saving this form sends the piece for approval again, and it leaves the Studio until then.
        </p>
      )}
      <ItemForm
        initial={initial}
        sells={account.sells}
        submitLabel="Save and send for approval"
        onSubmit={async (v) => {
          if (await act(`/brand/items/${id}`, { method: 'PUT', body: v }, 'Saved: sent for approval')) router.push('/brand/items?filter=pending');
        }}
      />
    </>
  );
}
