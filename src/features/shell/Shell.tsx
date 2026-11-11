import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AppWindow,
  History,
  House,
  Keyboard,
  Languages,
  MessagesSquare,
  Minus,
  Settings2,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";

import { Keys } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { isTauri } from "@/lib/ipc";
import { shortcutKeys } from "@/lib/format";
import { useNav, type Route } from "@/stores/navigation";
import { useSettings } from "@/stores/settings";
import { ocrReady, useSystem } from "@/stores/system";

async function windowAction(action: "minimize" | "maximize" | "close") {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  if (action === "minimize") await w.minimize();
  if (action === "maximize") await w.toggleMaximize();
  if (action === "close") await w.close();
}

export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="0.5" y="0.5" width="23" height="23" rx="6" fill="#151817" stroke="rgb(255 255 255 / .1)" />
      <g fill="none" stroke="var(--color-sage)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M6 9V7.2Q6 6 7.2 6H9" />
        <path d="M15 6h1.8Q18 6 18 7.2V9" />
        <path d="M18 15v1.8Q18 18 16.8 18H15" />
        <path d="M9 18H7.2Q6 18 6 16.8V15" />
      </g>
      <rect x="8.7" y="10" width="6.6" height="1.6" rx=".8" fill="#5e6461" />
      <rect x="8.7" y="12.9" width="4.6" height="1.6" rx=".8" fill="#ecedec" />
    </svg>
  );
}

function TitleBar() {
  return (
    <div data-tauri-drag-region className="drag relative z-10 flex h-10 shrink-0 items-center pl-4">
      <div data-tauri-drag-region className="pointer-events-none flex items-center gap-2.5">
        <Mark />
        <span className="text-xs font-semibold tracking-[0.01em] text-fg-2">Translate</span>
      </div>
      <div className="ml-auto flex h-full [-webkit-app-region:no-drag]">
        {(
          [
            ["minimize", Minus, "Minimizar"],
            ["maximize", Square, "Maximizar"],
            ["close", X, "Fechar"],
          ] as const
        ).map(([action, Icon, label]) => (
          <button
            key={action}
            aria-label={label}
            onClick={() => windowAction(action)}
            className={cn(
              "flex h-full w-[46px] items-center justify-center text-fg-3 transition-colors duration-100",
              action === "close" ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-white/[0.06] hover:text-fg",
            )}
          >
            <Icon size={action === "maximize" ? 12 : 15} strokeWidth={1.6} />
          </button>
        ))}
      </div>
    </div>
  );
}

const NAV: Array<{ route: Route; label: string; icon: LucideIcon }> = [
  { route: "home", label: "Início", icon: House },
  { route: "history", label: "Histórico", icon: History },
  { route: "conversation", label: "Conversas", icon: MessagesSquare },
];
const SETTINGS_NAV: Array<{ route: Route; label: string; icon: LucideIcon }> = [
  { route: "translation", label: "Tradução e idiomas", icon: Languages },
  { route: "shortcuts", label: "Atalhos", icon: Keyboard },
  { route: "popup", label: "Janela flutuante", icon: AppWindow },
  { route: "general", label: "Geral", icon: Settings2 },
];

function NavItem({ route, label, icon: Icon }: { route: Route; label: string; icon: LucideIcon }) {
  const active = useNav((s) => s.route === route);
  const go = useNav((s) => s.go);
  return (
    <button
      onClick={() => go(route)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 w-full items-center gap-3 rounded-[9px] px-3 text-left text-sm transition-colors duration-150",
        active ? "text-fg" : "text-fg-3 hover:bg-white/[0.035] hover:text-fg-2",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          transition={{ type: "spring", stiffness: 600, damping: 44 }}
          className="absolute inset-0 rounded-[9px] bg-white/[0.065] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]"
        />
      )}
      <Icon size={16} strokeWidth={1.8} className={cn("relative", active && "text-sage")} />
      <span className="relative">{label}</span>
    </button>
  );
}

function StatusFooter() {
  const settings = useSettings((s) => s.settings);
  const failures = useSettings((s) => s.shortcutFailures);
  const ocr = useSystem((s) => s.ocr);
  if (!settings) return null;

  const captureFailed = failures.some((f) => f.action === "capture");
  const ocrState = ocrReady(ocr, settings.translation.sourceLang);
  const problem = captureFailed
    ? "Atalho indisponível"
    : ocrState === "unsupported" && ocr && !ocr.available
      ? "OCR indisponível"
      : ocrState === "missing"
        ? "Falta idioma de OCR"
        : null;

  return (
    <div className="mx-3 mb-3 rounded-[10px] bg-white/[0.025] px-3 py-2.5 hairline">
      <div className="flex items-center gap-2 text-xs">
        <span className={cn("size-1.5 rounded-full", problem ? "bg-warn" : "bg-sage")} />
        <span className={problem ? "text-warn" : "text-fg-2"}>{problem ?? "Pronto para traduzir"}</span>
      </div>
      {settings.shortcuts.capture && !captureFailed && (
        <div className="mt-2">
          <Keys keys={shortcutKeys(settings.shortcuts.capture)} size="sm" />
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useNav((s) => s.route);
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Navegação" className="flex w-[228px] shrink-0 flex-col">
          <div className="flex-1 space-y-0.5 px-3 pt-2">
            {NAV.map((n) => (
              <NavItem key={n.route} {...n} />
            ))}
            <div className="px-3 pb-1.5 pt-5 text-2xs font-medium text-fg-3">Configurações</div>
            {SETTINGS_NAV.map((n) => (
              <NavItem key={n.route} {...n} />
            ))}
          </div>
          <StatusFooter />
        </nav>
        <main className="mb-2 mr-2 min-w-0 flex-1 overflow-hidden rounded-panel bg-ink-1/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06),0_8px_30px_rgb(0_0_0/0.35)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
