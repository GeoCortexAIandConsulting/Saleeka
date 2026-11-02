'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Gender } from './BodyFigure';
import { PHOTO_CREDITS } from '@/lib/silhouettePhotos';

export type Pattern = 'solid' | 'dots' | 'stripes';

const INK = '#2B1B2E';
const IVORY = '#F6EFE7';
const DENIM = '#46628C';
const DARK = '#3A3A48';
const GOLD = '#D9B26A';

type Draw = (top: string, bottom: string) => ReactNode;

// ---- shared pieces (viewBox 100 x 150) ----
const wSleevesLong = (t: string) => <path d="M36 18 L28 24 L25 66 L32 66 L35 30 Z M64 18 L72 24 L75 66 L68 66 L65 30 Z" fill={t} />;
const wSleeves34 = (t: string) => <path d="M36 18 L28 24 L27 50 L34 50 L35 32 Z M64 18 L72 24 L73 50 L66 50 L65 32 Z" fill={t} />;
const mSleevesLong = (t: string) => <path d="M33 18 L25 25 L23 74 L30 74 L33 32 Z M67 18 L75 25 L77 74 L70 74 L67 32 Z" fill={t} />;
const mSleevesShort = (t: string) => <path d="M33 18 L24 26 L26 40 L33 36 Z M67 18 L76 26 L74 40 L67 36 Z" fill={t} />;
const mSleevesElbow = (t: string) => <path d="M33 18 L25 25 L24 50 L31 50 L33 32 Z M67 18 L75 25 L76 50 L69 50 L67 32 Z" fill={t} />;
const shalwar = (b: string, top = 104) => (
  <path d={`M37 ${top} L33 140 Q36 146 46 145 L50 ${top + 12} L54 145 Q64 146 67 140 L63 ${top} Z`} fill={b} />
);
const straightTrouser = (b: string, top: number, inner = 8) => (
  <path d={`M36 ${top} L35 146 L48 146 L50 ${top + inner} L52 146 L65 146 L64 ${top} Z`} fill={b} />
);
const jeans = (top: number) => (
  <>
    {straightTrouser(DENIM, top, 10)}
    <path d={`M38 ${top + 6} Q42 ${top + 10} 46 ${top + 6} M54 ${top + 6} Q58 ${top + 10} 62 ${top + 6}`} fill="none" strokeOpacity={0.4} />
  </>
);
const buttons = (ys: number[], x = 50, fill = INK) => ys.map((y) => <circle key={y} cx={x} cy={y} r="1.1" fill={fill} />);
const shirtCollar = <path d="M42 14 L46 23 L50 18 L54 23 L58 14" fill="none" />;
const bandCollar = (t: string) => <path d="M44 12 L44 17 L56 17 L56 12 Z" fill={t} />;

const FEMALE: Record<string, Draw> = {
  western: (t) => (
    <>
      <path d="M44 100 L44 140 M56 100 L56 140" stroke="#E2CDBB" strokeWidth={4} strokeLinecap="round" />
      <path d="M41 142 L47 142 M53 142 L59 142" strokeWidth={2.5} strokeLinecap="round" />
      <path d="M37 18 L30 23 L30 34 L36 34 Z M63 18 L70 23 L70 34 L64 34 Z" fill={t} />
      <path d="M41 16 L37 18 L37 34 L39 50 L28 100 L72 100 L61 50 L63 34 L63 18 L59 16 Q50 24 41 16 Z" fill={t} />
      <path d="M39 47 L61 47 L61 52 L39 52 Z" fill={INK} fillOpacity={0.55} />
    </>
  ),
  'shirt-trouser': (t, b) => (
    <>
      {straightTrouser(b, 110, 6)}
      <path d="M36 18 L28 24 L26 58 L33 58 L34 30 Z M64 18 L72 24 L74 58 L67 58 L66 30 Z" fill={t} />
      <path d="M40 16 L36 18 L34 30 L34 110 L66 110 L66 30 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M44 17 L50 30 L56 17 M34 98 L36 110 M66 98 L64 110" fill="none" />
    </>
  ),
  'shalwar-kameez': (t, b) => (
    <>
      {shalwar(b, 104)}
      {wSleevesLong(t)}
      <path d="M40 16 L36 18 L34 30 L33 108 L67 108 L66 30 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M44 17 Q50 28 56 17 M33 94 L35 108 M67 94 L65 108" fill="none" />
      <path d="M38 18 Q31 50 29 104 L35 104 Q37 56 45 21 Z" fill={t} fillOpacity={0.45} />
    </>
  ),
  'a-line': (t, b) => (
    <>
      <path d="M42 116 L43 146 L49 146 L50 120 L51 146 L57 146 L58 116 Z" fill={b} />
      {wSleeves34(t)}
      <path d="M40 16 L36 18 L35 32 L34 44 L22 116 L78 116 L66 44 L65 32 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M45 17 Q50 27 55 17 M24 107 L76 107 M50 26 L50 40" fill="none" />
    </>
  ),
  angrakha: (t, b) => (
    <>
      <path d="M36 112 L30 146 L49 146 L50 120 L51 146 L70 146 L64 112 Z" fill={b} />
      <path d="M36 18 L28 24 L26 56 L33 56 L35 32 Z M64 18 L72 24 L74 56 L67 56 L65 32 Z" fill={t} />
      <path d="M40 16 L36 18 L35 32 L36 46 L24 112 L76 112 L64 46 L65 32 L64 18 L60 16 Q50 24 40 16 Z" fill={t} />
      <path d="M40 16 Q47 34 62 46 M36 46 Q50 50 64 46" fill="none" />
      <circle cx="62" cy="46" r="1.8" fill={INK} />
      <path d="M62 47 L60 56 M62 47 L65 55" fill="none" />
    </>
  ),
  maxi: (t) => (
    <>
      <path d="M36 18 L28 24 L25 70 L32 70 L36 34 Z M64 18 L72 24 L75 70 L68 70 L64 34 Z" fill={t} />
      <path d="M40 16 L36 18 L36 34 L38 48 L14 146 L86 146 L62 48 L64 34 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M38 48 Q50 53 62 48" fill="none" />
      <path d="M44 52 L36 146 M50 53 L50 146 M56 52 L64 146" fill="none" strokeOpacity={0.3} />
    </>
  ),
  peplum: (t, b) => (
    <>
      <path d="M38 70 L39 146 L48 146 L50 80 L52 146 L61 146 L62 70 Z" fill={b} />
      {wSleeves34(t)}
      <path d="M40 16 L36 18 L35 30 L37 52 L27 72 Q50 79 73 72 L63 52 L65 30 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M37 52 Q50 56 63 52 M44 17 Q50 26 56 17" fill="none" />
      <path d="M42 55 L37 75 M50 56 L50 77 M58 55 L63 75" fill="none" strokeOpacity={0.3} />
    </>
  ),
  sharara: (t, b) => (
    <>
      <path d="M37 78 L38 108 L26 146 L48 146 L50 112 L52 146 L74 146 L62 108 L63 78 Z" fill={b} />
      <path d="M38 108 L49 108 M51 108 L62 108" stroke={GOLD} strokeWidth={2} />
      <path d="M40 112 L33 146 M60 112 L67 146" fill="none" strokeOpacity={0.3} />
      {wSleeves34(t)}
      <path d="M40 16 L36 18 L35 30 L35 82 L65 82 L65 30 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M44 17 L50 28 L56 17" fill="none" />
    </>
  ),
  anarkali: (t, b) => (
    <>
      <path d="M44 126 L45 146 L49 146 L50 130 L51 146 L55 146 L56 126 Z" fill={b} />
      {wSleevesLong(t)}
      <path d="M40 16 L36 18 L36 32 L38 44 L16 128 L84 128 L62 44 L64 32 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M38 44 Q50 48 62 44 M45 17 Q50 27 55 17" fill="none" />
      <path d="M18 120 L82 120" stroke={GOLD} strokeWidth={2} />
      <path d="M50 47 L28 128 M50 47 L39 128 M50 47 L50 128 M50 47 L61 128 M50 47 L72 128" fill="none" strokeOpacity={0.28} />
    </>
  ),
  'co-ord': (t) => (
    <>
      <path d="M35 76 L34 146 L48 146 L50 84 L52 146 L66 146 L65 76 Z" fill={t} />
      <path d="M34 19 L25 26 L24 46 L33 44 Z M66 19 L75 26 L76 46 L67 44 Z" fill={t} />
      <path d="M40 16 L34 19 L33 78 L67 78 L66 19 L60 16 Q50 24 40 16 Z" fill={t} />
      <path d="M44 17 Q50 24 56 17 M33 78 L67 78" fill="none" />
    </>
  ),
  fusion: (t, b) => (
    <>
      <path d="M35 70 L26 140 L36 146 L49 146 L50 100 L51 146 L64 146 L74 140 L65 70 Z" fill={b} />
      <path d="M40 82 Q46 104 43 142 M60 82 Q54 104 57 142" fill="none" strokeOpacity={0.3} />
      <path d="M36 18 L28 26 L21 48 L33 46 L35 30 Z M64 18 L72 26 L79 48 L67 46 L65 30 Z" fill={t} />
      <path d="M40 16 L36 18 L35 30 L33 72 Q50 82 67 64 L65 30 L64 18 L60 16 Q50 26 40 16 Z" fill={t} />
      <path d="M45 17 L50 24 L55 17" fill="none" />
    </>
  ),
};

const MALE: Record<string, Draw> = {
  'shalwar-kameez': (t, b) => (
    <>
      {shalwar(b, 108)}
      {mSleevesLong(t)}
      <path d="M42 14 L33 18 L33 112 L67 112 L67 18 L58 14 L50 18 Z" fill={t} />
      {shirtCollar}
      <path d="M50 18 L50 42 M33 96 L35 112 M67 96 L65 112" fill="none" />
      {buttons([26, 34], 52)}
    </>
  ),
  'kurta-trouser': (t, b) => (
    <>
      {straightTrouser(b, 100, 6)}
      {mSleevesLong(t)}
      <path d="M44 13 L33 18 L33 102 L67 102 L67 18 L56 13 Z" fill={t} />
      {bandCollar(t)}
      <path d="M50 17 L50 40 M33 88 L35 102 M67 88 L65 102" fill="none" />
      {buttons([23, 30, 37], 52)}
    </>
  ),
  waistcoat: (t) => (
    <>
      {shalwar(IVORY, 108)}
      {mSleevesLong(IVORY)}
      <path d="M44 13 L33 18 L33 112 L67 112 L67 18 L56 13 Z" fill={IVORY} />
      {bandCollar(IVORY)}
      <path d="M40 16 L35 20 L35 74 L48 78 L50 42 L52 78 L65 74 L65 20 L60 16 L50 42 Z" fill={t} />
      {buttons([50, 58, 66, 74], 51.5, GOLD)}
      <path d="M38 60 L45 60" fill="none" />
    </>
  ),
  'western-shirt': (t) => (
    <>
      {straightTrouser(DARK, 72, 10)}
      {mSleevesLong(t)}
      <path d="M42 14 L33 18 L34 70 L66 70 L67 18 L58 14 L50 19 Z" fill={t} />
      {shirtCollar}
      <path d="M50 19 L50 70" fill="none" />
      {buttons([28, 38, 48, 58], 52)}
      <path d="M34 68 L66 68 L66 73 L34 73 Z" fill={INK} fillOpacity={0.75} />
    </>
  ),
  suit: (t) => (
    <>
      {straightTrouser(t, 92, 8)}
      {mSleevesLong(t)}
      <path d="M42 14 L33 18 L33 92 L49 95 L50 92 L51 95 L67 92 L67 18 L58 14 L50 52 Z" fill={t} />
      <path d="M42 14 L50 52 L58 14 L50 19 Z" fill="#FFFFFF" />
      <path d="M48.5 20 L51.5 20 L52.5 44 L50 48 L47.5 44 Z" fill={INK} fillOpacity={0.75} />
      <path d="M42 14 L44 34 L50 52 M58 14 L56 34 L50 52 M37 78 L45 78 M55 78 L63 78" fill="none" />
      {buttons([62, 74])}
    </>
  ),
  sherwani: (t, b) => (
    <>
      <path d="M40 114 L41 146 L48 146 L50 120 L52 146 L59 146 L60 114 Z" fill={b} />
      {mSleevesLong(t)}
      <path d="M44 12 L33 18 L32 118 L68 118 L67 18 L56 12 Z" fill={t} />
      {bandCollar(t)}
      <path d="M50 17 L50 118" fill="none" />
      <path d="M32 110 L68 110 M23 70 L30 70 M70 70 L77 70" stroke={GOLD} strokeWidth={1.8} />
      {buttons([24, 32, 40, 48, 56, 64], 51.8, GOLD)}
    </>
  ),
  'prince-coat': (t, b) => (
    <>
      {straightTrouser(b, 84, 8)}
      {mSleevesLong(t)}
      <path d="M44 12 L33 18 L33 86 L67 86 L67 18 L56 12 Z" fill={t} />
      {bandCollar(t)}
      <path d="M50 17 L50 86 M36 64 L44 64" fill="none" />
      <path d="M57 30 L63 30 L62 26 Z" fill="#FFFFFF" />
      {buttons([24, 34, 44, 54, 64, 74], 52)}
    </>
  ),
  'polo-jeans': (t) => (
    <>
      {jeans(76)}
      {mSleevesShort(t)}
      <path d="M42 14 L33 18 L34 78 L66 78 L67 18 L58 14 L50 18 Z" fill={t} />
      {shirtCollar}
      <path d="M50 18 L50 32" fill="none" />
      {buttons([24, 30], 52)}
    </>
  ),
  pathani: (t, b) => (
    <>
      <path d="M36 104 L31 140 Q35 147 46 145 L50 116 L54 145 Q65 147 69 140 L64 104 Z" fill={b} />
      {mSleevesLong(t)}
      <path d="M42 14 L33 18 L33 106 Q50 112 67 106 L67 18 L58 14 L50 18 Z" fill={t} />
      {shirtCollar}
      <path d="M50 18 L50 46 M55 30 L63 30 L63 39 L55 39 Z" fill="none" />
      {buttons([26, 34, 42], 52)}
    </>
  ),
  'kurta-jeans': (t) => (
    <>
      {jeans(84)}
      {mSleevesElbow(t)}
      <path d="M44 13 L33 18 L33 88 L67 88 L67 18 L56 13 Z" fill={t} />
      {bandCollar(t)}
      <path d="M50 17 L50 38 M33 76 L35 88 M67 76 L65 88 M24 46 L31 46 M69 46 L76 46" fill="none" />
      {buttons([24, 31], 52)}
    </>
  ),
};

export function SilhouetteArt({
  kind,
  gender = 'female',
  color,
  pattern = 'solid',
  className = '',
}: {
  kind: string;
  gender?: Gender;
  color: string;
  pattern?: Pattern;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const draw = (gender === 'male' ? MALE : FEMALE)[kind];
  if (!draw) return null;
  const fill = pattern === 'solid' ? color : `url(#p${id})`;
  return (
    <svg viewBox="0 0 100 150" className={className} aria-hidden="true">
      {pattern !== 'solid' && (
        <defs>
          <pattern id={`p${id}`} width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={color} />
            {pattern === 'dots' ? (
              <circle cx="4" cy="4" r="1.3" fill="#fff" fillOpacity={0.55} />
            ) : (
              <rect width="1.6" height="8" fill="#fff" fillOpacity={0.3} />
            )}
          </pattern>
        </defs>
      )}
      <g stroke={INK} strokeOpacity={0.7} strokeWidth={1.1} strokeLinejoin="round">
        {draw(fill, IVORY)}
      </g>
    </svg>
  );
}

const COLLAGE: Record<Gender, { color: string; pattern: Pattern; bg: string }[]> = {
  female: [
    { color: '#6B2D5C', pattern: 'solid', bg: '#F3E8F0' },
    { color: '#2F6B57', pattern: 'dots', bg: '#E8F1EC' },
    { color: '#B8893B', pattern: 'stripes', bg: '#F6EEDD' },
  ],
  male: [
    { color: '#2E3A59', pattern: 'solid', bg: '#E8EBF2' },
    { color: '#5A6440', pattern: 'solid', bg: '#EDEFE4' },
    { color: '#7A5A3C', pattern: 'stripes', bg: '#F3ECE3' },
  ],
};


// Photos dropped into public/silhouettes/<women|men>/<style>/, listed once per page load.
let folderPhotos: Promise<Record<string, string[]>> | null = null;
function useFolderPhotos() {
  const [map, setMap] = useState<Record<string, string[]>>({});
  useEffect(() => {
    folderPhotos ??= fetch('/silhouette-photos').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    let live = true;
    folderPhotos.then((m) => live && setMap(m));
    return () => { live = false; };
  }, []);
  return map;
}

/** One image per card: the first photo in the style's folder, or a drawing until it has one. */
export function SilhouetteCollage({ kind, gender = 'female' }: { kind: string; gender?: Gender }) {
  const looks = COLLAGE[gender];
  const folder = useFolderPhotos();
  const key = `${gender}:${kind}`;
  const photos = (folder[key] ?? []).map((src) => {
    const c = PHOTO_CREDITS[decodeURIComponent(src)];
    return { src, title: c ? `Photo: ${c.author} (${c.license})` : undefined };
  });
  const tile = (i: number) => {
    const c = looks[i];
    const p = photos[i];
    return p ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={p.src} alt="" loading="lazy" title={p.title} className="h-full w-full object-cover object-top" />
    ) : (
      <div className="flex h-full w-full items-center justify-center p-1" style={{ background: c.bg }}>
        <SilhouetteArt kind={kind} gender={gender} color={c.color} pattern={c.pattern} className="h-full" />
      </div>
    );
  };
  return (
    <div className="h-48 overflow-hidden rounded-xl">{tile(0)}</div>
  );
}

// ---- Embellishment previews ----

export type Embellishment = 'minimal' | 'medium' | 'heavy';

const W_KAMEEZ = 'M40 16 L36 18 L34 30 L34 110 L66 110 L66 30 L64 18 L60 16 Q50 26 40 16 Z';
const W_SLEEVES = 'M36 18 L28 24 L26 58 L33 58 L34 30 Z M64 18 L72 24 L74 58 L67 58 L66 30 Z';
const M_KURTA = 'M44 13 L33 18 L33 102 L67 102 L67 18 L56 13 Z';
const M_SHERWANI = 'M44 12 L33 18 L32 118 L68 118 L67 18 L56 12 Z';
const M_SLEEVES = 'M33 18 L25 25 L23 74 L30 74 L33 32 Z M67 18 L75 25 L77 74 L70 74 L67 32 Z';

const EMB_LOOK: Record<Gender, Record<Embellishment, { color: string; bg: string }>> = {
  female: {
    minimal: { color: '#E3A6B4', bg: '#FBEFF2' },
    medium: { color: '#1F6B55', bg: '#E8F1EC' },
    heavy: { color: '#7A1F2B', bg: '#F6EEDD' },
  },
  male: {
    minimal: { color: '#E9E2D4', bg: '#F1EEE8' },
    medium: { color: '#2E3A59', bg: '#E8EBF2' },
    heavy: { color: '#6B1F2E', bg: '#F6EEDD' },
  },
};

const sparkles = (pts: [number, number][]) =>
  pts.map(([x, y]) => (
    <path key={`${x}-${y}`} d={`M${x} ${y - 2.6} L${x + 0.7} ${y - 0.7} L${x + 2.6} ${y} L${x + 0.7} ${y + 0.7} L${x} ${y + 2.6} L${x - 0.7} ${y + 0.7} L${x - 2.6} ${y} L${x - 0.7} ${y - 0.7} Z`} fill="#FFF6D8" stroke="none" />
  ));

/** One outfit drawn at a given embroidery level, matched to the shopper's gender. */
export function EmbellishArt({ level, gender = 'female', className = '' }: { level: Embellishment; gender?: Gender; className?: string }) {
  const id = useId().replace(/:/g, '');
  const { color } = EMB_LOOK[gender][level];
  const print = `url(#print${id})`;
  const motif = `url(#motif${id})`;
  const male = gender === 'male';

  return (
    <svg viewBox="0 0 100 150" className={className} aria-hidden="true">
      <defs>
        <pattern id={`print${id}`} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" fill={color} />
          <circle cx="3" cy="3" r="1.2" fill="#fff" fillOpacity={0.6} />
          <circle cx="8" cy="8" r="0.8" fill="#fff" fillOpacity={0.45} />
        </pattern>
        <pattern id={`motif${id}`} width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="1.6" fill={GOLD} />
          <circle cx="4.5" cy="1.6" r="0.6" fill={GOLD} />
          <circle cx="4.5" cy="7.4" r="0.6" fill={GOLD} />
          <circle cx="1.6" cy="4.5" r="0.6" fill={GOLD} />
          <circle cx="7.4" cy="4.5" r="0.6" fill={GOLD} />
        </pattern>
      </defs>
      <g stroke={INK} strokeOpacity={0.7} strokeWidth={1.1} strokeLinejoin="round">
        {!male && (
          <>
            {straightTrouser(level === 'heavy' ? '#F3E3C0' : IVORY, 110, 6)}
            <path d={W_SLEEVES} fill={level === 'minimal' ? print : color} />
            <path d={W_KAMEEZ} fill={level === 'minimal' ? print : color} />
            {level !== 'minimal' && (
              <g stroke={GOLD} strokeWidth={level === 'heavy' ? 4 : 2.6} strokeLinecap="round" fill="none" strokeOpacity={1}>
                <path d="M43 17 L50 31 L57 17" />
                <path d="M26.5 54 L33 54 M67 54 L73.5 54" />
                <path d="M34.5 104 L65.5 104" />
              </g>
            )}
            {level === 'medium' && (
              <g fill={GOLD} stroke="none">
                {[38, 44, 50].map((y) => <circle key={y} cx="50" cy={y} r="1.3" />)}
              </g>
            )}
            {level === 'heavy' && (
              <>
                <path d="M36 34 L64 34 L64 96 L36 96 Z" fill={motif} stroke="none" />
                <path d="M34.5 97 L65.5 97" stroke={GOLD} strokeWidth={2.4} />
                <path d="M27 46 L33 46 M67 46 L73 46" stroke={GOLD} strokeWidth={2} />
                <path d="M38 18 Q31 50 29 104 L35 104 Q37 56 45 21 Z" fill={color} fillOpacity={0.55} />
                <path d="M29 104 L35 104 Q37 56 45 21" fill="none" stroke={GOLD} strokeWidth={1.6} strokeOpacity={1} />
                {sparkles([[42, 44], [58, 60], [46, 80], [56, 40], [40, 92], [60, 88]])}
              </>
            )}
          </>
        )}

        {male && level !== 'heavy' && (
          <>
            {straightTrouser(IVORY, 100, 6)}
            <path d={M_SLEEVES} fill={color} />
            <path d={M_KURTA} fill={color} />
            <path d="M44 12 L44 17 L56 17 L56 12 Z" fill={level === 'medium' ? GOLD : color} />
            {level === 'minimal' ? (
              <>
                <path d="M50 17 L50 40" fill="none" />
                {buttons([23, 30, 37], 52)}
              </>
            ) : (
              <>
                <path d="M50 17 L50 46" stroke={GOLD} strokeWidth={3} strokeOpacity={1} />
                <path d="M23.5 70 L30 70 M70 70 L76.5 70" stroke={GOLD} strokeWidth={2.6} strokeOpacity={1} />
                <path d="M44 19 Q50 23 56 19" fill="none" stroke={GOLD} strokeWidth={1.4} strokeOpacity={1} />
                {buttons([24, 32, 40], 53, GOLD)}
              </>
            )}
          </>
        )}

        {male && level === 'heavy' && (
          <>
            <path d="M40 114 L41 146 L48 146 L50 120 L52 146 L59 146 L60 114 Z" fill="#F3E3C0" />
            <path d={M_SLEEVES} fill={color} />
            <path d={M_SHERWANI} fill={color} />
            <path d="M35 24 L65 24 L65 104 L35 104 Z" fill={motif} stroke="none" />
            <path d="M44 12 L44 17 L56 17 L56 12 Z" fill={GOLD} />
            <path d="M50 17 L50 118" stroke={GOLD} strokeWidth={2.6} strokeOpacity={1} />
            <path d="M32.5 110 L67.5 110 M23.5 66 L30 66 M70 66 L76.5 66 M23.5 71 L30 71 M70 71 L76.5 71" stroke={GOLD} strokeWidth={2.4} strokeOpacity={1} />
            {buttons([24, 32, 40, 48, 56, 64], 52.5, '#FFF6D8')}
            {sparkles([[40, 40], [60, 56], [42, 84], [58, 96]])}
          </>
        )}
      </g>
    </svg>
  );
}

// Women's looks are cut from one styling chart (web/public/silhouettes/women/styletype.png) with CSS,
// so the original file is never changed. Boxes are in the chart's pixels (1234 x 1275).
const STYLE_CHART = { src: '/silhouettes/women/styletype.png', w: 1234, h: 1275 };
export type LookStyle = 'eastern' | 'western';
const CHART_CROPS: Record<LookStyle, Record<Embellishment, [number, number, number, number]>> = {
  western: { minimal: [174, 108, 212, 472], medium: [524, 108, 212, 472], heavy: [868, 108, 212, 472] },
  eastern: { minimal: [165, 712, 230, 510], medium: [516, 712, 230, 510], heavy: [866, 712, 230, 510] },
};

function ChartCrop({ box, label }: { box: [number, number, number, number]; label: string }) {
  const [x, y, w, h] = box;
  return (
    <div
      role="img"
      aria-label={label}
      className="w-full rounded-xl bg-sand"
      style={{
        aspectRatio: `${w} / ${h}`,
        backgroundImage: `url('${STYLE_CHART.src}')`,
        backgroundSize: `${(STYLE_CHART.w / w) * 100}% auto`,
        backgroundPosition: `${(x / (STYLE_CHART.w - w)) * 100}% ${(y / (STYLE_CHART.h - h)) * 100}%`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}

export function EmbellishPreview({ level, gender = 'female', look = 'eastern' }: { level: Embellishment; gender?: Gender; look?: LookStyle }) {
  if (gender === 'female') {
    return <ChartCrop box={CHART_CROPS[look][level]} label={`${look === 'eastern' ? 'Eastern' : 'Western'} outfit with ${level} detail`} />;
  }
  return (
    <div className="flex h-40 items-center justify-center rounded-xl p-1" style={{ background: EMB_LOOK[gender][level].bg }}>
      <EmbellishArt level={level} gender={gender} className="h-full" />
    </div>
  );
}
