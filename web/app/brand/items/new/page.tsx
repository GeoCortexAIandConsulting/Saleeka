'use client';
import { useRouter } from 'next/navigation';
import { PageTitle, act } from '@/components/admin/ui';
import { useBrandAccount } from '@/components/brand/BrandShell';
import ItemForm from '@/components/brand/ItemForm';

export default function NewItem() {
  const router = useRouter();
  const { account } = useBrandAccount();
  return (
    <>
      <PageTitle title="Add a piece" intro="Our team checks every new piece (usually within a day). Once approved, players can pick it in the Studio." />
      <ItemForm
        sells={account.sells}
        submitLabel="Send for approval"
        onSubmit={async (v) => {
          if (await act('/brand/items', { body: v }, 'Sent for approval')) router.push('/brand/items?filter=pending');
        }}
      />
    </>
  );
}
