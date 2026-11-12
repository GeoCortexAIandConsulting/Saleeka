import Link from 'next/link';
import { PHOTO_CREDITS } from '@/lib/silhouettePhotos';

export const metadata = { title: 'Photo credits · Saleeqa' };

const STYLE_NAMES: Record<string, string> = {
  'shirt-trouser': 'Western style',
  western: 'Western style',
  'shalwar-kameez': 'Shalwar kameez',
  'a-line': 'A-line / flared kameez',
  angrakha: 'Angrakha',
  maxi: 'Maxi / long frock',
  peplum: 'Peplum',
  sharara: 'Sharara / gharara',
  anarkali: 'Anarkali',
  'co-ord': 'Co-ord set',
  fusion: 'Fusion / western-cut',
};

export default function Credits() {
  const rows = Object.entries(PHOTO_CREDITS).map(([src, c]) => {
    const [, , group, style] = src.split('/');
    return { src, group, style, ...c };
  });
  return (
    <main className="page py-8">
      <Link href="/" className="font-display text-2xl font-bold text-plum">Saleeqa</Link>
      <h1 className="mt-6 text-3xl font-bold">Photo credits</h1>
      <p className="mt-2 text-sm text-ink/70">
        The style example photos in the quiz come from Wikimedia Commons under free licences. They illustrate a style
        only: they are not products for sale, and no person, museum or brand shown endorses Saleeqa.
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-ink/65">No credited photos in use.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-white">
          {rows.map((r) => (
            <li key={r.src} className="flex items-center gap-3 p-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.src} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover object-top" />
              <div className="min-w-0">
                <div className="font-semibold">
                  {STYLE_NAMES[r.style] ?? r.style} <span className="font-normal text-ink/65">({r.group})</span>
                </div>
                {r.title && <div className="truncate text-ink/65">{r.title}</div>}
                <div className="text-ink/70">
                  {r.author} ·{' '}
                  {r.licenseUrl ? <a className="underline" href={r.licenseUrl} target="_blank" rel="noreferrer">{r.license}</a> : r.license} ·{' '}
                  <a className="underline" href={r.source} target="_blank" rel="noreferrer">Source</a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
