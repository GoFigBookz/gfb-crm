import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

/**
 * Simple in-app Back button for tool pages so you don't have to use the browser
 * back arrow. Goes to the previous page; if there's no history (deep link), falls
 * back to the provided `to` (default: Dashboard).
 */
export default function BackButton({ to = "/", label = "Back" }: { to?: string; label?: string }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 -ml-2 text-slate-500 hover:text-slate-800"
      onClick={() => { if (window.history.length > 1) navigate(-1); else navigate(to); }}
    >
      <ArrowLeft className="h-4 w-4 mr-1" /> {label}
    </Button>
  );
}
