import { useState } from "react";
import { useNavigate } from "react-router";
import { Plus, Mic, Calendar, Flag, ArrowLeft, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { format, addDays } from "date-fns";

export default function QuickAdd() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("today");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
  const [added, setAdded] = useState(false);

  const createTask = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
      setAdded(true);
      setTitle("");
      setTimeout(() => setAdded(false), 2000);
    }
  });

  // Natural-language "add a task for <client>: <what> by <when>" box.
  const [nl, setNl] = useState("");
  const [nlResult, setNlResult] = useState<string | null>(null);
  const quickAdd = trpc.task.quickAddFromText.useMutation({
    onSuccess: (r: any) => {
      utils.task.list.invalidate();
      const p = r.parsed;
      const who = p.matchedClient ? ` · ${p.clientName}` : "";
      const when = p.dueDate ? ` · due ${format(new Date(p.dueDate), "MMM d")}` : "";
      setNlResult(`Added: “${p.title}”${who}${when}${p.priority === "high" ? " · 🔥 high" : ""}`);
      setNl("");
      setTimeout(() => setNlResult(null), 4000);
    },
    onError: (e) => setNlResult(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let due: Date | undefined;
    if (dueDate === "today") due = new Date();
    else if (dueDate === "tomorrow") due = addDays(new Date(), 1);
    else if (dueDate === "week") due = addDays(new Date(), 7);

    createTask.mutate({
      title: title.trim(),
      dueDate: due,
      priority: priority as "low" | "medium" | "high",
      category: category || undefined,
    });
  };

  const quickDates = [
    { value: "today", label: "Today", icon: Calendar },
    { value: "tomorrow", label: "Tomorrow", icon: Calendar },
    { value: "week", label: "This Week", icon: Calendar },
    { value: "none", label: "No Date", icon: Calendar },
  ];

  const quickCategories = [
    "",
    "Client Work",
    "Admin",
    "Follow-up",
    "Billing",
    "Payroll",
    "HST",
    "Personal",
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="p-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-slate-800">Quick Add Task</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {/* Success toast */}
        {added && (
          <div className="mb-4 bg-lime-100 text-lime-700 px-4 py-3 rounded-lg flex items-center gap-2 animate-in fade-in">
            <Check className="h-5 w-5" />
            <span className="font-medium">Task added!</span>
          </div>
        )}

        {/* Natural-language quick add — type it like you'd text it. */}
        <div className="mb-5 p-4 rounded-xl border-2 border-lime-200 bg-lime-50/40">
          <Label className="text-sm font-semibold text-slate-700 mb-2 block">Type it like a text</Label>
          <div className="flex gap-2">
            <Input
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nl.trim()) quickAdd.mutate({ text: nl.trim() }); }}
              placeholder='e.g. "add a task for Clark Owen Sound: file HST by Friday"'
              className="text-base py-5"
            />
            <Button type="button" disabled={!nl.trim() || quickAdd.isPending} className="bg-lime-600 hover:bg-lime-700 px-5"
              onClick={() => quickAdd.mutate({ text: nl.trim() })}>
              {quickAdd.isPending ? "…" : "Add"}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mt-2">Figures out the client, due date (“Friday”, “tomorrow”, “by Jun 30”) and priority (“urgent”). The same parser will power the text-the-bot workflow.</p>
          {nlResult && <p className="text-sm text-lime-700 mt-2 font-medium">{nlResult}</p>}
        </div>

        <p className="text-xs uppercase font-semibold text-slate-400 mb-2">or fill it out manually</p>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Task Title */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-2 block">
              What needs to get done?
            </Label>
            <div className="relative">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Call Jon about payroll"
                className="text-lg py-6 pr-12"
                autoFocus
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-lime-600"
                onClick={() => {
                  // Trigger speech recognition if available
                  const input = document.querySelector("input");
                  if (input && "webkitSpeechRecognition" in window) {
                    const recognition = new (window as any).webkitSpeechRecognition();
                    recognition.lang = "en-US";
                    recognition.onresult = (e: any) => {
                      setTitle(e.results[0][0].transcript);
                    };
                    recognition.start();
                  }
                }}
              >
                <Mic className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Quick Date Buttons */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-2 block">
              When is it due?
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {quickDates.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDueDate(d.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                    dueDate === d.value
                      ? "border-lime-500 bg-lime-50 text-lime-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <d.icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-2 block">
              How urgent?
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "low", label: "Low", color: "bg-slate-100 text-slate-700 border-slate-200" },
                { value: "medium", label: "Medium", color: "bg-amber-50 text-amber-700 border-amber-200" },
                { value: "high", label: "High 🔥", color: "bg-red-50 text-red-700 border-red-200" },
              ].map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`p-3 rounded-lg border-2 font-medium transition-all ${
                    priority === p.value
                      ? "border-lime-500 bg-lime-50 text-lime-700 ring-2 ring-lime-200"
                      : p.color + " hover:opacity-80"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className="text-sm font-semibold text-slate-700 mb-2 block">
              Category (optional)
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {quickCategories.map((c) => (
                  <SelectItem key={c || "none"} value={c || "none"}>
                    {c || "No category"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!title.trim() || createTask.isPending}
            className="w-full py-6 text-lg font-bold bg-lime-600 hover:bg-lime-700 text-white"
          >
            {createTask.isPending ? (
              "Adding..."
            ) : (
              <>
                <Plus className="h-5 w-5 mr-2" />
                Add Task
              </>
            )}
          </Button>

          {/* View Tasks Link */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => navigate("/tasks")}
          >
            View All Tasks
          </Button>
        </form>

        {/* Pro tip */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-700">
            <strong>💡 Pro tip:</strong> Bookmark this page to your Android home screen for instant task adding!
          </p>
        </div>
      </div>
    </div>
  );
}
