import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/global.css";
import { Toaster } from "@/components/ui/overlays";
import { ConversationPage } from "@/features/conversation/ConversationPage";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { HistoryPage } from "@/features/history/HistoryPage";
import { PopupSettingsPage } from "@/features/popup-config/PopupSettingsPage";
import { GeneralPage } from "@/features/settings/GeneralPage";
import { TranslationPage } from "@/features/settings/TranslationPage";
import { Shell } from "@/features/shell/Shell";
import { ShortcutsPage } from "@/features/shortcuts/ShortcutsPage";
import { api, events, on } from "@/lib/ipc";
import { routeFromString, useNav } from "@/stores/navigation";
import { useSettings } from "@/stores/settings";
import { useSystem } from "@/stores/system";

function Router() {
  const route = useNav((s) => s.route);
  switch (route) {
    case "home":
      return <Dashboard />;
    case "history":
      return <HistoryPage />;
    case "conversation":
      return <ConversationPage />;
    case "translation":
      return <TranslationPage />;
    case "shortcuts":
      return <ShortcutsPage />;
    case "popup":
      return <PopupSettingsPage />;
    case "general":
      return <GeneralPage />;
  }
}

let readySent = false;

function App() {
  const loaded = useSettings((s) => s.settings !== null);

  useEffect(() => {
    const sys = useSystem.getState();
    (async () => {
      await useSettings.getState().load();
      await Promise.all([sys.refreshOcr(), sys.refreshProviders()]);
      setTimeout(async () => {
        if (readySent) return;
        readySent = true;
        const info = await api.app.ready();
        sys.setInfo(info);
        document.documentElement.classList.toggle("vibrant", info.vibrancy);
      }, 0);
    })();

    const offNav = on<string>(events.navigate, (r) => useNav.getState().go(routeFromString(r)));
    const onFocus = () => void useSystem.getState().refreshOcr();
    window.addEventListener("focus", onFocus);
    return () => {
      offNav();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!loaded) return null;
  return (
    <>
      <Shell>
        <Router />
      </Shell>
      <Toaster />
    </>
  );
}

window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea, .selectable")) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
