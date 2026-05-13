import { useState } from "react";
import { ExternalLink, BookmarkPlus, Search, Globe, Calculator, FileText, Landmark, HeartPulse, Building2, Briefcase, BookOpen, Wrench, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ResourceLink {
  label: string;
  url: string;
  description?: string;
}

interface ResourceCategory {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  links: ResourceLink[];
}

const defaultCategories: ResourceCategory[] = [
  {
    icon: <Landmark className="h-5 w-5" />,
    title: "CRA & Tax",
    description: "Canada Revenue Agency portals and tax tools",
    color: "bg-red-50 text-red-700 border-red-200",
    links: [
      { label: "CRA My Business Account", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html", description: "Manage GST/HST, payroll, corporate tax accounts" },
      { label: "CRA Represent a Client", url: "https://www.canada.ca/en/revenue-agency/services/e-services/represent-a-client.html", description: "Access client tax information as a representative" },
      { label: "CRA Payroll Calculator", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/payroll-deductions-online-calculator.html", description: "Calculate source deductions" },
      { label: "GST/HST Netfile", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/gst-hst-netfile.html", description: "File GST/HST returns online" },
      { label: "CRA Auto-fill My Return", url: "https://www.canada.ca/en/revenue-agency/services/e-services/about-auto-fill-return.html", description: "Download client tax slips" },
      { label: "CRA RC59 Form", url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/forms/rc59.html", description: "Business consent for online access" },
    ],
  },
  {
    icon: <HeartPulse className="h-5 w-5" />,
    title: "WSIB & EHT",
    description: "Workplace Safety and Employer Health Tax",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    links: [
      { label: "WSIB Online Services", url: "https://www.wsib.ca/en/online-services", description: "Account management, e-clearance, premium reporting" },
      { label: "WSIB E-clearance", url: "https://www.wsib.ca/en/clearance-certificate", description: "Request/verify clearance certificates" },
      { label: "Ontario EHT", url: "https://www.ontario.ca/page/employer-health-tax", description: "Employer Health Tax information" },
      { label: "WSIB Rate Groups", url: "https://www.wsib.ca/en/rates", description: "Premium rate schedules by industry" },
    ],
  },
  {
    icon: <Briefcase className="h-5 w-5" />,
    title: "Payroll & Remittance",
    description: "Payroll services and remittance tools",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    links: [
      { label: "ROE Web (Service Canada)", url: "https://www.canada.ca/en/employment-social-development/services/roe.html", description: "Record of Employment online" },
      { label: "CRA PD7A", url: "https://www.canada.ca/en/revenue-agency/services/e-services/e-services-businesses/business-account.html", description: "Payroll remittance vouchers" },
      { label: "Ontario Employer Services", url: "https://www.ontario.ca/page/employers", description: "Ontario employer resources" },
    ],
  },
  {
    icon: <Calculator className="h-5 w-5" />,
    title: "Forms & Calculators",
    description: "CRA forms and calculation tools",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    links: [
      { label: "TD1 Federal Form", url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/td1.html", description: "Personal Tax Credits Return" },
      { label: "TD1ON Ontario Form", url: "https://www.canada.ca/en/revenue-agency/services/forms-publications/td1.html", description: "Ontario Tax Credits Return" },
      { label: "CRA CPP/EI Rates", url: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions.html", description: "Current year contribution rates" },
      { label: "CRA Prescribed Interest Rates", url: "https://www.canada.ca/en/revenue-agency/services/tax/prescribed-interest-rates.html", description: "Quarterly interest rates for loans" },
    ],
  },
  {
    icon: <Building2 className="h-5 w-5" />,
    title: "Corporations & Registry",
    description: "Ontario and federal corporate services",
    color: "bg-purple-50 text-purple-700 border-purple-200",
    links: [
      { label: "Ontario Business Registry", url: "https://www.ontario.ca/page/business-services", description: "Register/incorporate Ontario businesses" },
      { label: "Corporations Canada", url: "https://www.ic.gc.ca/eic/site/cd-dgc.nsf/eng/home", description: "Federal corporation search and filings" },
      { label: "NUANS Search", url: "https://www.ic.gc.ca/app/scr/cc/CorporationsCanada/fd/CRPRCR.html", description: "Business name search" },
    ],
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: "QuickBooks & Software",
    description: "Accounting software resources",
    color: "bg-green-50 text-green-700 border-green-200",
    links: [
      { label: "QuickBooks Online", url: "https://qbo.intuit.com/", description: "Sign in to QBO" },
      { label: "QuickBooks Apps", url: "https://apps.intuit.com/", description: "QBO app marketplace" },
      { label: "QBO Accountant Portal", url: "https://accountant.intuit.com/", description: "QuickBooks Online Accountant" },
      { label: "Hubdoc", url: "https://app.hubdoc.com/", description: "Document collection and data extraction" },
    ],
  },
];

export default function Resources() {
  const [search, setSearch] = useState("");
  const [customLinks, setCustomLinks] = useState<ResourceLink[]>(() => {
    try {
      const saved = localStorage.getItem("gofig-custom-resources");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [addOpen, setAddOpen] = useState(false);
  const [newLink, setNewLink] = useState({ label: "", url: "", description: "" });

  const handleAddCustom = () => {
    if (!newLink.label || !newLink.url) return;
    const updated = [...customLinks, newLink];
    setCustomLinks(updated);
    localStorage.setItem("gofig-custom-resources", JSON.stringify(updated));
    setNewLink({ label: "", url: "", description: "" });
    setAddOpen(false);
  };

  const removeCustom = (idx: number) => {
    const updated = customLinks.filter((_, i) => i !== idx);
    setCustomLinks(updated);
    localStorage.setItem("gofig-custom-resources", JSON.stringify(updated));
  };

  const filteredCategories = defaultCategories.map((cat) => ({
    ...cat,
    links: cat.links.filter(
      (l) =>
        l.label.toLowerCase().includes(search.toLowerCase()) ||
        l.description?.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => cat.links.length > 0);

  const filteredCustom = customLinks.filter(
    (l) =>
      l.label.toLowerCase().includes(search.toLowerCase()) ||
      l.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-lime-500" />
            Resources
          </h1>
          <p className="text-slate-500">Your cheat sheet — CRA portals, forms, calculators, and bookmarks</p>
        </div>
        <Button className="bg-lime-500" onClick={() => setAddOpen(true)}>
          <BookmarkPlus className="h-4 w-4 mr-2" /> Add Bookmark
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search resources..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Custom Bookmarks */}
      {filteredCustom.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookmarkPlus className="h-5 w-5 text-lime-500" />
              My Bookmarks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {filteredCustom.map((link, idx) => (
                <div key={idx} className="group relative">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-lime-50 text-lime-800 rounded-lg text-sm hover:bg-lime-100 transition-colors border border-lime-200"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {link.label}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                  <button
                    onClick={() => removeCustom(idx)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resource Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCategories.map((cat) => (
          <Card key={cat.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className={`p-1.5 rounded-md ${cat.color}`}>{cat.icon}</span>
                {cat.title}
              </CardTitle>
              <CardDescription>{cat.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {cat.links.map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <ExternalLink className="h-4 w-4 text-slate-400 mt-0.5 group-hover:text-lime-500 transition-colors flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{link.label}</p>
                    {link.description && (
                      <p className="text-xs text-slate-400">{link.description}</p>
                    )}
                  </div>
                </a>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Bookmark Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-5 w-5 text-lime-500" />
              Add Bookmark
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Label *</Label>
              <Input
                placeholder="e.g., TD Bank Business"
                value={newLink.label}
                onChange={(e) => setNewLink((l) => ({ ...l, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>URL *</Label>
              <Input
                placeholder="https://..."
                value={newLink.url}
                onChange={(e) => setNewLink((l) => ({ ...l, url: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description..."
                value={newLink.description}
                onChange={(e) => setNewLink((l) => ({ ...l, description: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button className="bg-lime-500" onClick={handleAddCustom} disabled={!newLink.label || !newLink.url}>
                Add Bookmark
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
