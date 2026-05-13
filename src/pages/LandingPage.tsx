import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Lock, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-24 w-auto mx-auto mb-6 object-contain" />
        <h1 className="text-3xl font-bold mb-2">Go Fig Bookz</h1>
        <p className="text-slate-400 mb-8">Internal Staff Portal</p>
        <div className="space-y-3">
          <Button size="lg" className="w-full bg-lime-500 hover:bg-lime-600 text-white" onClick={() => navigate("/login")}>
            <Lock className="h-5 w-5 mr-2" />
            Staff Login
          </Button>
          <Button size="lg" variant="outline" className="w-full border-white/20 text-white hover:bg-white/10" onClick={() => {
            localStorage.setItem("demo-mode", "true");
            window.location.href = "/";
          }}>
            Enter Demo Mode
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-8">
          New client? Visit <a href="https://gofig.ca" className="text-lime-400 underline">gofig.ca</a>
        </p>
      </div>
    </div>
  );
}
