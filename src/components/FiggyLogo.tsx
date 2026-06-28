/**
 * FIGGY wordmark — Markie's official logo (2026-06-28): flowing black brush
 * calligraphy "Figgy" with the green Figs robot as the dot of the i and the
 * lime swoosh underneath. Supplied as art, so we render the actual file
 * (background made transparent → sits on any surface) rather than redrawing it.
 *
 * The black ink needs a light backing on dark surfaces (the slate sidebar passes
 * `onDark` to get a rounded white plate); on light pages it drops in transparent.
 */
export function FiggyLogo({ className = "h-16 w-auto", onDark = false }: { className?: string; onDark?: boolean }) {
  const img = <img src="/figgy-logo.png" alt="Figgy" className={`${className} object-contain`} />;
  if (!onDark) return img;
  return <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 shadow-sm">{img}</span>;
}
