import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, CircleAlert, Download, ExternalLink, Gauge, KeyRound, ScanText } from "lucide-react";

import { Button, Input, PageHeader, Row, Section, Segmented, Spinner, Switch } from "@/components/ui/controls";
import { LanguagePicker } from "@/features/languages/LanguagePicker";
import { cn } from "@/lib/cn";
import { api, errorMessage } from "@/lib/ipc";
import { languageName, OCR_INSTALLABLE } from "@/lib/languages";
import type { Provider, ProviderStatus } from "@/lib/types";
import { useSettings } from "@/stores/settings";
import { ocrCodes, ocrReady, useSystem } from "@/stores/system";
import { toast } from "@/stores/toast";

export function LanguageField({ value, allowAuto, onChange, label }: { value: string; allowAuto?: boolean; onChange: (c: string) => void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const ocr = useSystem((s) => s.ocr);
  const codes = useMemo(() => ocrCodes(ocr), [ocr]);
  return (
    <>
      <button
        ref={ref}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-[220px] items-center justify-between gap-2 rounded-control bg-ink-0/70 px-3 text-sm text-fg hairline hover:bg-ink-3"
      >
        <span className="truncate">{languageName(value)}</span>
        <ChevronDown size={14} className="text-fg-3" />
      </button>
      <LanguagePicker
        open={open}
        anchor={ref.current}
        value={value}
        allowAuto={allowAuto}
        ocrCodes={allowAuto ? codes : undefined}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        align="end"
      />
    </>
  );
}

const PROVIDERS: Array<{ id: Provider; name: string; description: string; keyUrl?: string }> = [
  {
    id: "google",
    name: "Google Tradutor",
    description: "Funciona na hora, sem cadastro. Usa um serviço não oficial, que pode limitar uso muito intenso.",
  },
  {
    id: "deepl",
    name: "DeepL",
    description: "Traduções mais naturais. O plano gratuito inclui 500 mil caracteres por mês.",
    keyUrl: "https://www.deepl.com/pro-api",
  },
  {
    id: "microsoft",
    name: "Microsoft Translator",
    description: "Serviço oficial do Azure. O plano gratuito inclui 2 milhões de caracteres por mês.",
    keyUrl: "https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation",
  },
];

function StatusPill({ status }: { status?: ProviderStatus }) {
  if (!status) return null;
  if (!status.needsKey) return <span className="text-2xs text-fg-3">Sem chave</span>;
  return status.hasKey ? (
    <span className="tabular flex items-center gap-1 text-2xs text-fg-3">
      <KeyRound size={11} /> {status.keyHint}
    </span>
  ) : (
    <span className="text-2xs text-warn">Precisa de chave</span>
  );
}

function openExternal(url: string) {
  api.app.openUrl(url).catch((e) => toast.error(errorMessage(e)));
}

function ProviderConfig({ id, status }: { id: Provider; status?: ProviderStatus }) {
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const refresh = useSystem((s) => s.refreshProviders);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<{ state: "idle" | "running" | "ok" | "error"; text?: string }>({ state: "idle" });
  const meta = PROVIDERS.find((p) => p.id === id)!;

  const saveKey = async (value: string) => {
    setSaving(true);
    try {
      await api.providers.setKey(id, value);
      await refresh();
      setKey("");
      setTest({ state: "idle" });
      toast.success(value ? "Chave salva no Gerenciador de Credenciais do Windows" : "Chave removida");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTest({ state: "running" });
    try {
      const ms = await api.providers.test(id);
      setTest({ state: "ok", text: `Funcionando, respondeu em ${ms} ms` });
    } catch (e) {
      setTest({ state: "error", text: errorMessage(e) });
    }
  };

  return (
    <div className="space-y-3 pb-1 pl-8 pt-3">
      {id !== "google" && (
        <div className="flex items-center gap-2">
          <Input
            revealable
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={status?.hasKey ? `Chave salva (${status.keyHint}). Cole outra para trocar` : "Cole sua chave de API"}
            aria-label={`Chave de API do ${meta.name}`}
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && key.trim() && saveKey(key)}
          />
          <Button variant="secondary" disabled={!key.trim()} loading={saving} onClick={() => saveKey(key)}>
            Salvar chave
          </Button>
          {status?.hasKey && (
            <Button variant="ghost" onClick={() => saveKey("")}>
              Remover
            </Button>
          )}
        </div>
      )}
      {id === "microsoft" && (
        <div className="flex items-center gap-3">
          <span className="w-[120px] text-xs text-fg-3">Região do recurso</span>
          <Input
            value={settings.translation.microsoftRegion}
            onChange={(e) => update((d) => void (d.translation.microsoftRegion = e.target.value), { debounce: true })}
            placeholder="ex.: brazilsouth (vazio se for global)"
            aria-label="Região do recurso Azure"
            className="w-[300px]"
          />
        </div>
      )}
      {id === "deepl" && (
        <div className="flex items-center gap-3">
          <span className="w-[120px] text-xs text-fg-3">Tratamento</span>
          <Segmented
            label="Formalidade"
            value={settings.translation.deeplFormality}
            onChange={(v) => update((d) => void (d.translation.deeplFormality = v))}
            options={[
              { value: "default", label: "Padrão" },
              { value: "more", label: "Formal" },
              { value: "less", label: "Informal" },
            ]}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" icon={Gauge} onClick={runTest} disabled={test.state === "running" || (id !== "google" && !status?.hasKey)}>
          Testar conexão
        </Button>
        {meta.keyUrl && (
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openExternal(meta.keyUrl!)}>
            Obter uma chave
          </Button>
        )}
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs",
            test.state === "ok" && "text-sage",
            test.state === "error" && "text-danger",
            test.state === "running" && "text-fg-3",
          )}
        >
          {test.state === "running" && (
            <>
              <Spinner className="size-3" /> Testando…
            </>
          )}
          {test.state === "ok" && (
            <>
              <Check size={13} /> {test.text}
            </>
          )}
          {test.state === "error" && (
            <>
              <CircleAlert size={13} className="shrink-0" /> {test.text}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function ProviderList() {
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const providers = useSystem((s) => s.providers);
  const current = settings.translation.provider;

  return (
    <>
      {PROVIDERS.map((p) => {
        const selected = p.id === current;
        const status = providers.find((s) => s.provider === p.id);
        return (
          <div key={p.id} className={cn("px-4 py-3.5 transition-colors", selected && "bg-white/[0.02]")}>
            <button
              role="radio"
              aria-checked={selected}
              onClick={() => update((d) => void (d.translation.provider = p.id))}
              className="flex w-full items-start gap-3 text-left"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full transition-colors",
                  selected ? "bg-sage" : "hairline bg-ink-0/60",
                )}
              >
                {selected && <span className="size-[7px] rounded-full bg-sage-ink" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm text-fg">{p.name}</span>
                  <StatusPill status={status} />
                </span>
                <span className="mt-0.5 block max-w-[60ch] text-xs text-fg-3">{p.description}</span>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {selected && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <ProviderConfig id={p.id} status={status} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

function OcrSection() {
  const settings = useSettings((s) => s.settings)!;
  const update = useSettings((s) => s.update);
  const ocr = useSystem((s) => s.ocr);
  const installing = useSystem((s) => s.installing);
  const setInstalling = useSystem((s) => s.setInstalling);
  const source = settings.translation.sourceLang;
  const state = ocrReady(ocr, source);

  const install = async (code: string) => {
    try {
      setInstalling(code);
      await api.ocr.install(code);
      toast.show("Confirme a permissão de administrador para instalar o idioma.");
    } catch (e) {
      setInstalling(null);
      toast.error(errorMessage(e));
    }
  };

  return (
    <Section
      title="Reconhecimento de texto"
      description="Feito pelo próprio Windows, offline. Cada idioma de origem precisa do seu pacote instalado."
    >
      <Row
        stacked
        title="Idiomas instalados"
        description={ocr && !ocr.available ? ocr.error ?? "Indisponível neste sistema." : undefined}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {ocr === null && <span className="skeleton h-6 w-40 rounded-[6px]" />}
          {ocr?.languages.map((l) => (
            <span key={l.tag} className="inline-flex h-6 items-center gap-1.5 rounded-[6px] bg-white/[0.05] px-2 text-xs text-fg-2 hairline">
              <ScanText size={12} className="text-sage" />
              {l.name}
            </span>
          ))}
          {ocr?.available && ocr.languages.length === 0 && <span className="text-xs text-warn">Nenhum idioma instalado.</span>}
          <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => api.ocr.openLanguageSettings()} className="ml-1">
            Idiomas do Windows
          </Button>
        </div>
      </Row>
      {state === "missing" && source !== "auto" && (
        <Row
          title={
            <span className="flex items-center gap-2 text-warn">
              <CircleAlert size={14} /> {languageName(source)} ainda não pode ser lido
            </span>
          }
          description="O download vem da Microsoft e pede permissão de administrador."
        >
          <Button variant="primary" icon={Download} loading={installing === source} onClick={() => install(source)}>
            Instalar {languageName(source)}
          </Button>
        </Row>
      )}
      {state === "unsupported" && ocr?.available && source !== "auto" && !OCR_INSTALLABLE.has(source) && (
        <Row
          title={<span className="text-warn">O Windows não oferece reconhecimento para {languageName(source)}</span>}
          description="Textos nesse idioma não podem ser lidos da tela. Escolha outro idioma de origem."
        />
      )}
      <Row title="Juntar linhas do mesmo parágrafo" description="Frases quebradas em várias linhas são traduzidas inteiras, com mais contexto.">
        <Switch checked={settings.ocr.mergeLines} onChange={(v) => update((d) => void (d.ocr.mergeLines = v))} label="Juntar linhas" />
      </Row>
      <Row title="Ampliar textos pequenos" description="Melhora a leitura de legendas, menus e fontes pequenas.">
        <Switch checked={settings.ocr.upscaleSmall} onChange={(v) => update((d) => void (d.ocr.upscaleSmall = v))} label="Ampliar textos pequenos" />
      </Row>
    </Section>
  );
}

export function TranslationPage() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  if (!settings) return null;
  const t = settings.translation;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-10 pb-12 pt-8">
        <PageHeader title="Tradução e idiomas" description="Escolha os idiomas padrão e o serviço que faz as traduções." />

        <Section title="Idiomas">
          <Row title="Traduzir de" description="Com detecção automática, o idioma é identificado em cada seleção.">
            <LanguageField
              label="Idioma de origem"
              value={t.sourceLang}
              allowAuto
              onChange={(c) =>
                update((d) => {
                  if (c === d.translation.targetLang && d.translation.sourceLang !== "auto") d.translation.targetLang = d.translation.sourceLang;
                  d.translation.sourceLang = c;
                })
              }
            />
          </Row>
          <Row title="Traduzir para">
            <LanguageField
              label="Idioma de destino"
              value={t.targetLang}
              onChange={(c) =>
                update((d) => {
                  if (c === d.translation.sourceLang) d.translation.sourceLang = d.translation.targetLang;
                  d.translation.targetLang = c;
                })
              }
            />
          </Row>
        </Section>

        <Section title="Serviço de tradução">
          <div role="radiogroup" aria-label="Serviço de tradução" className="divide-y divide-line-soft">
            <ProviderList />
          </div>
          {t.provider !== "google" && (
            <Row title="Usar o Google se o serviço falhar" description="Evita ficar sem tradução quando a cota acaba ou a chave expira.">
              <Switch checked={t.fallbackToGoogle} onChange={(v) => update((d) => void (d.translation.fallbackToGoogle = v))} label="Usar Google como reserva" />
            </Row>
          )}
        </Section>

        <OcrSection />
      </div>
    </div>
  );
}
