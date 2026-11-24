'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import LookFigure, { MaleFigure, type FigureLook, type MaleLook } from './LookFigure';

/**
 * The Runway on the landing page: real trending looks (with their AI model images and latest comment)
 * once players have published a few; until then, illustrated sample posts in the same shape.
 */
interface RealLook {
  id: string;
  by: string;
  challenge: { title: string } | null;
  total: number;
  up: number;
  comments: number;
  previewUrl: string;
  comment: { by: string; text: string } | null;
}

interface Post {
  by: string;
  challenge: string;
  total: number;
  likes: number;
  comment: { by: string; text: string };
  look?: FigureLook;
  /** A men's look */
  male?: MaleLook;
  tint: string;
}

const POSTS: Post[] = [
  {
    by: 'Hira',
    challenge: 'Mehndi · mustard and green',
    total: 23500,
    likes: 248,
    comment: { by: 'Sana', text: 'That khussa is everything' },
    look: { kameez: '#D4A017', bottom: '#F3EBDD', dupatta: '#C2562E', shoes: '#C9A24A', bag: { kind: 'potli', color: '#0F7B5A' }, jewel: { kind: 'jhumka', color: '#C9A24A' } },
    tint: '#F6E7C1',
  },
  {
    by: 'Bilal',
    challenge: 'Eid · white and ivory',
    total: 18900,
    likes: 287,
    comment: { by: 'Ayesha', text: 'The gold waistcoat makes it' },
    male: { kurta: '#F7F2E8', bottom: '#F7F2E8', waistcoat: '#C9A24A', shoes: '#6B4A33', watch: '#C3C9D2' },
    tint: '#EFE7DA',
  },
  {
    by: 'Mariam',
    challenge: 'Baraat · red and maroon',
    total: 48900,
    likes: 401,
    comment: { by: 'Ayesha', text: 'Bridal party goals' },
    look: { kameez: '#9E1F2E', bottom: '#6F1D2B', dupatta: '#C9A24A', shoes: '#C9A24A', bag: { kind: 'potli', color: '#C9A24A' }, jewel: { kind: 'choker', color: '#D4AF37' } },
    tint: '#F2D9D6',
  },
  {
    by: 'Hamza',
    challenge: 'Walima · navy',
    total: 24600,
    likes: 198,
    comment: { by: 'Bilal', text: 'Clean. Where is the waistcoat from?' },
    male: { kurta: '#1F3A5F', bottom: '#1F3A5F', waistcoat: '#2B2B2E', shoes: '#2B2B2E', watch: '#C9A24A' },
    tint: '#DDE4EC',
  },
];

const rupees = (n: number) => `Rs. ${n.toLocaleString('en-PK')}`;

function PostCard({ post, i }: { post: Post; i: number }) {
  const [liked, setLiked] = useState(false);
  return (
    <li className={`reveal rounded-[1.75rem] bg-white p-3 text-ink shadow-[0_30px_60px_-40px_rgb(0_0_0_/_0.6)] ${i % 2 ? 'lg:translate-y-10' : ''}`}>
      <div className="flex items-center gap-2.5 px-1 pb-3 pt-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-plum-soft text-sm font-semibold text-plum-dark" aria-hidden="true">{post.by[0]}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{post.by}</p>
          <p className="truncate text-xs text-ink/65">{post.challenge}</p>
        </div>
      </div>
      <div className="arch overflow-hidden" style={{ background: `linear-gradient(to bottom, ${post.tint}, #FBF7F2)` }}>
        {post.male ? (
          <MaleFigure id={`post-${i}`} look={post.male} label={`${post.by}'s look for ${post.challenge}`} className="mx-auto block h-64 w-auto pt-3" />
        ) : (
          <LookFigure id={`post-${i}`} look={post.look ?? {}} label={`${post.by}'s look for ${post.challenge}`} className="mx-auto block h-64 w-auto pt-3" />
        )}
      </div>
      <div className="flex items-center gap-2 px-1 pt-3">
        <button
          type="button"
          onClick={() => setLiked((l) => !l)}
          aria-pressed={liked}
          aria-label={`Like ${post.by}'s look (${post.likes + (liked ? 1 : 0)} likes)`}
          className={`chip !min-h-[40px] !py-1 ${liked ? 'chip-on' : ''}`}
        >
          <span className={liked ? 'pop' : ''}>♥</span>
          <span className="ml-1.5">{post.likes + (liked ? 1 : 0)}</span>
        </button>
        <span className="ml-auto font-display text-lg font-semibold text-plum-dark">{rupees(post.total)}</span>
      </div>
      <p className="px-1 pb-1 pt-2 text-sm text-ink/80">
        <span className="font-semibold text-ink">{post.comment.by}</span> {post.comment.text}
      </p>
    </li>
  );
}

function RealCard({ look, i }: { look: RealLook; i: number }) {
  return (
    <li className={`reveal rounded-[1.75rem] bg-white p-3 text-ink shadow-[0_30px_60px_-40px_rgb(0_0_0_/_0.6)] ${i % 2 ? 'lg:translate-y-10' : ''}`}>
      <Link href={`/runway/${look.id}`} className="block">
        <div className="flex items-center gap-2.5 px-1 pb-3 pt-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-plum-soft text-sm font-semibold text-plum-dark" aria-hidden="true">{look.by[0]}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{look.by}</p>
            <p className="truncate text-xs text-ink/65">{look.challenge?.title ?? 'A look'}</p>
          </div>
        </div>
        <div className="arch overflow-hidden bg-sand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={look.previewUrl} alt={`${look.by}’s look on a model`} loading="lazy" className="aspect-[4/5] w-full object-cover object-top" />
        </div>
        <div className="flex items-center gap-3 px-1 pt-3 text-sm font-semibold">
          <span className="text-plum">♥ {look.up}</span>
          <span className="text-ink/65">💬 {look.comments}</span>
          <span className="ml-auto font-display text-lg text-plum-dark">{rupees(look.total)}</span>
        </div>
        {look.comment && (
          <p className="line-clamp-2 px-1 pb-1 pt-2 text-sm text-ink/80">
            <span className="font-semibold text-ink">{look.comment.by}</span> {look.comment.text}
          </p>
        )}
      </Link>
    </li>
  );
}

export default function RunwayShowcase() {
  const [real, setReal] = useState<RealLook[] | null>(null);

  useEffect(() => {
    fetch('/api/showcase')
      .then((r) => (r.ok ? r.json() : { looks: [] }))
      .then((b: { looks: RealLook[] }) => setReal(b.looks))
      .catch(() => setReal([]));
  }, []);

  // Two or more real looks: show them. Otherwise the illustrated samples, marked as samples.
  if (real && real.length >= 2) {
    return (
      <ul className={`grid grid-cols-1 gap-6 min-[520px]:grid-cols-2 lg:pb-10 ${real.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {real.map((l, i) => <RealCard key={l.id} look={l} i={i} />)}
      </ul>
    );
  }
  return (
    <div>
      <ul className="grid grid-cols-1 gap-6 min-[520px]:grid-cols-2 lg:grid-cols-4 lg:pb-10">
        {POSTS.map((p, i) => <PostCard key={p.by} post={p} i={i} />)}
      </ul>
      <p className="mt-8 text-center text-xs text-white/70">Illustrated sample looks.</p>
    </div>
  );
}
