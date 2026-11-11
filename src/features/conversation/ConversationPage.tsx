import { useEffect, useState } from "react";
import { MessagesSquare, Square } from "lucide-react";

import { Button, Keys, PageHeader, Row, Section, Segmented, Slider, Switch } from "@/components/ui/controls";
import { LanguageField } from "@/features/settings/TranslationPage";
import { shortcutKeys } from "@/lib/format";
import { api, events, on } from "@/lib/ipc";
import { languageName } from "@/lib/languages";
import type { PopupPayload } from "@/lib/types";
import { useLive } from "@/stores/live";
import { useNav } from "@/stores/navigation";
import { useSettings } from "@/stores/settings";

function useConversationLanguage() {
  const [lang, setLang] = useState<string | null>(null);
  useEffect(() => {
    void api.live.conversationLanguage().then(setLang);
    const offLive = on<PopupPayload>(events.liveState, (p) => p.detectedLang && setLang(p.detectedLang));
    const offPopup = on<PopupPayload>(events.popupState, (p) => p.detectedLang && setLang(p.detectedLang));
    return () => {
      offLive();
      offPopup();
    };
  }, []);
  return lang;
}

function ShortcutHint({ accelerator }: { accelerator: string }) {
  const go = useNav((s) => s.go);
  return accelerator ? (
    <button onClick={() => go("shortcuts")} title="Alterar atalho" className="rounded-[8px] p-1 hover:bg-white/[0.04]">
      <Keys keys={shortcutKeys(accelerator)} size="sm" />
    </button>
  ) : (
    <Button size="sm" variant="ghost" onClick={() => go("shortcuts")}>
      Definir atalho
    </Button>
  );
}

export function ConversationPage() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const live = useLive();
  const detected = useConversationLanguage();

  useEffect(() => {
    void useLive.getState().refresh();
  }, []);

  if (!settings) return null;
  const c = settings.compose;
  const fixed = c.targetLang !== "conversation";
  const ownLang = settings.translation.targetLang;
  const effective = fixed ? c.targetLang : detected && detected !== ownLang ? detected : c.fallbackLang;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-10 pb-12 pt-8">
        <PageHeader
          title="Conversas"
          description="Para Discord, WhatsApp Web, jogos e qualquer chat: traduza o que chega e responda no idioma da outra pessoa."
        />

        <Section
          title="Mensagens recebidas"
          description="Escolha a área do chat uma vez. Cada mensagem nova é traduzida sozinha, numa janela fixa ao lado."
        >
          <Row
            title={
              live.active ? (
                <span className="flex items-center gap-2">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-sage" />
                  Traduzindo uma área ao vivo
                </span>
              ) : (
                "Traduzir área ao vivo"
              )
            }
            description={live.active ? "A janela ao vivo também tem um botão para parar." : undefined}
          >
            <div className="flex items-center gap-3">
              <ShortcutHint accelerator={settings.shortcuts.live} />
              {live.active ? (
                <Button variant="danger" icon={Square} onClick={live.stop}>
                  Parar
                </Button>
              ) : (
                <Button variant="primary" icon={MessagesSquare} onClick={live.toggle}>
                  Escolher área
                </Button>
              )}
            </div>
          </Row>
          <Row
            title="Verificar a cada"
            description="Intervalos menores mostram as mensagens antes, com um pouco mais de uso do processador."
          >
            <Slider
              label="Intervalo de verificação"
              value={settings.live.intervalMs}
              min={400}
              max={5000}
              step={100}
              format={(v) => `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`}
              onChange={(v) => update((d) => void (d.live.intervalMs = v), { debounce: true })}
            />
          </Row>
          <Row title="Mostrar o texto original" description="Também dá para ligar e desligar na própria janela ao vivo.">
            <Switch
              checked={settings.live.showOriginal}
              onChange={(v) => update((d) => void (d.live.showOriginal = v))}
              label="Mostrar o texto original"
            />
          </Row>
        </Section>

        <Section
          title="Suas mensagens"
          description="Escreva em português no campo do chat e use o atalho: o texto é trocado pela tradução, pronto para enviar."
        >
          <Row title="Atalho">
            <ShortcutHint accelerator={settings.shortcuts.compose} />
          </Row>
          <Row
            title="Traduzir para"
            description={
              fixed
                ? undefined
                : detected && detected !== ownLang
                  ? `Agora: ${languageName(detected)}, detectado nas mensagens recebidas.`
                  : `Nenhum idioma detectado ainda. Até lá, usa ${languageName(c.fallbackLang).toLowerCase()}.`
            }
          >
            <Segmented
              label="Idioma das suas mensagens"
              value={fixed ? "fixed" : "conversation"}
              onChange={(v) =>
                update((d) => {
                  d.compose.targetLang = v === "fixed" ? effective : "conversation";
                })
              }
              options={[
                { value: "conversation", label: "Idioma da conversa" },
                { value: "fixed", label: "Idioma fixo" },
              ]}
            />
          </Row>
          {fixed ? (
            <Row title="Idioma fixo">
              <LanguageField
                label="Idioma fixo das suas mensagens"
                value={c.targetLang}
                onChange={(code) => update((d) => void (d.compose.targetLang = code))}
              />
            </Row>
          ) : (
            <Row title="Enquanto não detectar" description="Usado antes de chegar a primeira mensagem traduzida.">
              <LanguageField
                label="Idioma reserva"
                value={c.fallbackLang}
                onChange={(code) => update((d) => void (d.compose.fallbackLang = code))}
              />
            </Row>
          )}
        </Section>

        <Section title="Como responder">
          <ol className="space-y-3 px-4 py-4 text-sm text-fg-2">
            {[
              "Clique no campo de mensagem do chat e escreva em português.",
              <>
                Aperte <Keys keys={shortcutKeys(settings.shortcuts.compose || "Alt+E")} size="sm" /> e espere um instante.
              </>,
              `O texto vira ${languageName(effective).toLowerCase()}. Confira e envie normalmente.`,
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-2xs text-fg-2">
                  {i + 1}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
