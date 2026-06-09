import { useState } from "react";
import { useNavigate } from "react-router";
import { Shield, AlertTriangle, XCircle, Info, CheckCircle2, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

const severityConfig: Record<string, { icon: any; color: string; border: string; badge: "destructive" | "default" | "secondary"; rank: number }> = {
  critical: { icon: XCircle, color: "text-red-600", border: "border-l-red-500", badge: "destructive", rank: 0 },
  warning: { icon: AlertTriangle, color: "text-amber-600", border: "border-l-amber-500", badge: "default", rank: 1 },
  info: { icon: Info, color: "text-blue-600", border: "border-l-blue-500", badge: "secondary", rank: 2 },
};

export default function Triage() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"new" | "approved" | "dismissed">("new");
  const { data: findings, isLoading } = trpc.agentWebhook.listFindings.useQuery({ status: tab });
  const review = trpc.agentWebhook.reviewFinding.useMutation({
    onSuccess: () => {
      utils.agentWebhook.listFindings.invalidate();
    },
  });

  const items = [...(findings || [])].sort(
    (a: any, b: any) => (severityConfig[a.severity]?.rank ?? 9) - (severityConfig[b.severity]?.rank ?? 9)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Dashboard
        </Button>
        <Shield className="h-6 w-6 text-purple-500" />
        <h1 className="text-2xl font-bold text-slate-800">Figgy Junior &mdash; Triage</h1>
      </div>
      <p className="text-sm text-slate-500 -mt-2">
        Everything Figgy Jr has flagged for your review. Approve to accept, dismiss to clear.
      </p>

      <div className="flex gap-2">
        {(["new", "approved", "dismissed"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {isLoading && <p className="text-slate-500">Loading&hellip;</p>}

      {!isLoading && items.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-lime-500" />
            Nothing in "{tab}".
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((f: any) => {
          const cfg = severityConfig[f.severity] || severityConfig.info;
          const Icon = cfg.icon;
          return (
            <Card key={f.id} className={cn("border-l-4", cfg.border)}>
              <CardContent className="p-4 flex items-start gap-3">
                <Icon className={cn("h-5 w-5 mt-0.5 flex-shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{f.title}</span>
                    <Badge variant={cfg.badge} className="text-xs">{f.severity}</Badge>
                    {f.agentName && (
                      <Badge variant="outline" className="text-xs">{f.agentName}</Badge>
                    )}
                  </div>
                  {f.description && <p className="text-sm text-slate-600 break-words">{f.description}</p>}
                  {f.suggestedAction && (
                    <p className="text-xs text-slate-400 mt-1">Suggested: {f.suggestedAction}</p>
                  )}
                </div>
                {tab === "new" && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-lime-300 text-lime-700 hover:bg-lime-50"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: f.id, action: "approve" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-slate-500"
                      disabled={review.isPending}
                      onClick={() => review.mutate({ id: f.id, action: "dismiss" })}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
