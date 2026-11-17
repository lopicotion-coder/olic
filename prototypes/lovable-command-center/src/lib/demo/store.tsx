import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createSeed } from "./seed";
import { DEMO_NOW, DEMO_TODAY, PERSONAS, STATE_VERSION, STORAGE_KEY, l } from "./static";
import { gradeById, sectionLabel } from "./selectors";
import type {
  Activity,
  Applicant,
  ApplicationStatus,
  AppNotification,
  Assignment,
  AttendanceStatus,
  DemoState,
  GradeSheet,
  L,
  Lang,
  Message,
  PayMethod,
  PermMatrix,
  PermRoleId,
  Role,
  Settings,
  SheetStatus,
  Staff,
  Student,
  StudentStatus,
} from "./types";

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(counter++).toString(36)}`;
/** Demo clock: keeps the fixed date but uses the real time of day for new records. */
const nowIso = () => {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `${DEMO_TODAY}T${hh}:${mm}:00`;
};
const same = (text: string): L => ({ ar: text, en: text });

export type MessageTarget = "admin" | "teacher" | "parent" | "none";

function createActions(set: (fn: (s: DemoState) => DemoState) => void) {
  const actor = (s: DemoState) => PERSONAS[s.role].name;
  const log = (s: DemoState, text: L, kind: Activity["kind"]): Activity[] => [
    { id: uid("ac"), actor: actor(s), text, time: nowIso(), kind },
    ...s.activity,
  ].slice(0, 40);
  const notify = (s: DemoState, n: Omit<AppNotification, "id" | "time" | "read">): AppNotification[] => [
    { ...n, id: uid("n"), time: nowIso(), read: false },
    ...s.notifications,
  ];

  return {
    setLang: (lang: Lang) => set((s) => ({ ...s, lang })),
    setRole: (role: Role) => set((s) => ({ ...s, role })),
    setParentChild: (id: string) => set((s) => ({ ...s, parentChildId: id })),
    reset: () => set((s) => ({ ...createSeed(), lang: s.lang, role: s.role })),

    addStudent: (input: Omit<Student, "id" | "behaviour" | "missingDocs" | "health" | "transport" | "enrolledAt" | "nationalId" | "gender" | "familyId"> & {
      guardian: string;
      phone: string;
      gender: "m" | "f";
    }) => {
      const id = uid("st");
      set((s) => {
        const famId = uid("f");
        const student: Student = {
          id,
          code: input.code,
          name: input.name,
          gender: input.gender,
          nationalId: "—",
          birthDate: input.birthDate,
          gradeId: input.gradeId,
          sectionId: input.sectionId,
          familyId: famId,
          status: input.status,
          enrolledAt: DEMO_TODAY,
          missingDocs: [l("شهادة الميلاد (أصل)", "Birth certificate (original)"), l("الرقم القومي للطالب", "Student national ID")],
          transport: l("مواصلات خاصة", "Private transport"),
          health: { bloodType: "—", allergies: l("لم تُسجَّل بعد", "Not recorded yet"), conditions: l("لم تُسجَّل بعد", "Not recorded yet"), medication: l("لا يوجد", "None") },
          behaviour: [],
        };
        return {
          ...s,
          students: [student, ...s.students],
          families: [
            ...s.families,
            { id: famId, guardian: same(input.guardian), relation: l("ولي الأمر", "Guardian"), phone: input.phone, email: "—", job: l("—", "—"), address: l("لم يُسجَّل بعد", "Not recorded yet") },
          ],
          activity: log(s, l(`أضاف الطالب ${input.name.ar}`, `added student ${input.name.en}`), "student"),
        };
      });
      return id;
    },
    updateStudent: (id: string, patch: Partial<Student>) =>
      set((s) => ({
        ...s,
        students: s.students.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        activity: log(s, l("حدّث بيانات طالب", "updated a student record"), "student"),
      })),
    setStudentsStatus: (ids: string[], status: StudentStatus) =>
      set((s) => ({
        ...s,
        students: s.students.map((x) => (ids.includes(x.id) ? { ...x, status } : x)),
        activity: log(s, l(`غيّر حالة ${ids.length} طالب`, `changed status of ${ids.length} students`), "student"),
      })),
    resolveDoc: (id: string, index: number) =>
      set((s) => ({
        ...s,
        students: s.students.map((x) => (x.id === id ? { ...x, missingDocs: x.missingDocs.filter((_, i) => i !== index) } : x)),
        activity: log(s, l("استكمل مستندًا في ملف طالب", "completed a document in a student file"), "student"),
      })),

    saveAttendance: (sectionId: string, date: string, marks: Record<string, AttendanceStatus>) =>
      set((s) => {
        const absent = Object.values(marks).filter((m) => m === "absent").length;
        return {
          ...s,
          attendance: {
            ...s.attendance,
            [`${sectionId}|${date}`]: { sectionId, date, marks, savedAt: nowIso(), savedBy: actor(s) },
          },
          activity: log(s, l(`سجّل حضور ${sectionLabel(sectionId, "ar")}`, `recorded attendance for ${sectionLabel(sectionId, "en")}`), "attendance"),
          notifications:
            absent && s.role === "teacher"
              ? notify(s, {
                  role: "admin",
                  title: l(`${absent} غياب في ${sectionLabel(sectionId, "ar")}`, `${absent} absent in ${sectionLabel(sectionId, "en")}`),
                  body: l("سجّله أ. كريم حسن", "Recorded by Mr. Karim Hassan"),
                  href: "/attendance?tab=exceptions",
                  tone: "warning",
                })
              : s.notifications,
        };
      }),
    setAttendanceMark: (sectionId: string, date: string, studentId: string, status: AttendanceStatus) =>
      set((s) => {
        const key = `${sectionId}|${date}`;
        const sess = s.attendance[key];
        if (!sess) return s;
        return {
          ...s,
          attendance: { ...s.attendance, [key]: { ...sess, marks: { ...sess.marks, [studentId]: status } } },
          activity: log(s, l("حدّث حالة حضور طالب", "updated a student's attendance"), "attendance"),
        };
      }),

    createSheet: (sheet: Omit<GradeSheet, "id" | "updatedAt" | "status">) => {
      const id = `gs-${sheet.sectionId}-${sheet.subjectId}-${sheet.assessment}`;
      set((s) =>
        s.sheets.some((x) => x.id === id)
          ? s
          : { ...s, sheets: [...s.sheets, { ...sheet, id, status: "draft", updatedAt: nowIso() }] },
      );
      return id;
    },
    saveSheet: (id: string, marks: Record<string, number | null>, maxMark: number, status: SheetStatus) =>
      set((s) => {
        const sheet = s.sheets.find((x) => x.id === id);
        if (!sheet) return s;
        const label = sectionLabel(sheet.sectionId, "ar");
        return {
          ...s,
          sheets: s.sheets.map((x) => (x.id === id ? { ...x, marks, maxMark, status, updatedAt: nowIso(), note: status === "submitted" ? undefined : x.note } : x)),
          activity:
            status === "submitted"
              ? log(s, l(`أرسل كشف ${label} للاعتماد`, `submitted ${sectionLabel(sheet.sectionId, "en")} sheet for approval`), "grades")
              : s.activity,
          notifications:
            status === "submitted"
              ? notify(s, {
                  role: "admin",
                  title: l("كشف درجات جديد بانتظار الاعتماد", "New grade sheet awaiting approval"),
                  body: l(label, sectionLabel(sheet.sectionId, "en")),
                  href: "/grades?tab=approvals",
                  tone: "warning",
                })
              : s.notifications,
        };
      }),
    reviewSheet: (id: string, status: "approved" | "rejected", note?: string) =>
      set((s) => {
        const sheet = s.sheets.find((x) => x.id === id);
        if (!sheet) return s;
        return {
          ...s,
          sheets: s.sheets.map((x) => (x.id === id ? { ...x, status, note, updatedAt: nowIso() } : x)),
          activity: log(
            s,
            status === "approved"
              ? l(`اعتمد كشف ${sectionLabel(sheet.sectionId, "ar")}`, `approved ${sectionLabel(sheet.sectionId, "en")} sheet`)
              : l(`أعاد كشف ${sectionLabel(sheet.sectionId, "ar")} للمراجعة`, `returned ${sectionLabel(sheet.sectionId, "en")} sheet`),
            "grades",
          ),
          notifications:
            sheet.teacherId === "t-01"
              ? notify(s, {
                  role: "teacher",
                  title: status === "approved" ? l("تم اعتماد كشف الدرجات", "Grade sheet approved") : l("أُعيد كشف الدرجات للمراجعة", "Grade sheet returned"),
                  body: l(sectionLabel(sheet.sectionId, "ar"), sectionLabel(sheet.sectionId, "en")),
                  href: `/grades?section=${sheet.sectionId}`,
                  tone: status === "approved" ? "success" : "danger",
                })
              : s.notifications,
        };
      }),

    setApplicantStatus: (id: string, status: ApplicationStatus) =>
      set((s) => {
        const ap = s.applicants.find((a) => a.id === id) as Applicant;
        const verb: Record<ApplicationStatus, L> = {
          new: l("أعاد طلب", "moved application"),
          review: l("بدأ مراجعة طلب", "started reviewing"),
          accepted: l("قبل طلب", "accepted"),
          rejected: l("اعتذر عن طلب", "declined"),
        };
        return {
          ...s,
          applicants: s.applicants.map((a) => (a.id === id ? { ...a, status } : a)),
          activity: log(s, l(`${verb[status].ar} ${ap.name.ar}`, `${verb[status].en} ${ap.name.en}`), "admissions"),
        };
      }),

    recordPayment: (invoiceId: string, amount: number, method: PayMethod) =>
      set((s) => {
        const inv = s.invoices.find((i) => i.id === invoiceId)!;
        const paid = Math.min(inv.amount, inv.paid + amount);
        return {
          ...s,
          invoices: s.invoices.map((i) => (i.id === invoiceId ? { ...i, paid } : i)),
          payments: [
            { id: uid("pay"), invoiceId, amount, method, date: nowIso(), receivedBy: actor(s), ref: `RC-${Math.floor(20000 + Math.random() * 9999)}` },
            ...s.payments,
          ],
          activity: log(s, l(`سجّل دفعة بقيمة ${amount.toLocaleString("en-US")} ج.م`, `recorded a payment of EGP ${amount.toLocaleString("en-US")}`), "finance"),
        };
      }),

    sendMessage: (input: { subject: string; body: string; toLabel: L; targets: MessageTarget[] }) =>
      set((s) => {
        const date = nowIso();
        const from = PERSONAS[s.role].name;
        const sent: Message = { id: uid("m"), mailbox: s.role, box: "sent", from, to: input.toLabel, subject: same(input.subject), body: same(input.body), date, read: true };
        const delivered: Message[] = input.targets
          .filter((t): t is Role => t !== "none" && t !== s.role)
          .map((t) => ({ id: uid("m"), mailbox: t, box: "inbox", from, to: input.toLabel, subject: same(input.subject), body: same(input.body), date, read: false }));
        const notes = input.targets
          .filter((t): t is Role => t !== "none" && t !== s.role)
          .map((t) => ({
            id: uid("n"),
            role: t,
            title: l("رسالة جديدة", "New message"),
            body: l(`${from.ar}: ${input.subject}`, `${from.en}: ${input.subject}`),
            time: date,
            read: false,
            href: "/messages",
            tone: "info" as const,
          }));
        return {
          ...s,
          messages: [sent, ...delivered, ...s.messages],
          notifications: [...notes, ...s.notifications],
          activity: s.role === "admin" ? log(s, l(`أرسل رسالة: ${input.subject}`, `sent a message: ${input.subject}`), "message") : s.activity,
        };
      }),
    markMessageRead: (id: string) =>
      set((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, read: true } : m)) })),
    addAnnouncement: (title: string, body: string, audience: "all" | "parents" | "teachers" | "students") =>
      set((s) => ({
        ...s,
        announcements: [{ id: uid("an"), title: same(title), body: same(body), audience, date: nowIso(), author: PERSONAS[s.role].name }, ...s.announcements],
        notifications: [
          ...(["teacher", "parent", "student"] as Role[])
            .filter((r) => audience === "all" || (audience === "parents" && r === "parent") || (audience === "teachers" && r === "teacher") || (audience === "students" && r === "student"))
            .map((r) => ({ id: uid("n"), role: r, title: l("إعلان جديد من المدرسة", "New school announcement"), body: same(title), time: nowIso(), read: false, href: "/messages", tone: "info" as const })),
          ...s.notifications,
        ],
        activity: log(s, l(`نشر إعلان: ${title}`, `published announcement: ${title}`), "message"),
      })),

    markNotificationRead: (id: string) =>
      set((s) => ({ ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
    markAllNotificationsRead: () =>
      set((s) => ({ ...s, notifications: s.notifications.map((n) => (n.role === s.role ? { ...n, read: true } : n)) })),

    addAssignment: (a: Omit<Assignment, "id" | "createdAt" | "submissions" | "status">) =>
      set((s) => ({
        ...s,
        assignments: [{ ...a, id: uid("a"), createdAt: nowIso(), submissions: {}, status: "published" }, ...s.assignments],
        notifications: a.sectionId === "p4-a"
          ? [
              { id: uid("n"), role: "student" as Role, title: l("واجب جديد", "New assignment"), body: a.title, time: nowIso(), read: false, href: "/assignments", tone: "info" as const },
              { id: uid("n"), role: "parent" as Role, title: l("ليلى: واجب جديد", "Laila: new assignment"), body: a.title, time: nowIso(), read: false, href: "/assignments", tone: "info" as const },
              ...s.notifications,
            ]
          : s.notifications,
      })),
    submitAssignment: (assignmentId: string, studentId: string) =>
      set((s) => ({
        ...s,
        assignments: s.assignments.map((a) => (a.id === assignmentId ? { ...a, submissions: { ...a.submissions, [studentId]: { at: nowIso() } } } : a)),
        notifications: notify(s, {
          role: "teacher",
          title: l("تسليم واجب جديد", "New homework submission"),
          body: l("ليلى أحمد الشريف — 4 ابتدائي (أ)", "Laila Ahmed El-Sherif — P4-A"),
          href: "/assignments",
          tone: "info",
        }),
      })),
    scoreSubmission: (assignmentId: string, studentId: string, score: number) =>
      set((s) => ({
        ...s,
        assignments: s.assignments.map((a) =>
          a.id === assignmentId && a.submissions[studentId]
            ? { ...a, submissions: { ...a.submissions, [studentId]: { ...a.submissions[studentId], score } } }
            : a,
        ),
      })),
    closeAssignment: (id: string) =>
      set((s) => ({ ...s, assignments: s.assignments.map((a) => (a.id === id ? { ...a, status: "closed" } : a)) })),

    saveStaff: (staff: Staff) =>
      set((s) => {
        const exists = s.staff.some((x) => x.id === staff.id);
        return {
          ...s,
          staff: exists ? s.staff.map((x) => (x.id === staff.id ? staff : x)) : [...s.staff, staff],
          activity: log(s, exists ? l(`حدّث بيانات ${staff.name.ar}`, `updated ${staff.name.en}`) : l(`أضاف الموظف ${staff.name.ar}`, `added staff member ${staff.name.en}`), "settings"),
        };
      }),
    setPermissions: (roleId: PermRoleId, matrix: PermMatrix) =>
      set((s) => ({ ...s, permissions: { ...s.permissions, [roleId]: matrix } })),
    updateSettings: (patch: Partial<Settings>) =>
      set((s) => ({ ...s, settings: { ...s.settings, ...patch }, activity: log(s, l("حدّث إعدادات المدرسة", "updated school settings"), "settings") })),
  };
}

export type DemoActions = ReturnType<typeof createActions>;

interface Ctx {
  state: DemoState;
  actions: DemoActions;
  ready: boolean;
}

const DemoContext = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(() => createSeed());
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed.version === STATE_VERSION) setState(parsed);
      }
    } catch {
      // Corrupt demo data: fall back to the seed.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Storage full or blocked: the demo keeps working in memory.
      }
    }, 250);
  }, [state, ready]);

  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  }, [state.lang]);

  const set = useCallback((fn: (s: DemoState) => DemoState) => setState(fn), []);
  const actions = useMemo(() => createActions(set), [set]);
  const value = useMemo(() => ({ state, actions, ready }), [state, actions, ready]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}

const NOW = new Date(DEMO_NOW).getTime();

export function useI18n() {
  const { state } = useDemo();
  const lang = state.lang;
  return useMemo(() => {
    const locale = lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
    const nf = new Intl.NumberFormat(locale);
    const tr = (ar: string, en: string) => (lang === "ar" ? ar : en);
    const loc = (v: L | undefined) => (v ? v[lang] : "");
    const num = (n: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
    const money = (n: number) => (lang === "ar" ? `${nf.format(Math.round(n))} ج.م` : `EGP ${nf.format(Math.round(n))}`);
    const date = (iso: string, style: "short" | "long" | "weekday" | "day" = "short") => {
      const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
      const opts: Intl.DateTimeFormatOptions =
        style === "long"
          ? { day: "numeric", month: "long", year: "numeric" }
          : style === "weekday"
            ? { weekday: "long", day: "numeric", month: "long" }
            : style === "day"
              ? { day: "numeric", month: "short" }
              : { day: "numeric", month: "short", year: "numeric" };
      return new Intl.DateTimeFormat(locale, opts).format(d);
    };
    const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    const rel = (iso: string) => {
      const now = Math.max(NOW, new Date(nowIso()).getTime());
      const diff = Math.round((new Date(iso).getTime() - now) / 60000);
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const abs = Math.abs(diff);
      if (abs < 60) return rtf.format(diff, "minute");
      if (abs < 60 * 24) return rtf.format(Math.round(diff / 60), "hour");
      return rtf.format(Math.round(diff / 1440), "day");
    };
    const gradeName = (id: string) => gradeById(id).name[lang];
    const section = (id: string) => sectionLabel(id, lang);
    return { lang, dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const), tr, loc, num, money, date, time, rel, gradeName, section };
  }, [lang]);
}