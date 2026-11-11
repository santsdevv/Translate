const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto", style: "short" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const fullFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = (now - ms) / 1000;
  if (diff < 45) return "agora";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  const d = new Date(ms);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return timeFmt.format(d);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return "ontem";
  return dateFmt.format(d).replace(".", "");
}

export function fullDate(ms: number): string {
  return fullFmt.format(new Date(ms));
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}

export function shortcutKeys(accelerator: string): string[] {
  return accelerator
    .split("+")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => KEY_LABELS[k.toLowerCase()] ?? k);
}

const KEY_LABELS: Record<string, string> = {
  control: "Ctrl",
  ctrl: "Ctrl",
  commandorcontrol: "Ctrl",
  super: "Win",
  meta: "Win",
  space: "Espaço",
  escape: "Esc",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  backquote: "`",
};
