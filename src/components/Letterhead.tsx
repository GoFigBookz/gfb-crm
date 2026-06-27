/**
 * LETTERHEAD — the firm's professional face on every client-facing deliverable.
 * One reusable header + footer (the real Go Fig Bookz logo, an optional document
 * title/subtitle, and a clean "Prepared by Go Fig Bookz · date" footer) so every
 * share page and printed report looks like it came from a sharp, consistent firm.
 * Print-friendly (avoids page breaks inside the band; muted on screen, crisp on paper).
 */
import { Card } from "@/components/ui/card";

const FIRM = "Go Fig Bookz";
const TAGLINE = "Bookkeeping done right.";

export function Letterhead({ title, subtitle, client }: { title?: string; subtitle?: string; client?: string }) {
  return (
    <Card className="overflow-hidden border-lime-100">
      {/* lime accent bar — the brand colour, top of the page */}
      <div className="h-1.5 bg-gradient-to-r from-[#8bc53f] via-[#6fae2e] to-[#4d7c0f]" />
      <div className="px-5 py-4 flex items-center gap-4 flex-wrap">
        {/* The authoritative firm logo (never re-drawn). */}
        <img src="/assets/logo.jpg" alt={FIRM} className="h-12 w-auto object-contain" />
        <div className="flex-1 min-w-[180px]">
          {title && <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">{title}</h1>}
          {(subtitle || client) && (
            <p className="text-sm text-slate-500">
              {client}{client && subtitle ? " · " : ""}{subtitle}
            </p>
          )}
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-xs font-semibold text-lime-700 tracking-wide uppercase">{FIRM}</div>
          <div className="text-[11px] text-slate-400">{TAGLINE}</div>
        </div>
      </div>
    </Card>
  );
}

/** The matching footer — sign-off + timestamp, on every deliverable. */
export function LetterheadFooter({ generatedAt, label = "Prepared" }: { generatedAt?: string | number | Date; label?: string }) {
  const when = generatedAt ? new Date(generatedAt) : new Date();
  return (
    <div className="pt-3 mt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-1">
      <span>{label} by <b className="text-lime-700">{FIRM}</b> · {when.toLocaleString("en-CA", { dateStyle: "long", timeStyle: "short" })}</span>
      <span className="text-slate-300">This document was prepared from your books and is for your records.</span>
    </div>
  );
}
