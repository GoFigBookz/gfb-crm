import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle, AlertTriangle, Download } from "lucide-react";

interface ParsedRow {
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  status: string;
}

export default function ClientImport() {
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
      const row: any = {};
      headers.forEach((h, idx) => {
        if (h.includes("name")) row.name = values[idx] || "";
        else if (h.includes("email")) row.email = values[idx] || "";
        else if (h.includes("phone")) row.phone = values[idx] || "";
        else if (h.includes("company")) row.company = values[idx] || "";
        else if (h.includes("note")) row.notes = values[idx] || "";
        else if (h.includes("status")) row.status = values[idx] || "";
      });
      if (row.name) rows.push(row);
    }
    return rows;
  };

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".csv")) { alert("Please upload a CSV file"); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setParsedData(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Upload className="h-6 w-6 text-lime-500" />
          Client Import
        </h1>
        <p className="text-slate-500 mt-1">Bulk import client data from a CSV file.</p>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer ${
          isDragging ? "border-lime-400 bg-lime-50" : "border-slate-300 hover:bg-slate-50 hover:border-lime-400"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById("csv-upload")?.click()}
      >
        <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
        <p className="font-medium text-slate-600">Drop your CSV here or click to browse</p>
        <p className="text-sm text-slate-400 mt-1">Maps: Name, Email, Phone, Company, Notes, Status</p>
        <input id="csv-upload" type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      </div>

      {parsedData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Parsed Records ({parsedData.length})</CardTitle>
                <CardDescription>From: {fileName}</CardDescription>
              </div>
              <Badge variant="outline" className="bg-lime-50 text-lime-700">Ready to import</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-auto">
              {parsedData.map((row, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.email}{row.company && ` • ${row.company}`}</p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{row.status || "active"}</Badge>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="bg-lime-500 flex-1" onClick={() => alert("In a production build, this would create all clients in the CRM. Each row would be inserted via tRPC.crmClient.create.")}>
                <CheckCircle className="h-4 w-4 mr-2" /> Import {parsedData.length} Clients
              </Button>
              <Button variant="outline" onClick={() => setParsedData([])}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Expected CSV Format</CardTitle></CardHeader>
        <CardContent>
          <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-sm overflow-auto">
{`name,email,phone,company,notes,status
"Acme Corp","contact@acme.com","416-555-0100","Acme Inc","HST quarterly, payroll biweekly","active"
"Bob's Landscaping","bob@landscaping.ca","905-555-0200","Bob's Landscaping","Cleanup needed for 2024","prospect"`}
          </pre>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={() => {
              const csv = "name,email,phone,company,notes,status\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "client_import_template.csv"; a.click();
            }}>
              <Download className="h-3 w-3 mr-1" /> Download Template
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}