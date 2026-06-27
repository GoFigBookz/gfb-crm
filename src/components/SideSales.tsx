import { useState } from "react";
import { Tags, Plus, Trash2, Pencil, DollarSign, Megaphone, Copy, Loader2, Check, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";

/**
 * SIDE SALES — Markie's private resale side business (Phoenix Rising). Inventory +
 * sales tracking; Skye markets/resells these. Owner-only.
 */
const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BLANK = { name: "", category: "", qtyOnHand: "", givenAway: "", unitCost: "", minPrice: "", targetPrice: "", discreet: false, notes: "" };

export default function SideSales() {
  const q = trpc.phoenix.sideOverview.useQuery();
  const up = trpc.phoenix.sideProductUpsert.useMutation({ onSuccess: () => { q.refetch(); reset(); } });
  const rm = trpc.phoenix.sideProductRemove.useMutation({ onSuccess: () => q.refetch() });
  const sale = trpc.phoenix.sideSaleAdd.useMutation({ onSuccess: () => { q.refetch(); setSelling(null); } });

  const [form, setForm] = useState<any>(BLANK);
  const [open, setOpen] = useState(false);
  const [selling, setSelling] = useState<number | null>(null);
  const [listingFor, setListingFor] = useState<number | null>(null);
  const [saleForm, setSaleForm] = useState({ qty: "1", unitPrice: "", channel: "" });
  const reset = () => { setForm(BLANK); setOpen(false); };
  const edit = (p: any) => { setForm({ ...p, qtyOnHand: String(p.qtyOnHand ?? ""), givenAway: String(p.givenAway ?? ""), unitCost: String(p.unitCost ?? ""), minPrice: String(p.minPrice ?? ""), targetPrice: String(p.targetPrice ?? ""), discreet: !!p.discreet }); setOpen(true); };

  const products = q.data?.products || [];
  const soldBy = q.data?.soldByProduct || {};
  const t = q.data?.totals;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Tags className="h-5 w-5 text-fuchsia-600" />
        <h3 className="font-semibold text-slate-800">Side sales</h3>
        <span className="text-xs text-slate-400">your resale business — Skye markets these</span>
        <Button size="sm" className="ml-auto" onClick={() => (open ? reset() : setOpen(true))}><Plus className="h-4 w-4 mr-1" /> Product</Button>
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Units sold</div><div className="text-xl font-bold text-slate-800">{t.totalUnits}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">Revenue</div><div className="text-xl font-bold text-emerald-700">{money(t.totalRevenue)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-slate-500">On hand</div><div className="text-xl font-bold text-slate-800">{products.reduce((s: number, p: any) => s + (p.qtyOnHand || 0), 0)}</div></CardContent></Card>
        </div>
      )}

      {open && (
        <Card><CardContent className="p-3 grid sm:grid-cols-3 gap-2">
          <Input className="sm:col-span-2" placeholder="Product name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input inputMode="numeric" placeholder="Qty on hand" value={form.qtyOnHand} onChange={(e) => setForm({ ...form, qtyOnHand: e.target.value })} />
          <Input inputMode="numeric" placeholder="Given away" value={form.givenAway} onChange={(e) => setForm({ ...form, givenAway: e.target.value })} />
          <Input inputMode="decimal" placeholder="Unit cost" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
          <Input inputMode="decimal" placeholder="MIN price (floor)" value={form.minPrice} onChange={(e) => setForm({ ...form, minPrice: e.target.value })} />
          <Input inputMode="decimal" placeholder="Target price" value={form.targetPrice} onChange={(e) => setForm({ ...form, targetPrice: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.discreet} onChange={(e) => setForm({ ...form, discreet: e.target.checked })} /> Discreet</label>
          <Input className="sm:col-span-3" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-2 sm:col-span-3">
            <Button size="sm" disabled={!form.name || up.isPending} onClick={() => up.mutate({ name: form.name, category: form.category || undefined, qtyOnHand: +form.qtyOnHand || 0, givenAway: +form.givenAway || 0, unitCost: +form.unitCost || 0, minPrice: +form.minPrice || 0, targetPrice: +form.targetPrice || 0, discreet: form.discreet, notes: form.notes || undefined, id: form.id })}>{form.id ? "Save" : "Add"}</Button>
            <Button size="sm" variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {products.map((p: any) => {
          const sold = soldBy[p.id]?.units || 0;
          const avg = soldBy[p.id]?.units ? (soldBy[p.id].revenue / soldBy[p.id].units) : 0;
          return (
            <Card key={p.id} className="group">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {p.category && <span className="text-xs text-slate-400">{p.category}</span>}
                      {!!p.discreet && <span className="text-[10px] uppercase text-fuchsia-500 border border-fuchsia-200 rounded px-1">discreet</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-x-3">
                      <span><b className="text-slate-700">{p.qtyOnHand}</b> on hand</span>
                      {p.givenAway ? <span>{p.givenAway} given away</span> : null}
                      <span>min {money(p.minPrice)}</span>
                      {p.targetPrice ? <span>target {money(p.targetPrice)}</span> : null}
                      {sold ? <span className="text-emerald-600">{sold} sold @ avg {money(avg)}</span> : null}
                    </div>
                    {p.notes && <div className="text-xs text-slate-500 mt-1">{p.notes}</div>}
                    {selling === p.id && (
                      <div className="flex flex-wrap items-end gap-2 mt-2 p-2 bg-slate-50 rounded border">
                        <Input className="w-16" inputMode="numeric" placeholder="Qty" value={saleForm.qty} onChange={(e) => setSaleForm({ ...saleForm, qty: e.target.value })} />
                        <Input className="w-24" inputMode="decimal" placeholder="Price ea" value={saleForm.unitPrice} onChange={(e) => setSaleForm({ ...saleForm, unitPrice: e.target.value })} />
                        <Input className="w-32" placeholder="Channel" value={saleForm.channel} onChange={(e) => setSaleForm({ ...saleForm, channel: e.target.value })} />
                        <Button size="sm" disabled={!saleForm.unitPrice || sale.isPending} onClick={() => { sale.mutate({ productId: p.id, qty: +saleForm.qty || 1, unitPrice: +saleForm.unitPrice || 0, channel: saleForm.channel || undefined }); setSaleForm({ qty: "1", unitPrice: "", channel: "" }); }}>Log sale</Button>
                        <Button size="sm" variant="outline" onClick={() => setSelling(null)}>Cancel</Button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setListingFor(listingFor === p.id ? null : p.id)}><Megaphone className="h-3.5 w-3.5 mr-1" /> Listings</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => { setSelling(p.id); setSaleForm({ qty: "1", unitPrice: String(p.targetPrice || p.minPrice || ""), channel: "" }); }}><DollarSign className="h-3.5 w-3.5 mr-1" /> Sell</Button>
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => edit(p)}><Pencil className="h-3.5 w-3.5 text-slate-400" /></button>
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => { if (confirm("Remove product?")) rm.mutate({ id: p.id }); }}><Trash2 className="h-3.5 w-3.5 text-slate-400" /></button>
                  </div>
                </div>
                {listingFor === p.id && <ListingsPanel productId={p.id} productName={p.name} />}
              </CardContent>
            </Card>
          );
        })}
        {products.length === 0 && <p className="text-xs text-slate-400">No products yet — add one above. Set the MIN price you need back, and Skye can help move them.</p>}
      </div>

      <div className="text-xs text-slate-500 bg-fuchsia-50 border border-fuchsia-200 rounded p-2 flex items-start gap-2">
        <Megaphone className="h-4 w-4 shrink-0 mt-0.5 text-fuchsia-500" />
        <span>Skye (marketing) handles reselling these — channels, listings, and discreet outreach. Ask her in chat to draft a listing or find buyers for any product here.</span>
      </div>
    </div>
  );
}

// Reseller engine — Skye drafts channel-tailored listings; you copy + paste-and-post
// (Facebook Marketplace has no public listing API, so drafts are the safe play).
function ListingsPanel({ productId, productName }: { productId: number; productName: string }) {
  const utils = trpc.useUtils();
  const q = trpc.phoenix.listings.useQuery({ productId });
  const gen = trpc.phoenix.generateListing.useMutation({ onSuccess: () => utils.phoenix.listings.invalidate({ productId }) });
  const setStatus = trpc.phoenix.listingSetStatus.useMutation({ onSuccess: () => utils.phoenix.listings.invalidate({ productId }) });
  const del = trpc.phoenix.listingRemove.useMutation({ onSuccess: () => utils.phoenix.listings.invalidate({ productId }) });
  const [copied, setCopied] = useState<number | null>(null);
  const money = (n: number) => `$${(n || 0).toLocaleString()}`;

  const copy = (l: any) => {
    const text = `${l.title}\n\n${l.body}${l.hashtags ? `\n\n${l.hashtags}` : ""}${l.price ? `\n\nPrice: ${money(l.price)}` : ""}`;
    navigator.clipboard?.writeText(text).then(() => { setCopied(l.id); setTimeout(() => setCopied(null), 1500); }).catch(() => {});
  };
  const listings = q.data || [];
  return (
    <div className="mt-2 p-2 bg-fuchsia-50/50 border border-fuchsia-100 rounded space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-fuchsia-700">Skye's listings for {productName}</span>
        <Button size="sm" className="h-7 ml-auto" disabled={gen.isPending} onClick={() => gen.mutate({ productId, channels: ["marketplace", "kijiji", "ebay"] })}>
          {gen.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ListPlus className="h-3.5 w-3.5 mr-1" />} Draft (FB · Kijiji · eBay)
        </Button>
      </div>
      {q.isLoading ? <p className="text-xs text-slate-400">Loading…</p> : listings.length === 0 ? (
        <p className="text-xs text-slate-500">No listings yet. Click “Draft” — Skye writes one per channel, then you copy &amp; post. (No auto-posting: Marketplace has no API.)</p>
      ) : (
        <div className="space-y-2">
          {listings.map((l: any) => (
            <div key={l.id} className="rounded border border-slate-200 bg-white p-2 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-semibold text-fuchsia-600 bg-fuchsia-50 rounded px-1.5 py-0.5">{l.channel}</span>
                {l.price ? <span className="text-xs text-emerald-700">{money(l.price)}</span> : null}
                {l.status === "listed" && <span className="text-[10px] text-emerald-700 bg-emerald-50 rounded px-1">LISTED</span>}
                <div className="ml-auto flex items-center gap-1">
                  <button title="Copy" className="text-slate-400 hover:text-slate-700" onClick={() => copy(l)}>{copied === l.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}</button>
                  <button title={l.status === "listed" ? "Mark draft" : "Mark listed"} className="text-slate-400 hover:text-emerald-600 text-xs" onClick={() => setStatus.mutate({ id: l.id, status: l.status === "listed" ? "draft" : "listed" })}>{l.status === "listed" ? "↺" : "✓ posted"}</button>
                  <button title="Delete" className="text-slate-400 hover:text-red-500" onClick={() => del.mutate({ id: l.id })}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="font-medium text-slate-800">{l.title}</div>
              <div className="text-slate-600 whitespace-pre-wrap text-xs mt-0.5">{l.body}</div>
              {l.hashtags && <div className="text-[11px] text-slate-400 mt-1">{l.hashtags}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
