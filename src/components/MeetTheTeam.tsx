import { Sprout, Leaf, ShieldCheck, Sparkles, Gauge, Receipt, TrendingUp, Bot } from "lucide-react";
import { TEAM, type TeamMember } from "@/lib/team";

const ICONS: Record<string, any> = { Sprout, Leaf, ShieldCheck, Sparkles, Gauge, Receipt, TrendingUp, Bot };

/** Meet the team — a fun, character-rich breakout of the AI crew and who does what.
 *  onPick lets the chat screen jump straight to talking to that teammate. */
export function MeetTheTeam({ onPick, activeKey }: { onPick?: (key: string) => void; activeKey?: string }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {TEAM.map((m) => (
        <TeamCard key={m.key} m={m} active={activeKey === m.key} onPick={onPick} />
      ))}
    </div>
  );
}

function TeamCard({ m, active, onPick }: { m: TeamMember; active?: boolean; onPick?: (key: string) => void }) {
  const Icon = ICONS[m.icon] || Bot;
  return (
    <button
      onClick={() => onPick?.(m.key)}
      className={`text-left p-3 rounded-xl border bg-white hover:shadow-sm transition-all ${active ? "border-lime-400 ring-1 ring-lime-300" : "border-slate-200"} ${onPick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-11 w-11 shrink-0 rounded-full bg-gradient-to-br ${m.theme} flex items-center justify-center text-white shadow-sm`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-slate-900">{m.name}</span>
            <span className="text-[11px] text-slate-400">{m.role}</span>
          </div>
          <p className="text-xs font-medium text-slate-600">{m.tagline}</p>
          <p className="text-xs text-slate-500 mt-1">{m.does}</p>
          <p className="text-[11px] text-slate-400 italic mt-1">{m.personality}</p>
        </div>
      </div>
    </button>
  );
}
