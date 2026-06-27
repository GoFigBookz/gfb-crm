import { useState } from "react";
import { Lock, Loader2, Trash2, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";

/**
 * VENDOR RULES panel (Markie 2026-06-27: "Bell Canada is a utility → it should have a
 * rule so it auto-posts; stop re-deciding the same account every time").
 * ---------------------------------------------------------------------------
 * Lists the client's locked vendor → account/tax rules (confirmed vendorMemory) and lets
 * Markie add/remove one. A confirmed rule WINS over history in the brain, so the vendor
 * codes green automatically on every future post. SAFE: writes only Figgy's memory, never
 * the client's QBO books. Read-only QBO pulls for the vendor/account/tax pick-lists.
 */
export default function VendorRulesPanel({ clientId }: { clientId: number }) {
  const utils = trpc.useUtils();
  const rules = trpc.vendorRules.list.useQuery({ clientId });
  const options = trpc.vendorRules.options.useMutation();
  const setRule = trpc.vendorRules.setRule.useMutation({
    onSuccess: () => { utils.vendorRules.list.invalidate({ clientId }); resetForm(); },
  });
  const removeRule = trpc.vendorRules.removeRule.useMutation({
    onSuccess: () => utils.vendorRules.list.invalidate({ clientId }),
  });

  const [adding, setAdding] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [taxCode, setTaxCode] = useState("");

  function resetForm() {
    setAdding(false); setVendorId(""); setAccountId(""); setTaxCode("");
  }

  const opt = options.data && "ok" in options.data && options.data.ok ? options.data : null;

  async function openAddForm() {
    setAdding(true);
    if (!opt) await options.mutateAsync({ clientId });
  }

  function save() {
    if (!opt || !vendorId || !accountId) return;
    const v = opt.vendors.find((x) => x.id === vendorId);
    const a = opt.accounts.find((x) => x.id === accountId);
    if (!v || !a) return;
    setRule.mutate({
      clientId, qboVendorId: v.id, vendorName: v.name,
      accountId: a.id, accountName: a.name, taxCode: taxCode || undefined,
    });
  }

  const list = rules.data ?? [];

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-lime-600" />
          <span className="text-sm font-semibold text-slate-700">Vendor auto-post rules</span>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={openAddForm} disabled={options.isPending}>
            {options.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            <span className="ml-1">Add rule</span>
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Lock a recurring vendor to its account + tax (e.g. Bell Canada → Telephone). Confirmed
        rules code <span className="font-medium text-emerald-600">green automatically</span> on every
        future post — no re-review. Writes only Figgy's memory, never QuickBooks.
      </p>

      {adding && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3 space-y-2">
          {options.data && "ok" in options.data && !options.data.ok ? (
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Couldn't load QuickBooks lists: {options.data.error}
            </div>
          ) : !opt ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading vendors & accounts…
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-600">Vendor
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">Select vendor…</option>
                  {opt.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">Account
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Select account…</option>
                  {opt.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">Tax code (optional)
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm bg-white"
                  value={taxCode} onChange={(e) => setTaxCode(e.target.value)}>
                  <option value="">— none —</option>
                  {opt.taxCodes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={save} disabled={!vendorId || !accountId || setRule.isPending}>
                  {setRule.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <span className="ml-1">Lock rule</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      )}

      {rules.isLoading ? (
        <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rules…</div>
      ) : list.length === 0 ? (
        <p className="text-xs text-slate-400">No vendor rules yet. Add one to auto-code a recurring vendor.</p>
      ) : (
        <div className="space-y-1">
          {list.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border border-slate-100 bg-white px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-700 truncate">{r.vendorName || `Vendor ${r.qboVendorId}`}</span>
                  {r.confirmed && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1">LOCKED</span>}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  → {r.accountName || r.accountId}{r.taxCode ? ` · tax ${r.taxCode}` : ""}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500"
                onClick={() => removeRule.mutate({ id: r.id })} disabled={removeRule.isPending}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
