import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/providers/trpc";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

function enableDemoMode() {
  localStorage.setItem("demo-mode", "true");
  window.location.reload();
}

export default function Login() {
  const navigate = useNavigate();
  const { refetch } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "kimi">("login");

  const loginMutation = trpc.localAuth.login.useMutation({
    onSuccess: async () => {
      await refetch();
      window.location.href = "/";
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-6">
          <img src="/assets/logo.jpg" alt="Go Fig Bookz" className="h-16 w-auto object-contain mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-800">Go Fig Bookz</h1>
          <p className="text-sm text-slate-500">Bookkeeping CRM</p>
        </div>
        <Card>
          <CardHeader className="text-center pb-2">
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to access your workspace</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Toggle between login modes */}
            <div className="flex rounded-lg bg-slate-100 p-1">
              <button
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${
                  mode === "login" ? "bg-white shadow text-slate-900" : "text-slate-500"
                }`}
                onClick={() => { setMode("login"); setError(""); }}
              >
                Email / Password
              </button>
              <button
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition ${
                  mode === "kimi" ? "bg-white shadow text-slate-900" : "text-slate-500"
                }`}
                onClick={() => { setMode("kimi"); setError(""); }}
              >
                Kimi OAuth
              </button>
            </div>

            {mode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="markie@gofig.ca"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>
                )}
                <Button
                  type="submit"
                  className="w-full bg-lime-600 hover:bg-lime-700"
                  size="lg"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            ) : (
              <Button
                className="w-full bg-slate-900 hover:bg-slate-800"
                size="lg"
                onClick={() => {
                  window.location.href = getOAuthUrl();
                }}
              >
                Sign in with Kimi
              </Button>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">or</span>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-lime-300 text-lime-700 hover:bg-lime-50"
              size="lg"
              onClick={enableDemoMode}
            >
              Try Demo Mode
            </Button>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-slate-400">
          Demo mode loads sample data for preview
        </p>
      </div>
    </div>
  );
}
