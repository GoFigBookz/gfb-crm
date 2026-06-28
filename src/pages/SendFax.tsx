/**
 * SEND A FAX — CRA still demands faxes for many requests, so this sends a PDF
 * (or image) straight from the CRM. Pick the file, type the fax number, add an
 * optional cover note, hit Send. Every fax is logged below for your records.
 * =============================================================================
 * Backend = SRFax (Canadian; keeps client tax docs on Canadian infrastructure).
 * Until the SRFax credentials are set on the server, the page shows a "connect
 * your fax line" note instead of a Send button that can't work.
 * =============================================================================
 */
import { useState, useRef } from "react";
import { Printer, Loader2, CheckCircle2, AlertTriangle, Paperclip, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";

function fmtNum(raw: string) {
  const d = String(raw || "").replace(/[^\d]/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (n.length === 10) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  return raw;
}

export default function SendFax() {
  const utils = trpc.useUtils();
  const { data: status } = trpc.fax.providerStatus.useQuery();
  const { data: history } = trpc.fax.history.useQuery({ limit: 50 });
  const { data: clientList } = trpc.client.list.useQuery({ status: "active" } as any, { retry: false });

  const [toNumber, setToNumber] = useState("");
  const [toName, setToName] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [includeCover, setIncludeCover] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [base64, setBase64] = useState<string>("");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = trpc.fax.send.useMutation({
    onSuccess: (r: any) => {
      utils.fax.history.invalidate();
      if (r.ok) {
        setResult({ ok: true, msg: `Fax queued to ${fmtNum(toNumber)}${r.reference ? ` · ref ${r.reference}` : ""}` });
        setFile(null); setBase64(""); setSubject(""); setCoverNote(""); if (fileRef.current) fileRef.current.value = "";
      } else {
        setResult({ ok: false, msg: r.error || "Fax failed" });
      }
    },
    onError: (e) => setResult({ ok: false, msg: e.message }),
  });

  async function onPickFile(f: File | null) {
    setFile(f); setBase64(""); setResult(null);
    if (!f) return;
    const buf = await f.arrayBuffer();
    let bin = ""; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    setBase64(btoa(bin));
  }

  const canSend = Boolean(status?.configured && file && base64 && toNumber.replace(/[^\d]/g, "").length >= 10);

  function doSend() {
    setResult(null);
    send.mutate({
      toNumber, toName: toName || undefined,
      clientId: clientId ? Number(clientId) : undefined,
      fileName: file!.name, base64,
      subject: subject || undefined, coverNote: coverNote || undefined, includeCover,
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Printer className="h-7 w-7 text-lime-600" />
        <div>
          <h1 className="text-2xl font-bold">Send a Fax</h1>
          <p className="text-sm text-slate-500">For CRA and anyone else who still wants a fax. PDF in, fax out.</p>
        </div>
      </div>

      {status && !status.configured && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-start gap-2 text-sm text-amber-800">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <b>No fax line connected yet.</b> The tool is built and ready — it just needs an SRFax account so faxes can actually go out.
              Add <code>SRFAX_ACCESS_ID</code>, <code>SRFAX_ACCESS_PWD</code> and <code>SRFAX_CALLER_ID</code> on the server and this lights up.
              You can still see the form below.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">New fax</CardTitle>
          <CardDescription>{status?.configured ? `Sending from your fax line ${status.callerId ?? ""}` : "Fill it in — sending unlocks once the fax line is connected."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fax number *</Label>
              <Input value={toNumber} onChange={(e) => setToNumber(e.target.value)} onBlur={() => setToNumber((v) => fmtNum(v))} placeholder="(705) 123-4567" />
            </div>
            <div>
              <Label>Recipient (optional)</Label>
              <Input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="CRA — Sudbury Tax Centre" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Link to client (optional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                <SelectContent>
                  {(clientList || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subject (optional)</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="RC59 authorization" />
            </div>
          </div>

          <div>
            <Label>Document (PDF) *</Label>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="application/pdf,image/tiff,image/png,image/jpeg" className="hidden" onChange={(e) => onPickFile(e.target.files?.[0] || null)} />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4 mr-1" /> {file ? "Change file" : "Choose file"}</Button>
              {file && <span className="text-sm text-slate-600 truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm mb-1.5">
              <Checkbox checked={includeCover} onCheckedChange={(v) => setIncludeCover(!!v)} /> Include a cover page
            </label>
            {includeCover && (
              <Textarea value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={3} placeholder="Cover note (optional) — e.g. 'Please find attached the signed RC59 for…'" />
            )}
          </div>

          {result && (
            <div className={`flex items-center gap-2 text-sm rounded-lg p-2.5 ${result.ok ? "bg-lime-50 text-lime-700" : "bg-red-50 text-red-700"}`}>
              {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {result.msg}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button className="bg-lime-600 hover:bg-lime-700" disabled={!canSend || send.isPending} onClick={doSend}>
              {send.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…</> : <><Printer className="h-4 w-4 mr-1" /> Send fax</>}
            </Button>
            {!status?.configured && <span className="text-xs text-slate-400">Connect the fax line to enable</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recent faxes</CardTitle></CardHeader>
        <CardContent>
          {(!history || history.length === 0) ? (
            <p className="text-sm text-slate-400 py-2">No faxes sent yet.</p>
          ) : (
            <div className="divide-y">
              {history.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.toName || fmtNum(f.toNumber)} <span className="text-slate-400 font-normal">{fmtNum(f.toNumber)}</span></p>
                    <p className="text-xs text-slate-500 truncate">{[f.fileName, f.subject, f.clientName].filter(Boolean).join(" · ") || "—"}{f.createdAt ? ` · ${new Date(f.createdAt).toLocaleString()}` : ""}</p>
                    {f.errorMessage ? <p className="text-xs text-red-500">{f.errorMessage}</p> : null}
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${f.status === "queued" || f.status === "sent" ? "bg-lime-50 text-lime-700" : f.status === "failed" ? "bg-red-50 text-red-600" : ""}`}>{f.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
