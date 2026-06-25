/**
 * FIGGY wordmark — rendered INLINE (not an <img>) so it can use the flowing
 * calligraphy web font loaded in index.html (Great Vibes). An SVG used as an
 * <img src> can't load web fonts, which is why the file-based logo always fell
 * back to a stiff system font. Inline fixes that: genuinely cursive in every
 * browser. Big F, the Figs mascot as the dot of the i, and the brand swoosh.
 *
 * Font is swappable: change FIGGY_FONT to 'Dancing Script' or 'Pacifico' (both
 * preloaded) if Markie wants a different hand.
 */
const FIGGY_FONT = "'Great Vibes','Dancing Script','Pacifico',cursive";

export function FiggyLogo({ className = "h-16 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 110" className={className} role="img" aria-label="Figgy">
      <defs>
        <linearGradient id="figgyInk" x1="10" y1="10" x2="290" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8bc53f" /><stop offset="0.55" stopColor="#6fae2e" /><stop offset="1" stopColor="#4d7c0f" />
        </linearGradient>
        <linearGradient id="figgySwoosh" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8bc53f" /><stop offset="1" stopColor="#5e9e22" />
        </linearGradient>
      </defs>

      {/* Signature swoosh under the word (Go Fig Bookz brand). */}
      <path d="M8 96 C 70 110, 150 104, 220 86 C 262 75, 290 76, 296 82"
            fill="none" stroke="url(#figgySwoosh)" strokeWidth="5" strokeLinecap="round" />

      {/* The word in the flowing font. Big F via a larger tspan, same baseline. */}
      <text x="6" y="80" fill="url(#figgyInk)" fontFamily={FIGGY_FONT} fontSize="74">
        <tspan fontSize="112">F</tspan><tspan dx="-4">iggy</tspan>
      </text>

      {/* The dot of the 'i' IS Figs (the mascot tittle). Position is approximate
          to the font's 'i'; nudge translate() if it drifts. */}
      <g transform="translate(92 8) scale(0.26)">
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
