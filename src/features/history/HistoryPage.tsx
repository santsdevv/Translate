import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Download, FileJson, FileSpreadsheet, History as HistoryIcon, Search, Star, Trash2, X } from "lucide-react";

import { Button, IconButton, Input, Segmented, Switch } from "@/components/ui/controls";
import { ConfirmDialog, Popover } from "@/components/ui/overlays";
import { cn } from "@/lib/cn";
import { fullDate, plural, relativeTime } from "@/lib/format";
import { api, errorMessage, events, on } from "@/lib/ipc";
import { languageName } from "@/lib/languages";
import type { HistoryEntry } from "@/lib/types";
import { useNav } from "@/stores/navigation";
import { toast } from "@/stores/toast";

const PAGE = 200;
const PROVIDER_NAMES = { google: "Google Tradutor", deepl: "DeepL", microsoft: "Microsoft Translator" } as const;

function useHistory(search: string, favoritesOnly: boolean) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const loadingMore = useRef(false);

  const reload = useCallback(async () => {
    const page = await api.history.list({ search, favoritesOnly, limit: Math.max(PAGE, itemsRef.current.length) });
    setItems(page.items);
    setTotal(page.total);
    setLoading(false);
  }, [search, favoritesOnly]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const loadMore = useCallback(async () => {
    if (loadingMore.current || itemsRef.current.length >= total) return;
    loadingMore.current = true;
    const page = await api.history.list({ search, favoritesOnly, offset: itemsRef.current.length, limit: PAGE });
    setItems((prev) => [...prev, ...page.items]);
    setTotal(page.total);
    loadingMore.current = false;
  }, [search, favoritesOnly, total]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void reload(), search ? 180 : 0);
    return () => clearTimeout(t);
  }, [reload, search]);

  useEffect(() => on(events.historyChanged, () => void reload()), [reload]);

  return { items, total, loading, loadMore, setItems };
}

function ExportMenu() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const run = async (format: "json" | "csv") => {
    setOpen(false);
    try {
      const path = await api.history.export(format);
      if (path) toast.success(`Histórico exportado para ${path}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <>
      <Button ref={ref} variant="ghost" icon={Download} onClick={() => setOpen((o) => !o)}>
        Exportar
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref.current} align="end" className="!w-[230px] p-1.5">
        {(
          [
            ["json", FileJson, "JSON", "Para backup ou outros apps"],
            ["csv", FileSpreadsheet, "Planilha CSV", "Abre no Excel"],
          ] as const
        ).map(([fmt, Icon, label, hint]) => (
          <button
            key={fmt}
            onClick={() => run(fmt)}
            className="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left hover:bg-white/[0.06]"
          >
            <Icon size={16} className="text-fg-3" />
            <span>
              <span className="block text-sm text-fg">{label}</span>
              <span className="block text-2xs text-fg-3">{hint}</span>
            </span>
          </button>
        ))}
      </Popover>
    </>
  );
}

function Detail({ item, onDeleted }: { item: HistoryEntry; onDeleted: () => void }) {
  const from = item.detectedLang ?? item.sourceLang;
  const copy = async (text: string, what: string) => {
    await api.app.copy(text);
    toast.success(`${what} copiado`);
  };
  return (
    <motion.article
      key={item.id}
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col"
    >
      <header className="flex items-center gap-3 border-b border-line-soft px-7 py-3.5">
        <div className="min-w-0 flex-1 text-xs text-fg-3">
          <span className="text-fg-2">
            {languageName(from)} para {languageName(item.targetLang).toLowerCase()}
          </span>
          <span className="mx-2 text-fg-3/60">/</span>
          {fullDate(item.createdAt)}
        </div>
        <IconButton
          icon={Star}
          label={item.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          active={item.favorite}
          onClick={() => api.history.favorite(item.id, !item.favorite)}
          className={item.favorite ? "[&_svg]:fill-current" : ""}
        />
        <IconButton
          icon={Trash2}
          label="Excluir"
          onClick={async () => {
            await api.history.remove(item.id);
            onDeleted();
          }}
          className="hover:!text-danger"
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="group">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-sage">Tradução</h3>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(item.translatedText, "Tradução")}>
              Copiar
            </Button>
          </div>
          <p className="selectable whitespace-pre-wrap text-lg leading-[1.65rem] text-fg">{item.translatedText}</p>
        </div>
        <div className="my-6 h-px bg-line-soft" />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-fg-3">Texto original</h3>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => copy(item.sourceText, "Original")}>
              Copiar
            </Button>
          </div>
          <p className="selectable whitespace-pre-wrap text-sm leading-6 text-fg-2">{item.sourceText}</p>
        </div>
      </div>
      <footer className="border-t border-line-soft px-7 py-3 text-2xs text-fg-3">
        Traduzido com {PROVIDER_NAMES[item.provider] ?? item.provider}
      </footer>
    </motion.article>
  );
}

export function HistoryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "fav">("all");
  const { items, total, loading, loadMore } = useHistory(search, filter === "fav");
  const focusId = useNav((s) => s.focusHistoryId);
  const [selectedId, setSelectedId] = useState<number | null>(focusId);
  const [confirmClear, setConfirmClear] = useState(false);
  const [keepFavorites, setKeepFavorites] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  useEffect(() => {
    if (!loading && !selected && items.length) setSelectedId(items[0].id);
  }, [loading, items, selected]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 68,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (last && last.index >= items.length - 20) void loadMore();
  }, [virtualItems, items.length, loadMore]);

  useEffect(() => {
    if (focusId == null) return;
    const idx = items.findIndex((i) => i.id === focusId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "center" });
  }, [focusId, items, virtualizer]);

  const move = (delta: number) => {
    const idx = items.findIndex((i) => i.id === selectedId);
    const next = items[Math.max(0, Math.min(items.length - 1, idx + delta))];
    if (next) {
      setSelectedId(next.id);
      virtualizer.scrollToIndex(items.indexOf(next), { align: "auto" });
    }
  };

  const emptyAll = !loading && total === 0 && !search && filter === "all";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 px-7 pb-4 pt-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Histórico</h1>
          <p className="mt-0.5 text-xs text-fg-3">{loading ? " " : plural(total, "tradução", "traduções")}</p>
        </div>
        <ExportMenu />
        <Button variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)} disabled={emptyAll}>
          Limpar
        </Button>
      </header>

      {emptyAll ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
          <HistoryIcon size={28} strokeWidth={1.5} className="text-fg-3" />
          <p className="mt-3 text-sm text-fg-2">Nenhuma tradução ainda.</p>
          <p className="mt-1 max-w-[40ch] text-xs text-fg-3">
            Tudo que você traduzir fica salvo aqui, com busca e favoritos.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 border-t border-line-soft">
          <div className="flex w-[340px] shrink-0 flex-col border-r border-line-soft">
            <div className="space-y-2.5 px-4 py-3">
              <Input
                icon={Search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar no histórico"
                aria-label="Buscar no histórico"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    move(1);
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    move(-1);
                  }
                }}
              />
              <Segmented
                label="Filtro"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "Todas" },
                  { value: "fav", label: "Favoritas", icon: Star },
                ]}
              />
            </div>
            <div
              ref={scrollRef}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  move(1);
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  move(-1);
                }
              }}
              className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 focus-visible:outline-none"
            >
              {!loading && items.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-fg-3">
                  {filter === "fav" && !search ? "Marque traduções com a estrela para encontrá-las aqui." : "Nada encontrado."}
                </p>
              )}
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((v) => {
                  const item = items[v.index];
                  const isSelected = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      data-index={v.index}
                      ref={virtualizer.measureElement}
                      onClick={() => setSelectedId(item.id)}
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` }}
                      className="block py-px text-left"
                    >
                      <div
                        className={cn(
                          "rounded-[9px] px-3 py-2.5 transition-colors duration-100",
                          isSelected ? "bg-white/[0.07] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]" : "hover:bg-white/[0.03]",
                        )}
                      >
                        <div className="flex items-baseline gap-2">
                          <p className={cn("min-w-0 flex-1 truncate text-sm", isSelected ? "text-fg" : "text-fg/90")}>
                            {item.translatedText}
                          </p>
                          {item.favorite && <Star size={10} className="shrink-0 fill-sage text-sage" />}
                          <span className="tabular shrink-0 text-2xs text-fg-3">{relativeTime(item.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-fg-3">{item.sourceText}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <AnimatePresence mode="wait">
              {selected ? (
                <Detail
                  key={selected.id}
                  item={selected}
                  onDeleted={() => {
                    const idx = items.findIndex((i) => i.id === selected.id);
                    setSelectedId(items[idx + 1]?.id ?? items[idx - 1]?.id ?? null);
                    toast.show("Tradução excluída");
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-fg-3">
                  <X size={14} className="mr-2" /> Selecione uma tradução
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Limpar histórico?"
        confirmLabel="Limpar"
        tone="danger"
        onClose={() => setConfirmClear(false)}
        onConfirm={async () => {
          const n = await api.history.clear(keepFavorites);
          setSelectedId(null);
          toast.show(n ? `${plural(n, "tradução excluída", "traduções excluídas")}` : "Nada para excluir");
        }}
        extra={
          <label className="flex items-center justify-between gap-4 rounded-[10px] bg-white/[0.03] px-3 py-2.5 hairline">
            <span className="text-sm text-fg-2">Manter favoritas</span>
            <Switch checked={keepFavorites} onChange={setKeepFavorites} label="Manter favoritas" />
          </label>
        }
      >
        As traduções apagadas não podem ser recuperadas.
      </ConfirmDialog>
    </div>
  );
}
