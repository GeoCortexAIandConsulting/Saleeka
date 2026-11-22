import type { Metadata } from 'next';
import BrandShell from '@/components/brand/BrandShell';

export const metadata: Metadata = { title: 'Saleeqa for brands', description: 'Show your pieces to shoppers styling complete looks on Saleeqa, and see how they style them.' };

export default function BrandLayout({ children }: { children: React.ReactNode }) {
  return <BrandShell>{children}</BrandShell>;
}
