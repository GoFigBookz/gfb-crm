import { TEAM, type TeamMember } from "@/lib/team";

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
  return (
    <button
      onClick={() => onPick?.(m.key)}
      className={`text-left p-3 rounded-xl border bg-white hover:shadow-sm transition-all ${active ? "border-lime-400 ring-1 ring-lime-300" : "border-slate-200"} ${onPick ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-14 w-14 shrink-0 rounded-full bg-gradient-to-br ${m.theme} p-[3px] shadow-sm`}>
          <div className="h-full w-full rounded-full bg-white flex items-center justify-center overflow-hidden">
            <img src={`/agents/${m.key}.svg`} alt={m.name} className="h-[52px] w-[52px]" />
          </div>
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
