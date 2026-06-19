import { Component, type ReactNode } from "react";

/**
 * Catches render errors so a single broken page never blanks the whole app.
 * Also POSTs the error to /api/client-error so it can be read back server-side
 * (via the admin endpoint) — lets us diagnose white-screen crashes without
 * needing the browser console.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: any, info: any) {
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error?.message || String(error),
          stack: (error?.stack || "").slice(0, 4000),
          componentStack: (info?.componentStack || "").slice(0, 4000),
          url: typeof location !== "undefined" ? location.href : "",
          ts: Date.now(),
        }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* never throw from the boundary */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", color: "#334155" }}>
          <h2 style={{ color: "#dc2626", marginBottom: 8 }}>Something went wrong on this page.</h2>
          <p style={{ marginBottom: 16 }}>The rest of the app still works — use the menu to navigate, or reload.</p>
          <pre style={{ background: "#f1f5f9", padding: 12, borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>
            {this.state.message}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); history.back(); }}
            style={{ marginTop: 16, padding: "8px 16px", background: "#65a30d", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            ← Go back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
