import type {
  AssessmentId,
  Grade,
  L,
  PermAction,
  PermMatrix,
  PermRoleId,
  Role,
  Section,
  StageId,
  Subject,
} from "./types";

/** Fixed demo "today" so every seeded record tells a consistent story. */
export const DEMO_TODAY = "2026-11-16";
export const DEMO_NOW = "2026-11-16T09:20:00";
export const SCHOOL_YEAR = "2026–2027";
export const SCHOOL_NAME: L = { ar: "مدرسة النور الحديثة", en: "Al-Nour Modern School" };
export const TERM: L = { ar: "الفصل الدراسي الأول", en: "First term" };
export const STORAGE_KEY = "myschool-demo-v1";
export const STATE_VERSION = 3;

export const l = (ar: string, en: string): L => ({ ar, en });

export const STAGES: Record<StageId, L> = {
  primary: l("المرحلة الابتدائية", "Primary"),
  preparatory: l("المرحلة الإعدادية", "Preparatory"),
  secondary: l("المرحلة الثانوية", "Secondary"),
};

const ORD = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"];

export const GRADES: Grade[] = [
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    id: `p${n}`,
    stage: "primary" as const,
    level: n,
    order: n,
    name: l(`الصف ${ORD[n - 1]} الابتدائي`, `Primary ${n}`),
    short: l(`${n} ابتدائي`, `P${n}`),
  })),
  ...[1, 2, 3].map((n) => ({
    id: `m${n}`,
    stage: "preparatory" as const,
    level: n,
    order: 6 + n,
    name: l(`الصف ${ORD[n - 1]} الإعدادي`, `Preparatory ${n}`),
    short: l(`${n} إعدادي`, `Prep ${n}`),
  })),
  ...[1, 2, 3].map((n) => ({
    id: `s${n}`,
    stage: "secondary" as const,
    level: n,
    order: 9 + n,
    name: l(`الصف ${ORD[n - 1]} الثانوي`, `Secondary ${n}`),
    short: l(`${n} ثانوي`, `Sec ${n}`),
  })),
];

const LETTERS = [l("أ", "A"), l("ب", "B")];

export const SECTIONS: Section[] = GRADES.flatMap((g, gi) =>
  LETTERS.map((letter, li) => ({
    id: `${g.id}-${li === 0 ? "a" : "b"}`,
    gradeId: g.id,
    letter,
    room: `${g.stage === "primary" ? "A" : g.stage === "preparatory" ? "B" : "C"}${100 + gi * 2 + li + 1}`,
    capacity: 32,
  })),
);

export const SUBJECTS: Subject[] = [
  { id: "arabic", name: l("اللغة العربية", "Arabic") },
  { id: "english", name: l("اللغة الإنجليزية", "English") },
  { id: "math", name: l("الرياضيات", "Mathematics") },
  { id: "science", name: l("العلوم", "Science") },
  { id: "social", name: l("الدراسات الاجتماعية", "Social Studies") },
  { id: "religion", name: l("التربية الدينية", "Religious Education") },
  { id: "ict", name: l("تكنولوجيا المعلومات", "ICT") },
  { id: "art", name: l("التربية الفنية", "Art") },
  { id: "pe", name: l("التربية الرياضية", "Physical Education") },
];
export const GRADED_SUBJECTS = ["arabic", "english", "math", "science", "social"];

export const ASSESSMENTS: { id: AssessmentId; name: L; max: number }[] = [
  { id: "monthly1", name: l("اختبار شهر أكتوبر", "October monthly test"), max: 20 },
  { id: "midterm", name: l("امتحان منتصف الفصل", "Midterm exam"), max: 40 },
  { id: "final", name: l("امتحان نهاية الفصل", "End-of-term exam"), max: 60 },
];

export const PERIODS = [
  { n: 1, start: "08:00", end: "08:45" },
  { n: 2, start: "08:50", end: "09:35" },
  { n: 3, start: "09:40", end: "10:25" },
  { n: 4, start: "10:50", end: "11:35" },
  { n: 5, start: "11:40", end: "12:25" },
  { n: 6, start: "12:30", end: "13:15" },
  { n: 7, start: "13:20", end: "14:00" },
];

export const DAYS: L[] = [
  l("الأحد", "Sunday"),
  l("الاثنين", "Monday"),
  l("الثلاثاء", "Tuesday"),
  l("الأربعاء", "Wednesday"),
  l("الخميس", "Thursday"),
];
/** Index into DAYS for DEMO_TODAY (Monday). */
export const TODAY_DAY = 1;

export const PERSONAS: Record<
  Role,
  { name: L; title: L; staffId?: string; familyId?: string; studentId?: string; initials: L }
> = {
  admin: {
    name: l("أ. منى عبد الرحمن", "Ms. Mona Abdelrahman"),
    title: l("مديرة المدرسة", "School principal"),
    staffId: "s-admin",
    initials: l("م", "M"),
  },
  teacher: {
    name: l("أ. كريم حسن", "Mr. Karim Hassan"),
    title: l("معلم الرياضيات", "Mathematics teacher"),
    staffId: "t-01",
    initials: l("ك", "K"),
  },
  parent: {
    name: l("م. أحمد سامي الشريف", "Eng. Ahmed Samy El-Sherif"),
    title: l("ولي أمر — أسرة الشريف", "Parent — El-Sherif family"),
    familyId: "f-001",
    initials: l("أ", "A"),
  },
  student: {
    name: l("ليلى أحمد الشريف", "Laila Ahmed El-Sherif"),
    title: l("طالبة — 4 ابتدائي (أ)", "Student — P4-A"),
    studentId: "st-0001",
    initials: l("ل", "L"),
  },
};

export const ROLE_LABELS: Record<Role, L> = {
  admin: l("مدير المدرسة", "Administrator"),
  teacher: l("المعلم", "Teacher"),
  parent: l("ولي الأمر", "Parent"),
  student: l("الطالب", "Student"),
};

/** Teacher persona (t-01) weekly math schedule: day index -> [period, section]. */
export const TEACHER_SCHEDULE: Record<number, { period: number; sectionId: string }[]> = {
  0: [
    { period: 1, sectionId: "p4-b" },
    { period: 2, sectionId: "p5-a" },
    { period: 5, sectionId: "p6-b" },
    { period: 6, sectionId: "p4-a" },
  ],
  1: [
    { period: 1, sectionId: "p4-a" },
    { period: 3, sectionId: "p5-a" },
    { period: 4, sectionId: "p4-b" },
    { period: 6, sectionId: "p6-b" },
  ],
  2: [
    { period: 2, sectionId: "p4-a" },
    { period: 3, sectionId: "p6-b" },
    { period: 5, sectionId: "p4-b" },
  ],
  3: [
    { period: 1, sectionId: "p5-a" },
    { period: 4, sectionId: "p4-a" },
    { period: 5, sectionId: "p6-b" },
    { period: 7, sectionId: "p4-b" },
  ],
  4: [
    { period: 2, sectionId: "p4-b" },
    { period: 3, sectionId: "p4-a" },
    { period: 6, sectionId: "p5-a" },
  ],
};
export const TEACHER_SECTIONS = ["p4-a", "p4-b", "p5-a", "p6-b"];

const ROTATION = ["arabic", "english", "science", "social", "religion", "arabic", "ict", "art", "pe", "english"];

/** Deterministic weekly timetable for a section: 7 subject ids for a school day. */
export function sectionTimetable(sectionId: string, day: number): string[] {
  const idx = SECTIONS.findIndex((s) => s.id === sectionId);
  const out: string[] = [];
  for (let p = 0; p < 7; p++) out.push(ROTATION[(day * 3 + idx + p) % ROTATION.length]!);
  if (TEACHER_SECTIONS.includes(sectionId)) {
    for (const slot of TEACHER_SCHEDULE[day] ?? []) {
      if (slot.sectionId === sectionId) out[slot.period - 1] = "math";
    }
  } else {
    out[(day + idx) % 7] = "math";
  }
  return out;
}

export const EVENTS: { id: string; title: L; date: string; time: string; place: L; audience: Role[] }[] = [
  {
    id: "ev-1",
    title: l("لقاء أولياء الأمور مع معلمي الصف الرابع", "Parent–teacher meeting, Primary 4"),
    date: "2026-11-19",
    time: "13:30",
    place: l("قاعة الأنشطة", "Activity hall"),
    audience: ["admin", "teacher", "parent"],
  },
  {
    id: "ev-2",
    title: l("معرض العلوم السنوي", "Annual science fair"),
    date: "2026-11-26",
    time: "10:00",
    place: l("الملعب المغطى", "Indoor court"),
    audience: ["admin", "teacher", "parent", "student"],
  },
  {
    id: "ev-3",
    title: l("بدء امتحانات منتصف الفصل", "Midterm exams begin"),
    date: "2026-12-06",
    time: "08:00",
    place: l("جميع الفصول", "All classrooms"),
    audience: ["admin", "teacher", "parent", "student"],
  },
];

export const PERM_ACTIONS: PermAction[] = ["view", "create", "edit", "delete"];
export const PERM_ACTION_LABELS: Record<PermAction, L> = {
  view: l("عرض", "View"),
  create: l("إضافة", "Create"),
  edit: l("تعديل", "Edit"),
  delete: l("حذف", "Delete"),
};

export const PERM_MODULES: { id: string; name: L; items: { id: string; name: L; hint: L }[] }[] = [
  {
    id: "students",
    name: l("الطلاب", "Students"),
    items: [
      { id: "students.records", name: l("سجلات الطلاب", "Student records"), hint: l("البيانات الأساسية والقيد", "Core data and enrolment") },
      { id: "students.health", name: l("البيانات الصحية", "Health data"), hint: l("بيانات حساسة — يُنصح بتقييدها", "Sensitive — keep restricted") },
      { id: "students.documents", name: l("المستندات", "Documents"), hint: l("شهادات الميلاد والملفات المرفقة", "Certificates and attachments") },
    ],
  },
  {
    id: "admissions",
    name: l("القبول", "Admissions"),
    items: [
      { id: "admissions.applications", name: l("طلبات الالتحاق", "Applications"), hint: l("مراجعة وقبول الطلبات", "Review and decide") },
      { id: "admissions.interviews", name: l("المقابلات", "Interviews"), hint: l("جدولة مقابلات القبول", "Schedule interviews") },
    ],
  },
  {
    id: "attendance",
    name: l("الحضور", "Attendance"),
    items: [
      { id: "attendance.daily", name: l("الحضور اليومي", "Daily attendance"), hint: l("تسجيل حضور الفصول", "Record class attendance") },
      { id: "attendance.reports", name: l("تقارير الحضور", "Attendance reports"), hint: l("ملخصات ونِسب", "Summaries and rates") },
    ],
  },
  {
    id: "grades",
    name: l("الدرجات", "Grades"),
    items: [
      { id: "grades.gradebook", name: l("كشوف الدرجات", "Gradebook"), hint: l("رصد الدرجات", "Enter marks") },
      { id: "grades.approval", name: l("اعتماد الدرجات", "Grade approval"), hint: l("اعتماد أو رفض الكشوف", "Approve or reject sheets") },
      { id: "grades.reportcards", name: l("الشهادات", "Report cards"), hint: l("إصدار شهادات الطلاب", "Issue report cards") },
    ],
  },
  {
    id: "finance",
    name: l("المالية", "Finance"),
    items: [
      { id: "finance.invoices", name: l("الفواتير", "Invoices"), hint: l("إصدار ومتابعة الفواتير", "Issue and track invoices") },
      { id: "finance.payments", name: l("المدفوعات", "Payments"), hint: l("تسجيل التحصيل", "Record collections") },
      { id: "finance.fees", name: l("هيكل الرسوم", "Fee structure"), hint: l("المصروفات حسب المرحلة", "Fees per stage") },
    ],
  },
  {
    id: "communication",
    name: l("التواصل", "Communication"),
    items: [
      { id: "comm.announcements", name: l("الإعلانات", "Announcements"), hint: l("إعلانات عامة للمدرسة", "School-wide notices") },
      { id: "comm.messages", name: l("الرسائل", "Messages"), hint: l("المراسلات مع الأسر", "Family messaging") },
    ],
  },
  {
    id: "staff",
    name: l("الموظفون والصلاحيات", "Staff & roles"),
    items: [
      { id: "staff.records", name: l("بيانات الموظفين", "Staff records"), hint: l("بيانات المعلمين والإداريين", "Teachers and staff") },
      { id: "staff.roles", name: l("الأدوار والصلاحيات", "Roles & permissions"), hint: l("تعديل الصلاحيات", "Change permissions") },
    ],
  },
  {
    id: "settings",
    name: l("الإعدادات", "Settings"),
    items: [
      { id: "settings.school", name: l("إعدادات المدرسة", "School settings"), hint: l("العام الدراسي والقواعد", "Year and rules") },
      { id: "settings.audit", name: l("سجل النشاط", "Activity log"), hint: l("مراجعة العمليات", "Review actions") },
    ],
  },
];

export const PERM_ROLES: { id: PermRoleId; name: L; desc: L }[] = [
  { id: "admin", name: l("مدير النظام", "Full admin"), desc: l("وصول كامل لكل الوحدات", "Full access to every module") },
  { id: "teacher", name: l("معلم", "Teacher"), desc: l("فصوله فقط: الحضور والدرجات والواجبات", "Own classes: attendance, grades, homework") },
  { id: "accountant", name: l("محاسب", "Accountant"), desc: l("الفواتير والتحصيل وقراءة بيانات الطلاب", "Invoices, payments, read student data") },
  { id: "registrar", name: l("مسؤول القبول والتسجيل", "Registrar"), desc: l("القبول وسجلات الطلاب والمستندات", "Admissions, records and documents") },
  { id: "readonly", name: l("مشاهدة فقط", "Read-only"), desc: l("عرض دون أي تعديل", "View without changes") },
];

const ALL_ITEMS = PERM_MODULES.flatMap((m) => m.items.map((i) => i.id));
const row = (v: boolean, c: boolean, e: boolean, d: boolean) => ({ view: v, create: c, edit: e, delete: d });

export function presetMatrix(preset: PermRoleId): PermMatrix {
  const m: PermMatrix = {};
  for (const id of ALL_ITEMS) m[id] = row(false, false, false, false);
  const set = (ids: string[], r: ReturnType<typeof row>) => ids.forEach((id) => (m[id] = { ...r }));
  switch (preset) {
    case "admin":
      set(ALL_ITEMS, row(true, true, true, true));
      break;
    case "teacher":
      set(["students.records", "attendance.reports", "grades.reportcards", "comm.announcements"], row(true, false, false, false));
      set(["attendance.daily", "grades.gradebook"], row(true, true, true, false));
      set(["comm.messages"], row(true, true, false, false));
      break;
    case "accountant":
      set(["students.records", "attendance.reports", "comm.announcements"], row(true, false, false, false));
      set(["finance.invoices", "finance.payments"], row(true, true, true, false));
      set(["finance.fees"], row(true, false, true, false));
      set(["comm.messages"], row(true, true, false, false));
      break;
    case "registrar":
      set(["students.records", "students.documents"], row(true, true, true, false));
      set(["admissions.applications", "admissions.interviews"], row(true, true, true, true));
      set(["attendance.reports", "comm.announcements", "staff.records"], row(true, false, false, false));
      set(["comm.messages"], row(true, true, false, false));
      break;
    case "readonly":
      set(ALL_ITEMS.filter((i) => !["students.health", "staff.roles", "finance.payments"].includes(i)), row(true, false, false, false));
      break;
  }
  return m;
}