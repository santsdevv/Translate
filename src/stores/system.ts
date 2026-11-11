import { create } from "zustand";

import { api, events, on } from "@/lib/ipc";
import { ocrTagMatches, OCR_INSTALLABLE, LANGUAGES } from "@/lib/languages";
import type { AppInfo, OcrStatus, ProviderStatus } from "@/lib/types";

interface SystemStore {
  info: AppInfo | null;
  ocr: OcrStatus | null;
  providers: ProviderStatus[];
  installing: string | null;
  setInfo: (i: AppInfo) => void;
  refreshOcr: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  setInstalling: (code: string | null) => void;
}

export const useSystem = create<SystemStore>((set) => ({
  info: null,
  ocr: null,
  providers: [],
  installing: null,
  setInfo: (info) => set({ info }),
  refreshOcr: async () => set({ ocr: await api.ocr.status() }),
  refreshProviders: async () => set({ providers: await api.providers.status() }),
  setInstalling: (installing) => set({ installing }),
}));

on<boolean>(events.ocrChanged, () => {
  useSystem.getState().setInstalling(null);
  void useSystem.getState().refreshOcr();
});

export function ocrCodes(status: OcrStatus | null): Set<string> {
  const out = new Set<string>();
  if (!status) return out;
  for (const l of LANGUAGES) {
    if (status.languages.some((o) => ocrTagMatches(o.tag, l.code))) out.add(l.code);
  }
  return out;
}

export function ocrReady(status: OcrStatus | null, source: string): "ok" | "missing" | "unsupported" | "unknown" {
  if (!status) return "unknown";
  if (!status.available) return "unsupported";
  if (source === "auto") return status.languages.length > 0 ? "ok" : "missing";
  if (ocrCodes(status).has(source)) return "ok";
  return OCR_INSTALLABLE.has(source) ? "missing" : "unsupported";
}
