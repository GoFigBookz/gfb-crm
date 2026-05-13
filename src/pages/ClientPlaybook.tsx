import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import {
  BookOpen,
  Save,
  RefreshCw,
  Pencil,
  CheckCircle,
  Calendar,
  Building,
  Users,
  Receipt,
  FileCheck,
  Shield,
  Notebook,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<string, React.ReactNode> = {
  calendar: <Calendar className="h-4 w-4" />,
  building: <Building className="h-4 w-4" />,
  users: <Users className="h-4 w-4" />,
  receipt: <Receipt className="h-4 w-4" />,
  "file-check": <FileCheck className="h-4 w-4" />,
  shield: <Shield className="h-4 w-4" />,
  notebook: <Notebook className="h-4 w-4" />,
};

interface PlaybookSection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

export default function ClientPlaybook() {
  const { can } = useAuth();
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [sections, setSections] = useState<PlaybookSection[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: clients } = trpc.crmClient.list.useQuery();
  const utils = trpc.useUtils();

  const { data: playbook, isLoading } = trpc.playbook.get.useQuery(
    { clientId: parseInt(selectedClient) },
    { enabled: !!selectedClient }
  );

  const update = trpc.playbook.update.useMutation({
    onSuccess: () => {
      utils.playbook.get.invalidate();
      setHasChanges(false);
    },
  });

  const regenerate = trpc.playbook.regenerate.useMutation({
    onSuccess: (data) => {
      if (data.sections) {
        setSections(data.sections as PlaybookSection[]);
      }
      utils.playbook.get.invalidate();
    },
  });

  // Load sections from playbook
  useEffect(() => {
    if (playbook?.sections) {
      try {
        const parsed = JSON.parse(playbook.sections);
        setSections(parsed);
      } catch {
        setSections([]);
      }
    } else {
      setSections([]);
    }
  }, [playbook]);

  const handleSave = () => {
    if (!selectedClient) return;
    update.mutate({
      clientId: parseInt(selectedClient),
      sections: JSON.stringify(sections),
    });
  };

  const handleSectionChange = (id: string, content: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, content } : s))
    );
    setHasChanges(true);
  };

  const handleSectionTitleChange = (id: string, title: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s))
    );
    setHasChanges(true);
  };

  const addSection = () => {
    const newSection: PlaybookSection = {
      id: `custom-${Date.now()}`,
      title: "New Section",
      icon: "notebook",
      content: "",
    };
    setSections([...sections, newSection]);
    setExpandedSection(newSection.id);
    setHasChanges(true);
  };

  const removeSection = (id: string) => {
    if (confirm("Delete this section?")) {
      setSections(sections.filter((s) => s.id !== id));
      setHasChanges(true);
    }
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === sections.length - 1) return;
    const newSections = [...sections];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newSections[index], newSections[swapIndex]] = [newSections[swapIndex], newSections[index]];
    setSections(newSections);
    setHasChanges(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-lime-500" />
          Client Playbook
        </h1>
        <p className="text-slate-500 mt-1">
          Per-client standard operating procedures — auto-generated from onboarding data and fully editable. Think of this as your internal cheat sheet for how to handle each client.
        </p>
      </div>

      {/* Client Selector */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label className="text-sm font-medium mb-2 block">Select Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a client to view their playbook..." />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedClient && can.senior && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => regenerate.mutate({ clientId: parseInt(selectedClient) })} disabled={regenerate.isPending}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                {hasChanges && (
                  <Button className="bg-lime-500 hover:bg-lime-600" onClick={handleSave} disabled={update.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Playbook Content */}
      {selectedClient && isLoading && (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin" />
          <p>Loading playbook...</p>
        </div>
      )}

      {selectedClient && !isLoading && (
        <div className="space-y-3">
          {/* Auto-generated badge */}
          {playbook?.autoGenerated && (
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <RefreshCw className="h-4 w-4" />
              This playbook was auto-generated from the client's onboarding data. Review and edit as needed.
            </div>
          )}

          {/* Sections */}
          {sections.map((section, index) => (
            <Card key={section.id} className={cn(expandedSection === section.id && "ring-1 ring-lime-300")}>
              <CardHeader className="py-3 px-4">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-slate-100 rounded text-slate-500">
                      {SECTION_ICONS[section.icon] || <Notebook className="h-4 w-4" />}
                    </div>
                    {expandedSection === section.id ? (
                      <Input
                        value={section.title}
                        onChange={(e) => handleSectionTitleChange(section.id, e.target.value)}
                        className="h-8 font-medium w-64"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {can.senior && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); moveSection(index, "up"); }}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); moveSection(index, "down"); }}
                          disabled={index === sections.length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                          onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {expandedSection === section.id ? (
                      <ChevronUp className="h-4 w-4 text-slate-400 ml-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400 ml-1" />
                    )}
                  </div>
                </div>
              </CardHeader>

              {expandedSection === section.id && (
                <CardContent className="pt-0 pb-4 px-4">
                  <Textarea
                    value={section.content}
                    onChange={(e) => handleSectionChange(section.id, e.target.value)}
                    rows={8}
                    placeholder="Enter procedures, deadlines, and notes for this section..."
                    className="text-sm font-mono"
                  />
                </CardContent>
              )}
            </Card>
          ))}

          {/* Add Section Button */}
          {can.senior && (
            <Button variant="outline" className="w-full border-dashed py-6" onClick={addSection}>
              <Plus className="h-4 w-4 mr-2" />
              Add Custom Section
            </Button>
          )}
        </div>
      )}

      {!selectedClient && (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-slate-400">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-lg">Select a client to view their playbook</p>
            <p className="text-sm mt-1">
              Each client gets their own SOP — filing deadlines, banking procedures, payroll schedules, HST details, special instructions, and more.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
