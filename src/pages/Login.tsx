import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
            <Button
              className="w-full bg-slate-900 hover:bg-slate-800"
              size="lg"
              onClick={() => {
                window.location.href = getOAuthUrl();
              }}
            >
              Sign in with Kimi
            </Button>
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
