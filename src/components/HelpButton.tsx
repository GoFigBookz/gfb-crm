import { HelpCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { HELP } from "@/lib/help-content";

/**
 * HELP BUTTON — a little "?" next to any section header that pops step-by-step
 * instructions (Markie 2026-06-27: "training built in"). Usage: <HelpButton id="recharge-invoice" />.
 * Content lives in src/lib/help-content.ts — add an entry when you build a feature.
 * Renders nothing if the id has no content yet (so it's safe to drop in early).
 */
export default function HelpButton({ id, className = "" }: { id: string; className?: string }) {
  const entry = HELP[id];
  if (!entry) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`How to use: ${entry.title}`}
          className={`inline-flex items-center justify-center text-slate-400 hover:text-lime-600 transition-colors ${className}`}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm">
        <div className="font-semibold text-slate-800 mb-1.5">{entry.title} — how to</div>
        <ol className="list-decimal pl-4 space-y-1 text-slate-600">
          {entry.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        {entry.note && (
          <p className="mt-2 pt-2 border-t border-slate-100 text-xs text-amber-700">{entry.note}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
