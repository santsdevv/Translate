import type { HistoryEntry, HistoryQuery, PopupPayload, ProviderStatus, Settings } from "./types";

const bus = new EventTarget();

const defaults: Settings = {
  translation: {
    provider: "google",
    sourceLang: "auto",
    targetLang: "pt",
    fallbackToGoogle: true,
    microsoftRegion: "",
    deeplFormality: "default",
  },
  ocr: { mergeLines: true, upscaleSmall: true },
  shortcuts: { capture: "Alt+Q", recapture: "Alt+Shift+Q", showWindow: "Alt+Shift+T", live: "Alt+W", compose: "Alt+E" },
  live: { intervalMs: 1000, showOriginal: false },
  compose: { targetLang: "conversation", fallbackLang: "en" },
  popup: {
    placement: "auto",
    maxWidth: 420,
    fontSize: 15,
    opacity: 96,
    showOriginal: true,
    autoClose: false,
    autoCloseSeconds: 12,
    dismissOnOutsideClick: true,
    dismissOnEscape: true,
    autoCopy: false,
  },
  general: {
    launchAtStartup: true,
    startMinimized: false,
    closeToTray: true,
    saveHistory: true,
    historyLimit: 2000,
    motion: "system",
    showMagnifier: true,
  },
  onboarded: true,
};

let settings: Settings = structuredClone(defaults);
let liveOn = false;
const keys: Record<string, string | null> = { deepl: null, microsoft: null };

const now = Date.now();
const min = 60_000;
const samples: Array<[string, string, string, number, boolean]> = [
  ["Your changes have been saved. Restart the application to apply the new settings.", "Suas alterações foram salvas. Reinicie o aplicativo para aplicar as novas configurações.", "en", 2 * min, false],
  ["宝箱を開けるには鍵が必要です。", "Você precisa de uma chave para abrir o baú do tesouro.", "ja", 9 * min, true],
  ["The quick onboarding flow reduced churn by 18% in the first quarter.", "O fluxo rápido de integração reduziu a evasão em 18% no primeiro trimestre.", "en", 41 * min, false],
  ["Veuillez confirmer votre adresse e-mail avant de continuer.", "Confirme seu endereço de e-mail antes de continuar.", "fr", 3 * 60 * min, false],
  ["Die Lieferung verzögert sich aufgrund des Wetters um zwei Tage.", "A entrega atrasará dois dias por causa do clima.", "de", 26 * 60 * min, true],
  ["Press any key to continue", "Pressione qualquer tecla para continuar", "en", 27 * 60 * min, false],
  ["El servidor no responde. Inténtalo de nuevo más tarde.", "O servidor não responde. Tente novamente mais tarde.", "es", 3 * 24 * 60 * min, false],
  ["Low battery. Connect your device to a power source.", "Bateria fraca. Conecte seu dispositivo a uma fonte de energia.", "en", 5 * 24 * 60 * min, false],
  ["체크포인트에 도달했습니다", "Você chegou ao ponto de controle", "ko", 6 * 24 * 60 * min, false],
];
let history: HistoryEntry[] = samples.map(([s, t, d, ago, fav], i) => ({
  id: samples.length - i,
  createdAt: now - ago,
  sourceText: s,
  translatedText: t,
  sourceLang: "auto",
  targetLang: "pt",
  detectedLang: d,
  provider: "google",
  favorite: fav,
}));

function emit(event: string, payload: unknown) {
  bus.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mockListen(event: string, handler: (p: unknown) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent).detail);
  bus.addEventListener(event, fn);
  return () => bus.removeEventListener(event, fn);
}

export function samplePopup(): PopupPayload {
  if (new URLSearchParams(location.search).has("live")) {
    return {
      ...samplePopupBase(),
      original: "Alex — Today at 20:31\nanyone up for ranked tonight?\nMika — Today at 20:32\nsure, give me 10 min to finish dinner\nAlex — Today at 20:33\nnice, I'll send the invite",
      translated: "Alex — Hoje às 20:31\nalguém topa uma ranqueada hoje à noite?\nMika — Hoje às 20:32\nclaro, me dá 10 min pra terminar a janta\nAlex — Hoje às 20:33\nboa, vou mandar o convite",
      live: true,
    };
  }
  return samplePopupBase();
}

function samplePopupBase(): PopupPayload {
  return {
    job: 1,
    phase: "done",
    original: "Your changes have been saved. Restart the application to apply the new settings.",
    translated: "Suas alterações foram salvas. Reinicie o aplicativo para aplicar as novas configurações.",
    sourceLang: settings.translation.sourceLang,
    targetLang: settings.translation.targetLang,
    detectedLang: "en",
    provider: settings.translation.provider,
    fallbackUsed: false,
    error: null,
    historyId: 1,
    appearance: settings.popup,
    reduceMotion: null,
    live: new URLSearchParams(location.search).has("live"),
  };
}

export async function mockInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await wait(40);
  switch (cmd) {
    case "app_ready":
    case "app_info":
      return { version: "1.0.0", platform: "preview", vibrancy: false };
    case "settings_get":
      return structuredClone(settings);
    case "settings_update":
      settings = structuredClone(args.settings as Settings);
      emit("settings://changed", settings);
      return { settings, shortcutFailures: [] };
    case "settings_reset":
      settings = structuredClone(defaults);
      return { settings, shortcutFailures: [] };
    case "shortcuts_status":
      return [];
    case "shortcut_validate": {
      const acc = String(args.accelerator ?? "");
      if (!acc.includes("+") && !/^F\d+$/i.test(acc)) throw { code: "invalid_shortcut", message: `O atalho "${acc}" não é válido.` };
      return null;
    }
    case "provider_status":
      return (["google", "deepl", "microsoft"] as const).map<ProviderStatus>((p) => ({
        provider: p,
        needsKey: p !== "google",
        hasKey: p === "google" || !!keys[p],
        keyHint: keys[p] ? `••••${keys[p]!.slice(-4)}` : null,
      }));
    case "provider_set_key":
      keys[args.provider as string] = (args.key as string) || null;
      return null;
    case "provider_test":
      await wait(500);
      if (args.provider !== "google" && !keys[args.provider as string])
        throw { code: "missing_api_key", message: "Configure a chave de API antes de testar." };
      return 212;
    case "ocr_status":
      return {
        available: true,
        languages: [
          { tag: "pt-BR", name: "Português (Brasil)" },
          { tag: "en-US", name: "Inglês (Estados Unidos)" },
        ],
        error: null,
      };
    case "history_list": {
      const q = (args.query ?? {}) as HistoryQuery;
      const s = (q.search ?? "").toLowerCase();
      const items = history.filter(
        (h) =>
          (!q.favoritesOnly || h.favorite) &&
          (!s || h.sourceText.toLowerCase().includes(s) || h.translatedText.toLowerCase().includes(s)),
      );
      const off = q.offset ?? 0;
      return { items: items.slice(off, off + (q.limit || 100)), total: items.length };
    }
    case "history_stats":
      return {
        total: history.length,
        today: history.filter((h) => now - h.createdAt < 12 * 60 * min).length,
        week: history.length,
        favorites: history.filter((h) => h.favorite).length,
        topPair: ["en", "pt"],
      };
    case "history_favorite":
      history = history.map((h) => (h.id === args.id ? { ...h, favorite: !!args.favorite } : h));
      emit("history://changed", null);
      return null;
    case "history_delete":
      history = history.filter((h) => h.id !== args.id);
      emit("history://changed", null);
      return null;
    case "history_clear": {
      const before = history.length;
      history = args.keepFavorites ? history.filter((h) => h.favorite) : [];
      emit("history://changed", null);
      return before - history.length;
    }
    case "history_export":
      return "C:\\Users\\voce\\Documents\\translate-historico.json";
    case "popup_current":
      return samplePopup();
    case "conversation_language":
      return "en";
    case "live_status":
      return liveOn;
    case "live_toggle":
      liveOn = !liveOn;
      emit("live://active", liveOn);
      return null;
    case "live_stop":
      liveOn = false;
      emit("live://active", false);
      return null;
    case "capture_start":
    case "capture_repeat":
    case "copy_text":
    case "open_url":
    case "open_main":
    case "popup_present":
    case "popup_close":
    case "popup_pin":
    case "shortcuts_suspend":
    case "ocr_install":
    case "open_language_settings":
    case "overlay_ready":
    case "overlay_submit":
    case "overlay_cancel":
      return null;
    default:
      throw { code: "other", message: `comando simulado desconhecido: ${cmd}` };
  }
}

export function mockFrameUrl(): string {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2b3a4a";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#f4f4f2";
  g.fillRect(w * 0.12, h * 0.1, w * 0.62, h * 0.72);
  g.fillStyle = "#e4e4e0";
  g.fillRect(w * 0.12, h * 0.1, w * 0.62, 36);
  g.fillStyle = "#1d1d1b";
  g.font = "600 26px Segoe UI, sans-serif";
  g.fillText("Release notes", w * 0.15, h * 0.1 + 90);
  g.font = "16px Segoe UI, sans-serif";
  const lines = [
    "Your changes have been saved. Restart the application",
    "to apply the new settings. Some features may be",
    "unavailable until the update finishes downloading.",
  ];
  lines.forEach((l, i) => g.fillText(l, w * 0.15, h * 0.1 + 140 + i * 26));
  return c.toDataURL("image/png");
}
