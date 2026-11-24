/** The Saleeqa emblem (cut from the brand logo) with the wordmark beside it. */
export default function Logo({ variant = 'full', className = '' }: { variant?: 'full' | 'mark'; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-[1.7rem] font-semibold leading-none tracking-tight text-plum ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={42} height={40} className="h-10 w-auto" />
      {variant === 'full' && <span>Saleeqa</span>}
    </span>
  );
}

/** The brand's Urdu name, always in its own script and direction. */
export function UrduName({ className = '' }: { className?: string }) {
  return (
    <span lang="ur" dir="rtl" className={`font-urdu normal-case tracking-normal ${className}`}>
      سلیقہ
    </span>
  );
}
