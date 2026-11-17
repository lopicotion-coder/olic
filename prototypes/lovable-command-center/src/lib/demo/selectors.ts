import { DEMO_TODAY, GRADES, SECTIONS, SUBJECTS, TEACHER_SECTIONS, PERSONAS } from "./static";
import { hashStr } from "./seed";
import type {
  AttendanceStatus,
  DemoState,
  GradeSheet,
  Invoice,
  Role,
  Student,
} from "./types";

export const gradeById = (id: string) => GRADES.find((g) => g.id === id)!;
export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id)!;
export const subjectById = (id: string) => SUBJECTS.find((s) => s.id === id)!;

export const ACTIVE = (s: Student) => s.status === "active" || s.status === "new";

/** Last `n` school days (Sun–Thu) ending at `end` inclusive, oldest first. */
export function schoolDays(n: number, end = DEMO_TODAY): string[] {
  const out: string[] = [];
  const d = new Date(`${end}T12:00:00Z`);
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 5 && wd !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

const PERSONA_IDS = ["st-0001", "st-0002"];

/** Deterministic history for past days when no session was saved. */
export function baseStatus(studentId: string, date: string): AttendanceStatus {
  const h = hashStr(studentId + date) % 1000;
  const risk = !PERSONA_IDS.includes(studentId) && hashStr(studentId) % 11 === 0;
  const absentCut = risk ? 130 : 28;
  const lateCut = absentCut + (risk ? 70 : 30);
  const excCut = lateCut + 14;
  if (h < absentCut) return "absent";
  if (h < lateCut) return "late";
  if (h < excCut) return "excused";
  return "present";
}

export function sessionKey(sectionId: string, date: string) {
  return `${sectionId}|${date}`;
}

/** Status for a student on a date; null = not recorded yet (today with no session). */
export function attendanceOn(state: DemoState, student: Student, date: string): AttendanceStatus | null {
  const session = state.attendance[sessionKey(student.sectionId, date)];
  const mark = session?.marks[student.id];
  if (mark) return mark;
  if (date >= DEMO_TODAY) return null;
  return baseStatus(student.id, date);
}

export function attendanceSummary(state: DemoState, student: Student, days = 30) {
  const list = schoolDays(days);
  const c = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
  for (const d of list) {
    const st = attendanceOn(state, student, d);
    if (!st) continue;
    c[st] += 1;
    c.total += 1;
  }
  const rate = c.total ? Math.round(((c.present + c.late) / c.total) * 100) : 100;
  return { ...c, rate };
}

export function attendanceRateForDay(state: DemoState, date: string) {
  let present = 0;
  let total = 0;
  for (const s of state.students) {
    if (!ACTIVE(s)) continue;
    const st = attendanceOn(state, s, date);
    if (!st) continue;
    total += 1;
    if (st === "present" || st === "late") present += 1;
  }
  return { rate: total ? Math.round((present / total) * 1000) / 10 : 0, total, present };
}

export function todayExceptions(state: DemoState) {
  const out: { student: Student; status: AttendanceStatus; sectionId: string }[] = [];
  for (const session of Object.values(state.attendance)) {
    if (session.date !== DEMO_TODAY) continue;
    for (const [sid, st] of Object.entries(session.marks)) {
      if (st === "absent" || st === "late") {
        const student = state.students.find((s) => s.id === sid);
        if (student) out.push({ student, status: st, sectionId: session.sectionId });
      }
    }
  }
  return out;
}

export function pendingAttendanceSections(state: DemoState) {
  return SECTIONS.filter((s) => !state.attendance[sessionKey(s.id, DEMO_TODAY)]);
}

export function roster(state: DemoState, sectionId: string) {
  return state.students
    .filter((s) => s.sectionId === sectionId && ACTIVE(s))
    .sort((a, b) => a.name.ar.localeCompare(b.name.ar, "ar"));
}

export function teacherSectionIds(state: DemoState, teacherId: string) {
  if (teacherId === "t-01") return TEACHER_SECTIONS;
  return Array.from(new Set(state.teaching.filter((t) => t.teacherId === teacherId).map((t) => t.sectionId)));
}

export function teacherOf(state: DemoState, sectionId: string, subjectId: string) {
  const id = state.teaching.find((t) => t.sectionId === sectionId && t.subjectId === subjectId)?.teacherId;
  return state.staff.find((s) => s.id === id);
}

export function homeroomOf(state: DemoState, sectionId: string) {
  if (sectionId === "p4-a") return state.staff.find((s) => s.id === "t-01");
  return teacherOf(state, sectionId, "arabic");
}

/** Students the current persona is allowed to see. */
export function scopedStudents(state: DemoState, role: Role = state.role): Student[] {
  switch (role) {
    case "admin":
      return state.students;
    case "teacher": {
      const secs = teacherSectionIds(state, PERSONAS.teacher.staffId!);
      return state.students.filter((s) => secs.includes(s.sectionId));
    }
    case "parent":
      return state.students.filter((s) => s.familyId === PERSONAS.parent.familyId);
    case "student":
      return state.students.filter((s) => s.id === PERSONAS.student.studentId);
  }
}

export function invoiceStatus(inv: Invoice): "paid" | "partial" | "unpaid" | "overdue" {
  if (inv.paid >= inv.amount) return "paid";
  if (inv.dueDate < DEMO_TODAY) return "overdue";
  if (inv.paid > 0) return "partial";
  return "unpaid";
}

export function financeTotals(state: DemoState, invoices = state.invoices) {
  let billed = 0;
  let collected = 0;
  let overdue = 0;
  for (const i of invoices) {
    billed += i.amount;
    collected += i.paid;
    if (invoiceStatus(i) === "overdue") overdue += i.amount - i.paid;
  }
  return {
    billed,
    collected,
    outstanding: billed - collected,
    overdue,
    rate: billed ? Math.round((collected / billed) * 1000) / 10 : 0,
  };
}

export function overdueAccounts(state: DemoState) {
  return new Set(state.invoices.filter((i) => invoiceStatus(i) === "overdue").map((i) => i.studentId));
}

export function sheetAverage(sheet: GradeSheet) {
  const vals = Object.values(sheet.marks).filter((v): v is number => typeof v === "number");
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length / sheet.maxMark) * 1000) / 10;
}

/** Approved results per subject for a student (what parents & students may see). */
export function studentResults(state: DemoState, student: Student) {
  const sheets = state.sheets.filter(
    (s) => s.sectionId === student.sectionId && s.status === "approved" && typeof s.marks[student.id] === "number",
  );
  const bySubject = new Map<string, { subjectId: string; items: { sheet: GradeSheet; mark: number; pct: number }[] }>();
  for (const sh of sheets) {
    const mark = sh.marks[student.id] as number;
    const entry = bySubject.get(sh.subjectId) ?? { subjectId: sh.subjectId, items: [] };
    entry.items.push({ sheet: sh, mark, pct: Math.round((mark / sh.maxMark) * 100) });
    bySubject.set(sh.subjectId, entry);
  }
  const subjects = Array.from(bySubject.values()).map((e) => {
    const pct = Math.round(e.items.reduce((a, b) => a + b.pct, 0) / e.items.length);
    return { ...e, pct };
  });
  const overall = subjects.length ? Math.round(subjects.reduce((a, b) => a + b.pct, 0) / subjects.length) : null;
  return { subjects, overall };
}

export function studentAssignments(state: DemoState, student: Student) {
  return state.assignments
    .filter((a) => a.sectionId === student.sectionId)
    .map((a) => {
      const sub = a.submissions[student.id];
      const state_: "submitted" | "graded" | "missing" | "due" =
        sub?.score !== undefined ? "graded" : sub ? "submitted" : a.dueDate < DEMO_TODAY || a.status === "closed" ? "missing" : "due";
      return { a, sub, state: state_ };
    })
    .sort((x, y) => x.a.dueDate.localeCompare(y.a.dueDate));
}

export function sectionLabel(sectionId: string, lang: "ar" | "en") {
  const s = sectionById(sectionId);
  const g = gradeById(s.gradeId);
  return lang === "ar" ? `${g.short.ar} (${s.letter.ar})` : `${g.short.en}-${s.letter.en}`;
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
}