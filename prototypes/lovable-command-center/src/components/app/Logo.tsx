import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/demo/store";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden>
      <rect width="40" height="40" rx="11" className="fill-primary" />
      <path
        d="M11 30V18.5C11 13.8 15 10 20 10s9 3.8 9 8.5V30"
        className="stroke-primary-foreground"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M16 30v-7.5a4 4 0 0 1 8 0V30" className="stroke-primary-foreground" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="15.5" r="1.8" className="fill-navy-accent" />
    </svg>
  );
}

export function Wordmark({ collapsed, onDark = true }: { collapsed?: boolean; onDark?: boolean }) {
  const { tr } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <div className="leading-tight">
          <div className={cn("font-display text-[17px] font-semibold", onDark ? "text-navy-foreground" : "text-foreground")}>
            {tr("ماي سكول", "My School")}
          </div>
          <div className={cn("text-[11px] tracking-wide", onDark ? "text-navy-muted" : "text-muted-foreground")}>
            {tr("My School", "ماي سكول")}
          </div>
        </div>
      )}
    </div>
  );
}