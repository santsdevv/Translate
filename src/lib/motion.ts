import { useEffect, useState } from "react";
import type { MotionPreference } from "./types";

export function applyMotionPreference(pref: MotionPreference | boolean | null | undefined) {
  const root = document.documentElement;
  root.classList.remove("motion-reduced", "motion-full");
  if (pref === "reduced" || pref === true) root.classList.add("motion-reduced");
  if (pref === "full" || pref === false) root.classList.add("motion-full");
}

export function useReducedMotion(): boolean {
  const query = () => {
    const root = document.documentElement;
    if (root.classList.contains("motion-reduced")) return true;
    if (root.classList.contains("motion-full")) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };
  const [reduced, setReduced] = useState(query);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query());
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);
  return reduced;
}
