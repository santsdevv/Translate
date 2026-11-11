import { create } from "zustand";

import { api, errorMessage, on, events } from "@/lib/ipc";
import { applyMotionPreference } from "@/lib/motion";
import type { Settings, ShortcutFailure } from "@/lib/types";
import { toast } from "./toast";

interface SettingsStore {
  settings: Settings | null;
  shortcutFailures: ShortcutFailure[];
  load: () => Promise<void>;
  update: (mutate: (draft: Settings) => void, opts?: { debounce?: boolean }) => void;
  reset: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;

async function persist(next: Settings, set: (p: Partial<SettingsStore>) => void) {
  try {
    const result = await api.settings.update(next);
    set({ settings: result.settings, shortcutFailures: result.shortcutFailures });
    applyMotionPreference(result.settings.general.motion);
    result.shortcutFailures.forEach((f) => toast.error(f.message));
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: null,
  shortcutFailures: [],
  load: async () => {
    const [settings, shortcutFailures] = await Promise.all([api.settings.get(), api.shortcuts.status()]);
    applyMotionPreference(settings.general.motion);
    set({ settings, shortcutFailures });
  },
  update: (mutate, opts) => {
    const current = get().settings;
    if (!current) return;
    const next = structuredClone(current);
    mutate(next);
    set({ settings: next });
    if (timer) clearTimeout(timer);
    if (opts?.debounce) {
      timer = setTimeout(() => persist(next, set), 260);
    } else {
      void persist(next, set);
    }
  },
  reset: async () => {
    const result = await api.settings.reset();
    applyMotionPreference(result.settings.general.motion);
    set({ settings: result.settings, shortcutFailures: result.shortcutFailures });
  },
}));

on<Settings>(events.settingsChanged, (s) => {
  const current = useSettings.getState().settings;
  if (JSON.stringify(current) !== JSON.stringify(s)) useSettings.setState({ settings: s });
});
