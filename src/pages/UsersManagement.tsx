import { useState } from "react";
import { UserCog, Shield, Users, Crown, BookOpen, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";

const roleLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  admin: { label: "Admin / CFO", icon: Crown, color: "bg-purple-500" },
  senior_bookkeeper: { label: "Senior Bookkeeper", icon: BookOpen, color: "bg-blue-500" },
  junior_bookkeeper: { label: "Junior Bookkeeper", icon: GraduationCap, color: "bg-lime-500" },
  client: { label: "Client", icon: Users, color: "bg-slate-500" },
};

export default function UsersManagement() {
  const { data: users } = trpc.user.list.useQuery();
  const updateRole = trpc.user.updateRole.useMutation({
    onSuccess: () => utils.user.list.invalidate(),
  });
  const utils = trpc.useUtils();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <UserCog className="h-6 w-6 text-lime-500" />
          User Management
        </h1>
        <p className="text-slate-500">Manage staff roles and access levels</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff & Users</CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1 mr-3"><Crown className="h-3 w-3 text-purple-500" /> Admin: Full access</span>
            <span className="inline-flex items-center gap-1 mr-3"><BookOpen className="h-3 w-3 text-blue-500" /> Senior: Vault + QBO + AI</span>
            <span className="inline-flex items-center gap-1 mr-3"><GraduationCap className="h-3 w-3 text-lime-500" /> Junior: Basic tasks only</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!users || users.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No users found.</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => {
                const roleInfo = roleLabels[u.role] || roleLabels.junior_bookkeeper;
                const RoleIcon = roleInfo.icon;
                return (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full ${roleInfo.color} flex items-center justify-center text-white`}>
                        <RoleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{u.name || "Unnamed User"}</p>
                        <p className="text-xs text-slate-500">{u.email || "No email"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`${roleInfo.color} text-white`}>
                        {roleInfo.label}
                      </Badge>
                      <Select
                        value={u.role}
                        onValueChange={(v) => updateRole.mutate({ id: u.id, role: v as any })}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin / CFO</SelectItem>
                          <SelectItem value="senior_bookkeeper">Senior Bookkeeper</SelectItem>
                          <SelectItem value="junior_bookkeeper">Junior Bookkeeper</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
