import { useState } from "react";
import { Bot, Plus, Play, Trash2, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const agentTypes = [
  { value: "bookkeeper", label: "Go Fig Bookz", description: "Manages client books, reconciles accounts, tracks expenses" },
  { value: "executive_assistant", label: "Executive Assistant", description: "Manages calendar, drafts emails, schedules meetings" },
  { value: "sales_assistant", label: "Sales Assistant", description: "Follows up on leads, manages pipeline, sends proposals" },
  { value: "customer_support", label: "Customer Support", description: "Responds to client inquiries, resolves issues" },
  { value: "custom", label: "Custom Agent", description: "Fully customizable agent with your own configuration" },
];

export default function AIAgents() {
  const utils = trpc.useUtils();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { data: agents } = trpc.aiAgent.list.useQuery();
  const { data: runs } = trpc.aiAgent.listRuns.useQuery();
  const createAgent = trpc.aiAgent.create.useMutation({ onSuccess: () => { utils.aiAgent.list.invalidate(); setIsAddOpen(false); } });
  const deleteAgent = trpc.aiAgent.delete.useMutation({ onSuccess: () => utils.aiAgent.list.invalidate() });
  const createRun = trpc.aiAgent.createRun.useMutation({ onSuccess: () => utils.aiAgent.listRuns.invalidate() });

  const [newAgent, setNewAgent] = useState({ name: "", agentType: "custom" as const, description: "", systemPrompt: "", webhookUrl: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">AI Agents</h1>
          <p className="text-slate-500">Configure AI agents to automate your bookkeeping workflow</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> New Agent</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create AI Agent</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Name *</Label><Input value={newAgent.name} onChange={(e) => setNewAgent({...newAgent, name: e.target.value})} placeholder="e.g., Monthly Go Fig Bookz" /></div>
              <div className="space-y-2"><Label>Type</Label>
                <div className="space-y-2">
                  {agentTypes.map((type) => (
                    <div key={type.value} onClick={() => setNewAgent({...newAgent, agentType: type.value as typeof newAgent.agentType})} className={cn("p-3 border rounded-lg cursor-pointer transition-colors", newAgent.agentType === type.value ? "border-lime-500 bg-lime-50" : "hover:bg-slate-50")}>
                      <div className="flex items-center justify-between"><p className="font-medium">{type.label}</p>{newAgent.agentType === type.value && <CheckCircle className="h-4 w-4 text-lime-500" />}</div>
                      <p className="text-xs text-slate-500">{type.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input value={newAgent.description} onChange={(e) => setNewAgent({...newAgent, description: e.target.value})} /></div>
              <div className="space-y-2"><Label>System Prompt</Label><textarea className="w-full min-h-[80px] p-2 border rounded-md text-sm" value={newAgent.systemPrompt} onChange={(e) => setNewAgent({...newAgent, systemPrompt: e.target.value})} placeholder="Instructions for the AI agent..." /></div>
              <div className="space-y-2"><Label>Webhook URL (optional)</Label><Input value={newAgent.webhookUrl} onChange={(e) => setNewAgent({...newAgent, webhookUrl: e.target.value})} placeholder="https://your-ai-agent.com/webhook" /></div>
              <Button className="w-full" onClick={() => newAgent.name && createAgent.mutate(newAgent)}>Create Agent</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!agents || agents.length === 0 ? (
          <div className="col-span-full text-center py-16 text-slate-400"><Bot className="h-16 w-16 mx-auto mb-4 opacity-50" /><p>No AI agents configured yet</p></div>
        ) : agents.map((agent) => (
          <Card key={agent.id} className={cn(agent.isActive ? "border-lime-200" : "opacity-70")}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white"><Bot className="h-5 w-5" /></div>
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <CardDescription className="capitalize">{agent.agentType.replace("_", " ")}</CardDescription>
                  </div>
                </div>
                <Badge className={agent.isActive ? "bg-lime-500" : "bg-slate-400"}>{agent.isActive ? "Active" : "Inactive"}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 mb-4">{agent.description || "No description"}</p>
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                {agent.capabilities && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(agent.capabilities as Record<string, boolean>).filter(([, v]) => v).map(([k]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k.replace(/([A-Z])/g, " $1").trim()}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => createRun.mutate({ agentId: agent.id, triggerType: "manual" })}><Play className="h-3 w-3 mr-1" /> Run</Button>
                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => deleteAgent.mutate({ id: agent.id })}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Runs */}
      {runs && runs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /> Recent Runs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs.slice(0, 10).map((run) => (
                <div key={run.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {run.status === "completed" ? <CheckCircle className="h-4 w-4 text-lime-500" /> : run.status === "failed" ? <AlertCircle className="h-4 w-4 text-red-500" /> : <Clock className="h-4 w-4 text-amber-500" />}
                    <div>
                      <p className="text-sm font-medium">{run.triggerType} run</p>
                      <p className="text-xs text-slate-500">{run.startedAt ? format(new Date(run.startedAt), "MMM d, HH:mm") : ""}</p>
                    </div>
                  </div>
                  <Badge variant={run.status === "completed" ? "default" : run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
