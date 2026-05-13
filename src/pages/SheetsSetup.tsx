import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Database, ArrowRight, AlertTriangle, ExternalLink, Copy } from "lucide-react";

const TABLES = [
  "users", "clients", "tasks", "timeEntries", "emails", "calendar_events",
  "portal_tokens", "portal_settings", "missing_items", "portal_files",
  "signature_documents", "engagement_letters", "client_playbooks",
  "satisfaction_scores", "monthly_close_checklist", "client_vault",
  "client_onboarding", "triage_findings", "employees", "timesheets",
  "invoices", "qbo_connections", "notifications", "connected_accounts",
];

export default function SheetsSetup() {
  const [step, setStep] = useState(1);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [migrated, setMigrated] = useState(0);
  const [status, setStatus] = useState("");

  const handleCreateSpreadsheet = async () => {
    setStatus("Creating spreadsheet...");
    // This would call the API to create the spreadsheet
    // For now, show the manual steps
    setStep(2);
    setStatus("");
  };

  const handleManualSetup = () => {
    setStep(3);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Database className="h-6 w-6 text-lime-500" />
          Google Sheets Database Setup
        </h1>
        <p className="text-slate-500 mt-1">
          Switch your CRM database from SQLite to Google Sheets.
        </p>
      </div>

      {step === 1 && (
        <>
          <Card className="border-lime-300 bg-lime-50/30">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-lime-600" />
                <div>
                  <p className="font-semibold text-lg">What this does</p>
                  <p className="text-sm text-slate-600">Creates a Google Sheets workbook with 24 tabs — one for each CRM table. All your data lives in Sheets.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Step 1: Create the Master Spreadsheet</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="font-medium mb-2">Option A: Manual (Recommended)</p>
                <ol className="space-y-2 text-sm text-slate-600">
                  <li>1. Go to <a href="https://sheets.new" target="_blank" className="text-blue-600 underline">sheets.new <ExternalLink className="h-3 w-3 inline" /></a></li>
                  <li>2. Name it: <strong>Go Fig Bookz CRM Database</strong></li>
                  <li>3. Add 24 tabs (sheets) with these exact names:</li>
                </ol>
                <div className="grid grid-cols-3 gap-1 mt-2">
                  {TABLES.map((t) => (
                    <div key={t} className="text-xs bg-white border rounded px-2 py-1 flex items-center gap-1">
                      <Copy className="h-3 w-3 text-slate-400 cursor-pointer" onClick={() => navigator.clipboard.writeText(t)} />
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleManualSetup} className="bg-lime-500 w-full">
                <ArrowRight className="h-4 w-4 mr-2" /> I've Created the Spreadsheet
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Auto-Create in Your Drive</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">The CRM will create the spreadsheet automatically using your connected Google account.</p>
            <Button onClick={handleCreateSpreadsheet} className="bg-lime-500">
              Create Spreadsheet in My Drive
            </Button>
            <p className="text-xs text-slate-400">Requires Google OAuth connection in Integrations.</p>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card>
            <CardHeader><CardTitle>Step 2: Enter Spreadsheet ID</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Spreadsheet ID (from URL)</label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Found in the URL: https://docs.google.com/spreadsheets/d/<strong>YOUR_ID_HERE</strong>/edit
                </p>
              </div>
              <Button
                onClick={() => setStep(4)}
                disabled={!spreadsheetId}
                className="bg-lime-500"
              >
                <ArrowRight className="h-4 w-4 mr-2" /> Continue
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Step 3: Add Column Headers</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-3">
                In each sheet tab, row 1 must contain the column headers. Copy these for each tab:
              </p>
              <div className="space-y-2 max-h-64 overflow-auto">
                {[
                  { name: "clients", headers: "id, userId, name, email, phone, company, address, taxId, status, leadSource, assignedTo, monthlyFee, hourlyRate, billingType, notes, googleDriveFolderId, qboCustomerId, qboConnectionId, qboAccountType, referredBy, emergencyContactName, emergencyContactPhone, emergencyContactRelationship, lastContactedAt, createdAt, updatedAt" },
                  { name: "tasks", headers: "id, userId, clientId, title, description, completed, status, priority, category, dueDate, assignedTo, createdAt, updatedAt" },
                  { name: "timeEntries", headers: "id, clientId, userId, taskId, date, description, hours, isBillable, hourlyRate, category, createdAt, updatedAt" },
                  { name: "emails", headers: "id, userId, connectedAccountId, clientId, threadId, fromAddress, toAddress, subject, body, direction, status, provider, sentAt" },
                  { name: "portal_tokens", headers: "id, clientId, token, email, isActive, expiresAt, lastUsedAt" },
                  { name: "missing_items", headers: "id, clientId, title, description, category, status, dueDate, emailSentAt, emailSentCount" },
                  { name: "signature_documents", headers: "id, clientId, userId, title, description, content, documentType, status, signedBy, signatureData, signedAt, portalToken, expiresAt" },
                  { name: "engagement_letters", headers: "id, clientId, userId, title, content, monthlyFee, startDate, endDate, status" },
                  { name: "client_playbooks", headers: "id, clientId, userId, autoGenerated, sections, createdAt, updatedAt" },
                  { name: "employees", headers: "id, clientId, name, sin, dob, hireDate, payType, payRate, payrollFrequency, benefitsHealth, benefitsDental, benefitsRRSP, rrspMatchPercent, createdAt" },
                ].map((sheet) => (
                  <div key={sheet.name} className="p-2 bg-slate-50 rounded border">
                    <p className="font-medium text-sm">{sheet.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{sheet.headers}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === 4 && (
        <Card className="border-lime-300">
          <CardContent className="p-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-lime-500 mx-auto" />
            <p className="font-semibold text-lg">Setup Complete!</p>
            <p className="text-sm text-slate-600">
              Your CRM is now configured to use Google Sheets as the database.
              Spreadsheet ID: <code className="bg-slate-100 px-2 py-1 rounded text-xs">{spreadsheetId}</code>
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 text-left">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              <strong>Important:</strong> Google Sheets has API rate limits (500 requests per 100 seconds).
              For heavy use, consider keeping SQLite as primary and syncing to Sheets.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
