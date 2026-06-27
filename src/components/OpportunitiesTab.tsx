/**
 * SMART MONEY — find grants, WSIB programs, tax credits, cost-saving programs, and
 * best-fit business credit cards for a client (or Go Fig Bookz itself). Runs a LIVE
 * web search via the brain; results carry source links and are SUGGESTIONS to verify,
 * not advice. Save the good ones and track them (suggested → applied → won).
 */
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import HelpButton from "@/components/HelpButton";
import { Sparkles, ExternalLink, Loader2, Check, Trash2, PiggyBank } from "lucide-react";

const CARD_PREFS = [
  { key: "cashback", label: "Cash back" },
  { key: "travel", label: "Travel rewards" },
  { key: "low_interest", label: "Low interest" },
  { key: "no_fee", label: "No annual fee" },
] as const;

const STATUS_LABEL: Record<string, string> = { suggested: "Suggested", reviewing: "Reviewing", applied: "Applied", won: "Won", dismissed: "Dismissed" };
const STATUS_COLOR: Record<string, string> = {
  suggested: "bg-slate-100 text-slate-600", reviewing: "bg-amber-100 text-amber-700",
  applied: "bg-indigo-100 text-indigo-700", won: "bg-emerald-100 text-emerald-700", dismissed: "bg-slate-100 text-slate-400",
};

export function OpportunitiesTab({ clientId }: { clientId: number | null }) {
  const utils = trpc.useUtils();
  const cats = trpc.opportunities.categories.useQuery();
  const list = trpc.opportunities.list.useQuery({ clientId });
  const scan = trpc.opportunities.scan.useMutation();
  const save = trpc.opportunities.save.useMutation({ onSuccess: () => utils.opportunities.list.invalidate({ clientId }) });
  const setStatus = trpc.opportunities.setStatus.useMutation({ onSuccess: () => utils.opportunities.list.invalidate({ clientId }) });
  const remove = trpc.opportunities.remove.useMutation({ onSuccess: () => utils.opportunities.list.invalidate({ clientId }) });

  const [activeCat, setActiveCat] = useState<string>("grants");
  const [cardPref, setCardPref] = useState<string>("cashback");
  const [softwareNeed, setSoftwareNeed] = useState<string>("");
  const [found, setFound] = useState<any[]>([]);
  const [scanMsg, setScanMsg] = useState<string>("");

  // Intake: tools they use + what'd help beyond the financials (only for real clients).
  const tech = trpc.opportunities.tech.useQuery({ clientId: clientId! }, { enabled: clientId != null });
  const setTech = trpc.opportunities.setTech.useMutation({ onSuccess: () => utils.opportunities.tech.invalidate() });
  const [techDraft, setTechDraft] = useState<{ currentSoftware: string; bizNeeds: string } | null>(null);
  const techVal = techDraft ?? { currentSoftware: tech.data?.currentSoftware || "", bizNeeds: tech.data?.bizNeeds || "" };

  const runScan = (category: string) => {
    setActiveCat(category); setScanMsg(""); setFound([]);
    scan.mutate(
      { clientId, category: category as any, cardPreference: category === "credit_card" ? (cardPref as any) : undefined, need: category === "software" ? (softwareNeed || undefined) : undefined },
      {
        onSuccess: (r: any) => {
          if (!r.ok) { setScanMsg(r.error === "ai_off" ? "The AI web search is off — set the Anthropic key to enable live searches." : `Couldn't search right now (${r.error || "try again"}).`); return; }
          setFound(r.items || []);
          if (!r.items?.length) setScanMsg("No new opportunities found this time — try another category.");
        },
        onError: () => setScanMsg("Search failed — try again in a moment."),
      },
    );
  };

  const saved = list.data || [];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center gap-2 flex-wrap">
        <PiggyBank className="h-5 w-5 text-emerald-600" />
        <h3 className="font-semibold text-slate-800">Smart Money — save &amp; make money</h3>
        <HelpButton id="smart-money" />
      </div>
      <p className="text-xs text-slate-500 -mt-2">Figgy searches the web for current grants, WSIB programs, tax credits, cost-saving programs, and the best business credit cards. Results are suggestions to verify — always check the official source before applying.</p>

      {/* Category scan buttons */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(cats.data || []).map((c: any) => (
            <Button key={c.key} size="sm" variant={activeCat === c.key ? "default" : "outline"} disabled={scan.isPending}
              onClick={() => runScan(c.key)}>
              {scan.isPending && activeCat === c.key ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}{c.label}
            </Button>
          ))}
        </div>
        {activeCat === "credit_card" && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Card preference:</span>
            <select className="border rounded px-2 py-1 bg-white" value={cardPref} onChange={(e) => setCardPref(e.target.value)}>
              {CARD_PREFS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={scan.isPending} onClick={() => runScan("credit_card")}>Search cards</Button>
          </div>
        )}
        {activeCat === "software" && (
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600">
            <span>What do they need it to do?</span>
            <Input className="h-8 w-64" placeholder="e.g. track proposals, schedule jobs, manage inventory" value={softwareNeed} onChange={(e) => setSoftwareNeed(e.target.value)} />
            <Button size="sm" variant="outline" disabled={scan.isPending} onClick={() => runScan("software")}>Find tools</Button>
          </div>
        )}
        {scanMsg && <div className="text-xs text-amber-700">{scanMsg}</div>}
      </CardContent></Card>

      {/* Intake: what they run on + what'd help (feeds the software search + Jade) */}
      {clientId != null && (
        <Card><CardContent className="p-3 space-y-2">
          <div className="text-sm font-semibold text-slate-700">Their tech stack (intake)</div>
          <p className="text-[11px] text-slate-500">Ask at intake / a review: what software do they use to run the business (besides accounting)? And what — beyond the financials — would make running it easier? This drives the software search and lets Jade suggest tools proactively.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">Software they use now</label>
              <Input className="h-8" placeholder="e.g. Jobber, Square, Google Workspace" value={techVal.currentSoftware} onChange={(e) => setTechDraft({ ...techVal, currentSoftware: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-500">What'd help (beyond financials)</label>
              <Input className="h-8" placeholder="e.g. tracking proposals, scheduling, inventory" value={techVal.bizNeeds} onChange={(e) => setTechDraft({ ...techVal, bizNeeds: e.target.value })} />
            </div>
          </div>
          {techDraft && (
            <Button size="sm" disabled={setTech.isPending} onClick={() => setTech.mutate({ clientId, currentSoftware: techVal.currentSoftware, bizNeeds: techVal.bizNeeds }, { onSuccess: () => setTechDraft(null) })}>Save</Button>
          )}
        </CardContent></Card>
      )}

      {/* Scan results (review-gated; save the good ones) */}
      {found.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Found ({found.length}) — review &amp; save</div>
          {found.map((o, i) => (
            <Card key={i}><CardContent className="p-3 space-y-1">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{o.title} {o.estValue && <span className="text-emerald-700 text-sm">· {o.estValue}</span>}</div>
                  <div className="text-sm text-slate-600">{o.summary}</div>
                  {o.eligibility && <div className="text-xs text-slate-500 mt-0.5"><b>Who:</b> {o.eligibility}</div>}
                  <a href={o.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1 mt-0.5">{o.source || "Source"} <ExternalLink className="h-3 w-3" /></a>
                </div>
                <Button size="sm" variant="outline" disabled={save.isPending}
                  onClick={() => { save.mutate({ clientId, category: o.category, title: o.title, summary: o.summary, estValue: o.estValue, eligibility: o.eligibility, url: o.url, source: o.source }); setFound((f) => f.filter((_, j) => j !== i)); }}>
                  <Check className="h-3.5 w-3.5 mr-1" /> Save
                </Button>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Saved / tracked opportunities */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Saved opportunities</div>
        {saved.length === 0 && <div className="text-sm text-slate-400">None saved yet — run a search above.</div>}
        {saved.map((o: any) => (
          <Card key={o.id} className="group"><CardContent className="p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800">{o.title} {o.estValue && <span className="text-emerald-700 text-sm">· {o.estValue}</span>}</div>
                {o.summary && <div className="text-sm text-slate-600">{o.summary}</div>}
                {o.url && <a href={o.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1">{o.source || "Source"} <ExternalLink className="h-3 w-3" /></a>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select className={`text-xs rounded px-1.5 py-0.5 border-0 ${STATUS_COLOR[o.status] || ""}`} value={o.status} onChange={(e) => setStatus.mutate({ id: o.id, status: e.target.value as any })}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500" onClick={() => { if (confirm("Remove this opportunity?")) remove.mutate({ id: o.id }); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
