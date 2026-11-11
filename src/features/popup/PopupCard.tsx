import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, CircleAlert, Copy, Languages, Pin, PinOff, ScanSearch, Square, X } from "lucide-react";

import { IconButton } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { languageName } from "@/lib/languages";
import type { PopupPayload } from "@/lib/types";

export const POPUP_MARGIN = 18;

interface Props {
  payload: PopupPayload;
  pinned?: boolean;
  onCopy?: (text: string) => Promise<void> | void;
  onClose?: () => void;
  onPin?: (pinned: boolean) => void;
  onAction?: (action: "settings" | "retry") => void;
  preview?: boolean;
  reduceMotion?: boolean;
}

const PROVIDER_NAMES = { google: "Google", deepl: "DeepL", microsoft: "Microsoft" } as const;

function langLine(p: PopupPayload): string {
  const from = p.detectedLang ?? (p.sourceLang === "auto" ? null : p.sourceLang);
  const to = languageName(p.targetLang);
  return from ? `${languageName(from)} → ${to}` : `Traduzindo para ${to.toLowerCase()}`;
}

function errorAction(code?: string): { label: string; action: "settings" | "retry" } | null {
  switch (code) {
    case "ocr_language_missing":
      return { label: "Instalar idioma", action: "settings" };
    case "missing_api_key":
    case "invalid_api_key":
      return { label: "Configurar chave", action: "settings" };
    case "network":
    case "translate":
    case "quota_exceeded":
      return { label: "Tentar de novo", action: "retry" };
    default:
      return null;
  }
}

function SkeletonLines({ lines, size }: { lines: number; size: number }) {
  return (
    <div className="space-y-2 py-1" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton rounded-full" style={{ height: size * 0.62, width: i === lines - 1 ? "62%" : "100%" }} />
      ))}
    </div>
  );
}

function textMaxHeight(): number {
  return Math.round(Math.min(window.screen.availHeight * 0.5, 560));
}

export function PopupCard({ payload, pinned, onCopy, onClose, onPin, onAction, preview, reduceMotion }: Props) {
  const { appearance: a, phase, live } = payload;
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [liveOriginal, setLiveOriginal] = useState(a.showOriginal);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setExpanded(false);
    setCopied(false);
    setLiveOriginal(a.showOriginal);
  }, [payload.job]);

  useEffect(() => {
    if (live && textRef.current) textRef.current.scrollTop = textRef.current.scrollHeight;
  }, [live, payload.translated]);

  const copy = async () => {
    if (!payload.translated) return;
    await onCopy?.(payload.translated);
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1400);
  };

  const autoClose = !preview && !live && a.autoClose && !pinned && (phase === "done" || phase === "empty");
  const [progressKey, setProgressKey] = useState(0);
  useEffect(() => setProgressKey((k) => k + 1), [payload.job, phase, hovered, pinned]);
  useEffect(() => {
    if (!autoClose || hovered) return;
    const t = setTimeout(() => onClose?.(), a.autoCloseSeconds * 1000);
    return () => clearTimeout(t);
  }, [autoClose, hovered, a.autoCloseSeconds, onClose, progressKey]);

  const bg = `rgb(14 15 15 / ${a.opacity / 100})`;
  const fontSize = a.fontSize;
  const action = errorAction(payload.error?.code);
  const wantsOriginal = live ? liveOriginal : a.showOriginal;
  const showOriginal = wantsOriginal && !!payload.original && (phase === "done" || phase === "translating");
  const longOriginal = payload.original.length > 220;

  const style: CSSProperties = {
    maxWidth: a.maxWidth,
    background: bg,
  };

  return (
    <motion.div
      key={preview || live ? "stable" : payload.job}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.965, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.7 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
      className={cn(
        "popup-card relative w-max min-w-[264px] overflow-hidden rounded-[14px] text-fg",
        "shadow-[0_0_0_1px_rgb(255_255_255/0.085),inset_0_1px_0_rgb(255_255_255/0.06),0_18px_44px_-6px_rgb(0_0_0/0.65),0_3px_10px_rgb(0_0_0/0.45)]",
      )}
    >
      <div data-tauri-drag-region={preview ? undefined : true} className={cn("flex h-9 items-center gap-2 pl-3.5 pr-1.5", !preview && "drag")}>
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            phase === "error" ? "bg-danger" : phase === "empty" ? "bg-fg-3" : "bg-sage",
            (live || phase === "reading" || phase === "translating") && "animate-pulse-dot",
          )}
        />
        <span data-tauri-drag-region={preview ? undefined : true} className="min-w-0 flex-1 truncate text-2xs font-medium text-fg-3">
          {live && <span className="mr-1.5 text-sage">Ao vivo</span>}
          {phase === "reading"
            ? live
              ? "Lendo a área…"
              : "Lendo texto…"
            : phase === "error" && !payload.original
              ? "Translate"
              : langLine(payload)}
        </span>
        <AnimatePresence>
          {copied && (
            <motion.span
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-2xs font-medium text-sage"
            >
              Copiado
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex items-center [-webkit-app-region:no-drag]">
          {live && (
            <IconButton
              icon={Languages}
              label={liveOriginal ? "Ocultar original" : "Mostrar original"}
              size="sm"
              active={liveOriginal}
              onClick={() => setLiveOriginal((v) => !v)}
            />
          )}
          {onPin && !live && (
            <IconButton
              icon={pinned ? PinOff : Pin}
              label={pinned ? "Soltar" : "Manter aberta"}
              size="sm"
              active={pinned}
              onClick={() => onPin(!pinned)}
            />
          )}
          <IconButton
            icon={copied ? Check : Copy}
            label="Copiar tradução"
            size="sm"
            disabled={phase !== "done"}
            className={cn("disabled:opacity-30", copied && "!text-sage")}
            onClick={copy}
          />
          {live ? (
            <IconButton icon={Square} label="Parar ao vivo" size="sm" onClick={onClose} className="hover:!text-danger" />
          ) : (
            <IconButton icon={X} label="Fechar" size="sm" onClick={onClose} />
          )}
        </div>
      </div>

      <div className="px-3.5 pb-3.5">
        {phase === "reading" && <SkeletonLines lines={2} size={fontSize} />}
        {phase === "translating" && <SkeletonLines lines={Math.min(3, Math.max(1, Math.ceil(payload.original.length / 60)))} size={fontSize} />}
        {phase === "done" && (
          <p
            ref={textRef}
            className="selectable overflow-y-auto whitespace-pre-wrap break-words"
            style={{ fontSize, lineHeight: 1.5, maxHeight: textMaxHeight() }}
            lang={payload.targetLang}
          >
            {payload.translated}
          </p>
        )}
        {phase === "empty" && (
          <div className="flex gap-2.5 py-0.5">
            <ScanSearch size={16} className="mt-0.5 shrink-0 text-fg-3" />
            <div>
              {live ? (
                <>
                  <p className="text-sm text-fg">Esperando texto aparecer na área…</p>
                  <p className="mt-0.5 text-xs text-fg-3">Tudo que surgir ali será traduzido aqui.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-fg">Nenhum texto encontrado nessa área.</p>
                  <p className="mt-0.5 text-xs text-fg-3">Selecione uma área um pouco maior, só com o texto.</p>
                </>
              )}
            </div>
          </div>
        )}
        {phase === "error" && (
          <div className="flex gap-2.5 py-0.5">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm text-fg">{payload.error?.message ?? "Algo deu errado."}</p>
              {action && (
                <button
                  onClick={() => onAction?.(action.action)}
                  className="mt-2 rounded-[7px] bg-white/[0.07] px-2.5 py-1 text-xs font-medium text-fg hairline hover:bg-white/[0.11]"
                >
                  {action.label}
                </button>
              )}
            </div>
          </div>
        )}

        {showOriginal && (
          <div className="mt-3 border-t border-white/[0.07] pt-2.5">
            <p
              className={cn(
                "selectable whitespace-pre-wrap break-words text-fg-3",
                !expanded && longOriginal && "line-clamp-3",
              )}
              style={{ fontSize: Math.max(12, fontSize - 2.5), lineHeight: 1.5 }}
              lang={payload.detectedLang ?? undefined}
            >
              {payload.original}
            </p>
            {longOriginal && (
              <button onClick={() => setExpanded((e) => !e)} className="mt-1 flex items-center gap-1 text-2xs text-fg-3 hover:text-fg-2">
                {expanded ? "Mostrar menos" : "Mostrar tudo"}
                <ChevronDown size={11} className={cn("transition-transform", expanded && "rotate-180")} />
              </button>
            )}
          </div>
        )}

        {phase === "done" && payload.fallbackUsed && (
          <p className="mt-2 text-2xs text-warn/90">
            Traduzido pelo {PROVIDER_NAMES[payload.provider]} porque o serviço escolhido falhou.
          </p>
        )}
      </div>

      {autoClose && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04]">
          <div
            key={progressKey}
            className="h-full origin-left bg-sage/70"
            style={{
              animation: hovered ? "none" : `popup-countdown ${a.autoCloseSeconds}s linear forwards`,
              transform: hovered ? "scaleX(1)" : undefined,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
