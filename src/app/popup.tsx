import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/global.css";
import { PopupCard, POPUP_MARGIN } from "@/features/popup/PopupCard";
import { api, events, isTauri, on } from "@/lib/ipc";
import { applyMotionPreference } from "@/lib/motion";
import type { PopupPayload } from "@/lib/types";

const isLive = new URLSearchParams(location.search).has("live");

function PopupApp() {
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.popup.current(isLive).then((p) => p && setPayload(p));
    return on<PopupPayload>(isLive ? events.liveState : events.popupState, (p) => {
      setPayload((prev) => {
        if (!prev || prev.job !== p.job) setPinned(false);
        return p;
      });
    });
  }, []);

  useEffect(() => {
    if (payload) applyMotionPreference(payload.reduceMotion);
  }, [payload?.reduceMotion, payload]);

  const present = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !payload) return;
    const r = el.getBoundingClientRect();
    void api.popup.present(payload.job, Math.ceil(r.width), Math.ceil(r.height), POPUP_MARGIN);
  }, [payload]);

  useLayoutEffect(() => {
    if (!payload) return;
    void document.fonts.ready.then(present);
  }, [payload, present]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(present, 16);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, [present]);

  const close = useCallback(() => void (isLive ? api.live.stop() : api.popup.close()), []);

  if (!payload) return null;

  return (
    <div ref={wrapRef} className="absolute left-0 top-0 inline-block" style={{ padding: POPUP_MARGIN }}>
      <PopupCard
        payload={payload}
        pinned={pinned}
        reduceMotion={payload.reduceMotion === true}
        onCopy={(text) => api.app.copy(text)}
        onClose={close}
        onPin={isLive ? undefined : (v) => {
          setPinned(v);
          void api.popup.pin(v);
        }}
        onAction={(action) => {
          if (action === "settings") {
            void api.app.openMain("settings/translation");
            close();
          } else {
            void api.capture.repeat();
          }
        }}
      />
    </div>
  );
}

if (isTauri) {
  window.addEventListener("contextmenu", (e) => {
    if (!(e.target as HTMLElement).closest(".selectable")) e.preventDefault();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
