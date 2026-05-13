import { useState } from "react";
import { Lock, DollarSign, TrendingUp, TrendingDown, Users, Clock, Calendar, AlertTriangle, ArrowUpRight, ArrowDownRight, PiggyBank, Target, CreditCard, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/providers/trpc";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";

// Demo data for practice health
const practiceData = {
  revenue: {
    thisMonth: 18500,
    lastMonth: 16200,
    ytd: 142300,
    lastYearYtd: 128000,
    target: 200000,
  },
  clients: {
    total: 24,
    active: 21,
    prospects: 3,
    newThisMonth: 2,
    churned: 0,
  },
  billing: {
    totalInvoiced: 18500,
    totalPaid: 15200,
    outstanding: 3300,
    aging30: 2100,
    aging60: 900,
    aging90: 300,
  },
  staff: {
    totalHours: 340,
    billableHours: 285,
    utilizationRate: 84,
    seniorHours: 180,
    juniorHours: 105,
  },
  clientProfitability: [
    { name: "Acme Construction", revenue: 4200, cost: 2800, profit: 1400, margin: 33 },
    { name: "Smith Plumbing", revenue: 3500, cost: 1900, profit: 1600, margin: 46 },
    { name: "TechStart Inc", revenue: 6800, cost: 4200, profit: 2600, margin: 38 },
    { name: "Doe Consulting", revenue: 2200, cost: 1500, profit: 700, margin: 32 },
    { name: "Green Landscaping", revenue: 1800, cost: 1200, profit: 600, margin: 33 },
  ],
};

export default function PracticeHealth() {
  const [activeTab, setActiveTab] = useState("overview");

  const revenueChange = ((practiceData.revenue.thisMonth - practiceData.revenue.lastMonth) / practiceData.revenue.lastMonth) * 100;
  const ytdChange = ((practiceData.revenue.ytd - practiceData.revenue.lastYearYtd) / practiceData.revenue.lastYearYtd) * 100;
  const targetProgress = (practiceData.revenue.ytd / practiceData.revenue.target) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="h-6 w-6 text-lime-500" />
            Practice Health
          </h1>
          <p className="text-slate-500">Owner-only view of firm performance, revenue, and profitability</p>
        </div>
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          <Lock className="h-3 w-3 mr-1" /> Admin Only
        </Badge>
      </div>

      {/* Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 uppercase font-semibold">This Month</p>
              <Badge variant={revenueChange >= 0 ? "default" : "destructive"} className={revenueChange >= 0 ? "bg-lime-500" : ""}>
                {revenueChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {Math.abs(revenueChange).toFixed(1)}%
              </Badge>
            </div>
            <p className="text-2xl font-bold">${practiceData.revenue.thisMonth.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">vs ${practiceData.revenue.lastMonth.toLocaleString()} last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500 uppercase font-semibold">YTD Revenue</p>
              <Badge variant={ytdChange >= 0 ? "default" : "destructive"} className={ytdChange >= 0 ? "bg-lime-500" : ""}>
                {ytdChange >= 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {Math.abs(ytdChange).toFixed(1)}%
              </Badge>
            </div>
            <p className="text-2xl font-bold">${practiceData.revenue.ytd.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-1">vs ${practiceData.revenue.lastYearYtd.toLocaleString()} last year</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Annual Target</p>
            <p className="text-2xl font-bold">${practiceData.revenue.target.toLocaleString()}</p>
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Progress</span>
                <span className="font-medium">{targetProgress.toFixed(1)}%</span>
              </div>
              <Progress value={targetProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Outstanding</p>
            <p className="text-2xl font-bold text-amber-600">${practiceData.billing.outstanding.toLocaleString()}</p>
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              <div className="flex justify-between"><span>0-30 days</span><span>${practiceData.billing.aging30.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>31-60 days</span><span>${practiceData.billing.aging60.toLocaleString()}</span></div>
              <div className="flex justify-between text-red-500"><span>60+ days</span><span>${practiceData.billing.aging90.toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Client Profitability</TabsTrigger>
          <TabsTrigger value="staff">Staff Utilization</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-lime-500" />
                  Client Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Total Clients</span>
                  <span className="font-medium">{practiceData.clients.total}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Active</span>
                  <span className="font-medium text-lime-600">{practiceData.clients.active}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">New This Month</span>
                  <span className="font-medium">{practiceData.clients.newThisMonth}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Churned</span>
                  <span className="font-medium text-red-600">{practiceData.clients.churned}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Avg Revenue/Client</span>
                  <span className="font-medium">${Math.round(practiceData.revenue.thisMonth / practiceData.clients.active).toLocaleString()}/mo</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-lime-500" />
                  Billing Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Total Invoiced</span>
                  <span className="font-medium">${practiceData.billing.totalInvoiced.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 bg-lime-50 rounded">
                  <span className="text-sm text-slate-600">Total Paid</span>
                  <span className="font-medium text-lime-600">${practiceData.billing.totalPaid.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 bg-amber-50 rounded">
                  <span className="text-sm text-slate-600">Outstanding</span>
                  <span className="font-medium text-amber-600">${practiceData.billing.outstanding.toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Collection Rate</span>
                  <span className="font-medium">{Math.round((practiceData.billing.totalPaid / practiceData.billing.totalInvoiced) * 100)}%</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Days Sales Outstanding</span>
                  <span className="font-medium">{Math.round((practiceData.billing.outstanding / practiceData.billing.totalInvoiced) * 30)} days</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-lime-500" />
                  Staff This Month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Total Hours</span>
                  <span className="font-medium">{practiceData.staff.totalHours}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Billable Hours</span>
                  <span className="font-medium text-lime-600">{practiceData.staff.billableHours}</span>
                </div>
                <div className="flex justify-between p-2 bg-slate-50 rounded">
                  <span className="text-sm text-slate-600">Utilization</span>
                  <span className="font-medium">{practiceData.staff.utilizationRate}%</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Senior BK</span>
                    <span>{practiceData.staff.seniorHours} hrs</span>
                  </div>
                  <Progress value={(practiceData.staff.seniorHours / practiceData.staff.totalHours) * 100} className="h-1.5 mb-2" />
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Junior BK</span>
                    <span>{practiceData.staff.juniorHours} hrs</span>
                  </div>
                  <Progress value={(practiceData.staff.juniorHours / practiceData.staff.totalHours) * 100} className="h-1.5" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clients" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Client Profitability (This Month)</CardTitle>
              <CardDescription>Revenue minus estimated cost = profit margin</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {practiceData.clientProfitability.map((client) => (
                  <div key={client.name} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{client.name}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                        <span>Revenue: ${client.revenue.toLocaleString()}</span>
                        <span>Cost: ${client.cost.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lime-600">${client.profit.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">{client.margin}% margin</p>
                    </div>
                    <div className="w-24">
                      <Progress value={client.margin} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t flex justify-between text-sm font-medium">
                <span>Total</span>
                <span className="text-lime-600">${practiceData.clientProfitability.reduce((s, c) => s + c.profit, 0).toLocaleString()} profit</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <Card>
            <CardContent className="p-8 text-center text-slate-400">
              <Target className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>Staff utilization details will pull from timesheet data.</p>
              <p className="text-sm mt-1">Connect to your time tracking system for live data.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="mt-4">
          <Card>
            <CardContent className="p-8 text-center text-slate-400">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p>Revenue and client trend charts will appear here.</p>
              <p className="text-sm mt-1">Historical data builds over time as you use the CRM.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
