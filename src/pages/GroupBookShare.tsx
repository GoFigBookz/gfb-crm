import { useState } from "react";
import { useParams } from "react-router";
import { BookOpen } from "lucide-react";
import { GroupControlBookView } from "@/components/GroupControlBook";
import { trpc } from "@/providers/trpc";

/**
 * Public, token-gated, read-only Control Book — what the firm shares with the
 * group's owner (e.g. Jon) so he sees the consolidated view without a login.
 */
export default function GroupBookShare() {
  const { token } = useParams<{ token: string }>();
  const [fy, setFy] = useState<string | undefined>(undefined);
  const { data, isLoading } = trpc.groupBook.publicView.useQuery({ token: token!, fiscalYear: fy }, { enabled: !!token });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This link isn’t valid or has been revoked.</div>;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{data.groupName} — Control Book</h1>
            <p className="text-sm text-slate-500">
              Consolidated view prepared by Go Fig Bookz{data.label ? ` · ${data.label}` : ""} · read-only
              {data.generatedAt ? ` · ${new Date(data.generatedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })}` : ""}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <GroupControlBookView data={data} onFiscalYear={setFy} />
        </div>

        <p className="text-center text-xs text-slate-400">Prepared by Go Fig Bookz · figures recreated from your records · work in progress, for review.</p>
      </div>
    </div>
  );
}
