import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/global.css";
import { Selection } from "@/features/overlay/Selection";
import { api, events, frameUrl, isTauri, on } from "@/lib/ipc";
import { applyMotionPreference } from "@/lib/motion";
import type { CssRect, OverlayOpen } from "@/lib/types";

const myIndex = Number(new URLSearchParams(location.search).get("m") ?? 0);

function OverlayApp() {
  const [session, setSession] = useState<{ open: OverlayOpen; url: string } | null>(null);

  useEffect(() => {
    const off = on<OverlayOpen>(events.overlayOpen, async (open) => {
      if (open.index !== myIndex) return;
      applyMotionPreference(open.reduceMotion);
      const url = await frameUrl(open.frameId, open.index);
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => undefined);
      setSession({ open, url });
      setTimeout(() => void api.overlay.ready(open.frameId, open.index), 0);
    });

    if (!isTauri) {
      void frameUrl(0, 0).then((url) =>
        setSession({
          url,
          open: { frameId: 0, index: 0, width: innerWidth, height: innerHeight, scale: devicePixelRatio, showMagnifier: true, reduceMotion: null, mode: new URLSearchParams(location.search).get("mode") === "live" ? "live" : "translate" },
        }),
      );
    }
    return off;
  }, []);

  const submit = useCallback(
    (rect: CssRect) => {
      if (!session) return;
      void api.overlay.submit(session.open.frameId, session.open.index, rect);
    },
    [session],
  );

  const cancel = useCallback(() => void api.overlay.cancel(), []);

  if (!session) return <div className="fixed inset-0 bg-black" />;
  return <Selection key={session.open.frameId} open={session.open} url={session.url} onSubmit={submit} onCancel={cancel} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);
