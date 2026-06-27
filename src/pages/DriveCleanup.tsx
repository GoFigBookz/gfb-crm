/**
 * DRIVE CLEANUP & DEDUP — tidy a Google Drive (personal photos/videos or the business Drive).
 * =============================================================================
 * Pick a connected Google account, scan for duplicates + space hogs, and move the extra
 * copies to Trash (REVERSIBLE — recoverable for 30 days; never a hard delete). Exact
 * duplicates are matched by checksum (certain); same-name/size matches are flagged as
 * "possible" and left unchecked. The oldest copy is always kept.
 * =============================================================================
 */
import { useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { HardDrive, Image as ImageIcon, Video, FileText, Loader2, Trash2, AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import HelpButton from "@/components/HelpButton";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const human = (bytes: number) => {
  if (!bytes || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
};
const KIND_ICON: Record<string, any> = { image: ImageIcon, video: Video, document: FileText, other: FileText };

export default function DriveCleanup() {
  const [sp] = useSearchParams();
  const presetAccount = sp.get("account") || "";
  const { data: accounts } = trpc.driveCleanup.accounts.useQuery();
  const [account, setAccount] = useState(presetAccount);
  const [kind, setKind] = useState<"media" | "image" | "video" | "all">("media");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scanM = trpc.driveCleanup.scan.useMutation({ onSuccess: () => setSelected(new Set()) });
  const trashM = trpc.driveCleanup.trashDuplicates.useMutation();
  const utils = trpc.useUtils();

  const scan = scanM.data?.ok ? scanM.data : null;
  const groups = scan?.groups ?? [];

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllExact = () => {
    const ids = new Set<string>();
    for (const g of groups) if (g.exact) g.duplicates.forEach((d) => ids.add(d.id));
    setSelected(ids);
  };
  const selectedReclaim = useMemo(() => {
    let bytes = 0;
    for (const g of groups) for (const d of g.duplicates) if (selected.has(d.id)) bytes += g.size;
    return bytes;
  }, [selected, groups]);

  async function doTrash() {
    if (!account || selected.size === 0) return;
    await trashM.mutateAsync({ accountId: Number(account), fileIds: [...selected], kind });
    await utils.driveCleanup.scan.reset();
    scanM.mutate({ accountId: Number(account), kind });
  }

  const noAccounts = accounts && accounts.length === 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-lime-100 flex items-center justify-center"><HardDrive className="h-6 w-6 text-lime-700" /></div>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">Drive Cleanup <HelpButton id="drive-cleanup" /></h1>
          <p className="text-sm text-slate-500">Find duplicate photos, videos &amp; files and reclaim space. Duplicates move to Trash — recoverable for 30 days, never hard-deleted.</p>
        </div>
      </div>

      {noAccounts ? (
        <Card><CardContent className="py-8 text-center text-slate-500">
          <HardDrive className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          No Google account connected yet. Connect one in <b>Integrations</b> (your business gofig Drive, or your personal Google account for photos), then come back.
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Scan a Drive</CardTitle>
              <CardDescription>Pick the account and what to look at. We read file info only (names, sizes, checksums) — never the contents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 sm:items-end">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Google account</label>
                  <Select value={account} onValueChange={setAccount}>
                    <SelectTrigger><SelectValue placeholder="Select an account…" /></SelectTrigger>
                    <SelectContent>{(accounts ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.email || a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Look at</label>
                  <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="media">Photos &amp; videos</SelectItem>
                      <SelectItem value="image">Photos only</SelectItem>
                      <SelectItem value="video">Videos only</SelectItem>
                      <SelectItem value="all">Everything</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={!account || scanM.isPending} onClick={() => scanM.mutate({ accountId: Number(account), kind })}>
                  {scanM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <HardDrive className="h-4 w-4 mr-1.5" />}Scan
                </Button>
              </div>
              {scanM.data && !scanM.data.ok && <ErrLine msg={scanM.data.error} />}
              {scan?.error && <ErrLine msg={scan.error} />}
            </CardContent>
          </Card>

          {scan && !scan.error && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Files scanned" value={scan.summary.totalFiles.toLocaleString()} sub={human(scan.summary.totalBytes)} />
                <Stat label="Duplicate sets" value={String(scan.summary.dupGroups)} sub={`${scan.summary.dupExtraFiles} extra copies`} />
                <Stat label="Reclaimable" value={human(scan.summary.reclaimBytes)} sub={`${human(scan.summary.exactReclaimBytes)} certain`} accent />
                <Stat label="On" value={scan.email || "—"} sub="" small />
              </div>

              {scan.summary.byKind.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {scan.summary.byKind.map((k) => {
                    const Icon = KIND_ICON[k.kind] || FileText;
                    return <Badge key={k.kind} variant="secondary" className="bg-slate-100 text-slate-600 font-normal"><Icon className="h-3 w-3 mr-1" />{k.label}: {k.count.toLocaleString()} · {human(k.bytes)}</Badge>;
                  })}
                </div>
              )}

              {/* Duplicates */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div><CardTitle className="text-base">Duplicates</CardTitle>
                    <CardDescription>The oldest copy is kept; tick the extras to remove. ✓ = exact match (certain), ~ = possible (same name &amp; size).</CardDescription>
                  </div>
                  {groups.length > 0 && <Button size="sm" variant="outline" onClick={selectAllExact}>Select all exact</Button>}
                </CardHeader>
                <CardContent className="space-y-3">
                  {groups.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3"><CheckCircle2 className="h-4 w-4" />No duplicates found. This Drive is tidy. 🎉</div>
                  ) : (
                    <>
                      <div className="space-y-3 max-h-[34rem] overflow-y-auto pr-1">
                        {groups.map((g) => (
                          <div key={g.key} className="border rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs mb-2">
                              <Badge variant="secondary" className={cn("font-normal", g.exact ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{g.exact ? "✓ exact" : "~ possible"}</Badge>
                              <span className="text-slate-500">{g.duplicates.length + 1} copies · {human(g.size)} each · reclaim {human(g.reclaim)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-700 mb-1">
                              <Thumb f={g.keeper} />
                              <span className="flex-1 truncate"><b>Keep</b> · {g.keeper.name}</span>
                              {g.keeper.webViewLink && <a href={g.keeper.webViewLink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-lime-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                            </div>
                            {g.duplicates.map((d) => (
                              <label key={d.id} className="flex items-center gap-2 text-sm pl-2 py-1 cursor-pointer hover:bg-slate-50 rounded">
                                <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggle(d.id)} />
                                <Thumb f={d} />
                                <span className="flex-1 truncate text-slate-600">{d.name}</span>
                                {d.webViewLink && <a href={d.webViewLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-400 hover:text-lime-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>

                      {trashM.data?.ok && (
                        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                          <CheckCircle2 className="h-4 w-4" />Moved {trashM.data.trashed} file(s) to Trash (recoverable 30 days).{trashM.data.blocked ? ` ${trashM.data.blocked} protected.` : ""}{trashM.data.failed ? ` ${trashM.data.failed} failed.` : ""}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1 border-t">
                        <p className="text-xs text-slate-500 flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-lime-600" />Reversible — files go to Drive Trash, recoverable for 30 days.</p>
                        <Button disabled={selected.size === 0 || trashM.isPending} onClick={doTrash} variant="destructive">
                          {trashM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
                          Move {selected.size} to Trash{selectedReclaim > 0 ? ` · free ${human(selectedReclaim)}` : ""}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Biggest files */}
              {scan.biggest.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Biggest files</CardTitle><CardDescription>The space hogs — review these by hand.</CardDescription></CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {scan.biggest.map((b) => (
                            <tr key={b.id} className="border-t first:border-0">
                              <td className="p-2 truncate max-w-0 w-full">{b.name}</td>
                              <td className="p-2 text-right font-mono whitespace-nowrap">{human(b.size)}</td>
                              <td className="p-2">{b.webViewLink && <a href={b.webViewLink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-lime-600"><ExternalLink className="h-3.5 w-3.5" /></a>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Thumb({ f }: { f: { thumbnailLink?: string; name: string } }) {
  if (f.thumbnailLink) return <img src={f.thumbnailLink} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0 bg-slate-100" referrerPolicy="no-referrer" />;
  return <div className="h-8 w-8 rounded bg-slate-100 flex items-center justify-center flex-shrink-0"><FileText className="h-4 w-4 text-slate-300" /></div>;
}

function Stat({ label, value, sub, accent, small }: { label: string; value: string; sub: string; accent?: boolean; small?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", accent ? "bg-lime-50 border-lime-200" : "bg-white")}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn("font-bold truncate", small ? "text-sm" : "text-lg", accent && "text-lime-700")}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function ErrLine({ msg }: { msg: string }) {
  const friendly: Record<string, string> = {
    account_not_found: "That account isn't connected anymore — reconnect it in Integrations.",
    token_error: "Google sign-in expired — reconnect the account in Integrations.",
  };
  const text = friendly[msg] || (/401|invalid_grant|reconnect/i.test(msg) ? "Google sign-in expired — reconnect the account in Integrations." : /403|insufficient|scope/i.test(msg) ? "This account hasn't granted Drive access — reconnect it and allow Drive." : msg);
  return <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /><span>{text}</span></div>;
}
