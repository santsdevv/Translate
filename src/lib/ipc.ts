import type {
  AppInfo,
  CssRect,
  HistoryPage,
  HistoryQuery,
  HistoryStats,
  OcrStatus,
  PopupPayload,
  Provider,
  ProviderStatus,
  Settings,
  ShortcutFailure,
  UpdateResult,
} from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    const { mockInvoke } = await import("./mock");
    return mockInvoke(cmd, args) as Promise<T>;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export type Unlisten = () => void;

export function on<T>(event: string, handler: (payload: T) => void): Unlisten {
  let disposed = false;
  let unlisten: Unlisten | null = null;
  (async () => {
    if (!isTauri) {
      const { mockListen } = await import("./mock");
      unlisten = mockListen(event, handler as (p: unknown) => void);
    } else {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen<T>(event, (e) => handler(e.payload));
    }
    if (disposed) unlisten();
  })();
  return () => {
    disposed = true;
    unlisten?.();
  };
}

export const events = {
  overlayOpen: "overlay://open",
  popupState: "popup://state",
  historyChanged: "history://changed",
  settingsChanged: "settings://changed",
  navigate: "app://navigate",
  liveState: "live://state",
  liveActive: "live://active",
  ocrChanged: "ocr://changed",
} as const;

export const api = {
  app: {
    ready: () => call<AppInfo>("app_ready"),
    info: () => call<AppInfo>("app_info"),
    openMain: (route?: string) => call<void>("open_main", { route }),
    copy: (text: string) => call<void>("copy_text", { text }),
    openUrl: (url: string) => call<void>("open_url", { url }),
  },
  settings: {
    get: () => call<Settings>("settings_get"),
    update: (settings: Settings) => call<UpdateResult>("settings_update", { settings }),
    reset: () => call<UpdateResult>("settings_reset"),
  },
  shortcuts: {
    suspend: (suspended: boolean) => call<void>("shortcuts_suspend", { suspended }),
    validate: (accelerator: string) => call<void>("shortcut_validate", { accelerator }),
    status: () => call<ShortcutFailure[]>("shortcuts_status"),
  },
  providers: {
    status: () => call<ProviderStatus[]>("provider_status"),
    setKey: (provider: Provider, key: string) => call<void>("provider_set_key", { provider, key }),
    test: (provider: Provider) => call<number>("provider_test", { provider }),
  },
  ocr: {
    status: () => call<OcrStatus>("ocr_status"),
    install: (code: string) => call<void>("ocr_install", { code }),
    openLanguageSettings: () => call<void>("open_language_settings"),
  },
  capture: {
    start: () => call<void>("capture_start"),
    repeat: () => call<void>("capture_repeat"),
  },
  live: {
    toggle: () => call<void>("live_toggle"),
    stop: () => call<void>("live_stop"),
    status: () => call<boolean>("live_status"),
    conversationLanguage: () => call<string | null>("conversation_language"),
  },
  overlay: {
    ready: (frameId: number, index: number) => call<void>("overlay_ready", { frameId, index }),
    submit: (frameId: number, index: number, rect: CssRect) =>
      call<void>("overlay_submit", {
        frameId,
        index,
        rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    cancel: () => call<void>("overlay_cancel"),
  },
  popup: {
    current: (live = false) => call<PopupPayload | null>("popup_current", { live }),
    present: (job: number, width: number, height: number, margin: number) =>
      call<void>("popup_present", { job, width, height, margin }),
    close: () => call<void>("popup_close"),
    pin: (pinned: boolean) => call<void>("popup_pin", { pinned }),
  },
  history: {
    list: (query: HistoryQuery) => call<HistoryPage>("history_list", { query }),
    stats: () => call<HistoryStats>("history_stats"),
    favorite: (id: number, favorite: boolean) => call<void>("history_favorite", { id, favorite }),
    remove: (id: number) => call<void>("history_delete", { id }),
    clear: (keepFavorites: boolean) => call<number>("history_clear", { keepFavorites }),
    export: (format: "json" | "csv") => call<string | null>("history_export", { format }),
  },
};

export async function frameUrl(frameId: number, index: number): Promise<string> {
  if (!isTauri) {
    const { mockFrameUrl } = await import("./mock");
    return mockFrameUrl();
  }
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(`${frameId}/${index}`, "frame");
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
