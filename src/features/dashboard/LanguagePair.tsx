import { useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";
import { languageName } from "@/lib/languages";
import { LanguagePicker } from "@/features/languages/LanguagePicker";
import { useSettings } from "@/stores/settings";
import { ocrCodes, useSystem } from "@/stores/system";

function LangButton({
  value,
  allowAuto,
  onChange,
  align,
  label,
}: {
  value: string;
  allowAuto?: boolean;
  onChange: (code: string) => void;
  align?: "start" | "end";
  label: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const ocr = useSystem((s) => s.ocr);
  const codes = useMemo(() => ocrCodes(ocr), [ocr]);
  return (
    <>
      <button
        ref={ref}
        aria-label={`${label}: ${languageName(value)}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group -mx-2 flex min-w-0 items-center gap-2 rounded-[12px] px-2 py-1 text-left transition-colors duration-150 hover:bg-white/[0.04]",
          open && "bg-white/[0.05]",
        )}
      >
        <span
          className={cn(
            "truncate text-hero font-medium tracking-[-0.025em]",
            value === "auto" ? "text-fg-2" : "text-fg",
          )}
        >
          {languageName(value)}
        </span>
        <ChevronDown
          size={20}
          strokeWidth={2}
          className={cn("mt-1.5 shrink-0 text-fg-3 transition-transform duration-200 group-hover:text-fg-2", open && "rotate-180")}
        />
      </button>
      <LanguagePicker
        open={open}
        anchor={ref.current}
        value={value}
        allowAuto={allowAuto}
        ocrCodes={allowAuto ? codes : undefined}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        align={align}
      />
    </>
  );
}

export function LanguagePair() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  if (!settings) return null;
  const { sourceLang, targetLang } = settings.translation;
  const canSwap = sourceLang !== "auto";

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <LangButton
        label="Idioma de origem"
        value={sourceLang}
        allowAuto
        onChange={(code) =>
          update((d) => {
            if (code === d.translation.targetLang && d.translation.sourceLang !== "auto") {
              d.translation.targetLang = d.translation.sourceLang;
            }
            d.translation.sourceLang = code;
          })
        }
      />
      <button
        aria-label="Inverter idiomas"
        title={canSwap ? "Inverter idiomas" : "Escolha um idioma de origem para inverter"}
        disabled={!canSwap}
        onClick={() =>
          update((d) => {
            const s = d.translation.sourceLang;
            d.translation.sourceLang = d.translation.targetLang;
            d.translation.targetLang = s;
          })
        }
        className="group flex size-10 shrink-0 items-center justify-center rounded-full text-fg-3 transition-colors duration-150 hairline hover:bg-white/[0.05] hover:text-sage disabled:hover:bg-transparent disabled:hover:text-fg-3"
      >
        <ArrowLeftRight size={17} strokeWidth={1.8} className="transition-transform duration-300 group-enabled:group-hover:rotate-180" />
      </button>
      <LangButton
        label="Idioma de destino"
        value={targetLang}
        onChange={(code) =>
          update((d) => {
            if (code === d.translation.sourceLang) d.translation.sourceLang = d.translation.targetLang;
            d.translation.targetLang = code;
          })
        }
      />
    </div>
  );
}
