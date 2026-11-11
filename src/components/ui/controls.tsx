import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-sage text-sage-ink font-semibold hover:bg-sage-strong active:translate-y-px shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_1px_2px_rgb(0_0_0/0.4)]",
  secondary: "bg-ink-3 text-fg hairline hover:bg-ink-4 active:translate-y-px",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/[0.05]",
  danger: "bg-danger/12 text-danger hover:bg-danger/20",
};
const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-[7px]",
  md: "h-8 px-3 text-sm gap-2 rounded-control",
  lg: "h-10 px-4 text-sm gap-2 rounded-[10px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-[background-color,color,transform] duration-150 disabled:pointer-events-none disabled:opacity-45",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : Icon ? <Icon size={size === "sm" ? 14 : 15} strokeWidth={2} /> : null}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent", className)}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: "sm" | "md";
  tooltipSide?: "top" | "bottom";
}

export function IconButton({ icon: Icon, label, active, size = "md", tooltipSide = "bottom", className, ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "group/ib relative inline-flex shrink-0 items-center justify-center rounded-[7px] transition-colors duration-150",
        size === "sm" ? "size-7" : "size-8",
        active ? "bg-sage/14 text-sage" : "text-fg-3 hover:bg-white/[0.06] hover:text-fg",
        className,
      )}
      {...rest}
    >
      <Icon size={size === "sm" ? 15 : 16} strokeWidth={1.9} />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-ink-4 px-2 py-1 text-2xs font-medium text-fg opacity-0 shadow-lg transition-opacity delay-0 duration-100 group-hover/ib:opacity-100 group-hover/ib:delay-500",
          tooltipSide === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
        )}
      >
        {label}
      </span>
    </button>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function Switch({ checked, onChange, disabled, label, id }: SwitchProps) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40",
        checked ? "bg-sage" : "bg-ink-4 hairline",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-4 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.45)] transition-[left,background-color] duration-200 ease-[var(--ease-out-soft)]",
          checked ? "left-[19px] bg-sage-ink" : "left-[3px] bg-fg-2",
        )}
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
  onChange: (v: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[9px] bg-ink-0/60 p-[3px] hairline">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition-colors duration-150",
              on ? "bg-ink-4 text-fg shadow-[0_1px_2px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {o.icon && <o.icon size={13} strokeWidth={2} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  width?: number;
}

export function Slider({ value, min, max, step = 1, onChange, format, label, width = 180 }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width, ["--pct" as string]: `${pct}%` }}
        className="slider"
      />
      <span className="tabular w-12 text-right text-xs text-fg-2">{format ? format(value) : value}</span>
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  revealable?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon: Icon, revealable, className, type, ...rest },
  ref,
) {
  const [revealed, setRevealed] = useState(false);
  const actualType = revealable ? (revealed ? "text" : "password") : type;
  return (
    <div
      className={cn(
        "group/in flex h-8 items-center gap-2 rounded-control bg-ink-0/70 px-2.5 hairline transition-shadow focus-within:shadow-[inset_0_0_0_1px_var(--color-sage)]",
        className,
      )}
    >
      {Icon && <Icon size={14} className="shrink-0 text-fg-3" />}
      <input
        ref={ref}
        type={actualType}
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
        {...rest}
      />
      {revealable && (
        <button
          type="button"
          aria-label={revealed ? "Ocultar" : "Mostrar"}
          onClick={() => setRevealed((r) => !r)}
          className="text-fg-3 hover:text-fg"
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  );
});

export function Kbd({ children, size = "md" }: { children: ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-[6px] bg-gradient-to-b from-ink-4 to-ink-3 font-sans font-medium text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.08),inset_0_-1px_0_rgb(0_0_0/0.5),0_1px_2px_rgb(0_0_0/0.6)]",
        size === "sm" && "h-5 min-w-5 px-1.5 text-2xs",
        size === "md" && "h-6 min-w-6 px-2 text-xs",
        size === "lg" && "h-8 min-w-8 px-2.5 text-sm",
      )}
    >
      {children}
    </kbd>
  );
}

export function Keys({ keys, size }: { keys: string[]; size?: "sm" | "md" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k, i) => (
        <Kbd key={`${k}-${i}`} size={size}>
          {k}
        </Kbd>
      ))}
    </span>
  );
}

export function Section({ title, description, children, aside }: { title: string; description?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-end justify-between gap-4 px-1">
        <div>
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-fg-3">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="divide-y divide-line-soft overflow-hidden rounded-panel bg-ink-2/80 hairline">{children}</div>
    </section>
  );
}

export function Row({
  title,
  description,
  children,
  htmlFor,
  stacked,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
  stacked?: boolean;
}) {
  const autoId = useId();
  return (
    <div className={cn("flex gap-6 px-4 py-3.5", stacked ? "flex-col gap-3" : "items-center justify-between")}>
      <div className="min-w-0">
        <label htmlFor={htmlFor ?? autoId} className="block text-sm text-fg">
          {title}
        </label>
        {description && <div className="mt-0.5 max-w-[46ch] text-xs leading-[1.05rem] text-fg-3">{description}</div>}
      </div>
      {children && <div className={cn("shrink-0", stacked && "w-full")}>{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-[60ch] text-sm text-fg-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Notice({
  tone = "warn",
  icon: Icon,
  children,
  action,
}: {
  tone?: "warn" | "danger" | "info";
  icon: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3.5 py-2.5 text-sm",
        tone === "warn" && "bg-warn/[0.08] text-warn shadow-[inset_0_0_0_1px_rgb(216_180_107/0.18)]",
        tone === "danger" && "bg-danger/[0.08] text-danger shadow-[inset_0_0_0_1px_rgb(232_134_111/0.2)]",
        tone === "info" && "bg-white/[0.04] text-fg-2 hairline",
      )}
    >
      <Icon size={16} className="shrink-0" />
      <div className="min-w-0 flex-1 text-fg-2 [&_strong]:font-medium [&_strong]:text-fg">{children}</div>
      {action}
    </div>
  );
}
