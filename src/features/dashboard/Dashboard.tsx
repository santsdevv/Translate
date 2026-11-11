import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Copy,
  KeyRound,
  Keyboard,
  MessagesSquare,
  RotateCcw,
  ScanText,
  Square,
  SquareDashedMousePointer,
  Star,
} from "lucide-react";

import { Button, IconButton, Keys, Notice } from "@/components/ui/controls";
import { api, errorMessage, events, on } from "@/lib/ipc";
import { plural, relativeTime, shortcutKeys } from "@/lib/format";
import { languageName } from "@/lib/languages";
import type { HistoryEntry, HistoryStats } from "@/lib/types";
import { useLive } from "@/stores/live";
import { useNav } from "@/stores/navigation";
import { useSettings } from "@/stores/settings";
import { ocrReady, useSystem } from "@/stores/system";
import { toast } from "@/stores/toast";
import { LanguagePair } from "./LanguagePair";

function useRecent() {
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const load = useCallback(async () => {
    const [page, s] = await Promise.all([api.history.list({ limit: 6 }), api.history.stats()]);
    setItems(page.items);
    setStats(s);
  }, []);
  useEffect(() => {
    void load();
    return on(events.historyChanged, () => void load());
  }, [load]);
  return { items, stats };
}

function Warnings() {
  const settings = useSettings((s) => s.settings)!;
  const failures = useSettings((s) => s.shortcutFailures);
  const ocr = useSystem((s) => s.ocr);
  const providers = useSystem((s) => s.providers);
  const go = useNav((s) => s.go);

  const notices = [];
  const capture = failures.find((f) => f.action === "capture");
  if (capture) {
    notices.push(
      <Notice
        key="sc"
        icon={Keyboard}
        tone="warn"
        action={
          <Button size="sm" onClick={() => go("shortcuts")}>
            Escolher outro
          </Button>
        }
      >
        <strong>{capture.accelerator}</strong> está em uso por outro aplicativo. Escolha outro atalho para a seleção.
      </Notice>,
    );
  }
  const ocrState = ocrReady(ocr, settings.translation.sourceLang);
  if (ocrState === "missing" || (ocrState === "unsupported" && ocr?.available)) {
    notices.push(
      <Notice
        key="ocr"
        icon={ScanText}
        tone="warn"
        action={
          <Button size="sm" onClick={() => go("translation")}>
            Resolver
          </Button>
        }
      >
        {settings.translation.sourceLang === "auto" ? (
          <>Nenhum idioma de reconhecimento de texto está instalado no Windows.</>
        ) : ocrState === "missing" ? (
          <>
            Para ler textos em <strong>{languageName(settings.translation.sourceLang)}</strong>, instale o pacote de
            reconhecimento desse idioma.
          </>
        ) : (
          <>
            O Windows não reconhece textos em <strong>{languageName(settings.translation.sourceLang)}</strong>. Use
            "Detectar idioma" ou outro idioma de origem.
          </>
        )}
      </Notice>,
    );
  }
  if (ocr && !ocr.available) {
    notices.push(
      <Notice key="ocr-off" icon={ScanText} tone="danger">
        {ocr.error ?? "O reconhecimento de texto do Windows não está disponível neste sistema."}
      </Notice>,
    );
  }
  const provider = providers.find((p) => p.provider === settings.translation.provider);
  if (provider && provider.needsKey && !provider.hasKey) {
    notices.push(
      <Notice
        key="key"
        icon={KeyRound}
        tone="warn"
        action={
          <Button size="sm" onClick={() => go("translation")}>
            Adicionar chave
          </Button>
        }
      >
        O provedor escolhido precisa de uma chave de API.
        {settings.translation.fallbackToGoogle && " Até lá, as traduções usam o Google."}
      </Notice>,
    );
  }
  if (!notices.length) return null;
  return <div className="mt-8 space-y-2">{notices}</div>;
}

function RecentRow({ item }: { item: HistoryEntry }) {
  const go = useNav((s) => s.go);
  const from = item.detectedLang ?? item.sourceLang;
  return (
    <li className="group relative">
      <button
        onClick={() => go("history", { historyId: item.id })}
        className="flex w-full items-start gap-5 rounded-[10px] px-3 py-3 text-left transition-colors duration-150 hover:bg-white/[0.035]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.875rem] text-fg">{item.translatedText}</p>
          <p className="mt-0.5 truncate text-xs text-fg-3">{item.sourceText}</p>
        </div>
        <div className="shrink-0 pt-0.5 text-right text-xs text-fg-3 transition-opacity group-hover:opacity-0">
          <div className="flex items-center justify-end gap-1.5">
            {item.favorite && <Star size={11} className="fill-current text-sage" />}
            <span className="tabular">{relativeTime(item.createdAt)}</span>
          </div>
          <div className="mt-0.5 text-2xs">
            {languageName(from)} para {languageName(item.targetLang).toLowerCase()}
          </div>
        </div>
      </button>
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-hover:opacity-100">
        <IconButton
          icon={Copy}
          label="Copiar tradução"
          size="sm"
          tooltipSide="top"
          onClick={async () => {
            await api.app.copy(item.translatedText);
            toast.success("Tradução copiada");
          }}
        />
      </div>
    </li>
  );
}

export function Dashboard() {
  const settings = useSettings((s) => s.settings);
  const go = useNav((s) => s.go);
  const { items, stats } = useRecent();
  const live = useLive();
  useEffect(() => {
    void useLive.getState().refresh();
  }, []);
  if (!settings) return null;

  const capture = settings.shortcuts.capture;
  const startCapture = async () => {
    try {
      await api.capture.start();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-10 pb-12 pt-11">
        <LanguagePair />

        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-fg-2">
          {capture ? (
            <>
              Pressione <Keys keys={shortcutKeys(capture)} /> em qualquer aplicativo e arraste sobre o texto.
            </>
          ) : (
            <>Defina um atalho para selecionar áreas da tela de qualquer aplicativo.</>
          )}
        </p>

        <div className="mt-6 flex items-center gap-2">
          <Button variant="primary" size="lg" icon={SquareDashedMousePointer} onClick={startCapture}>
            Selecionar área
          </Button>
          <Button
            variant="ghost"
            size="lg"
            icon={RotateCcw}
            onClick={() => api.capture.repeat().catch((e) => toast.error(errorMessage(e)))}
          >
            Repetir última área
          </Button>
          {!live.active && (
            <Button variant="ghost" size="lg" icon={MessagesSquare} onClick={live.toggle}>
              Traduzir ao vivo
            </Button>
          )}
        </div>

        {live.active && (
          <div className="mt-5 flex items-center gap-3 rounded-[10px] bg-sage/[0.07] px-3.5 py-2.5 shadow-[inset_0_0_0_1px_rgb(124_196_160/0.18)]">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-sage" />
            <p className="min-w-0 flex-1 text-sm text-fg-2">
              <span className="text-fg">Ao vivo:</span> cada mensagem nova na área escolhida é traduzida sozinha.
              {settings.shortcuts.compose && (
                <>
                  {" "}
                  Para responder, use <Keys keys={shortcutKeys(settings.shortcuts.compose)} size="sm" /> no campo de mensagem.
                </>
              )}
            </p>
            <Button size="sm" variant="danger" icon={Square} onClick={live.stop}>
              Parar
            </Button>
          </div>
        )}

        <Warnings />

        <section className="mt-12">
          <div className="mb-2 flex items-baseline justify-between px-3">
            <h2 className="text-sm font-semibold text-fg">Recentes</h2>
            {!!items?.length && (
              <button onClick={() => go("history")} className="group flex items-center gap-1 text-xs text-fg-3 hover:text-fg">
                Ver histórico
                <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
          {items === null ? (
            <div className="space-y-2 px-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-11 rounded-[10px]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-panel px-6 py-10 text-center hairline">
              <p className="text-sm text-fg-2">Suas traduções vão aparecer aqui.</p>
              <p className="mx-auto mt-1 max-w-[44ch] text-xs text-fg-3">
                Abra qualquer janela com texto, use o atalho e selecione um trecho. A tradução aparece ao lado, sem
                trocar de aplicativo.
              </p>
            </div>
          ) : (
            <ul className="space-y-px">
              {items.map((item) => (
                <RecentRow key={item.id} item={item} />
              ))}
            </ul>
          )}
        </section>

        {stats && stats.total > 0 && (
          <p className="mt-8 px-3 text-xs text-fg-3">
            {plural(stats.today, "tradução hoje", "traduções hoje")}, {plural(stats.week, "nesta semana", "nesta semana")} e{" "}
            {plural(stats.total, "no total", "no total")}.
          </p>
        )}
      </div>
    </div>
  );
}
