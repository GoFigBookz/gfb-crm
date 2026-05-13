import { useState } from "react";
import { Bell, User, Database, Moon, Sun, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: settingsData } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const settings = settingsData && "theme" in settingsData ? settingsData : null;

  const [theme, setTheme] = useState<string>(settings?.theme || "system");

  const handleNotificationToggle = (key: string, value: boolean) => {
    updateSettings.mutate({ [key]: value });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">Configure your CRM preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-blue-500" /> Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Name</Label><Input defaultValue="Admin User" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" defaultValue="admin@bookkeeper.com" /></div>
          </div>
          <div className="space-y-2"><Label>Company</Label><Input placeholder="Your bookkeeping company" /></div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5 text-purple-500" /> Appearance</CardTitle><CardDescription>Choose your preferred theme</CardDescription></CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {[
              { value: "light", icon: Sun, label: "Light" },
              { value: "dark", icon: Moon, label: "Dark" },
              { value: "system", icon: Monitor, label: "System" },
            ].map((t) => (
              <button key={t.value} onClick={() => setTheme(t.value)} className={cn("flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors", theme === t.value ? "border-lime-500 bg-lime-50" : "hover:bg-slate-50")}>
                <t.icon className="h-6 w-6" />
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-amber-500" /> Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "notifyTaskDue", label: "Task Due Soon", desc: "Get notified when tasks are due within 24 hours" },
            { key: "notifyTaskOverdue", label: "Overdue Tasks", desc: "Alerts for overdue tasks" },
            { key: "notifyInvoiceOverdue", label: "Invoice Overdue", desc: "Get notified when invoices become overdue" },
            { key: "notifyNewEmail", label: "New Emails", desc: "Notifications for new emails in unified inbox" },
            { key: "notifyCalendarEvent", label: "Calendar Events", desc: "Reminders for upcoming calendar events" },
            { key: "notifyClientActivity", label: "Client Activity", desc: "Notifications about client interactions" },
            { key: "notifyAIAgent", label: "AI Agent Alerts", desc: "Get notified about AI agent runs and alerts" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <div><p className="font-medium">{item.label}</p><p className="text-sm text-slate-500">{item.desc}</p></div>
              <Switch checked={settings ? (settings[item.key as keyof typeof settings] as boolean) ?? true : true} onCheckedChange={(v) => handleNotificationToggle(item.key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-slate-500" /> Data Management</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div><p className="font-medium">Export Data</p><p className="text-sm text-slate-500">Download all CRM data as JSON</p></div>
            <Button variant="outline">Export</Button>
          </div>
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
            <div><p className="font-medium text-red-900">Clear All Data</p><p className="text-sm text-red-500">Delete all clients, tasks, and invoices</p></div>
            <Button variant="destructive">Clear</Button>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-slate-400 pt-4">
        Enterprise Go Fig Bookz v2.0.0 • Self-hosted • Multi-account
      </div>
    </div>
  );
}
