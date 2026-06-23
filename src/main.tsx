import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Register the service worker so the app is installable on Android/iOS as a
// real app (home-screen, full-screen, offline shell). Best-effort.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
