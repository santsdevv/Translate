import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button, PageHeader, Row, Section, Segmented, Slider, Switch } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useSettings } from "@/stores/settings";
import { useSystem } from "@/stores/system";
import { toast } from "@/stores/toast";
import { Mark } from "@/features/shell/Shell";

export function GeneralPage() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const reset = useSettings((s) => s.reset);
  const info = useSystem((s) => s.info);
  const [confirmReset, setConfirmReset] = useState(false);
  if (!settings) return null;
  const g = settings.general;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-10 pb-12 pt-8">
        <PageHeader title="Geral" />

        <Section title="Inicialização">
          <Row title="Abrir com o Windows" description="O Translate fica pronto na bandeja assim que você entra no Windows.">
            <Switch checked={g.launchAtStartup} onChange={(v) => update((d) => void (d.general.launchAtStartup = v))} label="Abrir com o Windows" />
          </Row>
          <Row title="Começar minimizado" description="Abre direto na bandeja, sem mostrar esta janela.">
            <Switch checked={g.startMinimized} onChange={(v) => update((d) => void (d.general.startMinimized = v))} label="Começar minimizado" />
          </Row>
          <Row title="Fechar para a bandeja" description="O X esconde a janela e os atalhos continuam funcionando. Para sair, use o ícone da bandeja.">
            <Switch checked={g.closeToTray} onChange={(v) => update((d) => void (d.general.closeToTray = v))} label="Fechar para a bandeja" />
          </Row>
        </Section>

        <Section title="Seleção">
          <Row title="Lupa de precisão" description="Mostra uma ampliação ao redor do cursor enquanto você seleciona.">
            <Switch checked={g.showMagnifier} onChange={(v) => update((d) => void (d.general.showMagnifier = v))} label="Lupa de precisão" />
          </Row>
          <Row title="Animações">
            <Segmented
              label="Animações"
              value={g.motion}
              onChange={(v) => update((d) => void (d.general.motion = v))}
              options={[
                { value: "system", label: "Como o Windows" },
                { value: "reduced", label: "Reduzidas" },
                { value: "full", label: "Completas" },
              ]}
            />
          </Row>
        </Section>

        <Section title="Histórico">
          <Row title="Salvar traduções no histórico" description="Fica só neste computador.">
            <Switch checked={g.saveHistory} onChange={(v) => update((d) => void (d.general.saveHistory = v))} label="Salvar histórico" />
          </Row>
          {g.saveHistory && (
            <Row title="Guardar até" description="As mais antigas saem primeiro. Favoritas nunca são apagadas.">
              <Slider
                label="Limite do histórico"
                value={g.historyLimit}
                min={100}
                max={10000}
                step={100}
                width={160}
                format={(v) => v.toLocaleString("pt-BR")}
                onChange={(v) => update((d) => void (d.general.historyLimit = v), { debounce: true })}
              />
            </Row>
          )}
        </Section>

        <Section title="Sobre">
          <div className="flex items-center gap-4 px-4 py-4">
            <Mark size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">Translate</p>
              <p className="tabular text-xs text-fg-3">Versão {info?.version ?? "…"}</p>
            </div>
            <Button variant="ghost" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
              Restaurar padrões
            </Button>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar as configurações padrão?"
        confirmLabel="Restaurar"
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          await reset();
          toast.success("Configurações restauradas");
        }}
      >
        Idiomas, atalhos e aparência voltam ao padrão. O histórico e as chaves de API são mantidos.
      </ConfirmDialog>
    </div>
  );
}
