export type Provider = "google" | "deepl" | "microsoft";
export type PopupPlacement = "auto" | "below" | "above" | "cursor";
export type MotionPreference = "system" | "reduced" | "full";

export interface TranslationSettings {
  provider: Provider;
  sourceLang: string;
  targetLang: string;
  fallbackToGoogle: boolean;
  microsoftRegion: string;
  deeplFormality: "default" | "more" | "less";
}

export interface OcrSettings {
  mergeLines: boolean;
  upscaleSmall: boolean;
}

export interface ShortcutSettings {
  capture: string;
  recapture: string;
  showWindow: string;
  live: string;
  compose: string;
}

export interface LiveSettings {
  intervalMs: number;
  showOriginal: boolean;
}

export interface ComposeSettings {
  targetLang: string;
  fallbackLang: string;
}

export interface PopupSettings {
  placement: PopupPlacement;
  maxWidth: number;
  fontSize: number;
  opacity: number;
  showOriginal: boolean;
  autoClose: boolean;
  autoCloseSeconds: number;
  dismissOnOutsideClick: boolean;
  dismissOnEscape: boolean;
  autoCopy: boolean;
}

export interface GeneralSettings {
  launchAtStartup: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  saveHistory: boolean;
  historyLimit: number;
  motion: MotionPreference;
  showMagnifier: boolean;
}

export interface Settings {
  translation: TranslationSettings;
  ocr: OcrSettings;
  shortcuts: ShortcutSettings;
  popup: PopupSettings;
  general: GeneralSettings;
  live: LiveSettings;
  compose: ComposeSettings;
  onboarded: boolean;
}

export type ShortcutAction = "capture" | "recapture" | "showWindow" | "live" | "compose";

export interface ShortcutFailure {
  action: ShortcutAction;
  accelerator: string;
  message: string;
}

export interface UpdateResult {
  settings: Settings;
  shortcutFailures: ShortcutFailure[];
}

export interface AppError {
  code: string;
  message: string;
}

export interface HistoryEntry {
  id: number;
  createdAt: number;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang: string | null;
  provider: Provider;
  favorite: boolean;
}

export interface HistoryQuery {
  search?: string;
  favoritesOnly?: boolean;
  offset?: number;
  limit?: number;
}

export interface HistoryPage {
  items: HistoryEntry[];
  total: number;
}

export interface HistoryStats {
  total: number;
  today: number;
  week: number;
  favorites: number;
  topPair: [string, string] | null;
}

export interface ProviderStatus {
  provider: Provider;
  needsKey: boolean;
  hasKey: boolean;
  keyHint: string | null;
}

export interface OcrLanguage {
  tag: string;
  name: string;
}

export interface OcrStatus {
  available: boolean;
  languages: OcrLanguage[];
  error: string | null;
}

export interface AppInfo {
  version: string;
  platform: string;
  vibrancy: boolean;
}

export type PopupPhase = "reading" | "translating" | "done" | "empty" | "error";

export interface PopupPayload {
  job: number;
  phase: PopupPhase;
  original: string;
  translated: string;
  sourceLang: string;
  targetLang: string;
  detectedLang: string | null;
  provider: Provider;
  fallbackUsed: boolean;
  error: AppError | null;
  historyId: number | null;
  appearance: PopupSettings;
  reduceMotion: boolean | null;
  live: boolean;
}

export interface OverlayOpen {
  frameId: number;
  index: number;
  width: number;
  height: number;
  scale: number;
  showMagnifier: boolean;
  reduceMotion: boolean | null;
  mode: "translate" | "live";
}

export interface CssRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
