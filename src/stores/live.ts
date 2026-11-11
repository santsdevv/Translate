import { create } from "zustand";

import { api, errorMessage, events, on } from "@/lib/ipc";
import { toast } from "./toast";

interface LiveStore {
  active: boolean;
  refresh: () => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
}

export const useLive = create<LiveStore>((set) => ({
  active: false,
  refresh: async () => set({ active: await api.live.status() }),
  toggle: async () => {
    try {
      await api.live.toggle();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  },
  stop: async () => {
    await api.live.stop();
  },
}));

on<boolean>(events.liveActive, (active) => useLive.setState({ active }));
