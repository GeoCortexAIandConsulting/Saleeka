/**
 * A fashion-sketch woman (no face, like a designer's croquis) wearing a look: kurta, shalwar,
 * dupatta, khussa, a bag and jewellery. Every piece is optional; unchosen clothes show as plain
 * muslin, like a dress form waiting to be styled. Used for the landing page's illustrated sample
 * Runway posts and steps, so they share one style (the demo itself uses real pieces).
 */

export interface FigureLook {
  kameez?: string;
  bottom?: string;
  dupatta?: string;
  shoes?: string;
  bag?: { color: string; kind: 'potli' | 'clutch' };
  jewel?: { color: string; kind: 'jhumka' | 'choker' };
}

const SKIN = '#C68B66';
const SKIN_SHADE = '#B07654';
const HAIR = '#2A1A1F';
const GOLD = '#C9A24A';
const MUSLIN = '#EFE6D8';
const MUSLIN_LINE = '#CDB9A0';

const fill = (c: string | undefined, fallback: string) => ({ fill: c ?? fallback, transition: 'fill 450ms var(--ease-silk)' });

export default function LookFigure({ look, id, className = '', label }: { look: FigureLook; id: string; className?: string; label: string }) {
  const motif = `motif-${id}`;
  const muslin = (c?: string) => (c ? {} : { stroke: MUSLIN_LINE, strokeWidth: 1.5, strokeDasharray: '5 5' });
  return (
    <svg viewBox="62 34 196 558" role="img" aria-label={label} className={className}>
      <defs>
        {/* Small embroidered dots, laid over any fabric colour */}
        <pattern id={motif} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.3" fill="#fff" opacity="0.35" />
          <circle cx="10" cy="10" r="0.9" fill="#fff" opacity="0.25" />
        </pattern>
      </defs>

      {/* ground shadow */}
      <ellipse cx="150" cy="584" rx="78" ry="8" fill="#1E1020" opacity="0.08" />

      {/* hair falling behind the shoulders */}
      <path d="M124 76 C116 124 118 168 126 200 L174 200 C182 168 184 124 176 76 Z" fill={HAIR} />

      {/* dupatta, the panel falling behind the right arm */}
      {look.dupatta && (
        <g className="piece-in">
          <path d="M184 116 C202 182 214 290 222 404 L246 396 C234 288 216 178 194 112 Z" style={fill(look.dupatta, MUSLIN)} />
          <path d="M184 116 C202 182 214 290 222 404 L246 396 C234 288 216 178 194 112 Z" fill={`url(#${motif})`} />
          <path d="M222 404 L246 396" stroke={GOLD} strokeWidth="3" />
        </g>
      )}

      {/* neck and hands */}
      <path d="M142 100 L158 100 L161 124 L139 124 Z" fill={SKIN_SHADE} />
      <ellipse cx="96" cy="302" rx="8" ry="11" fill={SKIN} />
      <ellipse cx="204" cy="302" rx="8" ry="11" fill={SKIN} />

      {/* shalwar */}
      <g>
        <path d="M112 420 C110 470 106 520 104 562 L142 562 C144 520 146 470 151 428 Z" style={fill(look.bottom, MUSLIN)} {...muslin(look.bottom)} />
        <path d="M149 428 C154 470 156 520 158 562 L196 562 C194 520 190 470 188 420 Z" style={fill(look.bottom, MUSLIN)} {...muslin(look.bottom)} />
        {look.bottom && <path d="M104 553 L142 553 M158 553 L196 553" stroke={GOLD} strokeWidth="3" />}
      </g>

      {/* feet: khussa, or bare */}
      {look.shoes ? (
        <g className="piece-in">
          <path d="M101 566 C112 557 136 557 146 566 L147 577 C130 585 108 584 94 574 C95 570 97 568 101 566 Z" style={fill(look.shoes, MUSLIN)} />
          <path d="M199 566 C188 557 164 557 154 566 L153 577 C170 585 192 584 206 574 C205 570 203 568 199 566 Z" style={fill(look.shoes, MUSLIN)} />
          <path d="M108 568 L140 568 M160 568 L192 568" stroke={GOLD} strokeWidth="1.6" strokeDasharray="1 4" strokeLinecap="round" />
        </g>
      ) : (
        <g fill={SKIN}>
          <ellipse cx="124" cy="570" rx="17" ry="6" />
          <ellipse cx="176" cy="570" rx="17" ry="6" />
        </g>
      )}

      {/* kurta: sleeves, then the body */}
      <g>
        <path d="M121 120 L104 128 C96 170 92 230 88 292 L106 295 C110 236 116 186 124 150 Z" style={fill(look.kameez, MUSLIN)} {...muslin(look.kameez)} />
        <path d="M179 120 L196 128 C204 170 208 230 212 292 L194 295 C190 236 184 186 176 150 Z" style={fill(look.kameez, MUSLIN)} {...muslin(look.kameez)} />
        <path
          d="M122 118 C134 113 166 113 178 118 L185 150 C183 186 179 212 179 232 C189 300 200 360 209 424 L91 424 C100 360 111 300 121 232 C121 212 117 186 115 150 Z"
          style={fill(look.kameez, MUSLIN)}
          {...muslin(look.kameez)}
        />
        {look.kameez && (
          <>
            <path d="M121 120 L104 128 C96 170 92 230 88 292 L106 295 C110 236 116 186 124 150 Z M179 120 L196 128 C204 170 208 230 212 292 L194 295 C190 236 184 186 176 150 Z M122 118 C134 113 166 113 178 118 L185 150 C183 186 179 212 179 232 C189 300 200 360 209 424 L91 424 C100 360 111 300 121 232 C121 212 117 186 115 150 Z" fill={`url(#${motif})`} />
            {/* neckline, cuffs and hem embroidery */}
            <path d="M140 117 L150 140 L160 117 Z" fill={SKIN_SHADE} />
            <path d="M138 116 L150 143 L162 116" stroke={GOLD} strokeWidth="2.5" fill="none" />
            <path d="M88 288 L106 291 M212 288 L194 291" stroke={GOLD} strokeWidth="3.5" />
            <path d="M94 404 C130 409 170 409 206 404" stroke={GOLD} strokeWidth="3" strokeDasharray="0.5 6" strokeLinecap="round" fill="none" />
            <path d="M92 416 C130 421 170 421 208 416" stroke={GOLD} strokeWidth="2.5" fill="none" />
          </>
        )}
      </g>

      {/* dupatta, the front panel over the left shoulder */}
      {look.dupatta && (
        <g className="piece-in">
          <path d="M116 115 C104 172 98 252 93 392 L127 399 C129 300 135 200 143 118 Z" style={fill(look.dupatta, MUSLIN)} opacity="0.94" />
          <path d="M116 115 C104 172 98 252 93 392 L127 399 C129 300 135 200 143 118 Z" fill={`url(#${motif})`} />
          <path d="M116 115 C104 172 98 252 93 392 M143 118 C135 200 129 300 127 399" stroke={GOLD} strokeWidth="1.6" fill="none" opacity="0.9" />
          <path d="M93 392 L127 399" stroke={GOLD} strokeWidth="3.5" />
          <path d="M97 396 L96 406 M105 397 L104 408 M113 398 L113 409 M121 399 L121 409" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      )}

      {/* head */}
      <ellipse cx="150" cy="78" rx="22" ry="27" fill={SKIN} />
      <path d="M127 82 C123 50 138 44 150 44 C162 44 177 50 173 82 C168 66 160 59 150 61 C140 59 132 66 127 82 Z" fill={HAIR} />

      {/* jewellery */}
      {look.jewel?.kind === 'jhumka' && (
        <g className="piece-in" fill={look.jewel.color}>
          <circle cx="128" cy="88" r="2.4" />
          <circle cx="172" cy="88" r="2.4" />
          <path d="M122.5 99 Q128 89 133.5 99 Z M166.5 99 Q172 89 177.5 99 Z" />
          <path d="M123 100 L123 103 M128 100 L128 104 M133 100 L133 103 M167 100 L167 103 M172 100 L172 104 M177 100 L177 103" stroke={look.jewel.color} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}
      {look.jewel?.kind === 'choker' && (
        <g className="piece-in">
          <path d="M139 109 Q150 119 161 109" stroke={look.jewel.color} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <circle cx="150" cy="116" r="2.6" fill="#9E1F3A" />
          <circle cx="143" cy="113.5" r="1.8" fill="#1F7A5A" />
          <circle cx="157" cy="113.5" r="1.8" fill="#1F7A5A" />
        </g>
      )}

      {/* bag, held in the right hand */}
      {look.bag?.kind === 'potli' && (
        <g className="piece-in">
          <path d="M204 306 L206 326" stroke={GOLD} strokeWidth="1.6" />
          <path d="M191 334 C190 322 222 322 221 334 C228 358 214 370 206 370 C198 370 184 358 191 334 Z" style={fill(look.bag.color, MUSLIN)} />
          <path d="M191 334 C190 322 222 322 221 334 C228 358 214 370 206 370 C198 370 184 358 191 334 Z" fill={`url(#${motif})`} />
          <ellipse cx="206" cy="329" rx="14" ry="3.5" fill={GOLD} />
          <circle cx="206" cy="372" r="2.5" fill={GOLD} />
        </g>
      )}
      {look.bag?.kind === 'clutch' && (
        <g className="piece-in">
          <rect x="186" y="296" width="44" height="26" rx="5" style={fill(look.bag.color, MUSLIN)} stroke="#D9C9B3" />
          <path d="M186 302 L208 313 L230 302" stroke="#D9C9B3" strokeWidth="1.5" fill="none" />
          <circle cx="208" cy="313" r="2.6" fill={GOLD} />
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------ Menswear ------------------------------------------ */

export interface MaleLook {
  kurta?: string;
  bottom?: string;
  waistcoat?: string;
  shoes?: string;
  watch?: string;
}

/** The same sketch style for a men's look: kurta and shalwar, a waistcoat, peshawari chappals and a watch. */
export function MaleFigure({ look, id, className = '', label }: { look: MaleLook; id: string; className?: string; label: string }) {
  const motif = `mmotif-${id}`;
  const muslin = (c?: string) => (c ? {} : { stroke: MUSLIN_LINE, strokeWidth: 1.5, strokeDasharray: '5 5' });
  return (
    <svg viewBox="62 34 196 558" role="img" aria-label={label} className={className}>
      <defs>
        <pattern id={motif} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="0.9" fill="#fff" opacity="0.28" />
        </pattern>
      </defs>
      <ellipse cx="150" cy="584" rx="80" ry="8" fill="#1E1020" opacity="0.08" />

      {/* neck and hands */}
      <path d="M141 98 L159 98 L161 120 L139 120 Z" fill={SKIN_SHADE} />
      <ellipse cx="99" cy="303" rx="8.5" ry="11" fill={SKIN} />
      <ellipse cx="201" cy="303" rx="8.5" ry="11" fill={SKIN} />

      {/* shalwar */}
      <path d="M110 398 C108 450 105 510 103 562 L145 562 C147 510 149 450 151 404 Z" style={fill(look.bottom, MUSLIN)} {...muslin(look.bottom)} />
      <path d="M149 404 C151 450 153 510 155 562 L197 562 C195 510 192 450 190 398 Z" style={fill(look.bottom, MUSLIN)} {...muslin(look.bottom)} />

      {/* peshawari chappals, or bare feet */}
      {look.shoes ? (
        <g className="piece-in">
          <path d="M100 566 C112 556 138 556 147 566 L148 578 C130 586 106 585 94 575 C95 570 97 568 100 566 Z" style={fill(look.shoes, MUSLIN)} />
          <path d="M200 566 C188 556 162 556 153 566 L152 578 C170 586 194 585 206 575 C205 570 203 568 200 566 Z" style={fill(look.shoes, MUSLIN)} />
          <path d="M106 569 L141 569 M159 569 L194 569" stroke="#00000033" strokeWidth="2" />
        </g>
      ) : (
        <g fill={SKIN}>
          <ellipse cx="124" cy="570" rx="18" ry="6" />
          <ellipse cx="176" cy="570" rx="18" ry="6" />
        </g>
      )}

      {/* kurta: sleeves, then a straight body to the knee */}
      <path d="M119 117 L102 125 C95 170 92 230 90 292 L108 296 C112 236 117 186 123 150 Z" style={fill(look.kurta, MUSLIN)} {...muslin(look.kurta)} />
      <path d="M181 117 L198 125 C205 170 208 230 210 292 L192 296 C188 236 183 186 177 150 Z" style={fill(look.kurta, MUSLIN)} {...muslin(look.kurta)} />
      <path d="M120 115 C134 111 166 111 180 115 L187 150 C187 220 190 330 194 402 L106 402 C110 330 113 220 113 150 Z" style={fill(look.kurta, MUSLIN)} {...muslin(look.kurta)} />
      {look.kurta && (
        <>
          <path d="M120 115 C134 111 166 111 180 115 L187 150 C187 220 190 330 194 402 L106 402 C110 330 113 220 113 150 Z" fill={`url(#${motif})`} />
          {/* mandarin collar, placket and buttons */}
          <path d="M139 113 L161 113 L159 122 L141 122 Z" style={fill(look.kurta, MUSLIN)} stroke="#00000022" />
          <path d="M150 122 L150 182" stroke="#00000026" strokeWidth="1.5" />
          <circle cx="150" cy="134" r="1.6" fill={GOLD} />
          <circle cx="150" cy="150" r="1.6" fill={GOLD} />
          <circle cx="150" cy="166" r="1.6" fill={GOLD} />
          <path d="M90 288 L108 292 M210 288 L192 292" stroke="#00000022" strokeWidth="3" />
        </>
      )}

      {/* waistcoat, over the kurta */}
      {look.waistcoat && (
        <g className="piece-in">
          <path d="M123 118 L140 118 L150 160 L160 118 L177 118 L183 150 C182 200 183 236 186 262 L114 262 C117 236 118 200 117 150 Z" style={fill(look.waistcoat, MUSLIN)} />
          <path d="M123 118 L140 118 L150 160 L160 118 L177 118 L183 150 C182 200 183 236 186 262 L114 262 C117 236 118 200 117 150 Z" fill={`url(#${motif})`} />
          <path d="M140 118 L150 160 L160 118" stroke={GOLD} strokeWidth="1.5" fill="none" />
          {[176, 196, 216, 236].map((y) => <circle key={y} cx="150" cy={y} r="2.2" fill={GOLD} />)}
          <path d="M126 214 L140 214 M160 214 L174 214" stroke={GOLD} strokeWidth="1.2" />
        </g>
      )}

      {/* watch */}
      {look.watch && (
        <g className="piece-in">
          <rect x="91" y="284" width="17" height="7" rx="2" fill={look.watch} />
          <circle cx="99.5" cy="287.5" r="4.2" fill={look.watch} stroke="#00000033" />
        </g>
      )}

      {/* head and short hair */}
      <ellipse cx="150" cy="76" rx="21" ry="25" fill={SKIN} />
      <path d="M129 74 C126 50 140 43 150 43 C162 43 175 50 171 74 C167 61 159 56 150 57 C141 56 133 61 129 74 Z" fill={HAIR} />
    </svg>
  );
}
