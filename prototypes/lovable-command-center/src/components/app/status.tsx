import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileClock,
  FilePen,
  FileX2,
  HelpCircle,
  MinusCircle,
  PauseCircle,
  Sparkles,
  XCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { StatusBadge } from "./primitives";
import { useI18n } from "@/lib/demo/store";
import { l } from "@/lib/demo/static";
import type { ApplicationStatus, AttendanceStatus, L, SheetStatus, StudentStatus, Tone } from "@/lib/demo/types";

type Meta = { tone: Tone; icon: LucideIcon; label: L };

export const ATTENDANCE_META: Record<AttendanceStatus, Meta> = {
  present: { tone: "success", icon: CheckCircle2, label: l("حاضر", "Present") },
  absent: { tone: "danger", icon: XCircle, label: l("غائب", "Absent") },
  late: { tone: "warning", icon: Clock3, label: l("متأخر", "Late") },
  excused: { tone: "info", icon: MinusCircle, label: l("غياب بعذر", "Excused") },
};
export const STUDENT_META: Record<StudentStatus, Meta> = {
  active: { tone: "success", icon: CheckCircle2, label: l("منتظم", "Active") },
  new: { tone: "info", icon: Sparkles, label: l("مستجد", "New") },
  suspended: { tone: "warning", icon: PauseCircle, label: l("موقوف مؤقتًا", "Suspended") },
  withdrawn: { tone: "neutral", icon: MinusCircle, label: l("منسحب", "Withdrawn") },
};
export const APP_META: Record<ApplicationStatus, Meta> = {
  new: { tone: "info", icon: Sparkles, label: l("جديد", "New") },
  review: { tone: "warning", icon: Clock3, label: l("قيد المراجعة", "Under review") },
  accepted: { tone: "success", icon: CheckCircle2, label: l("مقبول", "Accepted") },
  rejected: { tone: "neutral", icon: XCircle, label: l("معتذر عنه", "Declined") },
};
export const SHEET_META: Record<SheetStatus, Meta> = {
  draft: { tone: "neutral", icon: FilePen, label: l("مسودة", "Draft") },
  submitted: { tone: "warning", icon: FileClock, label: l("بانتظار الاعتماد", "Awaiting approval") },
  approved: { tone: "success", icon: FileCheck2, label: l("معتمد", "Approved") },
  rejected: { tone: "danger", icon: FileX2, label: l("أعيد للمراجعة", "Returned") },
};
export const INVOICE_META: Record<"paid" | "partial" | "unpaid" | "overdue", Meta> = {
  paid: { tone: "success", icon: CheckCircle2, label: l("مدفوعة", "Paid") },
  partial: { tone: "info", icon: Clock3, label: l("مدفوعة جزئيًا", "Partly paid") },
  unpaid: { tone: "neutral", icon: HelpCircle, label: l("مستحقة", "Due") },
  overdue: { tone: "danger", icon: AlertTriangle, label: l("متأخرة", "Overdue") },
};

export function MetaBadge({ meta, className }: { meta: Meta; className?: string }) {
  const { loc } = useI18n();
  return (
    <StatusBadge tone={meta.tone} icon={meta.icon} className={className}>
      {loc(meta.label)}
    </StatusBadge>
  );
}