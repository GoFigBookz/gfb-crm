import { useState } from "react";
import { Plus, Pencil, Lock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

/**
 * Shared, fully-editable employee card — used by the Payroll pay-run view AND the
 * Employee Management page so there's ONE rich editor (like Gusto/Wagepoint):
 * pay type/rate with raise tracking, phone allowance + reimbursement per pay,
 * per-employee payroll features, YTD carry-forward, SIN (encrypted), notes,
 * active status. Every field flows through `onSave` to employee.create/update.
 *
 * `payFrequency` just labels the per-pay add-ons (e.g. "$/week" when weekly).
 */
export function EmployeeCardDialog({ employee, onClose, onSave, pending, payFrequency }: {
  employee: any; onClose: () => void;
  onSave: (data: any) => void; pending: boolean;
  payFrequency?: string | null;
}) {
  const isNew = !employee.id;
  // SIN is hidden by default (stored encrypted). Reveal/set is gated by a code.
  const [sin, setSin] = useState("");
  const [sinTouched, setSinTouched] = useState(false);
  const [sinCode, setSinCode] = useState("");
  const revealSin = trpc.employee.revealSin.useMutation();
  const rateHistory = trpc.employee.rateHistory.useQuery({ employeeId: employee.id ?? 0 }, { enabled: !!employee.id });
  // "$/pay" → a clearer per-period label so Markie knows the cadence the add-on is paid at.
  const perPay = (() => {
    const f = (payFrequency || "").toLowerCase();
    if (f.includes("week") && !f.includes("bi") && !f.includes("semi")) return "$/week";
    if (f.includes("bi")) return "$/2 wks";
    if (f.includes("semi")) return "$/half-month";
    if (f.includes("month")) return "$/month";
    return "$/pay";
  })();
  const [f, setF] = useState({
    rateEffectiveDate: "", // when changing the rate (a raise) — the day it takes effect; blank = today
    firstName: employee.firstName || "", lastName: employee.lastName || "",
    payType: employee.payType || "hourly",
    annualSalary: employee.annualSalary != null ? String(employee.annualSalary) : "",
    hourlyRate: employee.hourlyRate != null ? String(employee.hourlyRate) : "",
    hoursPerWeek: employee.hoursPerWeek != null ? String(employee.hoursPerWeek) : "",
    position: employee.position || "", email: employee.email || "", phone: employee.phone || "",
    isActive: employee.isActive !== false,
    contractUrl: employee.contractUrl || "",
    phoneAllowance: employee.phoneAllowance != null ? String(employee.phoneAllowance) : "",
    reimbursementAmount: employee.reimbursementAmount != null ? String(employee.reimbursementAmount) : "",
    reimbursementNote: employee.reimbursementNote || "",
    // Per-employee payroll features (default phone/reimbursement on if an amount exists).
    getsRevenueShare: employee.getsRevenueShare ?? false,
    revenueSharePercent: employee.revenueSharePercent != null ? String(employee.revenueSharePercent) : "",
    getsBonus: employee.getsBonus ?? false,
    getsDividends: employee.getsDividends ?? false,
    getsPhoneAllowance: employee.getsPhoneAllowance ?? ((employee.phoneAllowance ?? 0) > 0),
    getsReimbursement: employee.getsReimbursement ?? ((employee.reimbursementAmount ?? 0) > 0),
    ytdGrossOpening: employee.ytdGrossOpening != null ? String(employee.ytdGrossOpening) : "",
    ytdCppOpening: employee.ytdCppOpening != null ? String(employee.ytdCppOpening) : "",
    ytdEiOpening: employee.ytdEiOpening != null ? String(employee.ytdEiOpening) : "",
    ytdTaxOpening: employee.ytdTaxOpening != null ? String(employee.ytdTaxOpening) : "",
    ytdAsOf: employee.ytdAsOf ? new Date(employee.ytdAsOf).toISOString().slice(0, 10) : "",
    notes: employee.notes || "",
  });
  const set = (k: string, v: any) => setF((prev) => ({ ...prev, [k]: v }));
  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? undefined : n; };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2">{isNew ? <><Plus className="h-4 w-4" /> New employee</> : <><Pencil className="h-4 w-4" /> {employee.firstName} {employee.lastName}</>}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>First name</Label><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus /></div>
            <div><Label>Last name</Label><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Pay type</Label>
              <Select value={f.payType} onValueChange={(v) => set("payType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.payType === "salary" ? (
              <div><Label>Annual salary</Label><Input type="number" value={f.annualSalary} onChange={(e) => set("annualSalary", e.target.value)} /></div>
            ) : (
              <div><Label>Hourly rate</Label><Input type="number" value={f.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} /></div>
            )}
            <div><Label>Hrs / week</Label><Input type="number" value={f.hoursPerWeek} onChange={(e) => set("hoursPerWeek", e.target.value)} /></div>
          </div>
          {/* Raise tracking — when you change the rate, set the day it takes effect
              (blank = today). Past raises are listed below. */}
          {!isNew && (
            <div className="rounded-md border bg-slate-50 px-2 py-2 space-y-1.5">
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label className="text-xs">Raise effective date</Label>
                  <Input type="date" value={f.rateEffectiveDate} onChange={(e) => set("rateEffectiveDate", e.target.value)} />
                </div>
                <p className="text-[11px] text-slate-500 pb-1.5">Set when you change the rate above. Blank = today.</p>
              </div>
              {!!rateHistory.data?.length && (
                <div className="text-[11px] text-slate-600">
                  <div className="font-medium text-slate-500 uppercase tracking-wide mb-0.5">Pay-rate history</div>
                  <ul className="space-y-0.5">
                    {rateHistory.data.map((h: any) => (
                      <li key={h.id} className="flex justify-between gap-2">
                        <span>{h.effectiveDate ? new Date(h.effectiveDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}{h.note ? ` · ${h.note}` : ""}</span>
                        <span className="font-medium">{h.hourlyRate != null ? `$${h.hourlyRate}/hr` : h.annualSalary != null ? `$${Number(h.annualSalary).toLocaleString()}/yr` : "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div>
            <Label>Position</Label><Input value={f.position} onChange={(e) => set("position", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          </div>
          <div>
            <Label className="flex items-center justify-between">
              <span>Contract / agreement link</span>
              {f.contractUrl ? <a href={f.contractUrl} target="_blank" rel="noreferrer" className="text-xs text-lime-700 hover:underline inline-flex items-center gap-1">open <ExternalLink className="h-3 w-3" /></a> : null}
            </Label>
            <Input value={f.contractUrl} onChange={(e) => set("contractUrl", e.target.value)} placeholder="Google Drive link to the signed contract…" />
          </div>
          {/* SIN — hidden by default, stored encrypted. Reveal/set needs the code. */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <Label className="text-xs uppercase font-semibold text-slate-500 flex items-center gap-1"><Lock className="h-3 w-3" /> SIN {employee.hasSin && !sinTouched && !sin ? <span className="text-slate-400 normal-case">· on file (hidden)</span> : null}</Label>
            <div className="flex gap-2">
              <Input value={sin} onChange={(e) => { setSin(e.target.value); setSinTouched(true); }} placeholder={employee.hasSin ? "•••-•••-••• (enter to replace)" : "000-000-000"} />
              {!isNew && employee.hasSin && (
                <>
                  <Input type="password" value={sinCode} onChange={(e) => setSinCode(e.target.value)} placeholder="code" className="w-24" />
                  <Button type="button" size="sm" variant="outline" disabled={revealSin.isPending || !sinCode} onClick={async () => {
                    const r = await revealSin.mutateAsync({ id: employee.id, code: sinCode });
                    if (!r.ok) { alert(r.reason || "Could not reveal."); return; }
                    setSin(r.sin || ""); setSinTouched(false);
                  }}>Reveal</Button>
                </>
              )}
            </div>
          </div>
          {/* Per-employee payroll features — tick which apply to this person. */}
          <div className="rounded-lg border p-2.5 space-y-2">
            <Label className="text-xs uppercase font-semibold text-slate-500">Payroll features for this employee</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ["getsRevenueShare", "Revenue share"],
                ["getsBonus", "Bonus"],
                ["getsDividends", "Dividends"],
                ["getsPhoneAllowance", "Phone allowance"],
                ["getsReimbursement", "Reimbursement"],
              ] as [string, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-lime-500" checked={!!(f as any)[key]} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
            {f.getsRevenueShare && (
              <div><Label className="text-xs">Revenue share %</Label><Input type="number" value={f.revenueSharePercent} onChange={(e) => set("revenueSharePercent", e.target.value)} placeholder="e.g. 10" /></div>
            )}
            {f.getsPhoneAllowance && (
              <div><Label className="text-xs">Phone allowance ({perPay})</Label><Input type="number" value={f.phoneAllowance} onChange={(e) => set("phoneAllowance", e.target.value)} placeholder="0.00" /></div>
            )}
            {f.getsReimbursement && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Reimbursement ({perPay})</Label><Input type="number" value={f.reimbursementAmount} onChange={(e) => set("reimbursementAmount", e.target.value)} placeholder="0.00" /></div>
                <div><Label className="text-xs">For</Label><Input value={f.reimbursementNote} onChange={(e) => set("reimbursementNote", e.target.value)} placeholder="What it's for…" /></div>
              </div>
            )}
          </div>
          {/* YTD carry-forward from QuickBooks Payroll. */}
          <div className="rounded-md border bg-slate-50 px-2 py-2 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-slate-500">YTD carry-forward (from QuickBooks Payroll)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">YTD gross</Label><Input type="number" value={f.ytdGrossOpening} onChange={(e) => set("ytdGrossOpening", e.target.value)} placeholder="feeds CPP/EI maxing" /></div>
              <div><Label className="text-xs">As of date</Label><Input type="date" value={f.ytdAsOf} onChange={(e) => set("ytdAsOf", e.target.value)} /></div>
              <div><Label className="text-xs">YTD CPP</Label><Input type="number" value={f.ytdCppOpening} onChange={(e) => set("ytdCppOpening", e.target.value)} /></div>
              <div><Label className="text-xs">YTD EI</Label><Input type="number" value={f.ytdEiOpening} onChange={(e) => set("ytdEiOpening", e.target.value)} /></div>
              <div><Label className="text-xs">YTD income tax</Label><Input type="number" value={f.ytdTaxOpening} onChange={(e) => set("ytdTaxOpening", e.target.value)} /></div>
            </div>
            <p className="text-[11px] text-slate-500">Enter from the QuickBooks Payroll YTD report (or it'll be synced once the QuickBooks connection is re-authorized). Carries CPP/EI toward their annual max so the calc is right from the first run.</p>
          </div>
          <div>
            <Label>Notes / history</Label>
            <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Rate changes, start/end dates, anything to track on this employee's card…" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-lime-500" />
            Active employee
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={!f.firstName.trim() || pending} onClick={() => onSave({
              firstName: f.firstName.trim(), lastName: f.lastName.trim(),
              payType: f.payType,
              annualSalary: f.payType === "salary" ? num(f.annualSalary) : undefined,
              hourlyRate: f.payType !== "salary" ? num(f.hourlyRate) : undefined,
              hoursPerWeek: num(f.hoursPerWeek),
              position: f.position.trim() || undefined,
              email: f.email.trim() || undefined, phone: f.phone.trim() || undefined,
              contractUrl: f.contractUrl.trim() || undefined,
              phoneAllowance: f.phoneAllowance.trim() === "" ? null : num(f.phoneAllowance),
              reimbursementAmount: f.reimbursementAmount.trim() === "" ? null : num(f.reimbursementAmount),
              reimbursementNote: f.reimbursementNote.trim() || undefined,
              getsRevenueShare: !!f.getsRevenueShare,
              revenueSharePercent: f.revenueSharePercent.trim() === "" ? null : num(f.revenueSharePercent),
              getsBonus: !!f.getsBonus, getsDividends: !!f.getsDividends,
              getsPhoneAllowance: !!f.getsPhoneAllowance, getsReimbursement: !!f.getsReimbursement,
              ytdGrossOpening: f.ytdGrossOpening.trim() === "" ? null : num(f.ytdGrossOpening),
              ytdCppOpening: f.ytdCppOpening.trim() === "" ? null : num(f.ytdCppOpening),
              ytdEiOpening: f.ytdEiOpening.trim() === "" ? null : num(f.ytdEiOpening),
              ytdTaxOpening: f.ytdTaxOpening.trim() === "" ? null : num(f.ytdTaxOpening),
              ...(f.ytdAsOf ? { ytdAsOf: new Date(f.ytdAsOf + "T12:00:00"), ytdSource: "manual" } : {}),
              ...(sinTouched ? { sin: sin.trim() } : {}),
              ...(f.rateEffectiveDate ? { rateEffectiveDate: new Date(f.rateEffectiveDate + "T12:00:00") } : {}),
              isActive: f.isActive, notes: f.notes.trim() || undefined,
            })}>{pending ? "Saving…" : isNew ? "Create" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
