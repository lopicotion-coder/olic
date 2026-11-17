import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, GraduationCap, Receipt, School, Search, UserPlus, UserRound } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useDemo, useI18n } from "@/lib/demo/store";
import { navItemsFlat } from "@/lib/demo/nav";
import { scopedStudents, teacherSectionIds } from "@/lib/demo/selectors";
import { PERSONAS, SECTIONS } from "@/lib/demo/static";
import { cn } from "@/lib/utils";

export function SearchTrigger({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const { tr } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-surface-sunken px-3 text-start text-sm text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface",
        className,
      )}
      aria-label={tr("بحث شامل", "Global search")}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{tr("ابحث عن طالب، فصل، موظف، فاتورة…", "Search students, classes, staff, invoices…")}</span>
      <kbd className="hidden rounded border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground md:inline num">Ctrl K</kbd>
    </button>
  );
}

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state } = useDemo();
  const { tr, loc, section, lang } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const role = state.role;
  const students = useMemo(() => scopedStudents(state), [state]);
  const sections = useMemo(
    () => (role === "admin" ? SECTIONS : role === "teacher" ? SECTIONS.filter((s) => teacherSectionIds(state, PERSONAS.teacher.staffId!).includes(s.id)) : []),
    [role, state],
  );

  const go = (to: string, search?: Record<string, string>) => {
    onOpenChange(false);
    navigate({ to, search } as never);
  };

  const showStudents = q.trim().length > 0 || students.length <= 12;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{tr("بحث شامل", "Global search")}</DialogTitle>
        <DialogDescription className="sr-only">
          {tr("ابحث في السجلات المتاحة لدورك الحالي", "Search the records available to your current role")}
        </DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5">
          <CommandInput value={q} onValueChange={setQ} placeholder={tr("اكتب اسمًا أو كودًا أو رقمًا قوميًا…", "Type a name, code or national ID…")} className="h-12 text-[15px]" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>{tr("لا توجد نتائج مطابقة في نطاق دورك.", "No matches within your role's scope.")}</CommandEmpty>
            <CommandGroup heading={tr("الصفحات", "Pages")}>
              {navItemsFlat(role).map((i) => (
                <CommandItem key={i.to} value={`page ${i.label.ar} ${i.label.en}`} onSelect={() => go(i.to)}>
                  <i.icon className="size-4 text-muted-foreground" aria-hidden />
                  {loc(i.label)}
                </CommandItem>
              ))}
            </CommandGroup>
            {showStudents && students.length > 0 && (
              <CommandGroup heading={role === "parent" ? tr("أبنائي", "My children") : tr("الطلاب", "Students")}>
                {students.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`student ${s.name.ar} ${s.name.en} ${s.code} ${s.nationalId}`}
                    onSelect={() =>
                      role === "admin" || role === "teacher" ? go(`/students/${s.id}`) : role === "parent" ? go("/children") : go("/")
                    }
                  >
                    <GraduationCap className="size-4 text-muted-foreground" aria-hidden />
                    <span className="flex-1 truncate">{loc(s.name)}</span>
                    <span className="text-[12px] text-muted-foreground num">{s.code}</span>
                    <span className="text-[12px] text-muted-foreground">{section(s.sectionId)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {sections.length > 0 && (
              <CommandGroup heading={tr("الفصول", "Classes")}>
                {sections.map((s) => (
                  <CommandItem key={s.id} value={`class ${section(s.id)} ${s.id} ${s.room}`} onSelect={() => go(`/classes/${s.id}`)}>
                    <School className="size-4 text-muted-foreground" aria-hidden />
                    {section(s.id)}
                    <span className="ms-auto text-[12px] text-muted-foreground">
                      {tr("قاعة", "Room")} {s.room}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {role === "admin" && q.trim().length > 0 && (
              <>
                <CommandGroup heading={tr("الموظفون", "Staff")}>
                  {state.staff.map((s) => (
                    <CommandItem key={s.id} value={`staff ${s.name.ar} ${s.name.en} ${s.email}`} onSelect={() => go("/staff")}>
                      <UserRound className="size-4 text-muted-foreground" aria-hidden />
                      {loc(s.name)}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading={tr("طلبات الالتحاق", "Applications")}>
                  {state.applicants.map((a) => (
                    <CommandItem key={a.id} value={`app ${a.name.ar} ${a.name.en} ${a.code}`} onSelect={() => go("/admissions", { q: a.code })}>
                      <UserPlus className="size-4 text-muted-foreground" aria-hidden />
                      <span className="flex-1 truncate">{loc(a.name)}</span>
                      <span className="text-[12px] text-muted-foreground num">{a.code}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup heading={tr("الفواتير", "Invoices")}>
                  {state.invoices.slice(0, 400).map((inv) => (
                    <CommandItem key={inv.id} value={`invoice ${inv.number}`} onSelect={() => go("/finance", { q: inv.number })}>
                      <Receipt className="size-4 text-muted-foreground" aria-hidden />
                      <span className="num">{inv.number}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {!showStudents && (
              <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground">
                <FileText className="size-4" aria-hidden />
                {lang === "ar" ? "ابدأ الكتابة للبحث في سجلات الطلاب والموظفين والفواتير." : "Start typing to search students, staff and invoices."}
              </div>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}