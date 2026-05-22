import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { 
  Sun, 
  Moon, 
  CloudSun, 
  AlertCircle, 
  CheckSquare, 
  Flame, 
  Clock, 
  ChevronRight,
  Volume2,
  VolumeX,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function MorningBriefing() {
  const navigate = useNavigate();
  const [speakEnabled, setSpeakEnabled] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  
  const { data: briefing, isLoading, refetch } = trpc.agent.morningBriefing.useQuery();
  const { data: dailySummary } = trpc.agent.dailySummary.useQuery();
  
  // Text-to-speech for the briefing
  useEffect(() => {
    if (speakEnabled && briefing && "speechSynthesis" in window) {
      const text = buildSpeechText(briefing);
      if (text !== lastSpoken) {
        setLastSpoken(text);
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [speakEnabled, briefing, lastSpoken]);
  
  const buildSpeechText = (b: typeof briefing) => {
    if (!b) return "";
    let text = `${b.greeting}. `;
    
    if (b.summary.overdue > 0) {
      text += `You have ${b.summary.overdue} overdue task${b.summary.overdue > 1 ? 's' : ''}. `;
    }
    if (b.summary.highPriority > 0) {
      text += `You have ${b.summary.highPriority} high priority task${b.summary.highPriority > 1 ? 's' : ''}. `;
    }
    if (b.summary.today > 0) {
      text += `You have ${b.summary.today} task${b.summary.today > 1 ? 's' : ''} due today. `;
    }
    
    if (b.priorities.length > 0 && b.priorities[0].level !== "clear") {
      text += `Top priority: ${b.priorities[0].tasks[0]?.title || b.priorities[0].message}. `;
    }
    
    if (b.priorities.length === 0 || b.priorities[0].level === "clear") {
      text += "You're all caught up! Have a great day.";
    }
    
    return text;
  };
  
  const getGreetingIcon = () => {
    const hour = new Date().getHours();
    if (hour < 12) return <Sun className="h-6 w-6 text-amber-500" />;
    if (hour < 17) return <CloudSun className="h-6 w-6 text-orange-500" />;
    return <Moon className="h-6 w-6 text-indigo-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getGreetingIcon()}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {briefing?.greeting || "Good morning"}
            </h1>
            <p className="text-slate-500">
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="speak"
              checked={speakEnabled}
              onCheckedChange={setSpeakEnabled}
            />
            <Label htmlFor="speak" className="flex items-center gap-1 cursor-pointer">
              {speakEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Speak
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={cn(
          briefing && briefing.summary.overdue > 0 ? "border-red-300 bg-red-50/50" : "border-slate-200"
        )}>
          <CardContent className="p-4 text-center">
            <AlertCircle className={cn(
              "h-8 w-8 mx-auto mb-2",
              briefing && briefing.summary.overdue > 0 ? "text-red-500" : "text-slate-400"
            )} />
            <p className="text-2xl font-bold">{briefing?.summary.overdue ?? 0}</p>
            <p className="text-xs text-slate-500">Overdue</p>
          </CardContent>
        </Card>
        <Card className={cn(
          briefing && briefing.summary.today > 0 ? "border-amber-300 bg-amber-50/50" : "border-slate-200"
        )}>
          <CardContent className="p-4 text-center">
            <Clock className={cn(
              "h-8 w-8 mx-auto mb-2",
              briefing && briefing.summary.today > 0 ? "text-amber-500" : "text-slate-400"
            )} />
            <p className="text-2xl font-bold">{briefing?.summary.today ?? 0}</p>
            <p className="text-xs text-slate-500">Due Today</p>
          </CardContent>
        </Card>
        <Card className={cn(
          briefing && briefing.summary.highPriority > 0 ? "border-orange-300 bg-orange-50/50" : "border-slate-200"
        )}>
          <CardContent className="p-4 text-center">
            <Flame className={cn(
              "h-8 w-8 mx-auto mb-2",
              briefing && briefing.summary.highPriority > 0 ? "text-orange-500" : "text-slate-400"
            )} />
            <p className="text-2xl font-bold">{briefing?.summary.highPriority ?? 0}</p>
            <p className="text-xs text-slate-500">High Priority</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckSquare className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-2xl font-bold">{briefing?.summary.upcoming ?? 0}</p>
            <p className="text-xs text-slate-500">This Week</p>
          </CardContent>
        </Card>
      </div>

      {/* Priority List */}
      {briefing && briefing.priorities.length > 0 && (
        <Card className={cn(
          briefing.priorities[0].level === "critical" && "border-red-300",
          briefing.priorities[0].level === "high" && "border-orange-300",
          briefing.priorities[0].level === "today" && "border-amber-300",
        )}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {briefing.priorities[0].level === "critical" && <AlertCircle className="h-5 w-5 text-red-500" />}
              {briefing.priorities[0].level === "high" && <Flame className="h-5 w-5 text-orange-500" />}
              {briefing.priorities[0].level === "today" && <Clock className="h-5 w-5 text-amber-500" />}
              {briefing.priorities[0].level === "clear" && <Sun className="h-5 w-5 text-lime-500" />}
              Today's Priority
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {briefing.priorities.map((priority, idx) => (
              <div key={idx} className="space-y-2">
                <p className={cn(
                  "font-medium",
                  priority.level === "critical" && "text-red-700",
                  priority.level === "high" && "text-orange-700",
                  priority.level === "today" && "text-amber-700",
                )}>
                  {priority.message}
                </p>
                {priority.tasks.length > 0 && (
                  <div className="space-y-1">
                    {priority.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
                        onClick={() => navigate(`/tasks?focus=${task.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                          <span className="text-sm">{task.title}</span>
                        </div>
                        {task.priority && (
                          <Badge variant="outline" className={cn(
                            task.priority === "high" && "bg-red-50 text-red-700",
                            task.priority === "medium" && "bg-amber-50 text-amber-700",
                            task.priority === "low" && "bg-lime-50 text-lime-700",
                          )}>
                            {task.priority}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Task Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Due Today
            </CardTitle>
            <Badge variant="outline">{briefing?.allTasks.today.length ?? 0}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {(!briefing || briefing.allTasks.today.length === 0) ? (
              <p className="text-sm text-slate-400 text-center py-4">Nothing due today</p>
            ) : (
              briefing.allTasks.today.map((task) => (
                <div
                  key={task.id}
                  className="p-2 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                  onClick={() => navigate(`/tasks?focus=${task.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{task.title}</p>
                    <Badge variant="outline" className={cn(
                      task.priority === "high" && "bg-red-50 text-red-700",
                      task.priority === "medium" && "bg-amber-50 text-amber-700",
                      task.priority === "low" && "bg-lime-50 text-lime-700",
                    )}>
                      {task.priority}
                    </Badge>
                  </div>
                  {task.category && (
                    <p className="text-xs text-slate-500 mt-1">{task.category}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Overdue Tasks */}
        <Card className={cn(
          briefing && briefing.summary.overdue > 0 ? "border-red-200" : ""
        )}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Overdue
            </CardTitle>
            <Badge variant="destructive" className="bg-red-500">
              {briefing?.summary.overdue ?? 0}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {(!briefing || briefing.allTasks.overdue.length === 0) ? (
              <p className="text-sm text-slate-400 text-center py-4">No overdue tasks 🎉</p>
            ) : (
              briefing.allTasks.overdue.map((task) => (
                <div
                  key={task.id}
                  className="p-2 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100 cursor-pointer transition-colors"
                  onClick={() => navigate(`/tasks?focus=${task.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{task.title}</p>
                    <Badge variant="outline" className="bg-red-100 text-red-700">
                      {task.dueDate ? format(new Date(task.dueDate), "MMM d") : "No date"}
                    </Badge>
                  </div>
                  {task.category && (
                    <p className="text-xs text-red-400 mt-1">{task.category}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 justify-center">
        <Button onClick={() => navigate("/tasks")}>
          <CheckSquare className="h-4 w-4 mr-2" />
          Go to Tasks
        </Button>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Dashboard
        </Button>
      </div>
    </div>
  );
}
