import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ScanText, Search } from "lucide-react";

import { Popover } from "@/components/ui/overlays";
import { cn } from "@/lib/cn";
import { AUTO, LANGUAGES, normalize, type Language } from "@/lib/languages";

interface Props {
  open: boolean;
  anchor: HTMLElement | null;
  value: string;
  allowAuto?: boolean;
  ocrCodes?: Set<string>;
  onSelect: (code: string) => void;
  onClose: () => void;
  align?: "start" | "end" | "center";
}

export function LanguagePicker({ open, anchor, value, allowAuto, ocrCodes, onSelect, onClose, align }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Language[]>(() => {
    const q = normalize(query.trim());
    const all = allowAuto ? [AUTO, ...LANGUAGES] : LANGUAGES;
    if (!q) return all;
    return all.filter((l) => normalize(l.name).includes(q) || normalize(l.native).includes(q) || l.code.toLowerCase() === q);
  }, [query, allowAuto]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    const idx = items.findIndex((l) => l.code === value);
    setCursor(idx >= 0 && !query ? idx : 0);
  }, [items, value, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const choose = (code: string) => {
    onSelect(code);
    onClose();
  };

  return (
    <Popover open={open} onClose={onClose} anchor={anchor} align={align}>
      <div className="flex items-center gap-2 border-b border-line-soft px-3 py-2.5">
        <Search size={14} className="text-fg-3" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(items.length - 1, c + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && items[cursor]) {
              choose(items[cursor].code);
            }
          }}
          placeholder="Buscar idioma"
          className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
        />
      </div>
      <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-3">Nenhum idioma com esse nome.</p>}
        {items.map((l, i) => {
          const selected = l.code === value;
          return (
            <button
              key={l.code}
              data-index={i}
              role="option"
              aria-selected={selected}
              onMouseEnter={() => setCursor(i)}
              onClick={() => choose(l.code)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[8px] px-2.5 py-[7px] text-left",
                i === cursor ? "bg-white/[0.06]" : "",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", selected ? "text-sage" : "text-fg")}>{l.name}</span>
                {l.code !== "auto" && l.native !== l.name && (
                  <span className="block truncate text-2xs text-fg-3">{l.native}</span>
                )}
                {l.code === "auto" && <span className="block text-2xs text-fg-3">O provedor identifica o idioma</span>}
              </span>
              {ocrCodes?.has(l.code) && (
                <span title="Reconhecimento de texto instalado" className="text-fg-3">
                  <ScanText size={13} />
                </span>
              )}
              {selected && <Check size={14} className="text-sage" />}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
