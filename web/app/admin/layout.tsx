import type { Metadata } from 'next';

// The admin page is for the team only: never in search results.
export const metadata: Metadata = { title: 'Admin · Saleeqa', robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
