/**
 * BACKUP & DATA — Settings panel. See the last automatic backup, take one now, list
 * snapshots, and DOWNLOAD the full data as a file (a real off-box backup). Restore is
 * admin-only and always previews the change first (never a blind overwrite).
 */
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Download, Save, Loader2, Trash2, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import HelpButton from "@/components/HelpButton";

const when = (ms?: number) => (ms ? new Date(ms).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "—");
const KIND: Record<string, string> = { auto: "Daily auto", manual: "Manual", pre_restore: "Pre-restore safety" };

export default function BackupPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const status = trpc.backup.status.useQuery();
  const list = trpc.backup.list.useQuery();
  const snapshot = trpc.backup.snapshotNow.useMutation({ onSuccess: () => { utils.backup.status.invalidate(); utils.backup.list.invalidate(); } });
  const remove = trpc.backup.remove.useMutation({ onSuccess: () => { utils.backup.list.invalidate(); utils.backup.status.invalidate(); } });
  const utilsClient = trpc.useUtils();
  const [downloading, setDownloading] = useState<number | null>(null);

  const downloadBackup = async (id: number) => {
    setDownloading(id);
    try {
      const r = await utilsClient.backup.download.fetch({ id });
      if (!r?.payload) return;
      const blob = new Blob([r.payload], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const d = new Date(r.createdAt);
      const p = (n: number) => String(n).padStart(2, "0");
      a.download = `figgy-backup-${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}.json`;
      a.click();
    } finally { setDownloading(null); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-emerald-600" /> Backup &amp; Data <HelpButton id="backup" /></CardTitle>
        <CardDescription>Your live data — the client list and everything else — is snapshotted automatically every day. Take one now or download a full copy anytime.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-sm text-emerald-900">
            <div className="font-semibold">Last backup: {when(status.data?.last?.createdAt)}</div>
            <div className="text-xs text-emerald-700">
              {status.data?.last ? `${status.data.last.tableCount} tables · ${(status.data.last.totalRows ?? 0).toLocaleString()} rows` : "No backups yet — take the first one."}
              {status.data ? ` · keeping the latest ${status.data.keep} auto backups` : ""}
            </div>
          </div>
          <Button size="sm" disabled={snapshot.isPending} onClick={() => snapshot.mutate({ label: "Manual backup" })}>
            {snapshot.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Back up now
          </Button>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1"><History className="h-3.5 w-3.5" /> Snapshots</div>
          {list.data && list.data.length === 0 && <div className="text-sm text-slate-400">None yet.</div>}
          {(list.data || []).map((b: any) => (
            <div key={b.id} className="flex items-center gap-2 border rounded-lg px-2.5 py-1.5 text-sm group">
              <span className={`text-[10px] uppercase font-semibold rounded px-1.5 py-0.5 ${b.kind === "manual" ? "bg-indigo-100 text-indigo-700" : b.kind === "pre_restore" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>{KIND[b.kind] || b.kind}</span>
              <span className="text-slate-700">{when(b.createdAt)}</span>
              <span className="text-xs text-slate-400">{b.tableCount} tables · {(b.totalRows ?? 0).toLocaleString()} rows</span>
              <div className="ml-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={downloading === b.id} onClick={() => downloadBackup(b.id)}>
                  {downloading === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </Button>
                {isAdmin && <button className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500" onClick={() => { if (confirm("Delete this snapshot?")) remove.mutate({ id: b.id }); }}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">Download a backup and keep it somewhere safe (your computer, Drive). Restoring from a snapshot is an admin action and always previews the change first.</p>
      </CardContent>
    </Card>
  );
}
