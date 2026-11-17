import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useDemo, useI18n } from "@/lib/demo/store";
import { cn } from "@/lib/utils";
import { toneSolid } from "./primitives";

export function NotificationsMenu() {
  const { state, actions } = useDemo();
  const { tr, loc, rel, dir } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const all = state.notifications.filter((n) => n.role === state.role).sort((a, b) => b.time.localeCompare(a.time));
  const unread = all.filter((n) => !n.read).length;
  const list = onlyUnread ? all.filter((n) => !n.read) : all;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={tr(`الإشعارات، ${unread} غير مقروء`, `Notifications, ${unread} unread`)}
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute end-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-destructive-foreground num">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={dir === "rtl" ? "start" : "end"} className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-[15px] font-semibold">{tr("الإشعارات", "Notifications")}</h2>
          <Button variant="link" size="sm" className="h-auto" disabled={!unread} onClick={() => actions.markAllNotificationsRead()}>
            <CheckCheck aria-hidden />
            {tr("تعليم الكل كمقروء", "Mark all read")}
          </Button>
        </div>
        <div className="flex gap-1 border-b px-3 py-2" role="tablist" aria-label={tr("تصفية الإشعارات", "Filter notifications")}>
          {[
            { v: false, label: tr("الكل", "All") },
            { v: true, label: tr(`غير المقروءة (${unread})`, `Unread (${unread})`) },
          ].map((t) => (
            <button
              key={String(t.v)}
              role="tab"
              aria-selected={onlyUnread === t.v}
              onClick={() => setOnlyUnread(t.v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[13px] font-medium",
                onlyUnread === t.v ? "bg-primary-soft text-primary-ink" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {list.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">{tr("لا توجد إشعارات غير مقروءة. أحسنت!", "You're all caught up.")}</li>
          )}
          {list.map((n) => (
            <li key={n.id} className="border-b last:border-0">
              <div className={cn("flex gap-3 px-4 py-3", !n.read && "bg-primary-soft/40")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : toneSolid[n.tone])} aria-hidden />
                <button
                  className="min-w-0 flex-1 text-start"
                  onClick={() => {
                    actions.markNotificationRead(n.id);
                    setOpen(false);
                    const [p, qs] = n.href.split("?");
                    navigate({ to: p, search: qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined } as never);
                  }}
                >
                  <div className={cn("text-[14px]", n.read ? "text-foreground" : "font-semibold text-foreground")}>{loc(n.title)}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">{loc(n.body)}</div>
                  <div className="mt-1 text-[12px] text-muted-foreground">{rel(n.time)}</div>
                </button>
                {!n.read && (
                  <button
                    onClick={() => actions.markNotificationRead(n.id)}
                    className="h-fit shrink-0 rounded-md px-1.5 py-1 text-[12px] text-primary-ink hover:bg-primary-soft"
                    aria-label={tr(`تعليم «${loc(n.title)}» كمقروء`, `Mark “${loc(n.title)}” as read`)}
                  >
                    {tr("مقروء", "Read")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <span className="sr-only" aria-live="polite">{tr(`${unread} غير مقروء`, `${unread} unread`)}</span>
      </PopoverContent>
    </Popover>
  );
}