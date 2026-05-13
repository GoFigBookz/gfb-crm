import { useState } from "react";
import { Upload, FolderOpen, Search, File, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Files() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<string>("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: filesList } = trpc.file.list.useQuery({ search: search || undefined, provider: provider === "all" ? undefined : provider as "google_drive" | "one_drive" | "local" });
  const { data: stats } = trpc.file.stats.useQuery();
  const createFile = trpc.file.create.useMutation({ onSuccess: () => { utils.file.list.invalidate(); setIsAddOpen(false); } });

  const [newFile, setNewFile] = useState({ name: "", provider: "local" as const, webViewLink: "" });

  const formatSize = (bytes?: number) => {
    if (!bytes) return "-";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Files</h1>
          <p className="text-slate-500">All your files from Google Drive, OneDrive, and local storage</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild><Button><Upload className="h-4 w-4 mr-2" /> Add File</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add File Reference</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2"><Label>Name *</Label><Input value={newFile.name} onChange={(e) => setNewFile({...newFile, name: e.target.value})} /></div>
              <div className="space-y-2"><Label>Provider</Label>
                <Select value={newFile.provider} onValueChange={(v) => setNewFile({...newFile, provider: v as typeof newFile.provider})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="local">Local</SelectItem><SelectItem value="google_drive">Google Drive</SelectItem><SelectItem value="one_drive">OneDrive</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Link</Label><Input value={newFile.webViewLink} onChange={(e) => setNewFile({...newFile, webViewLink: e.target.value})} /></div>
              <Button className="w-full" onClick={() => newFile.name && createFile.mutate(newFile)}>Add File</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><FolderOpen className="h-5 w-5 text-lime-500" /><div><p className="text-sm text-slate-500">Total</p><p className="text-xl font-bold">{stats?.total ?? 0}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><File className="h-5 w-5 text-red-500" /><div><p className="text-sm text-slate-500">Google Drive</p><p className="text-xl font-bold">{stats?.googleDrive ?? 0}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><File className="h-5 w-5 text-blue-500" /><div><p className="text-sm text-slate-500">OneDrive</p><p className="text-xl font-bold">{stats?.oneDrive ?? 0}</p></div></div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-3"><File className="h-5 w-5 text-slate-500" /><div><p className="text-sm text-slate-500">Local</p><p className="text-xl font-bold">{stats?.local ?? 0}</p></div></div></CardContent></Card>
      </div>

      <Card><CardContent className="p-4 flex gap-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder="Search files..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Sources</SelectItem><SelectItem value="google_drive">Google Drive</SelectItem><SelectItem value="one_drive">OneDrive</SelectItem><SelectItem value="local">Local</SelectItem></SelectContent>
        </Select>
      </CardContent></Card>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {!filesList || filesList.length === 0 ? (
          <div className="col-span-full text-center py-16 text-slate-400"><FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-50" /><p>No files found</p></div>
        ) : filesList.map((file) => (
          <Card key={file.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-slate-100 rounded-lg"><File className="h-6 w-6 text-slate-600" /></div>
                <Badge variant="outline" className={cn(file.provider === "google_drive" ? "bg-red-50 text-red-700" : file.provider === "one_drive" ? "bg-blue-50 text-blue-700" : "bg-slate-50")}>{file.provider}</Badge>
              </div>
              <h4 className="font-medium text-slate-900 truncate" title={file.name}>{file.name}</h4>
              <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                <span>{formatSize(file.size ?? undefined)}</span>
                <span>{file.createdAt ? format(new Date(file.createdAt), "MMM d") : ""}</span>
              </div>
              {file.webViewLink && <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => window.open(file.webViewLink!, "_blank")}><ExternalLink className="h-3 w-3 mr-1" /> Open</Button>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
