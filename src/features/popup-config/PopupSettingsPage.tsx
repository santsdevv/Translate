import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, MousePointer2, Sparkles } from "lucide-react";

import { PageHeader, Row, Section, Segmented, Slider, Switch } from "@/components/ui/controls";
import { PopupCard } from "@/features/popup/PopupCard";
import type { PopupPayload, PopupPhase } from "@/lib/types";
import { useSettings } from "@/stores/settings";

const SAMPLE = {
  original: "Your changes have been saved. Restart the application to apply the new settings.",
  translated: "Suas alterações foram salvas. Reinicie o aplicativo para aplicar as novas configurações.",
};

function Preview() {
  const settings = useSettings((s) => s.settings)!;
  const [phase, setPhase] = useState<PopupPhase>("done");
  const payload = useMemo<PopupPayload>(
    () => ({
      job: 1,
      phase,
      original: SAMPLE.original,
      translated: SAMPLE.translated,
      sourceLang: "auto",
      targetLang: settings.translation.targetLang,
      detectedLang: "en",
      provider: settings.translation.provider,
      fallbackUsed: false,
      error: null,
      historyId: null,
      appearance: { ...settings.popup, autoClose: false },
      reduceMotion: true,
      live: false,
    }),
    [settings.popup, settings.translation, phase],
  );

  return (
    <div className="mb-7">
      <div className="relative flex min-h-[236px] items-start overflow-hidden rounded-panel bg-[#1b2530] px-6 pb-6 pt-5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-x-6 top-5 h-[62px] rounded-[8px] bg-[#eef0ec] px-4 py-3">
            <div className="h-2.5 w-28 rounded bg-[#1b1d1c]/70" />
            <div className="mt-2.5 h-2 w-[86%] rounded bg-[#1b1d1c]/30" />
            <div className="mt-2 h-2 w-[58%] rounded bg-[#1b1d1c]/30" />
          </div>
          <div className="absolute left-[34px] top-[44px] h-[30px] w-[54%] rounded-[3px] shadow-[inset_0_0_0_1.5px_var(--color-sage)]" />
          <div className="absolute inset-x-6 bottom-0 top-[96px] rounded-t-[8px] bg-[#25313d]" />
          <div className="absolute inset-x-6 top-[96px] h-8 border-b border-white/5" />
        </div>
        <div className="relative ml-2 mt-[66px]">
          <PopupCard payload={payload} preview reduceMotion onClose={() => undefined} onCopy={() => undefined} />
        </div>
        <div className="absolute bottom-3 right-3">
          <Segmented
            label="Estado da pré-visualização"
            value={phase}
            onChange={setPhase}
            options={[
              { value: "done", label: "Pronta" },
              { value: "translating", label: "Traduzindo" },
              { value: "error", label: "Erro" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export function PopupSettingsPage() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  if (!settings) return null;
  const p = settings.popup;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-10 pb-12 pt-8">
        <PageHeader
          title="Janela flutuante"
          description="Aparece ao lado da área selecionada, sempre por cima, sem tirar o foco do aplicativo em uso."
        />
        <Preview />
        <div>
          <div>
            <Section title="Posição">
              <Row title="Onde aparecer" description="No automático, o Translate escolhe o lado com espaço livre.">
                <Segmented
                  label="Posição da janela"
                  value={p.placement}
                  onChange={(v) => update((d) => void (d.popup.placement = v))}
                  options={[
                    { value: "auto", label: "Automático", icon: Sparkles },
                    { value: "below", label: "Abaixo", icon: ArrowDownToLine },
                    { value: "above", label: "Acima", icon: ArrowUpToLine },
                    { value: "cursor", label: "Cursor", icon: MousePointer2 },
                  ]}
                />
              </Row>
            </Section>

            <Section title="Aparência">
              <Row title="Largura máxima">
                <Slider
                  label="Largura máxima"
                  value={p.maxWidth}
                  min={280}
                  max={640}
                  step={10}
                  format={(v) => `${v} px`}
                  onChange={(v) => update((d) => void (d.popup.maxWidth = v), { debounce: true })}
                />
              </Row>
              <Row title="Tamanho do texto">
                <Slider
                  label="Tamanho do texto"
                  value={p.fontSize}
                  min={12}
                  max={22}
                  format={(v) => `${v} px`}
                  onChange={(v) => update((d) => void (d.popup.fontSize = v), { debounce: true })}
                />
              </Row>
              <Row title="Opacidade do fundo">
                <Slider
                  label="Opacidade"
                  value={p.opacity}
                  min={60}
                  max={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => update((d) => void (d.popup.opacity = v), { debounce: true })}
                />
              </Row>
              <Row title="Mostrar texto original" description="Exibe o texto reconhecido abaixo da tradução.">
                <Switch checked={p.showOriginal} onChange={(v) => update((d) => void (d.popup.showOriginal = v))} label="Mostrar texto original" />
              </Row>
            </Section>

            <Section title="Comportamento">
              <Row title="Fechar ao clicar fora">
                <Switch
                  checked={p.dismissOnOutsideClick}
                  onChange={(v) => update((d) => void (d.popup.dismissOnOutsideClick = v))}
                  label="Fechar ao clicar fora"
                />
              </Row>
              <Row title="Fechar com Esc" description="Funciona mesmo com o foco em outro aplicativo.">
                <Switch checked={p.dismissOnEscape} onChange={(v) => update((d) => void (d.popup.dismissOnEscape = v))} label="Fechar com Esc" />
              </Row>
              <Row title="Fechar sozinha" description="Pausa enquanto o mouse estiver sobre a janela.">
                <div className="flex items-center gap-4">
                  {p.autoClose && (
                    <Slider
                      label="Segundos até fechar"
                      value={p.autoCloseSeconds}
                      min={3}
                      max={60}
                      width={120}
                      format={(v) => `${v} s`}
                      onChange={(v) => update((d) => void (d.popup.autoCloseSeconds = v), { debounce: true })}
                    />
                  )}
                  <Switch checked={p.autoClose} onChange={(v) => update((d) => void (d.popup.autoClose = v))} label="Fechar sozinha" />
                </div>
              </Row>
              <Row title="Copiar a tradução automaticamente" description="A tradução vai para a área de transferência assim que fica pronta.">
                <Switch checked={p.autoCopy} onChange={(v) => update((d) => void (d.popup.autoCopy = v))} label="Copiar automaticamente" />
              </Row>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
