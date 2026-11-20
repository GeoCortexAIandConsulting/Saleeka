import Link from 'next/link';

/**
 * Where a visitor without an account reaches the end of what they can see: the first few Runway
 * looks. Signing up (or in) brings them back to the same page.
 */
export default function GuestWall({ next, title = 'See every look on the Runway' }: { next: string; title?: string }) {
  const back = `?next=${encodeURIComponent(next)}`;
  return (
    <div className="relative mt-6 overflow-hidden rounded-3xl border border-gold/50 bg-ivory px-6 py-10 text-center">
      <p className="eyebrow">Free account</p>
      <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink/75">
        Sign in or create a free account to see all the looks, like your favourites, comment, and publish your own.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href={`/signup${back}`} className="btn btn-primary">Create a free account</Link>
        <Link href={`/login${back}`} className="btn btn-ghost">Sign in</Link>
      </div>
    </div>
  );
}
