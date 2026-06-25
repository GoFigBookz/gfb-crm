/**
 * FIGGY wordmark — rendered INLINE so it can use the flowing web font loaded in
 * index.html. (An <img>-loaded SVG can't load web fonts, which is why a file logo
 * always fell back to a stiff system font.)
 *
 * Markie's direction (2026-06-25): keep the flow but STRAIGHTER (less slant) so
 * it's legible; NO line/swoosh underneath; a BIGGER Figs mascot sitting clearly
 * as the dot of the i so it's the visual hero; a big, slightly fancier F.
 * → Pacifico (upright, round, flowing) instead of the heavily-slanted Great Vibes.
 *
 * Font is swappable via FIGGY_FONT (Dancing Script / Great Vibes also preloaded).
 * The mascot x/scale are placed by estimate over the font's 'i' — nudge if it drifts.
 */
const FIGGY_FONT = "'Pacifico','Dancing Script','Great Vibes',cursive";

export function FiggyLogo({ className = "h-16 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 118" className={className} role="img" aria-label="Figgy">
      <defs>
        <linearGradient id="figgyInk" x1="10" y1="10" x2="280" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8bc53f" /><stop offset="0.55" stopColor="#6fae2e" /><stop offset="1" stopColor="#4d7c0f" />
        </linearGradient>
      </defs>

      {/* The word in the upright flowing font. Big F via a larger tspan; a touch
          of letter-spacing so it's not bunched. NO swoosh underneath. */}
      <text x="8" y="98" fill="url(#figgyInk)" fontFamily={FIGGY_FONT} fontSize="80" letterSpacing="1">
        <tspan fontSize="116">F</tspan><tspan dx="0">iggy</tspan>
      </text>

      {/* BIG Figs mascot as the dot of the 'i' — the visual hero. Positioned over
          the font's i (estimate); nudge translate()/scale() if it drifts. */}
      <g transform="translate(76 0) scale(0.46)">
        <path d="M50.0 22.0 L54.6 25.7 L60.2 23.6 L63.5 28.5 L69.4 28.3 L71.0 34.0 L76.7 35.6 L76.5 41.5 L81.4 44.8 L79.3 50.4 L83.0 55.0 L79.3 59.6 L81.4 65.2 L76.5 68.5 L76.7 74.4 L71.0 76.0 L69.4 81.7 L63.5 81.5 L60.2 86.4 L54.6 84.3 L50.0 88.0 L45.4 84.3 L39.8 86.4 L36.5 81.5 L30.6 81.7 L29.0 76.0 L23.3 74.4 L23.5 68.5 L18.6 65.2 L20.7 59.6 L17.0 55.0 L20.7 50.4 L18.6 44.8 L23.5 41.5 L23.3 35.6 L29.0 34.0 L30.6 28.3 L36.5 28.5 L39.8 23.6 L45.4 25.7 Z" fill="#a3e635" stroke="#4d7c0f" strokeWidth="3.4" strokeLinejoin="round" />
        <circle cx="30" cy="64" r="5" fill="#65a30d" opacity="0.45" /><circle cx="70" cy="64" r="5" fill="#65a30d" opacity="0.45" />
        <ellipse cx="37" cy="53" rx="10" ry="12" fill="#fff" stroke="#1e293b" strokeWidth="1.8" />
        <ellipse cx="63" cy="53" rx="10" ry="12" fill="#fff" stroke="#1e293b" strokeWidth="1.8" />
        <circle cx="38.5" cy="55.5" r="5.2" fill="#1e293b" /><circle cx="64.5" cy="55.5" r="5.2" fill="#1e293b" />
        <circle cx="40.3" cy="53.7" r="1.8" fill="#fff" /><circle cx="66.3" cy="53.7" r="1.8" fill="#fff" />
        <path d="M42 70 q8 9 16 0" stroke="#1e293b" strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <path d="M50 26 q-2 -12 6 -18" stroke="#4d7c0f" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M56 8 q11 -3 16 4 q-5 9 -16 6 q-4 -4 0 -10Z" fill="#84cc16" stroke="#4d7c0f" strokeWidth="2.6" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
