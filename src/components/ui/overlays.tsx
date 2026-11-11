import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert } from "lucide-react";

import { cn } from "@/lib/cn";
import { useToasts } from "@/stores/toast";
import { Button } from "./controls";

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.14 } }}
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
            className="flex items-center gap-2 rounded-[10px] bg-ink-3/95 px-3.5 py-2 text-sm text-fg shadow-[0_10px_30px_rgb(0_0_0/0.55),inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur-xl"
          >
            {t.tone === "success" && <Check size={15} className="text-sage" />}
            {t.tone === "error" && <CircleAlert size={15} className="text-danger" />}
            <span className="max-w-[52ch]">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onClose: () => void;
  extra?: ReactNode;
}

export function ConfirmDialog({ open, title, children, confirmLabel, tone = "primary", onConfirm, onClose, extra }: ConfirmProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => confirmRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 backdrop-blur-[6px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="alertdialog"
            aria-modal
            aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
            className="w-[400px] rounded-[14px] bg-ink-2 p-5 shadow-[0_24px_70px_rgb(0_0_0/0.7),inset_0_0_0_1px_rgb(255_255_255/0.08)]"
          >
            <h2 className="text-base font-semibold text-fg">{title}</h2>
            {children && <div className="mt-1.5 text-sm text-fg-2">{children}</div>}
            {extra && <div className="mt-4">{extra}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                ref={confirmRef}
                variant={tone === "danger" ? "danger" : "primary"}
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  children: ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
}

export function Popover({ open, onClose, anchor, children, className, align = "start" }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchor]);

  const rect = anchor?.getBoundingClientRect();
  const width = 300;
  let left = rect ? rect.left : 0;
  if (rect && align === "end") left = rect.right - width;
  if (rect && align === "center") left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
  const top = rect ? rect.bottom + 8 : 0;
  const maxHeight = Math.min(380, Math.max(200, window.innerHeight - top - 16));

  return (
    <AnimatePresence>
      {open && rect && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -2, scale: 0.99, transition: { duration: 0.1 } }}
          transition={{ type: "spring", stiffness: 600, damping: 38 }}
          style={{ left, top, width, maxHeight, transformOrigin: "top" }}
          className={cn(
            "fixed z-[80] flex flex-col overflow-hidden rounded-[12px] bg-ink-2/92 shadow-[0_18px_50px_rgb(0_0_0/0.6),inset_0_0_0_1px_rgb(255_255_255/0.08)] backdrop-blur-2xl",
            className,
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
