import { useState } from "react";
import { Megaphone, Plus, CheckCircle2, Circle, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * MARKETING (Skye) — the social/marketing hub. A per-platform cleanup checklist
 * + a content-post pipeline. Skye drafts off the brain (brand voice); Markie
 * approves and posts. No auto-posting.
 */
const PLATFORMS = ["linkedin", "instagram", "facebook", "proadvisor", "website", "google", "other"];
const PLABEL: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", proadvisor: "ProAdvisor", website: "Website", google: "Google", other: "Other" };
const TASK_STATUS = ["todo", "in_progress", "done"];
const POST_STATUS = ["idea", "drafted", "scheduled", "posted"];

export default function Marketing() {
  const list = trpc.marketing.list.useQuery();
  const add = trpc.marketing.add.useMutation({ onSuccess: () => { list.refetch(); resetPost(); } });
  const update = trpc.marketing.update.useMutation({ onSuccess: () => list.refetch() });
  const remove = trpc.marketing.remove.useMutation({ onSuccess: () => list.refetch() });

  const items = list.data || [];
  const tasks = items.filter((i: any) => i.kind === "platform");
  const posts = items.filter((i: any) => i.kind === "post");

  const [pPlatform, setPPlatform] = useState("linkedin");
  const [pTitle, setPTitle] = useState(""); const [pBody, setPBody] = useState("");
  const resetPost = () => { setPTitle(""); setPBody(""); };

  const cycleTask = (i: any) => {
    const next = TASK_STATUS[(TASK_STATUS.indexOf(i.status) + 1) % TASK_STATUS.length];
    update.mutate({ id: i.id, status: next });
  };
  const taskIcon = (s: string) => s === "done" ? <CheckCircle2 className="h-4 w-4 text-lime-600" /> : s === "in_progress" ? <Clock className="h-4 w-4 text-amber-500" /> : <Circle className="h-4 w-4 text-slate-300" />;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing — Skye</h1>
          <p className="text-sm text-slate-500">Get the socials cleaned up and posting. Skye drafts off the brand voice; you approve and post.</p>
        </div>
      </div>

      {/* Platform cleanup checklist */}
      <Card><CardContent className="p-3 space-y-2">
        <div className="text-sm font-semibold text-slate-700">Platform cleanup</div>
        {PLATFORMS.filter((p) => tasks.some((t: any) => t.platform === p)).map((p) => (
          <div key={p} className="space-y-1">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{PLABEL[p]}</div>
            {tasks.filter((t: any) => t.platform === p).map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 text-sm">
                <button onClick={() => cycleTask(t)}>{taskIcon(t.status)}</button>
                <span className={t.status === "done" ? "line-through text-slate-400" : "text-slate-700"}>{t.title}</span>
                <button className="ml-auto p-1 rounded hover:bg-slate-100" onClick={() => remove.mutate({ id: t.id })}><Trash2 className="h-3.5 w-3.5 text-slate-300" /></button>
              </div>
            ))}
          </div>
        ))}
      </CardContent></Card>

      {/* Content pipeline */}
      <Card><CardContent className="p-3 space-y-3">
        <div className="text-sm font-semibold text-slate-700">Content pipeline</div>
        <div className="grid gap-2 sm:grid-cols-[140px,1fr] items-start">
          <select className="border rounded px-2 py-2 text-sm bg-white" value={pPlatform} onChange={(e) => setPPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLABEL[p]}</option>)}
          </select>
          <div className="space-y-2">
            <Input placeholder="Post title / hook" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
            <textarea className="w-full border rounded p-2 text-sm" rows={2} placeholder="Draft (Skye can help fill this off the brand voice)" value={pBody} onChange={(e) => setPBody(e.target.value)} />
            <Button size="sm" disabled={add.isPending || !pTitle.trim()} onClick={() => add.mutate({ kind: "post", platform: pPlatform, title: pTitle.trim(), body: pBody || undefined })}><Plus className="h-4 w-4 mr-1" /> Add draft</Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {POST_STATUS.map((st) => (
            <div key={st} className="space-y-2">
              <div className="text-xs font-semibold text-slate-600 capitalize">{st} ({posts.filter((p: any) => p.status === st).length})</div>
              {posts.filter((p: any) => p.status === st).map((p: any) => (
                <Card key={p.id}><CardContent className="p-2 space-y-1">
                  <div className="text-[10px] uppercase text-slate-400">{PLABEL[p.platform] || p.platform}</div>
                  <div className="text-sm font-medium text-slate-800">{p.title}</div>
                  {p.body && <div className="text-xs text-slate-500 whitespace-pre-wrap line-clamp-4">{p.body}</div>}
                  <div className="flex items-center gap-1 pt-1">
                    <select className="text-xs border rounded px-1 py-0.5 bg-white flex-1" value={p.status} onChange={(e) => update.mutate({ id: p.id, status: e.target.value })}>
                      {POST_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className="p-1 rounded hover:bg-slate-100" onClick={() => remove.mutate({ id: p.id })}><Trash2 className="h-3.5 w-3.5 text-slate-300" /></button>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}
