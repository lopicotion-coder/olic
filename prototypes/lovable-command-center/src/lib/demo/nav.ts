import {
  Award,
  BarChart3,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Home,
  Inbox,
  LayoutDashboard,
  MessagesSquare,
  NotebookPen,
  School,
  Settings,
  ShieldCheck,
  Sun,
  UserPlus,
  Users,
  Wallet,
  Baby,
  type LucideIcon,
} from "lucide-react";
import type { L, Role } from "./types";
import { l } from "./static";

export interface NavItem {
  to: string;
  label: L;
  icon: LucideIcon;
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
}
export interface NavGroup {
  label: L;
  items: NavItem[];
}

export const NAV: Record<Role, NavGroup[]> = {
  admin: [
    { label: l("نظرة عامة", "Overview"), items: [{ to: "/", label: l("لوحة القيادة", "Dashboard"), icon: LayoutDashboard }] },
    {
      label: l("الشؤون الأكاديمية", "Academics"),
      items: [
        { to: "/students", label: l("الطلاب", "Students"), icon: GraduationCap, match: ["/students"] },
        { to: "/admissions", label: l("القبول", "Admissions"), icon: UserPlus },
        { to: "/classes", label: l("الفصول والشعب", "Classes & sections"), icon: School, match: ["/classes"] },
        { to: "/attendance", label: l("الحضور", "Attendance"), icon: CalendarCheck2 },
        { to: "/grades", label: l("الدرجات", "Grades"), icon: BookOpenCheck },
      ],
    },
    {
      label: l("الإدارة", "Administration"),
      items: [
        { to: "/staff", label: l("الموظفون والصلاحيات", "Staff & roles"), icon: ShieldCheck },
        { to: "/finance", label: l("المالية", "Finance"), icon: Wallet },
        { to: "/reports", label: l("التقارير", "Reports"), icon: BarChart3 },
        { to: "/messages", label: l("التواصل", "Communication"), icon: MessagesSquare },
        { to: "/settings", label: l("الإعدادات", "Settings"), icon: Settings },
      ],
    },
  ],
  teacher: [
    {
      label: l("يومي", "My day"),
      items: [
        { to: "/", label: l("يومي", "My day"), icon: Sun },
        { to: "/classes", label: l("فصولي", "My classes"), icon: School, match: ["/classes", "/students"] },
      ],
    },
    {
      label: l("التدريس", "Teaching"),
      items: [
        { to: "/attendance", label: l("الحضور", "Attendance"), icon: CalendarCheck2 },
        { to: "/grades", label: l("كشف الدرجات", "Gradebook"), icon: BookOpenCheck },
        { to: "/assignments", label: l("الواجبات", "Assignments"), icon: NotebookPen },
      ],
    },
    { label: l("التواصل", "Communication"), items: [{ to: "/messages", label: l("الرسائل", "Messages"), icon: Inbox }] },
  ],
  parent: [
    {
      label: l("أسرتي", "My family"),
      items: [
        { to: "/", label: l("نظرة على الأسرة", "Family overview"), icon: Home },
        { to: "/children", label: l("أبنائي", "My children"), icon: Baby },
      ],
    },
    {
      label: l("المتابعة", "Follow-up"),
      items: [
        { to: "/attendance", label: l("الحضور", "Attendance"), icon: CalendarCheck2 },
        { to: "/grades", label: l("الدرجات", "Grades"), icon: BookOpenCheck },
        { to: "/assignments", label: l("الواجبات", "Homework"), icon: NotebookPen },
        { to: "/finance", label: l("المصروفات", "Fees"), icon: Wallet },
      ],
    },
    { label: l("التواصل", "Communication"), items: [{ to: "/messages", label: l("الرسائل", "Messages"), icon: Inbox }] },
  ],
  student: [
    {
      label: l("مساحتي", "My space"),
      items: [
        { to: "/", label: l("صفحتي", "My home"), icon: Home },
        { to: "/schedule", label: l("جدولي", "My schedule"), icon: CalendarDays },
        { to: "/assignments", label: l("واجباتي", "Assignments"), icon: ClipboardList },
        { to: "/grades", label: l("درجاتي", "My grades"), icon: BookOpenCheck },
        { to: "/attendance", label: l("حضوري", "Attendance"), icon: CalendarCheck2 },
        { to: "/achievements", label: l("إنجازاتي", "Achievements"), icon: Award },
      ],
    },
  ],
};

export const ROUTE_ROLES: Record<string, Role[]> = {
  "/students": ["admin", "teacher"],
  "/admissions": ["admin"],
  "/classes": ["admin", "teacher"],
  "/staff": ["admin"],
  "/finance": ["admin", "parent"],
  "/reports": ["admin"],
  "/settings": ["admin"],
  "/assignments": ["teacher", "parent", "student"],
  "/schedule": ["student"],
  "/achievements": ["student"],
  "/children": ["parent"],
  "/messages": ["admin", "teacher", "parent"],
};

export function navItemsFlat(role: Role) {
  return NAV[role].flatMap((g) => g.items);
}

export function titleForPath(role: Role, path: string): L | undefined {
  const items = navItemsFlat(role);
  const exact = items.find((i) => i.to === path);
  if (exact) return exact.label;
  return items.find((i) => i.to !== "/" && (path.startsWith(i.to) || i.match?.some((m) => path.startsWith(m))))?.label;
}

export { Users };