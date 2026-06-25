import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { awayInfo, type AwayInfo } from "@/lib/timezone";

/**
 * Shows ONLY when the device is in a different timezone than Ontario (Eastern).
 * Ontario/Florida/Playa del Carmen are all Eastern, so on a normal day this
 * renders nothing. When Markie is somewhere genuinely different it flags the
 * offset so he reads every Eastern deadline correctly.
 */
export function TimezoneBanner() {
  const [info, setInfo] = useState<AwayInfo | null>(null);

  useEffect(() => {
    const update = () => setInfo(awayInfo());
    update();
    const t = setInterval(update, 60_000); // re-check (e.g. crossed a zone / DST flip)
    return () => clearInterval(t);
  }, []);

  if (!info || !info.away) return null;

  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-800">
      <Globe className="h-4 w-4 mt-0.5 shrink-0 text-sky-500" />
      <span>
        You're in <span className="font-semibold">{info.deviceCity} ({info.deviceAbbrev})</span> — {info.diffLabel}.
        Times show in <span className="font-semibold">Ontario {info.businessAbbrev}</span>, with your local time in brackets.
      </span>
    </div>
  );
}
