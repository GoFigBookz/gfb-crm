import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Smile, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function SatisfactionScores() {
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [score, setScore] = useState<string>("");
  const [notes, setNotes] = useState("");

  const { data: clients } = trpc.crmClient.list.useQuery();
  const utils = trpc.useUtils();

  // Get scores for selected client
  const { data: scores } = trpc.crmClient.getSatisfactionScores.useQuery(
    { clientId: parseInt(selectedClient) },
    { enabled: !!selectedClient }
  );

  const addScore = trpc.crmClient.addSatisfactionScore.useMutation({
    onSuccess: () => {
      utils.client.getSatisfactionScores.invalidate();
      setScore(""); setNotes("");
    },
  });

  const avgScore = scores && scores.length > 0
    ? (scores.reduce((s, r) => s + r.score, 0) / scores.length).toFixed(1)
    : "0";

  const latestScore = scores?.[0];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Smile className="h-6 w-6 text-lime-500" />
          Client Satisfaction
        </h1>
        <p className="text-slate-500 mt-1">Track satisfaction scores after check-in calls. Alert if score drops below 7.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select a client..." /></SelectTrigger>
            <SelectContent>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedClient && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Average Score</p>
                <p className={cn("text-3xl font-bold", parseFloat(avgScore) >= 8 ? "text-emerald-600" : parseFloat(avgScore) >= 6 ? "text-amber-600" : "text-red-600")}>
                  {avgScore}
                </p>
                <p className="text-xs text-slate-400">out of 10</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Latest Score</p>
                <p className={cn("text-3xl font-bold", (latestScore?.score || 0) >= 8 ? "text-emerald-600" : (latestScore?.score || 0) >= 6 ? "text-amber-600" : "text-red-600")}>
                  {latestScore?.score || "—"}
                </p>
                {latestScore?.createdAt && <p className="text-xs text-slate-400">{format(new Date(latestScore.createdAt), "MMM d, yyyy")}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Total Ratings</p>
                <p className="text-3xl font-bold">{scores?.length || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Alert if below 7 */}
          {latestScore && latestScore.score < 7 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <TrendingDown className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-700 font-medium">Latest score is {latestScore.score}/10 — below the threshold of 7. Consider a follow-up call.</p>
            </div>
          )}

          {/* Add Score */}
          <Card>
            <CardHeader><CardTitle className="text-base">Log New Score</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Score (1-10)</Label>
                <div className="flex gap-2 mt-2">
                  {Array.from({ length: 10 }, (_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => setScore((i + 1).toString())}
                      className={cn(
                        "w-9 h-9 rounded-lg text-sm font-bold transition-colors",
                        score === (i + 1).toString()
                          ? i + 1 >= 8 ? "bg-emerald-500 text-white" : i + 1 >= 6 ? "bg-amber-500 text-white" : "bg-red-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did the client say? Any concerns or praise?" rows={3} />
              </div>
              <Button
                onClick={() => addScore.mutate({ clientId: parseInt(selectedClient), score: parseInt(score), notes: notes || undefined })}
                disabled={!score || addScore.isPending}
                className="bg-lime-500"
              >
                {addScore.isPending ? "Saving..." : "Save Score"}
              </Button>
            </CardContent>
          </Card>

          {/* History */}
          {scores && scores.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Score History</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {scores.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm",
                        s.score >= 8 ? "bg-emerald-500" : s.score >= 6 ? "bg-amber-500" : "bg-red-500"
                      )}>{s.score}</span>
                      {s.notes && <p className="text-sm text-slate-600">{s.notes}</p>}
                    </div>
                    <span className="text-xs text-slate-400">{s.createdAt ? format(new Date(s.createdAt), "MMM d, yyyy") : ""}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
