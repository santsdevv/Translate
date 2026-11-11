import { useCallback, useEffect, useRef, useState } from "react";

import { Keys } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import type { CssRect, OverlayOpen } from "@/lib/types";

interface Props {
  open: OverlayOpen;
  url: string;
  onSubmit: (rect: CssRect) => void;
  onCancel: () => void;
}

type Point = { x: number; y: number };

const MAG_SIZE = 132;
const MAG_ZOOM = 5;
const MIN_SIZE = 6;

function normalize(a: Point, b: Point): CssRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function Brackets({ flash }: { flash: boolean }) {
  const base = "absolute size-[18px] transition-[border-color,transform] duration-150 ease-[var(--ease-out-soft)]";
  const color = flash ? "border-sage-strong" : "border-sage";
  const grow = flash ? "scale-110" : "";
  return (
    <>
      <span className={cn(base, color, grow, "-left-[3px] -top-[3px] origin-top-left rounded-tl-[5px] border-l-[3px] border-t-[3px]")} />
      <span className={cn(base, color, grow, "-right-[3px] -top-[3px] origin-top-right rounded-tr-[5px] border-r-[3px] border-t-[3px]")} />
      <span className={cn(base, color, grow, "-bottom-[3px] -left-[3px] origin-bottom-left rounded-bl-[5px] border-b-[3px] border-l-[3px]")} />
      <span className={cn(base, color, grow, "-bottom-[3px] -right-[3px] origin-bottom-right rounded-br-[5px] border-b-[3px] border-r-[3px]")} />
    </>
  );
}

export function Selection({ open, url, onSubmit, onCancel }: Props) {
  const [cursor, setCursor] = useState<Point | null>(null);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);
  const [shutter, setShutter] = useState(false);
  const raf = useRef(0);
  const pending = useRef<Point | null>(null);

  const rect = anchor && current ? normalize(anchor, current) : null;
  const dragging = !!anchor;

  const finish = useCallback(
    (r: CssRect) => {
      setShutter(true);
      setTimeout(() => onSubmit(r), 110);
    },
    [onSubmit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Enter" && rect && rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) finish(rect);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, finish, rect]);

  const move = (e: React.PointerEvent) => {
    pending.current = { x: e.clientX, y: e.clientY };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const p = pending.current!;
      setCursor(p);
      if (anchor) setCurrent(p);
    });
  };

  const down = (e: React.PointerEvent) => {
    if (shutter) return;
    if (e.button === 2) {
      if (anchor) {
        setAnchor(null);
        setCurrent(null);
      } else {
        onCancel();
      }
      return;
    }
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    setAnchor(p);
    setCurrent(p);
  };

  const up = (e: React.PointerEvent) => {
    if (e.button !== 0 || !anchor) return;
    const r = normalize(anchor, { x: e.clientX, y: e.clientY });
    if (r.width >= MIN_SIZE && r.height >= MIN_SIZE) {
      setCurrent({ x: e.clientX, y: e.clientY });
      finish(r);
    } else {
      setAnchor(null);
      setCurrent(null);
    }
  };

  const W = open.width;
  const H = open.height;
  const phys = (v: number) => Math.round(v * open.scale);

  let mag: { left: number; top: number } | null = null;
  if (open.showMagnifier && cursor && !shutter) {
    const off = 26;
    let left = cursor.x + off;
    let top = cursor.y + off;
    if (left + MAG_SIZE > W - 8) left = cursor.x - off - MAG_SIZE;
    if (top + MAG_SIZE + 26 > H - 8) top = cursor.y - off - MAG_SIZE - 26;
    mag = { left, top };
  }

  let label: { left: number; top: number } | null = null;
  if (rect && rect.width > 2) {
    let top = rect.y + rect.height + 10;
    if (top + 26 > H) top = rect.y + rect.height - 34;
    label = { left: Math.min(rect.x + rect.width - 2, W - 8), top };
  }

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden"
      style={{ cursor: "crosshair" }}
      onPointerMove={move}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={() => !dragging && setCursor(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />

      {!rect || rect.width < 1 ? (
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
      ) : (
        <div
          className="pointer-events-none absolute"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: `0 0 0 100vmax rgb(0 0 0 / ${shutter ? 0.62 : 0.52})`,
            transition: "box-shadow 110ms",
          }}
        >
          <div
            className={cn(
              "absolute inset-0 transition-[background-color,box-shadow] duration-100",
              shutter ? "bg-sage/[0.16] shadow-[inset_0_0_0_1px_var(--color-sage-strong)]" : "shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)]",
            )}
          />
          <Brackets flash={shutter} />
        </div>
      )}

      {cursor && !dragging && (
        <>
          <div className="pointer-events-none absolute inset-x-0 h-px bg-white/[0.16]" style={{ top: cursor.y }} />
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white/[0.16]" style={{ left: cursor.x }} />
        </>
      )}

      {label && rect && (
        <div
          className="tabular pointer-events-none absolute -translate-x-full rounded-[6px] bg-black/75 px-2 py-[3px] text-2xs font-medium text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] backdrop-blur-md"
          style={{ left: label.left, top: label.top }}
        >
          {phys(rect.width)} × {phys(rect.height)}
        </div>
      )}

      {mag && cursor && (
        <div className="pointer-events-none absolute" style={{ left: mag.left, top: mag.top }}>
          <div
            className="relative overflow-hidden rounded-[12px] shadow-[0_0_0_1px_rgb(255_255_255/0.16),0_12px_30px_rgb(0_0_0/0.6)]"
            style={{
              width: MAG_SIZE,
              height: MAG_SIZE,
              backgroundImage: `url("${url}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${W * MAG_ZOOM}px ${H * MAG_ZOOM}px`,
              backgroundPosition: `${-(cursor.x * MAG_ZOOM - MAG_SIZE / 2)}px ${-(cursor.y * MAG_ZOOM - MAG_SIZE / 2)}px`,
              imageRendering: "pixelated",
              backgroundColor: "#000",
            }}
          >
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-sage/60" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-sage/60" />
          </div>
          <div className="tabular mt-1.5 text-center text-2xs font-medium text-fg/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.9)]">
            {phys(cursor.x)}, {phys(cursor.y)}
          </div>
        </div>
      )}

      <div
        className={cn(
          "pointer-events-none absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/70 py-1.5 pl-4 pr-2 text-xs text-fg-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1),0_8px_24px_rgb(0_0_0/0.4)] backdrop-blur-xl transition-opacity duration-200",
          dragging || shutter ? "opacity-0" : "opacity-100",
        )}
      >
        {open.mode === "live" ? (
          <span>
            <span className="font-medium text-sage">Ao vivo:</span> arraste sobre a área que quer acompanhar, como o chat
          </span>
        ) : (
          "Arraste sobre o texto que quer traduzir"
        )}
        <span className="flex items-center gap-1.5 text-fg-3">
          <Keys keys={["Esc"]} size="sm" /> cancela
        </span>
      </div>
    </div>
  );
}
