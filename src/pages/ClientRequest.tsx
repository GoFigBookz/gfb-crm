import { useState } from "react";
import { useParams } from "react-router";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";

/** Public, token-gated page: the client's document/info to-do list. */
export default function ClientRequest() {
  const { token } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.public.clientRequestGet.useQuery({ token: token! }, { enabled: !!token });
  const submit = trpc.public.clientRequestSubmitItem.useMutation({
    onSuccess: () => utils.public.clientRequestGet.invalidate({ token: token! }),
    onError: (e) => alert(e.message),
  });
  const [notes, setNotes] = useState<Record<number, string>>({});

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This request link isn’t valid or has expired.</div>;

  const done = data.items.filter((i: any) => i.status === "provided").length;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-lime-600" />
          <h1 className="text-xl font-bold text-slate-900">{data.title}</h1>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{data.clientName}</CardTitle>
            {data.message && <p className="text-sm text-slate-600">{data.message}</p>}
            <p className="text-xs text-slate-500">
              {done} of {data.items.length} provided{data.dueDate ? ` · due ${format(new Date(data.dueDate), "MMM d, yyyy")}` : ""}
              {data.status === "completed" ? " · all done — thank you!" : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.items.map((it: any) => {
              const provided = it.status === "provided";
              return (
                <div key={it.id} className={`rounded-lg border p-3 ${provided ? "bg-lime-50/50 border-lime-200" : "bg-white"}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => submit.mutate({ token: token!, itemId: it.id, status: provided ? "pending" : "provided", response: notes[it.id] ?? it.response ?? undefined })}
                      className="mt-0.5 shrink-0" title={provided ? "Mark not done" : "Mark provided"}>
                      {provided ? <CheckCircle2 className="h-5 w-5 text-lime-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${provided ? "text-slate-500 line-through" : ""}`}>{it.label}</p>
                      {!provided && (
                        <div className="flex gap-2 mt-2">
                          <Input
                            defaultValue={it.response || ""}
                            onChange={(e) => setNotes({ ...notes, [it.id]: e.target.value })}
                            placeholder="Add a note or a link (optional)…"
                            className="h-8 text-xs"
                          />
                          <Button size="sm" className="h-8" onClick={() => submit.mutate({ token: token!, itemId: it.id, status: "provided", response: notes[it.id] ?? it.response ?? undefined })}>
                            Mark provided
                          </Button>
                        </div>
                      )}
                      {provided && it.response && <p className="text-xs text-slate-500 mt-0.5">{it.response}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <p className="text-[11px] text-slate-400 text-center">Tick each item once you've sent it. Your bookkeeper sees updates in real time. Email any documents you can't link here.</p>
      </div>
    </div>
  );
}
