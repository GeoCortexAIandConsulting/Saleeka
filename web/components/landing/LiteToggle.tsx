'use client';
import { useEffect, useState } from 'react';
import { LITE_EVENT, readLite, writeLite } from './capability';

/** Footer switch that forces the 2D page, remembered on this device. */
export default function LiteToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(readLite());
    const sync = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener(LITE_EVENT, sync);
    return () => window.removeEventListener(LITE_EVENT, sync);
  }, []);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => writeLite(!on)}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full text-sm text-ink/80 hover:text-ink"
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-plum' : 'bg-line'}`} aria-hidden="true">
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      Lite mode
    </button>
  );
}
