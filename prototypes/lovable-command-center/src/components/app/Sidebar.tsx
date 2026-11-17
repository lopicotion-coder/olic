import { Link, useRouterState } from "@tanstack/react-router";
import { Info, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDemo, useI18n } from "@/lib/demo/store";
import { NAV, type NavItem } from "@/lib/demo/nav";
import { SCHOOL_NAME, SCHOOL_YEAR } from "@/lib/demo/static";
import { Wordmark } from "./Logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function isActivePath(item: NavItem, path: string) {
  if (item.to === "/") return path === "/";
  return path === item.to || path.startsWith(item.to + "/") || !!item.match?.some((m) => path === m || path.startsWith(m + "/"));
}

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { state } = useDemo();
  const { loc, tr, dir } = useI18n();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const groups = NAV[state.role];

  return (
    <nav aria-label={tr("التنقل الرئيسي", "Main navigation")} className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin">
      {groups.map((g) => (
        <div key={g.label.en}>
          {!collapsed ? (
            <div className="px-3 pb-1.5 text-[11.5px] font-medium tracking-wide text-navy-muted">{loc(g.label)}</div>
          ) : (
            <div className="mx-auto mb-2 h-px w-6 bg-navy-foreground/15" aria-hidden />
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActivePath(item, path);
              const link = (
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-navy-accent",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-navy-foreground/12 text-navy-foreground"
                      : "text-navy-foreground/75 hover:bg-navy-foreground/7 hover:text-navy-foreground",
                  )}
                >
                  {active && <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-navy-accent" aria-hidden />}
                  <item.icon className={cn("size-[18px] shrink-0", active ? "text-navy-accent" : "")} aria-hidden />
                  {!collapsed ? <span className="truncate">{loc(item.label)}</span> : <span className="sr-only">{loc(item.label)}</span>}
                </Link>
              );
              return (
                <li key={item.to}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side={dir === "rtl" ? "left" : "right"}>{loc(item.label)}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SidebarFooterNote({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { tr } = useI18n();
  if (collapsed)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/about" onClick={onNavigate} className="mx-auto mb-3 grid size-10 place-items-center rounded-lg text-navy-muted hover:bg-navy-foreground/10 hover:text-navy-foreground" aria-label={tr("حول العرض التجريبي", "About this demo")}>
            <Info className="size-[18px]" aria-hidden />
          </Link>
        </TooltipTrigger>
        <TooltipContent>{tr("حول العرض التجريبي", "About this demo")}</TooltipContent>
      </Tooltip>
    );
  return (
    <div className="mx-3 mb-3 rounded-xl border border-navy-foreground/10 bg-navy-3/60 p-3">
      <p className="text-[12px] leading-relaxed text-navy-muted">
        {tr("جميع السجلات وهمية، وأي تغيير يُحفظ على هذا المتصفح فقط.", "All records are fictitious; changes stay in this browser only.")}
      </p>
      <Link to="/about" onClick={onNavigate} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-navy-accent hover:underline">
        <Info className="size-3.5" aria-hidden />
        {tr("حول العرض التجريبي", "About this demo")}
      </Link>
    </div>
  );
}

export function SchoolBlock({ collapsed }: { collapsed?: boolean }) {
  const { loc, tr } = useI18n();
  if (collapsed) return null;
  return (
    <div className="mx-3 mt-1 rounded-xl bg-navy-foreground/6 px-3 py-2.5">
      <div className="text-[13px] font-medium text-navy-foreground">{loc(SCHOOL_NAME)}</div>
      <div className="text-[12px] text-navy-muted">
        {tr("العام الدراسي", "School year")} <span className="num">{SCHOOL_YEAR}</span>
      </div>
    </div>
  );
}

export function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { tr, dir } = useI18n();
  const CollapseIcon = (dir === "rtl") === collapsed ? PanelRightOpen : PanelRightClose;
  return (
    <aside
      className={cn(
        "no-print sticky top-0 hidden h-dvh shrink-0 flex-col bg-navy bg-pattern-star text-navy-foreground transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-[264px]",
      )}
    >
      <div className={cn("flex h-16 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Wordmark collapsed={collapsed} />
      </div>
      <SchoolBlock collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <SidebarFooterNote collapsed={collapsed} />
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "mx-3 mb-3 flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] text-navy-muted hover:bg-navy-foreground/10 hover:text-navy-foreground",
          collapsed && "justify-center px-0",
        )}
        aria-label={collapsed ? tr("توسيع القائمة الجانبية", "Expand sidebar") : tr("طي القائمة الجانبية", "Collapse sidebar")}
        aria-expanded={!collapsed}
      >
        <CollapseIcon className={cn("size-[18px]", dir === "ltr" && "-scale-x-100")} aria-hidden />
        {!collapsed && tr("طي القائمة", "Collapse")}
      </button>
    </aside>
  );
}