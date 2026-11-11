import { create } from "zustand";

export type Route = "home" | "history" | "conversation" | "translation" | "shortcuts" | "popup" | "general";

interface NavStore {
  route: Route;
  focusHistoryId: number | null;
  go: (route: Route, opts?: { historyId?: number }) => void;
}

export const useNav = create<NavStore>((set) => ({
  route: "home",
  focusHistoryId: null,
  go: (route, opts) => set({ route, focusHistoryId: opts?.historyId ?? null }),
}));

export function routeFromString(s: string): Route {
  const last = s.split("/").pop() ?? "";
  const known: Route[] = ["home", "history", "conversation", "translation", "shortcuts", "popup", "general"];
  return (known as string[]).includes(last) ? (last as Route) : "home";
}
