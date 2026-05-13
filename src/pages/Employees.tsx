import { useState } from "react";
import { Briefcase, Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, DollarSign, Calendar, Award, HeartPulse, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

export default function Employees() {
  const { can } = useAuth();
  const [selectedClient, setSelectedClient] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: clients } = trpc.crmClient.list.useQuery();
  const { data: employees } = trpc.employee.list.useQuery(
    { clientId: selectedClient! },
    { enabled: !!selectedClient }
  );

  const create = trpc.employee.create.useMutation({ onSuccess: () => { utils.employee.list.invalidate(); setShowAdd(false); setForm({}); } });
  const update = trpc.employee.update.useMutation({ onSuccess: () => { utils.employee.list.invalidate(); setEditingId(null); } });
  const del = trpc.employee.delete.useMutation({ onSuccess: () => utils.employee.list.invalidate() });

  const utils = trpc.useUtils();

  const handleSave = () => {
    if (!selectedClient) return;
    const payload = {
      clientId: selectedClient,
      firstName: form.firstName || "",
      lastName: form.lastName || "",
      sin: form.sin || undefined,
      position: form.position || undefined,
      department: form.department || undefined,
      payType: (form.payType || "salary") as any,
      annualSalary: form.annualSalary ? parseFloat(form.annualSalary) : undefined,
      hourlyRate: form.hourlyRate ? parseFloat(form.hourlyRate) : undefined,
      hoursPerWeek: form.hoursPerWeek ? parseFloat(form.hoursPerWeek) : undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      isContractor: form.isContractor === "true",
      notes: form.notes || undefined,
    };
    if (editingId) {
      update.mutate({ id: editingId, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-lime-500" />
            Employee Management
          </h1>
          <p className="text-slate-500">Track all employees, contractors, and payroll details per client</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Client</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedClient?.toString() || ""} onValueChange={(v) => { setSelectedClient(Number(v)); setShowAdd(false); setEditingId(null); }}>
            <SelectTrigger><SelectValue placeholder="Choose a client..." /></SelectTrigger>
            <SelectContent className="max-h-72">
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name} — {c.company || "No company"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedClient && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{employees?.length || 0} Employees</h2>
            {can.senior && (
              <Button size="sm" className="bg-lime-500" onClick={() => { setShowAdd(true); setEditingId(null); setForm({}); }}>
                <Plus className="h-4 w-4 mr-1" /> Add Employee
              </Button>
            )}
          </div>

          {(showAdd || editingId) && can.senior && (
            <Card className="border-lime-300">
              <CardHeader>
                <CardTitle>{editingId ? "Edit Employee" : "Add New Employee"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>First Name *</Label><Input value={form.firstName || ""} onChange={e => setForm({...form, firstName: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Last Name *</Label><Input value={form.lastName || ""} onChange={e => setForm({...form, lastName: e.target.value})} /></div>
                  <div className="space-y-2"><Label>SIN</Label><Input value={form.sin || ""} onChange={e => setForm({...form, sin: e.target.value})} placeholder="123-456-789" /></div>
                  <div className="space-y-2"><Label>Position</Label><Input value={form.position || ""} onChange={e => setForm({...form, position: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Department</Label><Input value={form.department || ""} onChange={e => setForm({...form, department: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Pay Type</Label>
                    <Select value={form.payType || "salary"} onValueChange={v => setForm({...form, payType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="salary">Salary</SelectItem>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="commission">Commission</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Annual Salary ($)</Label><Input type="number" value={form.annualSalary || ""} onChange={e => setForm({...form, annualSalary: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Hourly Rate ($)</Label><Input type="number" value={form.hourlyRate || ""} onChange={e => setForm({...form, hourlyRate: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Hours/Week</Label><Input type="number" value={form.hoursPerWeek || "40"} onChange={e => setForm({...form, hoursPerWeek: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                  <div className="space-y-2"><Label>Contractor?</Label>
                    <Select value={form.isContractor || "false"} onValueChange={v => setForm({...form, isContractor: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Employee</SelectItem>
                        <SelectItem value="true">Contractor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Address</Label><Input value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} /></div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} className="bg-lime-500"><Save className="h-4 w-4 mr-1" /> Save</Button>
                  <Button variant="outline" onClick={() => { setShowAdd(false); setEditingId(null); }}><X className="h-4 w-4 mr-1" /> Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {employees?.map((emp) => {
              const isExpanded = expanded === emp.id;
              return (
                <Card key={emp.id} className={!emp.isActive ? "opacity-60" : ""}>
                  <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isExpanded ? null : emp.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-lime-400 to-blue-500 flex items-center justify-center text-white font-semibold">
                        {(emp.firstName?.[0] || "") + (emp.lastName?.[0] || "")}
                      </div>
                      <div>
                        <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-slate-500">{emp.position || "No position"} {emp.department ? `• ${emp.department}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={emp.isContractor ? "secondary" : "default"} className={!emp.isContractor ? "bg-lime-500" : ""}>
                        {emp.isContractor ? "Contractor" : "Employee"}
                      </Badge>
                      {emp.payType === "salary" && emp.annualSalary && (
                        <span className="text-sm font-medium">${emp.annualSalary.toLocaleString()}/yr</span>
                      )}
                      {emp.payType === "hourly" && emp.hourlyRate && (
                        <span className="text-sm font-medium">${emp.hourlyRate}/hr</span>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <CardContent className="border-t pt-4 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><p className="text-slate-500 text-xs">SIN</p><p className="font-medium">{emp.sin || "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Date of Birth</p><p className="font-medium">{emp.dateOfBirth ? format(new Date(emp.dateOfBirth), "MMM d, yyyy") : "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Hire Date</p><p className="font-medium">{emp.hireDate ? format(new Date(emp.hireDate), "MMM d, yyyy") : "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Start Date</p><p className="font-medium">{emp.startDate ? format(new Date(emp.startDate), "MMM d, yyyy") : "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Email</p><p className="font-medium">{emp.email || "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Phone</p><p className="font-medium">{emp.phone || "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Hours/Week</p><p className="font-medium">{emp.hoursPerWeek || "—"}</p></div>
                        <div><p className="text-slate-500 text-xs">Pay Type</p><p className="font-medium capitalize">{emp.payType || "—"}</p></div>
                      </div>
                      <div className="flex gap-3 pt-2">
                        {can.senior && (
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(emp.id); setForm({ ...emp as any }); setShowAdd(false); }}>
                            <Pencil className="h-3 w-3 mr-1" /> Edit
                          </Button>
                        )}
                        {can.senior && (
                          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => del.mutate({ id: emp.id })}>
                            <Trash2 className="h-3 w-3 mr-1" /> Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {(!employees || employees.length === 0) && (
              <p className="text-center text-slate-400 py-8">No employees for this client yet.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
