import { useState, useEffect } from "react";
import { UserCog, Users, Crown, BookOpen, GraduationCap, Plus, ShieldCheck, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";

const roleLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  admin: { label: "Admin / CFO", icon: Crown, color: "bg-purple-500" },
  senior_bookkeeper: { label: "Senior Bookkeeper", icon: BookOpen, color: "bg-blue-500" },
  junior_bookkeeper: { label: "Junior Bookkeeper", icon: GraduationCap, color: "bg-lime-500" },
  client: { label: "Client", icon: Users, color: "bg-slate-500" },
};

const seesAll = (role: string) => role === "admin" || role === "senior_bookkeeper";

export default function UsersManagement() {
  const utils = trpc.useUtils();
  const { data: users } = trpc.user.list.useQuery();
  const updateRole = trpc.user.updateRole.useMutation({ onSuccess: () => utils.user.list.invalidate() });
  const setActive = trpc.user.setActive.useMutation({ onSuccess: () => utils.user.list.invalidate() });
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<any | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="h-6 w-6 text-lime-500" /> User Management
          </h1>
          <p className="text-slate-500">Add staff, set roles, and grant per-client access.</p>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> Add user</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff &amp; Users</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1 mr-3"><Crown className="h-3 w-3 text-purple-500" /> Admin: full access</span>
            <span className="inline-flex items-center gap-1 mr-3"><BookOpen className="h-3 w-3 text-blue-500" /> Senior: all clients + vault/QBO/AI</span>
            <span className="inline-flex items-center gap-1 mr-3"><GraduationCap className="h-3 w-3 text-lime-500" /> Junior: only granted clients</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!users || users.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No users found.</p>
          ) : (
            <div className="space-y-3">
              {users.map((u: any) => {
                const roleInfo = roleLabels[u.role] || roleLabels.junior_bookkeeper;
                const RoleIcon = roleInfo.icon;
                return (
                  <div key={u.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg ${u.isActive === false ? "bg-red-50/60" : "bg-slate-50"}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full ${roleInfo.color} flex items-center justify-center text-white`}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium flex items-center gap-2">{u.name || "Unnamed User"}
                          {u.isActive === false && <span className="text-[10px] text-red-500 font-normal">(deactivated)</span>}
                          {u.restrictedToClients && !seesAll(u.role) && <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 font-normal"><Lock className="h-3 w-3" /> restricted</span>}
                        </p>
                        <p className="text-xs text-slate-500">{u.email || "No email"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!seesAll(u.role) && (
                        <Button size="sm" variant="outline" onClick={() => setManaging(u)}>
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Client access
                        </Button>
                      )}
                      <Select value={u.role} onValueChange={(v) => updateRole.mutate({ id: u.id, role: v as any })}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin / CFO</SelectItem>
                          <SelectItem value="senior_bookkeeper">Senior Bookkeeper</SelectItem>
                          <SelectItem value="junior_bookkeeper">Junior Bookkeeper</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className={u.isActive === false ? "text-lime-600" : "text-red-400 hover:text-red-600"}
                        onClick={() => setActive.mutate({ userId: u.id, isActive: u.isActive === false })}>
                        {u.isActive === false ? "Reactivate" : "Deactivate"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {adding && <AddUserDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); utils.user.list.invalidate(); }} />}
      {managing && <ClientAccessDialog user={managing} onClose={() => setManaging(null)} onDone={() => { setManaging(null); utils.user.list.invalidate(); }} />}
    </div>
  );
}

function AddUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("junior_bookkeeper");
  const register = trpc.localAuth.register.useMutation({ onSuccess: onDone, onError: (e) => alert(e.message) });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add user</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div><Label className="text-xs">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label className="text-xs">Temporary password</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters — share with them to change later" /></div>
          <div><Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin / CFO</SelectItem>
                <SelectItem value="senior_bookkeeper">Senior Bookkeeper (sees all clients)</SelectItem>
                <SelectItem value="junior_bookkeeper">Junior Bookkeeper</SelectItem>
                <SelectItem value="client">Client (portal)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-slate-400">Admins &amp; seniors see every client. For a junior, add them then click <b>Client access</b> to limit them to specific clients.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={register.isPending || !email || !name || password.length < 8}
              onClick={() => register.mutate({ email: email.trim(), name: name.trim(), password, role: role as any })}>
              {register.isPending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClientAccessDialog({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const { data: clients } = trpc.crmClient.list.useQuery({ status: "all", limit: 100 });
  const { data: grants } = trpc.user.clientAccess.useQuery({ userId: user.id });
  const [restricted, setRestricted] = useState<boolean>(!!user.restrictedToClients);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  useEffect(() => { if (grants?.clientIds) setSelected(new Set(grants.clientIds)); }, [grants]);

  const setRestrictedM = trpc.user.setRestricted.useMutation();
  const setAccessM = trpc.user.setClientAccess.useMutation();
  const save = async () => {
    await setRestrictedM.mutateAsync({ userId: user.id, restricted });
    await setAccessM.mutateAsync({ userId: user.id, clientIds: Array.from(selected) });
    onDone();
  };
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const list = (clients || []).filter((c: any) => !search || c.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Client access — {user.name || user.email}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-2.5">
            <input type="checkbox" className="w-4 h-4 accent-lime-500" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
            <span><b>Restrict to selected clients only.</b> When off, this user sees every client (default).</span>
          </label>
          {restricted && (
            <>
              <Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{selected.size} selected</span>
                <div className="flex gap-2">
                  <button className="hover:underline" onClick={() => setSelected(new Set(list.map((c: any) => c.id)))}>Select all</button>
                  <button className="hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
              </div>
              <div className="border rounded-lg max-h-72 overflow-auto divide-y">
                {list.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" className="w-4 h-4 accent-lime-500" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    {c.name} {c.status !== "active" && <span className="text-[10px] text-slate-400">({c.status})</span>}
                  </label>
                ))}
                {list.length === 0 && <p className="text-xs text-slate-400 p-3 text-center">No clients match.</p>}
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={setAccessM.isPending || setRestrictedM.isPending} onClick={save}>
              {setAccessM.isPending || setRestrictedM.isPending ? "Saving…" : "Save access"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
