import { redirect } from 'next/navigation';

/** Brands sign in on the same page as players (/login), which opens the right dashboard. */
export default function BrandLogin() {
  redirect('/login');
}
