import { useEffect, useRef, useState } from "react";
import { CircleAlert, RotateCcw, X } from "lucide-react";

import { IconButton, Keys, PageHeader, Row, Section } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { shortcutKeys } from "@/lib/format";
import { api, errorMessage } from "@/lib/ipc";
import type { ShortcutAction, ShortcutSettings } from "@/lib/types";
import { useSettings } from "@/stores/settings";

const DEFAULTS: ShortcutSettings = {
  capture: "Alt+Q",
  recapture: "Alt+Shift+Q",
  showWindow: "Alt+Shift+T",
  live: "Alt+W",
  compose: "Alt+E",
};

const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight",
]);

function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^Numpad\d$/.test(code)) return `Num${code.slice(6)}`;
  const map: Record<string, string> = {
    Space: "Space", Enter: "Enter", Tab: "Tab", Backquote: "Backquote", Minus: "Minus", Equal: "Equal",
    BracketLeft: "BracketLeft", BracketRight: "BracketRight", Backslash: "Backslash", Semicolon: "Semicolon",
    Quote: "Quote", Comma: "Comma", Period: "Period", Slash: "Slash", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", Insert: "Insert", Delete: "Delete", Home: "Home", End: "End",
    PageUp: "PageUp", PageDown: "PageDown", PrintScreen: "PrintScreen", Pause: "Pause",
  };
  return map[code] ?? null;
}

function modifiers(e: KeyboardEvent): string[] {
  const m: string[] = [];
  if (e.ctrlKey) m.push("Ctrl");
  if (e.altKey) m.push("Alt");
  if (e.shiftKey) m.push("Shift");
  if (e.metaKey) m.push("Super");
  return m;
}

function Recorder({ action, value }: { action: ShortcutAction; value: string }) {
  const update = useSettings((s) => s.update);
  const failure = useSettings((s) => s.shortcutFailures.find((f) => f.action === action));
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const stop = async () => {
    setRecording(false);
    setHeld([]);
    await api.shortcuts.suspend(false);
  };

  const commit = async (accelerator: string) => {
    await stop();
    update((d) => void (d.shortcuts[action] = accelerator));
  };

  useEffect(() => {
    if (!recording) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const mods = modifiers(e);
      if (e.type === "keyup") {
        setHeld(mods);
        return;
      }
      if (MODIFIER_CODES.has(e.code)) {
        setHeld(mods);
        return;
      }
      if (e.code === "Escape" && mods.length === 0) {
        void stop();
        return;
      }
      if ((e.code === "Backspace" || e.code === "Delete") && mods.length === 0) {
        void commit("");
        return;
      }
      const key = keyName(e.code);
      if (!key) return;
      const accelerator = [...mods, key].join("+");
      try {
        await api.shortcuts.validate(accelerator);
        setError(null);
        void commit(accelerator);
      } catch (err) {
        setHeld([]);
        setError(mods.length === 0 ? "Use ao menos uma tecla modificadora (Ctrl, Alt, Shift ou Win)." : errorMessage(err));
      }
    };
    const onBlur = () => void stop();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [recording]);

  const start = async () => {
    setError(null);
    await api.shortcuts.suspend(true);
    setRecording(true);
  };

  const isDefault = value === DEFAULTS[action];

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        <button
          ref={ref}
          onClick={() => (recording ? void stop() : void start())}
          aria-label={recording ? "Gravando atalho, pressione as teclas" : `Alterar atalho, atual ${value || "nenhum"}`}
          className={cn(
            "flex h-9 min-w-[176px] items-center justify-center gap-2 rounded-[9px] px-3 transition-[background-color,box-shadow] duration-150",
            recording
              ? "bg-sage/[0.08] shadow-[inset_0_0_0_1px_var(--color-sage)]"
              : "bg-ink-0/70 hairline hover:bg-ink-3",
          )}
        >
          {recording ? (
            held.length ? (
              <Keys keys={[...held.map((k) => (k === "Super" ? "Win" : k)), "…"]} size="sm" />
            ) : (
              <span className="flex items-center gap-2 text-xs text-sage">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-sage" />
                Pressione as teclas
              </span>
            )
          ) : value ? (
            <Keys keys={shortcutKeys(value)} size="sm" />
          ) : (
            <span className="text-xs text-fg-3">Desativado</span>
          )}
        </button>
        <IconButton
          icon={RotateCcw}
          label="Restaurar padrão"
          size="sm"
          disabled={isDefault}
          className="disabled:opacity-30"
          onClick={() => update((d) => void (d.shortcuts[action] = DEFAULTS[action]))}
        />
        <IconButton
          icon={X}
          label="Desativar atalho"
          size="sm"
          disabled={!value}
          className="disabled:opacity-30"
          onClick={() => update((d) => void (d.shortcuts[action] = ""))}
        />
      </div>
      {recording && !error && <span className="text-2xs text-fg-3">Esc cancela, Backspace desativa</span>}
      {(error || failure) && (
        <span className="flex max-w-[300px] items-start gap-1 text-right text-2xs text-danger">
          <CircleAlert size={11} className="mt-0.5 shrink-0" />
          {error ?? failure?.message}
        </span>
      )}
    </div>
  );
}

export function ShortcutsPage() {
  const settings = useSettings((s) => s.settings);
  if (!settings) return null;
  const sc = settings.shortcuts;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-10 pb-12 pt-8">
        <PageHeader
          title="Atalhos"
          description="Funcionam em qualquer aplicativo, mesmo com o Translate minimizado na bandeja."
        />
        <Section title="Atalhos globais">
          <Row title="Selecionar área da tela" description="Congela a tela para você arrastar sobre o texto que quer traduzir.">
            <Recorder action="capture" value={sc.capture} />
          </Row>
          <Row title="Repetir última área" description="Traduz de novo a mesma região, sem selecionar. Ideal para legendas e diálogos de jogos.">
            <Recorder action="recapture" value={sc.recapture} />
          </Row>
          <Row
            title="Traduzir área ao vivo"
            description="Escolha uma área, como o chat do Discord, e cada mensagem nova é traduzida sozinha. Aperte de novo para parar."
          >
            <Recorder action="live" value={sc.live} />
          </Row>
          <Row
            title="Traduzir o que estou escrevendo"
            description="Troca o texto do campo em que você está digitando pela tradução no idioma da conversa."
          >
            <Recorder action="compose" value={sc.compose} />
          </Row>
          <Row title="Mostrar ou esconder o Translate" description="Abre esta janela por cima de tudo, ou a esconde se já estiver aberta.">
            <Recorder action="showWindow" value={sc.showWindow} />
          </Row>
        </Section>
        <Section title="Durante a seleção">
          <Row title="Cancelar a seleção">
            <Keys keys={["Esc"]} size="sm" />
          </Row>
          <Row title="Cancelar com o mouse">
            <span className="text-xs text-fg-2">Clique com o botão direito</span>
          </Row>
        </Section>
        <Section title="Com a tradução aberta">
          <Row title="Fechar a janela flutuante" description="Pode ser desativado em Janela flutuante.">
            <Keys keys={["Esc"]} size="sm" />
          </Row>
        </Section>
      </div>
    </div>
  );
}
