import { useState, useCallback } from "react";
import {
  Upload,
  FileText,
  Download,
  Trash2,
  ArrowRightLeft,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Building2,
  Table2,
  Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/* =================================================================
   TYPES
   ================================================================= */
interface ParsedTransaction {
  id: number;
  date: string;        // ISO YYYY-MM-DD
  rawDate: string;     // Original
  payee: string;
  description: string;
  memo: string;
  amount: number;      // Positive = deposit, Negative = withdrawal
  debit: number;
  credit: number;
  category: string;
  account: string;
  chequeNum: string;
  type: "debit" | "credit" | "transfer" | "fee";
}

interface ParsedFile {
  fileName: string;
  bank: string;
  format: string;
  transactions: ParsedTransaction[];
  rawData: string[][];
}

/* =================================================================
   BANK FORMAT DETECTORS
   ================================================================= */

const BANK_PATTERNS = [
  { name: "RBC", keywords: ["Account Type", "Account Number", "Description 1", "Description 2", "CAD$"] },
  { name: "TD", keywords: ["Transaction", "Description", "Debit", "Credit", "Balance"] },
  { name: "Scotiabank", keywords: ["Withdrawals", "Deposits", "Balance"] },
  { name: "BMO", keywords: ["Transaction Description", "Debit", "Credit", "Running Balance"] },
  { name: "CIBC", keywords: ["Description", "Debit", "Credit", "Balance"] },
  { name: "Tangerine", keywords: ["Transaction", "Name", "Memo", "Amount"] },
  { name: "Simplii", keywords: ["Transaction", "Description", "Debit", "Credit"] },
  { name: "ATB", keywords: ["Details", "Debit", "Credit", "Balance"] },
  { name: "National Bank", keywords: ["Description", "Retrait", "Dépôt", "Solde"] },
  { name: "Laurentian", keywords: ["Description", "Débit", "Crédit", "Solde"] },
  { name: "Desjardins", keywords: ["Description", "Retraits", "Dépôts", "Solde"] },
  { name: "PC Financial", keywords: ["Transaction", "Description", "Amount", "Balance"] },
  { name: "EQ Bank", keywords: ["Transaction", "Description", "Amount"] },
  { name: "KOHO", keywords: ["Merchant", "Category", "Amount"] },
  { name: "Wealthsimple", keywords: ["Activity", "Symbol", "Description", "Amount"] },
];

function detectBank(headers: string[]): string {
  const headerStr = headers.join(" ").toLowerCase();
  let bestMatch = "Unknown Bank";
  let bestScore = 0;
  for (const bank of BANK_PATTERNS) {
    let score = 0;
    for (const kw of bank.keywords) {
      if (headerStr.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = bank.name;
    }
  }
  return bestScore >= 2 ? bestMatch : "Generic CSV";
}

/* =================================================================
   CSV PARSER
   ================================================================= */

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  const result: string[][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cell = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    result.push(cells);
  }
  return { headers: result[0] || [], rows: result.slice(1) };
}

/* =================================================================
   DATE PARSER — handles all Canadian bank formats
   ================================================================= */

function parseDate(raw: string): { iso: string; valid: boolean } {
  if (!raw) return { iso: "", valid: false };
  const s = raw.trim();

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { iso: s, valid: true };
  }
  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
    return { iso: s.replace(/\//g, "-"), valid: true };
  }
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split("/");
    return { iso: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, valid: true };
  }
  // DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return { iso: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, valid: true };
  }
  // MMM DD, YYYY  or  DD MMM YYYY
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const monMatch = s.match(/([A-Za-z]{3})\D+(\d{1,2})\D+(\d{4})/);
  if (monMatch) {
    const mon = monthNames[monMatch[1].toLowerCase()];
    if (mon) {
      return { iso: `${monMatch[3]}-${mon}-${monMatch[2].padStart(2, "0")}`, valid: true };
    }
  }
  // Try Date.parse as fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const iso = d.toISOString().slice(0, 10);
    return { iso, valid: true };
  }
  return { iso: s, valid: false };
}

/* =================================================================
   AMOUNT PARSER
   ================================================================= */

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[$£€¥,\s]/g, "")
    .replace(/\(/g, "-")
    .replace(/\)/g, "")
    .replace(/CR/i, "")
    .replace(/DB/i, "")
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/* =================================================================
   BANK-SPECIFIC PARSERS
   ================================================================= */

function parseRBC(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[2] || "");
    const debit = parseAmount(r[6] || "");
    const credit = parseAmount(r[7] || "");
    const amount = (credit || 0) - (debit || 0);
    return {
      id: i,
      date: date.iso,
      rawDate: r[2] || "",
      payee: r[4] || "",
      description: [r[4], r[5]].filter(Boolean).join(" — "),
      memo: r[5] || "",
      amount,
      debit: debit || 0,
      credit: credit || 0,
      category: "",
      account: r[1] || "",
      chequeNum: r[3] || "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseTD(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[0] || "");
    const debit = parseAmount(r[3] || "");
    const credit = parseAmount(r[4] || "");
    const amount = (credit || 0) - (debit || 0);
    return {
      id: i, date: date.iso, rawDate: r[0] || "",
      payee: r[2] || "", description: [r[1], r[2]].filter(Boolean).join(" — "),
      memo: "", amount, debit: debit || 0, credit: credit || 0,
      category: "", account: "", chequeNum: "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseScotiabank(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[0] || "");
    const debit = parseAmount(r[2] || "");
    const credit = parseAmount(r[3] || "");
    const amount = (credit || 0) - (debit || 0);
    return {
      id: i, date: date.iso, rawDate: r[0] || "",
      payee: r[1] || "", description: r[1] || "",
      memo: "", amount, debit: debit || 0, credit: credit || 0,
      category: "", account: "", chequeNum: "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseBMO(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[0] || "");
    const debit = parseAmount(r[2] || "");
    const credit = parseAmount(r[3] || "");
    const amount = (credit || 0) - (debit || 0);
    return {
      id: i, date: date.iso, rawDate: r[0] || "",
      payee: r[1] || "", description: r[1] || "",
      memo: "", amount, debit: debit || 0, credit: credit || 0,
      category: "", account: "", chequeNum: "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseCIBC(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[0] || "");
    const debit = parseAmount(r[2] || "");
    const credit = parseAmount(r[3] || "");
    const amount = (credit || 0) - (debit || 0);
    return {
      id: i, date: date.iso, rawDate: r[0] || "",
      payee: r[1] || "", description: r[1] || "",
      memo: "", amount, debit: debit || 0, credit: credit || 0,
      category: "", account: "", chequeNum: "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseTangerine(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[0] || "");
    const amount = parseAmount(r[4] || "");
    return {
      id: i, date: date.iso, rawDate: r[0] || "",
      payee: r[2] || "", description: [r[1], r[2], r[3]].filter(Boolean).join(" — "),
      memo: r[3] || "", amount: amount || 0, debit: (amount || 0) < 0 ? Math.abs(amount || 0) : 0,
      credit: (amount || 0) > 0 ? amount || 0 : 0, category: "", account: "", chequeNum: "",
      type: (amount || 0) < 0 ? "debit" : (amount || 0) > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseSimplii(rows: string[][]): ParsedTransaction[] {
  return rows.map((r, i) => {
    const date = parseDate(r[0] || "");
    const debit = parseAmount(r[3] || "");
    const credit = parseAmount(r[4] || "");
    const amount = (credit || 0) - (debit || 0);
    return {
      id: i, date: date.iso, rawDate: r[0] || "",
      payee: r[2] || "", description: [r[1], r[2]].filter(Boolean).join(" — "),
      memo: "", amount, debit: debit || 0, credit: credit || 0,
      category: "", account: "", chequeNum: "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

function parseGeneric(rows: string[][], headers: string[]): ParsedTransaction[] {
  const h = headers.map(h => h.toLowerCase().trim());
  const dateIdx = h.findIndex(h => h.includes("date") && !h.includes("post"));
  const descIdx = h.findIndex(h => h.includes("desc") || h.includes("name") || h.includes("merchant") || h.includes("payee"));
  const debitIdx = h.findIndex(h => h.includes("debit") || h.includes("withdrawal") || h.includes("out"));
  const creditIdx = h.findIndex(h => h.includes("credit") || h.includes("deposit") || h.includes("in"));
  const amountIdx = h.findIndex(h => h.includes("amount") && !h.includes("balance"));
  const memoIdx = h.findIndex(h => h.includes("memo") || h.includes("notes"));
  const chequeIdx = h.findIndex(h => h.includes("cheque") || h.includes("check") || h.includes("num"));

  return rows.map((r, i) => {
    const date = parseDate(r[dateIdx >= 0 ? dateIdx : 0] || "");
    let amount = 0;
    let debit = 0;
    let credit = 0;
    if (debitIdx >= 0 && creditIdx >= 0) {
      debit = parseAmount(r[debitIdx] || "") || 0;
      credit = parseAmount(r[creditIdx] || "") || 0;
      amount = credit - debit;
    } else if (amountIdx >= 0) {
      amount = parseAmount(r[amountIdx] || "") || 0;
      debit = amount < 0 ? Math.abs(amount) : 0;
      credit = amount > 0 ? amount : 0;
    }
    return {
      id: i, date: date.iso, rawDate: r[dateIdx >= 0 ? dateIdx : 0] || "",
      payee: r[descIdx >= 0 ? descIdx : 1] || "",
      description: r[descIdx >= 0 ? descIdx : 1] || "",
      memo: r[memoIdx >= 0 ? memoIdx : ""] || "",
      amount, debit, credit,
      category: "", account: "",
      chequeNum: r[chequeIdx >= 0 ? chequeIdx : ""] || "",
      type: amount < 0 ? "debit" : amount > 0 ? "credit" : "transfer",
    };
  }).filter(t => t.date);
}

/* =================================================================
   MAIN PARSER ROUTER
   ================================================================= */

function parseTransactions(fileName: string, text: string): ParsedFile | null {
  const { headers, rows } = parseCSV(text);
  if (rows.length === 0) return null;

  const bank = detectBank(headers);
  let transactions: ParsedTransaction[] = [];

  switch (bank) {
    case "RBC": transactions = parseRBC(rows); break;
    case "TD": transactions = parseTD(rows); break;
    case "Scotiabank": transactions = parseScotiabank(rows); break;
    case "BMO": transactions = parseBMO(rows); break;
    case "CIBC": transactions = parseCIBC(rows); break;
    case "Tangerine": transactions = parseTangerine(rows); break;
    case "Simplii": transactions = parseSimplii(rows); break;
    default: transactions = parseGeneric(rows, headers);
  }

  return {
    fileName,
    bank,
    format: "CSV",
    transactions,
    rawData: [headers, ...rows],
  };
}

/* =================================================================
   QBO EXPORTERS
   ================================================================= */

function formatDate(iso: string, format: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  switch (format) {
    case "MM/DD/YYYY": return `${m}/${d}/${y}`;
    case "DD/MM/YYYY": return `${d}/${m}/${y}`;
    case "YYYY-MM-DD": return iso;
    case "DD-MMM-YYYY": return `${d}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]}-${y}`;
    default: return `${m}/${d}/${y}`;
  }
}

function exportQBOCSV(transactions: ParsedTransaction[], dateFormat: string): string {
  // QBO Bank Feed CSV format
  const header = "Date,Description,Amount";
  const rows = transactions.map(t => {
    const date = formatDate(t.date, dateFormat);
    const desc = [t.payee, t.memo].filter(Boolean).join(" — ").replace(/,/g, ";");
    return `${date},"${desc}",${t.amount.toFixed(2)}`;
  });
  return [header, ...rows].join("\n");
}

function exportIIF(transactions: ParsedTransaction[], dateFormat: string): string {
  // IIF format for older QBO/Desktop
  const lines = [
    "!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO",
    "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tMEMO",
    "!ENDTRNS",
  ];
  transactions.forEach((t, i) => {
    const date = formatDate(t.date, dateFormat);
    const desc = [t.payee, t.memo].filter(Boolean).join(" — ").replace(/\t/g, " ");
    const accnt = t.amount < 0 ? "Checking" : "Checking";
    lines.push(`TRNS\t${i}\t${t.amount < 0 ? "CHECK" : "DEPosit"}\t${date}\t${accnt}\t${desc}\t${t.amount.toFixed(2)}\t${desc}`);
    lines.push(`SPL\t${i}\t${t.amount < 0 ? "CHECK" : "DEPosit"}\t${date}\t${t.amount < 0 ? "Expense" : "Income"}\t${desc}\t${(-t.amount).toFixed(2)}\t${desc}`);
    lines.push("ENDTRNS");
  });
  return lines.join("\n");
}

function exportJournalCSV(transactions: ParsedTransaction[], dateFormat: string): string {
  // Full journal entry format for accountants
  const header = "Date,Payee,Description,Memo,Debit,Credit,Account,Category,Cheque #,Type";
  const rows = transactions.map(t => {
    const date = formatDate(t.date, dateFormat);
    const desc = [t.payee, t.description].filter(Boolean).join(" — ").replace(/,/g, ";");
    return `${date},"${t.payee || ""}","${desc}","${t.memo || ""}",${t.debit > 0 ? t.debit.toFixed(2) : ""},${t.credit > 0 ? t.credit.toFixed(2) : ""},Checking,,${t.chequeNum || ""},${t.type}`;
  });
  return [header, ...rows].join("\n");
}

function downloadCSV(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* =================================================================
   PAGE COMPONENT
   ================================================================= */

export default function BankConverter() {
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [exportType, setExportType] = useState<"qbo" | "iif" | "journal">("qbo");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const processFile = useCallback((file: File) => {
    if (!file.name.match(/\.(csv|txt|qfx|ofx)$/i)) {
      alert("Please upload a CSV, QFX, OFX, or TXT file. PDF support requires manual CSV export from your bank.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseTransactions(file.name, text);
      if (result) {
        setParsedFile(result);
      } else {
        alert("Could not parse this file. Please ensure it's a valid bank statement CSV.");
      }
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const sortedTransactions = parsedFile
    ? [...parsedFile.transactions].sort((a, b) => {
        if (sortBy === "date") return a.date.localeCompare(b.date);
        return Math.abs(b.amount) - Math.abs(a.amount);
      })
    : [];

  const handleExport = () => {
    if (!parsedFile) return;
    let content = "";
    let ext = "csv";
    switch (exportType) {
      case "qbo": content = exportQBOCSV(sortedTransactions, dateFormat); ext = "csv"; break;
      case "iif": content = exportIIF(sortedTransactions, dateFormat); ext = "iif"; break;
      case "journal": content = exportJournalCSV(sortedTransactions, dateFormat); ext = "csv"; break;
    }
    if (!includeHeader) {
      content = content.split("\n").slice(1).join("\n");
    }
    const base = parsedFile.fileName.replace(/\.[^.]+$/, "");
    downloadCSV(content, `${base}_QBO_Ready.${ext}`);
  };

  const totalDebits = parsedFile?.transactions.reduce((s, t) => s + (t.amount < 0 ? Math.abs(t.amount) : 0), 0) || 0;
  const totalCredits = parsedFile?.transactions.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0) || 0;
  const net = totalCredits - totalDebits;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="h-6 w-6 text-lime-500" />
          Bank Statement → QBO Converter
        </h1>
        <p className="text-slate-500">
          Upload any Canadian bank CSV and get a clean, QBO-ready import file with correct dates.
        </p>
      </div>

      {/* Upload Area */}
      {!parsedFile && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center transition-all",
            isDragging ? "border-lime-500 bg-lime-50" : "border-slate-300 bg-slate-50"
          )}
        >
          <Upload className={cn("h-12 w-12 mx-auto mb-4", isDragging ? "text-lime-500" : "text-slate-400")} />
          <p className="text-lg font-medium text-slate-700 mb-2">
            {isDragging ? "Drop your bank statement here" : "Drag & drop your bank statement CSV"}
          </p>
          <p className="text-sm text-slate-500 mb-4">
            Supports: RBC, TD, Scotiabank, BMO, CIBC, Tangerine, Simplii, and generic CSV
          </p>
          <input
            type="file"
            accept=".csv,.txt,.qfx,.ofx"
            onChange={onFileInput}
            className="hidden"
            id="bank-file"
          />
          <Button variant="outline" onClick={() => document.getElementById("bank-file")?.click()}>
            <FileText className="h-4 w-4 mr-2" /> Browse Files
          </Button>
          <p className="text-xs text-slate-400 mt-4">
            PDF? Export to CSV from your online banking first, then upload here.
          </p>
        </div>
      )}

      {/* Results */}
      {parsedFile && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <p className="text-xs text-blue-600">Bank Detected</p>
                <p className="text-lg font-bold text-blue-800 flex items-center gap-1">
                  <Building2 className="h-4 w-4" /> {parsedFile.bank}
                </p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <p className="text-xs text-red-600">Total Debits</p>
                <p className="text-lg font-bold text-red-700">${totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-4">
                <p className="text-xs text-emerald-600">Total Credits</p>
                <p className="text-lg font-bold text-emerald-700">${totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
            <Card className={net >= 0 ? "bg-lime-50 border-lime-200" : "bg-amber-50 border-amber-200"}>
              <CardContent className="p-4">
                <p className="text-xs text-lime-600">Net Balance</p>
                <p className="text-lg font-bold text-lime-700">${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </CardContent>
            </Card>
          </div>

          {/* Export Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-lime-500" />
                Export Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    Date Format
                  </Label>
                  <Select value={dateFormat} onValueChange={setDateFormat}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (QBO US/CA)</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
                      <SelectItem value="DD-MMM-YYYY">DD-MMM-YYYY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-400" />
                    Export Format
                  </Label>
                  <Select value={exportType} onValueChange={(v) => setExportType(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qbo">QBO CSV (Date, Description, Amount)</SelectItem>
                      <SelectItem value="iif">QBO IIF (Desktop)</SelectItem>
                      <SelectItem value="journal">Journal Entry CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-slate-400" />
                    Sort By
                  </Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Date (Oldest First)</SelectItem>
                      <SelectItem value="amount">Amount (Largest First)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={includeHeader} onCheckedChange={setIncludeHeader} />
                  <Label className="text-sm">Include Header Row</Label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button className="bg-lime-500" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Download QBO File
                </Button>
                <Button variant="outline" onClick={() => { setParsedFile(null); setForm({}); }}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear & Upload New
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Transaction Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-lime-500" />
                Transaction Preview ({sortedTransactions.length} rows)
              </CardTitle>
              <CardDescription>
                Dates shown in <strong>{dateFormat}</strong> format for QBO import
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Payee / Description</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Debit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Credit</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedTransactions.slice(0, 100).map((t, i) => (
                        <tr key={t.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-xs">{formatDate(t.date, dateFormat)}</td>
                          <td className="px-3 py-2 max-w-xs truncate" title={t.description}>
                            <p className="font-medium text-slate-800">{t.payee || "—"}</p>
                            {t.memo && <p className="text-xs text-slate-400">{t.memo}</p>}
                          </td>
                          <td className="px-3 py-2 text-right text-red-600 font-medium">
                            {t.debit > 0 ? `-${t.debit.toFixed(2)}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-600 font-medium">
                            {t.credit > 0 ? `+${t.credit.toFixed(2)}` : ""}
                          </td>
                          <td className={cn(
                            "px-3 py-2 text-right font-bold",
                            t.amount < 0 ? "text-red-700" : t.amount > 0 ? "text-emerald-700" : "text-slate-400"
                          )}>
                            {t.amount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              t.type === "debit" ? "bg-red-50 text-red-600 border-red-200" :
                              t.type === "credit" ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                              "bg-slate-50 text-slate-500"
                            )}>
                              {t.type}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {sortedTransactions.length > 100 && (
                  <div className="p-3 bg-slate-50 text-center text-xs text-slate-500 border-t">
                    Showing first 100 of {sortedTransactions.length} transactions. All will be included in the export.
                  </div>
                )}
              </div>

              {/* Date Validation */}
              <div className="mt-4 flex items-center gap-2 text-sm">
                {sortedTransactions.every(t => parseDate(t.rawDate).valid) ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-emerald-700">All {sortedTransactions.length} dates parsed successfully</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-amber-700">
                      {sortedTransactions.filter(t => !parseDate(t.rawDate).valid).length} dates could not be parsed — check raw CSV
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
