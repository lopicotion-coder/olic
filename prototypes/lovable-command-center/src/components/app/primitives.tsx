import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronsLeftRight, FlaskConical, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/demo/store";
import type { Tone } from "@/lib/demo/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] font-medium text-primary-ink">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold text-foreground md:text-[28px] md:leading-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  icon: Icon,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: LucideIcon;
}) {
  return (
    <section className={cn("rounded-xl border bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
                <Icon className="size-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const TONE: Record<Tone, string> = {
  info: "bg-info-soft text-info-ink border-info/20",
  success: "bg-success-soft text-success-ink border-success/25",
  warning: "bg-warning-soft text-warning-ink border-warning/40",
  danger: "bg-danger-soft text-danger-ink border-danger/25",
  neutral: "bg-neutral-soft text-neutral-ink border-border",
};
export const toneText: Record<Tone, string> = {
  info: "text-info-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
  danger: "text-danger-ink",
  neutral: "text-neutral-ink",
};
export const toneSoft: Record<Tone, string> = {
  info: "bg-info-soft",
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-danger-soft",
  neutral: "bg-neutral-soft",
};
export const toneSolid: Record<Tone, string> = {
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-border-strong",
};

export function StatusBadge({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  context,
  icon: Icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  context: ReactNode;
  icon: LucideIcon;
  trend?: { up: boolean; good: boolean; text: string };
}) {
  return (
    <div className="rounded-xl border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-surface-sunken text-navy">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 font-display text-[26px] font-semibold leading-none text-foreground num">{value}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        {trend && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", trend.good ? "text-success-ink" : "text-danger-ink")}>
            {trend.up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
            <span className="num">{trend.text}</span>
          </span>
        )}
        <span>{context}</span>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface-sunken text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-primary-soft text-primary-ink",
  "bg-success-soft text-success-ink",
  "bg-warning-soft text-warning-ink",
  "bg-neutral-soft text-navy",
  "bg-accent text-accent-foreground",
];

export function PersonAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const parts = name.replace(/^(أ\.|م\.|Mr\.|Ms\.|Eng\.)\s*/, "").split(" ").filter(Boolean);
  const initials = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold",
        AVATAR_TONES[h % AVATAR_TONES.length],
        size === "sm" && "size-7 text-[11px]",
        size === "md" && "size-9 text-[13px]",
        size === "lg" && "size-12 text-base",
        size === "xl" && "size-16 text-xl",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { tr } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary-soft py-1 ps-3 pe-1 text-[13px] text-primary-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="grid size-5 place-items-center rounded-full hover:bg-primary/15"
        aria-label={tr(`إزالة الفلتر: ${label}`, `Remove filter: ${label}`)}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("إلغاء", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  required,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ms-0.5 text-danger-ink" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger-ink" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Horizontal scroll container for wide tables, with a visible hint on small screens. */
export function ScrollArea({ children, className }: { children: ReactNode; className?: string }) {
  const { tr } = useI18n();
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 px-5 pt-3 text-[12px] text-muted-foreground md:hidden">
        <ChevronsLeftRight className="size-3.5" aria-hidden />
        {tr("اسحب أفقيًا لعرض باقي الأعمدة", "Swipe sideways to see more columns")}
      </div>
      <div className="scrollbar-thin overflow-x-auto" tabIndex={0} role="region" aria-label={tr("جدول قابل للتمرير", "Scrollable table")}>
        {children}
      </div>
    </div>
  );
}

export function Meter({ value, tone = "info", label }: { value: number; tone?: Tone; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-surface-sunken"
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cn("h-full rounded-full", toneSolid[tone])} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-10 shrink-0 text-end text-[13px] font-medium text-foreground num">{value}%</span>
    </div>
  );
}

export function DemoPill({ className }: { className?: string }) {
  const { tr } = useI18n();
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning-ink", className)}>
      <FlaskConical className="size-3.5" aria-hidden />
      {tr("وضع العرض التجريبي", "Demo preview mode")}
    </span>
  );
}

export const th = "h-11 px-4 text-start align-middle text-[13px] font-medium text-muted-foreground whitespace-nowrap";
export const td = "px-4 py-3 align-middle text-sm";