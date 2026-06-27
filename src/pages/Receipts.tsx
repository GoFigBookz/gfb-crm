import { useState, useCallback } from "react";
import { ScanLine, Upload, Trash2, Image, FileText, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { trpc } from "@/providers/trpc";

interface ScannedReceipt {
  id: string;
  fileName: string;
  vendor: string;
  date: string;
  amount: string;
  category: string;
  taxAmount: string;
  hstGst: string;
  status: "pending" | "processed" | "flagged";
  clientId?: number;
}

const CATEGORIES = [
  "Meals & Entertainment",
  "Office Supplies",
  "Vehicle & Fuel",
  "Travel",
  "Advertising",
  "Professional Fees",
  "Insurance",
  "Rent",
  "Utilities",
  "Equipment",
  "Maintenance",
  "Other",
];

export default function Receipts() {
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [receipts, setReceipts] = useState<ScannedReceipt[]>([]);

  const { data: clients } = trpc.crmClient.list.useQuery();

  const processFile = useCallback((file: File) => {
    // HONEST INTAKE: receipts are coded by Fig's intake pipeline (Gmail/Drive →
    // vendor brain → Triage), NEVER fabricated here. We list the file as queued and
    // do NOT invent vendor/amount/HST — making up financial data would violate the
    // golden rules. (Live in-browser extraction lands when the OCR service is wired.)
    const queued: ScannedReceipt = {
      id: Math.random().toString(36).substring(2, 10),
      fileName: file.name,
      vendor: "",
      date: "",
      amount: "",
      category: "",
      taxAmount: "",
      hstGst: "",
      status: "pending",
      clientId: selectedClient || undefined,
    };
    setReceipts((prev) => [queued, ...prev]);
  }, [selectedClient]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach((f) => {
      if (f.type.startsWith("image/") || f.name.match(/\.(pdf|png|jpg|jpeg)$/i)) {
        processFile(f);
      }
    });
  }, [processFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((f) => processFile(f));
  }, [processFile]);

  const removeReceipt = (id: string) => {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  };

  const updateReceipt = (id: string, field: string, value: string) => {
    setReceipts((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const totalAmount = receipts
    .filter((r) => r.status === "processed")
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  const totalTax = receipts
    .filter((r) => r.status === "processed")
    .reduce((sum, r) => sum + (parseFloat(r.taxAmount) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ScanLine className="h-6 w-6 text-lime-500" />
          Receipt Scanner
        </h1>
        <p className="text-slate-500">Queue receipts for Fig to code — vendor, date, amount, and HST</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Receipts are coded by <b>Fig's intake pipeline</b> (Gmail/Drive → vendor brain → <a href="/triage" className="underline">Triage</a>), where you review the suggested coding.
          This page <b>does not invent</b> vendor/amount/HST — automatic in-browser extraction lands when the OCR service is wired. For now, drop files here to queue them or forward to the intake inbox.
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedClient?.toString() || ""} onValueChange={(v) => setSelectedClient(Number(v))}>
            <SelectTrigger><SelectValue placeholder="Choose a client..." /></SelectTrigger>
            <SelectContent className="max-h-72">
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-lime-50 border-lime-200">
          <CardContent className="p-4">
            <p className="text-xs text-lime-600">Receipts Scanned</p>
            <p className="text-2xl font-bold text-lime-700">{receipts.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-xs text-blue-600">Total Amount</p>
            <p className="text-2xl font-bold text-blue-700">${totalAmount.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4">
            <p className="text-xs text-amber-600">Total HST/GST</p>
            <p className="text-2xl font-bold text-amber-700">${totalTax.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-all",
          isDragging ? "border-lime-500 bg-lime-50" : "border-slate-300 bg-slate-50"
        )}
      >
        <Image className={cn("h-10 w-10 mx-auto mb-3", isDragging ? "text-lime-500" : "text-slate-400")} />
        <p className="font-medium text-slate-700">
          {isDragging ? "Drop receipts here" : "Drag & drop receipt images or PDFs"}
        </p>
        <p className="text-xs text-slate-500 mt-1">JPG, PNG, PDF supported</p>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={onFileInput} className="hidden" id="receipt-files" />
        <Button variant="outline" size="sm" className="mt-3" onClick={() => document.getElementById("receipt-files")?.click()}>
          <Upload className="h-3 w-3 mr-1" /> Browse
        </Button>
      </div>

      {/* Receipts List */}
      {receipts.length > 0 && (
        <div className="space-y-3">
          {receipts.map((receipt) => (
            <Card key={receipt.id} className={cn(
              receipt.status === "flagged" && "border-red-300 bg-red-50/30"
            )}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    {receipt.status === "pending" ? (
                      <div className="w-4 h-4 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
                    ) : receipt.status === "flagged" ? (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <FileText className="h-5 w-5 text-lime-500" />
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div>
                      <p className="text-xs text-slate-500">File</p>
                      <p className="text-sm font-medium truncate">{receipt.fileName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Vendor</p>
                      <input
                        className="w-full text-sm border rounded px-2 py-1"
                        value={receipt.vendor}
                        onChange={(e) => updateReceipt(receipt.id, "vendor", e.target.value)}
                        placeholder="Vendor name..."
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Date</p>
                      <input
                        type="date"
                        className="w-full text-sm border rounded px-2 py-1"
                        value={receipt.date}
                        onChange={(e) => updateReceipt(receipt.id, "date", e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Amount</p>
                      <input
                        type="number"
                        className="w-full text-sm border rounded px-2 py-1"
                        value={receipt.amount}
                        onChange={(e) => updateReceipt(receipt.id, "amount", e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Category</p>
                      <select
                        className="w-full text-sm border rounded px-2 py-1 bg-white"
                        value={receipt.category}
                        onChange={(e) => updateReceipt(receipt.id, "category", e.target.value)}
                      >
                        <option value="">Select...</option>
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-500 flex-shrink-0" onClick={() => removeReceipt(receipt.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {receipt.status === "processed" && receipt.taxAmount && (
                  <div className="flex gap-4 mt-2 text-xs text-slate-500 pl-14">
                    <span>HST/GST: ${receipt.taxAmount} ({(parseFloat(receipt.hstGst) * 100).toFixed(0)}%)</span>
                    <Badge variant="outline" className="text-xs">{receipt.category}</Badge>
                  </div>
                )}
                {receipt.status === "flagged" && (
                  <p className="text-xs text-red-600 mt-2 pl-14">Could not auto-read — please fill in details manually</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4 text-sm text-blue-700">
          <strong>Note:</strong> Full OCR (optical character recognition) for receipt scanning requires a backend OCR service like Google Vision, AWS Textract, or Azure Form Recognizer. This page provides the UI framework — once you connect an OCR API, it will automatically extract vendor names, dates, amounts, and HST/GST from uploaded receipt images.
        </CardContent>
      </Card>
    </div>
  );
}
