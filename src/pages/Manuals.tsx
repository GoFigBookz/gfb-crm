import { useMemo, useState } from "react";
import { BookOpen, Search, Building2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Link } from "react-router";
import { MANUALS, type Manual } from "@/lib/manuals";

/**
 * MANUALS — the firm's three in-app handbooks (Bookkeeping Team, CRM, QuickBooks),
 * maintained in code, plus a Per-client playbooks editor that stores each client's
 * own procedures. (#114)
 */
export default function Manuals() {
  const [tab, setTab] = useState("bookkeeping");
  const [q, setQ] = useState("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-lime-500" /> Manuals
          </h1>
          <p className="text-slate-500">The firm's handbooks — how we do the books, drive the CRM, and keep QuickBooks. Training built in.</p>
        </div>
        <div className="relative w-64 max-w-full">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the manuals…" className="pl-8 h-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          {MANUALS.map((m) => <TabsTrigger key={m.id} value={m.id}>{m.title.replace(" Manual", "")}</TabsTrigger>)}
          <TabsTrigger value="playbooks">Per-client playbooks</TabsTrigger>
        </TabsList>

        {MANUALS.map((m) => (
          <TabsContent key={m.id} value={m.id} className="mt-4">
            <ManualView manual={m} query={q} />
          </TabsContent>
        ))}

        <TabsContent value="playbooks" className="mt-4">
          <ClientPlaybooks />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function highlight(text: string, q: string) {
  if (!q.trim()) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (<>{text.slice(0, i)}<mark className="bg-lime-100 rounded px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>);
}

function ManualView({ manual, query }: { manual: Manual; query: string }) {
  const sections = useMemo(() => {
    if (!query.trim()) return manual.sections;
    const ql = query.toLowerCase();
    return manual.sections.filter((s) => s.heading.toLowerCase().includes(ql) || s.body.some((b) => b.toLowerCase().includes(ql)));
  }, [manual, query]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{manual.title}</CardTitle>
        <CardDescription>{manual.tagline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sections.length === 0 && <div className="text-sm text-slate-500">No sections match “{query}”.</div>}
        {sections.map((s) => (
          <div key={s.heading}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1.5">{highlight(s.heading, query)}</h3>
            <ul className="space-y-1.5">
              {s.body.map((b, i) => (
                <li key={i} className="text-sm text-slate-600 flex gap-2">
                  <span className="text-lime-500 mt-1.5 h-1 w-1 rounded-full bg-lime-500 shrink-0" />
                  <span>{highlight(b, query)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ClientPlaybooks() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2"><Building2 className="h-4 w-4 text-lime-500" /> Per-client playbooks</CardTitle>
        <CardDescription>
          The standard procedures (in the Bookkeeping Team manual) apply to everyone. Each client ALSO has its own quirks — special accounts, who to email, recharge arrangements, odd cadences. Those live in the client's own Playbook (auto-started from intake, then maintained by the team).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link to="/playbook" className="inline-flex items-center gap-1.5 text-sm font-medium text-lime-700 hover:underline">
          Open Client Playbooks <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <p className="text-xs text-slate-500 mt-2">Pick a client there to read or edit their specific procedures. Read it before you work the file; update it when you learn something client-specific.</p>
      </CardContent>
    </Card>
  );
}
