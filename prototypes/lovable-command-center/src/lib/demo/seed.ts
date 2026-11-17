// @ts-nocheck -- deterministic demo seed generator; indexed lookups are always in range.
import {
  GRADED_SUBJECTS,
  GRADES,
  PERM_ROLES,
  SECTIONS,
  TEACHER_SECTIONS,
  l,
  presetMatrix,
  STATE_VERSION,
} from "./static";
import type {
  Activity,
  Announcement,
  Applicant,
  ApplicationStatus,
  AppNotification,
  Assignment,
  AttendanceSession,
  AttendanceStatus,
  BehaviourNote,
  DemoState,
  Family,
  GradeSheet,
  Invoice,
  L,
  Message,
  Payment,
  PayMethod,
  PermMatrix,
  PermRoleId,
  Staff,
  Student,
  StudentStatus,
  Teaching,
} from "./types";

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

const MALE: [string, string][] = [
  ["محمد", "Mohamed"], ["أحمد", "Ahmed"], ["يوسف", "Youssef"], ["عمر", "Omar"], ["علي", "Ali"],
  ["مصطفى", "Mostafa"], ["حسن", "Hassan"], ["زياد", "Ziad"], ["آدم", "Adam"], ["مالك", "Malek"],
  ["سليم", "Selim"], ["ياسين", "Yassin"], ["إياد", "Eyad"], ["مروان", "Marwan"], ["خالد", "Khaled"],
  ["سيف", "Seif"], ["حمزة", "Hamza"], ["أنس", "Anas"], ["رامي", "Ramy"], ["تامر", "Tamer"],
  ["عبد الله", "Abdallah"], ["مازن", "Mazen"], ["فارس", "Fares"], ["هشام", "Hesham"],
];
const FEMALE: [string, string][] = [
  ["مريم", "Mariam"], ["فاطمة", "Fatma"], ["نور", "Nour"], ["سلمى", "Salma"], ["جنى", "Jana"],
  ["ملك", "Malak"], ["هنا", "Hana"], ["فريدة", "Farida"], ["رقية", "Roqaya"], ["ياسمين", "Yasmine"],
  ["سارة", "Sara"], ["حبيبة", "Habiba"], ["لمى", "Lama"], ["ريم", "Reem"], ["دينا", "Dina"],
  ["منة", "Menna"], ["آية", "Aya"], ["رنا", "Rana"], ["تقى", "Toqa"], ["جميلة", "Gamila"],
];
const FAMILY: [string, string][] = [
  ["عبد العزيز", "Abdelaziz"], ["منصور", "Mansour"], ["السيد", "El-Sayed"], ["فهمي", "Fahmy"],
  ["رشدي", "Roshdy"], ["النجار", "El-Naggar"], ["عثمان", "Osman"], ["الجمال", "El-Gamal"],
  ["حلمي", "Helmy"], ["زكي", "Zaki"], ["بدوي", "Badawy"], ["سالم", "Salem"], ["عزت", "Ezzat"],
  ["شاكر", "Shaker"], ["الدسوقي", "El-Desouky"], ["صبري", "Sabry"], ["القاضي", "El-Kady"],
  ["رضوان", "Radwan"], ["نصار", "Nassar"], ["خليل", "Khalil"], ["الحسيني", "El-Husseiny"],
  ["توفيق", "Tawfik"], ["الشاذلي", "El-Shazly"], ["المصري", "El-Masry"], ["غنيم", "Ghoneim"],
];
const AREAS: L[] = [
  l("مدينة نصر، القاهرة", "Nasr City, Cairo"),
  l("المعادي، القاهرة", "Maadi, Cairo"),
  l("مصر الجديدة، القاهرة", "Heliopolis, Cairo"),
  l("التجمع الخامس، القاهرة الجديدة", "Fifth Settlement, New Cairo"),
  l("الدقي، الجيزة", "Dokki, Giza"),
  l("الشيخ زايد، الجيزة", "Sheikh Zayed, Giza"),
  l("حدائق القبة، القاهرة", "Hadayek El-Kobba, Cairo"),
];
const JOBS: L[] = [
  l("محاسب", "Accountant"), l("طبيب", "Physician"), l("مهندس", "Engineer"), l("محامٍ", "Lawyer"),
  l("موظف حكومي", "Civil servant"), l("رجل أعمال", "Business owner"), l("صيدلي", "Pharmacist"), l("مدرس جامعي", "Lecturer"),
];
const FATHER = l("الأب", "Father");
const MOTHER = l("الأم", "Mother");
const NONE = l("لا يوجد", "None");

const STAFF: Staff[] = [
  ["s-admin", "منى عبد الرحمن", "Mona Abdelrahman", "principal", undefined, "admin"],
  ["s-deputy", "هشام فؤاد", "Hisham Fouad", "deputy", undefined, "admin"],
  ["s-acc1", "رانيا مجدي", "Rania Magdy", "accountant", undefined, "accountant"],
  ["s-acc2", "وليد عادل", "Walid Adel", "accountant", undefined, "accountant"],
  ["s-reg", "ميرفت سعيد", "Mervat Saeed", "registrar", undefined, "registrar"],
  ["s-cou", "دعاء حمدي", "Doaa Hamdy", "counselor", undefined, "readonly"],
  ["s-nurse", "إيمان فتحي", "Eman Fathy", "nurse", undefined, "readonly"],
  ["s-it", "باسم نبيل", "Bassem Nabil", "it", undefined, "admin"],
  ["t-01", "كريم حسن", "Karim Hassan", "teacher", "math", "teacher"],
  ["t-02", "نادية سمير", "Nadia Samir", "teacher", "math", "teacher"],
  ["t-03", "عمرو الشافعي", "Amr El-Shafei", "teacher", "math", "teacher"],
  ["t-04", "هالة منصور", "Hala Mansour", "teacher", "arabic", "teacher"],
  ["t-05", "محمود عبد الحميد", "Mahmoud Abdelhamid", "teacher", "arabic", "teacher"],
  ["t-06", "سماح عبد الله", "Samah Abdallah", "teacher", "arabic", "teacher"],
  ["t-07", "جيهان رأفت", "Gihan Raafat", "teacher", "arabic", "teacher"],
  ["t-08", "سارة وجدي", "Sara Wagdy", "teacher", "english", "teacher"],
  ["t-09", "أمير لطفي", "Amir Lotfy", "teacher", "english", "teacher"],
  ["t-10", "نهى كمال", "Noha Kamal", "teacher", "english", "teacher"],
  ["t-11", "شيرين البنا", "Shereen El-Banna", "teacher", "science", "teacher"],
  ["t-12", "حسام جلال", "Hossam Galal", "teacher", "science", "teacher"],
  ["t-13", "أسماء ربيع", "Asmaa Rabie", "teacher", "science", "teacher"],
  ["t-14", "طارق عبد الفتاح", "Tarek Abdelfattah", "teacher", "social", "teacher"],
  ["t-15", "منال يسري", "Manal Yousry", "teacher", "social", "teacher"],
  ["t-16", "عادل رمضان", "Adel Ramadan", "teacher", "religion", "teacher"],
  ["t-17", "مريم عازر", "Mariam Azer", "teacher", "religion", "teacher"],
  ["t-18", "رحاب صلاح", "Rehab Salah", "teacher", "art", "teacher"],
  ["t-19", "أحمد فاروق", "Ahmed Farouk", "teacher", "pe", "teacher"],
  ["t-20", "ياسر الحناوي", "Yasser El-Hennawy", "teacher", "ict", "teacher"],
].map(([id, ar, en, role, subjectId, permRole], i) => ({
  id: id as string,
  name: l(ar as string, en as string),
  role: role as Staff["role"],
  subjectId: subjectId as string | undefined,
  email: `${(en as string).toLowerCase().split(" ")[0]}.${(en as string).toLowerCase().split(" ").slice(-1)[0].replace(/[^a-z]/g, "")}@alnour-demo.edu.eg`,
  phone: `0100 555 ${pad(2100 + i * 37, 4)}`,
  status: id === "t-17" ? "leave" : "active",
  joinedAt: `20${pad(12 + (i % 12))}-09-01`,
  permRole: permRole as PermRoleId,
}));

function buildTeaching(): Teaching[] {
  const out: Teaching[] = [];
  SECTIONS.forEach((s, si) => {
    const g = GRADES.find((x) => x.id === s.gradeId)!;
    const primary = g.stage === "primary";
    out.push({ sectionId: s.id, subjectId: "arabic", teacherId: ["t-04", "t-05", "t-06", "t-07"][si % 4] });
    out.push({ sectionId: s.id, subjectId: "english", teacherId: ["t-08", "t-09", "t-10"][si % 3] });
    out.push({
      sectionId: s.id,
      subjectId: "math",
      teacherId: TEACHER_SECTIONS.includes(s.id) ? "t-01" : primary ? "t-02" : "t-03",
    });
    out.push({ sectionId: s.id, subjectId: "science", teacherId: ["t-11", "t-12", "t-13"][si % 3] });
    out.push({ sectionId: s.id, subjectId: "social", teacherId: si % 2 ? "t-15" : "t-14" });
    out.push({ sectionId: s.id, subjectId: "religion", teacherId: "t-16" });
    out.push({ sectionId: s.id, subjectId: "ict", teacherId: "t-20" });
    out.push({ sectionId: s.id, subjectId: "art", teacherId: "t-18" });
    out.push({ sectionId: s.id, subjectId: "pe", teacherId: "t-19" });
  });
  return out;
}

const POSITIVE: L[] = [
  l("مشاركة متميزة في الحصة", "Outstanding class participation"),
  l("ساعد زملاءه في مشروع جماعي", "Helped classmates on a group project"),
  l("التزام كامل بالواجبات هذا الشهر", "Completed every homework this month"),
  l("تحسّن واضح في القراءة", "Clear improvement in reading"),
];
const CONCERN: L[] = [
  l("تأخر متكرر عن الطابور الصباحي", "Repeated late arrival to morning assembly"),
  l("عدم إحضار الأدوات المدرسية", "Did not bring school materials"),
  l("يحتاج متابعة في التركيز داخل الفصل", "Needs support with focus in class"),
];
const MISSING_DOCS: L[] = [
  l("شهادة الميلاد (أصل)", "Birth certificate (original)"),
  l("استمارة التطعيمات", "Vaccination record"),
  l("صورة بطاقة ولي الأمر", "Guardian ID copy"),
  l("صور شخصية حديثة", "Recent photos"),
];

export function teacherFor(teaching: Teaching[], sectionId: string, subjectId: string) {
  return teaching.find((t) => t.sectionId === sectionId && t.subjectId === subjectId)?.teacherId ?? "t-02";
}

export function createSeed(): DemoState {
  const rand = prng(2026);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const teaching = buildTeaching();

  const families: Family[] = [
    {
      id: "f-001",
      guardian: l("أحمد سامي الشريف", "Ahmed Samy El-Sherif"),
      relation: FATHER,
      phone: "0100 555 0142",
      email: "ahmed.sherif@example.com",
      job: l("مهندس مدني", "Civil engineer"),
      address: l("شارع النزهة، مصر الجديدة، القاهرة", "El-Nozha St., Heliopolis, Cairo"),
      second: { name: l("دينا محمود فهمي", "Dina Mahmoud Fahmy"), relation: MOTHER, phone: "0111 555 0187" },
    },
  ];
  const famMeta: Record<string, { father: [string, string]; family: [string, string] }> = {
    "f-001": { father: ["أحمد", "Ahmed"], family: ["الشريف", "El-Sherif"] },
  };

  const students: Student[] = [];
  let seq = 0;

  const makeStudent = (
    sectionId: string,
    opts?: Partial<Student> & { first?: [string, string]; familyId?: string },
  ): Student => {
    seq += 1;
    const { first: _first, ...rest } = opts ?? {};
    void _first;
    const section = SECTIONS.find((s) => s.id === sectionId)!;
    const grade = GRADES.find((g) => g.id === section.gradeId)!;
    const gender: "m" | "f" = opts?.gender ?? (rand() < 0.5 ? "m" : "f");
    const first = opts?.first ?? (gender === "m" ? pick(MALE) : pick(FEMALE));
    let familyId = opts?.familyId;
    if (!familyId) {
      if (rand() < 0.16 && families.length > 6) {
        familyId = families[1 + Math.floor(rand() * (families.length - 1))].id;
      } else {
        familyId = `f-${pad(families.length + 1, 3)}`;
        const father = pick(MALE);
        const grand = pick(MALE);
        const fam = pick(FAMILY);
        const motherGuardian = rand() < 0.15;
        const mother = pick(FEMALE);
        const motherFam = pick(FAMILY);
        famMeta[familyId] = { father, family: fam };
        const fatherName = l(`${father[0]} ${grand[0]} ${fam[0]}`, `${father[1]} ${grand[1]} ${fam[1]}`);
        const motherName = l(`${mother[0]} ${pick(MALE)[0]} ${motherFam[0]}`, `${mother[1]} ${pick(MALE)[1]} ${motherFam[1]}`);
        const n = families.length + 1;
        families.push({
          id: familyId,
          guardian: motherGuardian ? motherName : fatherName,
          relation: motherGuardian ? MOTHER : FATHER,
          phone: `01${pick(["0", "1", "2", "5"])}0 555 ${pad(1000 + n * 13, 4)}`,
          email: `family${pad(n, 3)}@example.com`,
          job: pick(JOBS),
          address: pick(AREAS),
          second: {
            name: motherGuardian ? fatherName : motherName,
            relation: motherGuardian ? FATHER : MOTHER,
            phone: `01${pick(["0", "1", "2"])}2 555 ${pad(3000 + n * 7, 4)}`,
          },
        });
      }
    }
    const meta = famMeta[familyId];
    const birthYear = 2020 - (grade.order - 1);
    const bm = 1 + Math.floor(rand() * 12);
    const bd = 1 + Math.floor(rand() * 28);
    const birthDate = opts?.birthDate ?? `${birthYear}-${pad(bm)}-${pad(bd)}`;
    const [by, bmo, bdy] = birthDate.split("-");
    const enrolYear = Math.max(2016, 2026 - (grade.order - 1));
    const behaviour: BehaviourNote[] = [];
    const nb = Math.floor(rand() * 3);
    for (let i = 0; i < nb; i++) {
      const pos = rand() < 0.7;
      behaviour.push({
        id: `bn-${seq}-${i}`,
        date: `2026-${pick(["10", "11"])}-${pad(1 + Math.floor(rand() * 14))}`,
        type: pos ? "positive" : "concern",
        note: pos ? pick(POSITIVE) : pick(CONCERN),
        by: pick(STAFF.filter((s) => s.role === "teacher")).name,
      });
    }
    const allergyRoll = rand();
    const condRoll = rand();
    return {
      id: `st-${pad(seq, 4)}`,
      code: `MS-${String(enrolYear).slice(2)}-${pad(seq, 4)}`,
      name: l(`${first[0]} ${meta.father[0]} ${meta.family[0]}`, `${first[1]} ${meta.father[1]} ${meta.family[1]}`),
      gender,
      nationalId: `3${by.slice(2)}${bmo}${bdy}01${pad(Math.floor(rand() * 9000) + 1000, 4)}${gender === "m" ? 1 : 2}`,
      birthDate,
      gradeId: grade.id,
      sectionId,
      familyId,
      status: "active",
      enrolledAt: `${enrolYear}-09-0${1 + Math.floor(rand() * 5)}`,
      missingDocs: [],
      transport: rand() < 0.4 ? l(`خط الحافلة ${1 + Math.floor(rand() * 6)}`, `Bus route ${1 + Math.floor(rand() * 6)}`) : l("مواصلات خاصة", "Private transport"),
      health: {
        bloodType: pick(["A+", "O+", "B+", "AB+", "O-", "A-"]),
        allergies: allergyRoll < 0.08 ? l("حساسية من المكسرات", "Nut allergy") : allergyRoll < 0.13 ? l("حساسية من البنسلين", "Penicillin allergy") : NONE,
        conditions: condRoll < 0.06 ? l("ربو خفيف", "Mild asthma") : condRoll < 0.09 ? l("ضعف نظر — يرتدي نظارة", "Short-sighted — wears glasses") : NONE,
        medication: condRoll < 0.06 ? l("بخاخ عند الحاجة", "Inhaler as needed") : NONE,
      },
      behaviour,
      ...rest,
    } as Student;
  };

  // Personas first: Laila (P4-A) and Youssef (Prep 1-B), both of family f-001.
  const laila = makeStudent("p4-a", { gender: "f", first: ["ليلى", "Laila"], familyId: "f-001", birthDate: "2017-03-12" });
  laila.health = {
    bloodType: "O+",
    allergies: l("حساسية من الفول السوداني", "Peanut allergy"),
    conditions: NONE,
    medication: l("قلم إبينفرين لدى الممرضة", "Epinephrine pen kept with the nurse"),
  };
  laila.transport = l("خط الحافلة 3", "Bus route 3");
  laila.behaviour = [
    { id: "bn-l1", date: "2026-11-09", type: "positive", note: POSITIVE[0], by: l("كريم حسن", "Karim Hassan") },
    { id: "bn-l2", date: "2026-10-22", type: "positive", note: POSITIVE[3], by: l("هالة منصور", "Hala Mansour") },
  ];
  students.push(laila);
  const youssef = makeStudent("m1-b", { gender: "m", first: ["يوسف", "Youssef"], familyId: "f-001", birthDate: "2014-08-02" });
  youssef.health = { bloodType: "A+", allergies: NONE, conditions: NONE, medication: NONE };
  youssef.behaviour = [
    { id: "bn-y1", date: "2026-11-03", type: "concern", note: CONCERN[0], by: l("حسام جلال", "Hossam Galal") },
  ];
  students.push(youssef);

  for (const s of SECTIONS) {
    const already = students.filter((x) => x.sectionId === s.id).length;
    const count = 9 + (hashStr(s.id) % 2) - already;
    for (let i = 0; i < count; i++) students.push(makeStudent(s.id));
  }
  students.sort((a, b) => a.id.localeCompare(b.id));

  // Status variety and incomplete files.
  const others = students.filter((s) => s.familyId !== "f-001");
  [others[17], others[64], others[150]].forEach((s, i) => {
    s.missingDocs = [MISSING_DOCS[i % 4], ...(i === 1 ? [MISSING_DOCS[3]] : [])];
  });
  others.filter((_, i) => i % 41 === 7).forEach((s) => (s.status = "new" as StudentStatus));
  [others[30], others[120]].forEach((s) => (s.status = "suspended"));
  [others[88], others[176]].forEach((s) => (s.status = "withdrawn"));

  // Today's attendance sessions: 18 of 24 sections already submitted, 12 exceptions.
  const pending = ["p4-a", "p5-a", "p2-b", "m3-a", "s2-b", "s3-a"];
  const attendance: Record<string, AttendanceSession> = {};
  const exceptionSections = SECTIONS.filter((s) => !pending.includes(s.id)).slice(0, 12).map((s) => s.id);
  for (const s of SECTIONS) {
    if (pending.includes(s.id)) continue;
    const roster = students.filter((x) => x.sectionId === s.id && (x.status === "active" || x.status === "new"));
    const marks: Record<string, AttendanceStatus> = {};
    roster.forEach((st) => (marks[st.id] = "present"));
    const exIdx = exceptionSections.indexOf(s.id);
    const victim = roster.find((st) => st.familyId !== "f-001");
    if (exIdx >= 0 && victim) marks[victim.id] = exIdx % 3 === 1 ? "late" : "absent";
    if (s.id === "p3-b" && roster[3]) marks[roster[3].id] = "excused";
    attendance[`${s.id}|2026-11-16`] = {
      sectionId: s.id,
      date: "2026-11-16",
      marks,
      savedAt: `2026-11-16T08:${pad(5 + (hashStr(s.id) % 40))}:00`,
      savedBy: STAFF.find((x) => x.id === teacherFor(teaching, s.id, "arabic"))!.name,
    };
  }

  // Grade sheets.
  const sheets: GradeSheet[] = [];
  const markFor = (sid: string, key: string, max: number) => {
    const base = 0.55 + (hashStr(sid) % 40) / 100;
    const jitter = ((hashStr(sid + key) % 21) - 10) / 100;
    return Math.max(Math.round(max * 0.3), Math.min(max, Math.round(max * (base + jitter) * 2) / 2));
  };
  const rosterOf = (sectionId: string) =>
    students.filter((x) => x.sectionId === sectionId && x.status !== "withdrawn");
  const makeSheet = (
    sectionId: string,
    subjectId: string,
    assessment: GradeSheet["assessment"],
    status: GradeSheet["status"],
    opts?: { blanks?: number; note?: string; updatedAt?: string },
  ) => {
    const max = assessment === "monthly1" ? 20 : assessment === "midterm" ? 40 : 60;
    const marks: Record<string, number | null> = {};
    rosterOf(sectionId).forEach((st, i) => {
      marks[st.id] = opts?.blanks && i >= rosterOf(sectionId).length - opts.blanks ? null : markFor(st.id, subjectId + assessment, max);
    });
    sheets.push({
      id: `gs-${sectionId}-${subjectId}-${assessment}`,
      sectionId,
      subjectId,
      assessment,
      maxMark: max,
      marks,
      status,
      teacherId: teacherFor(teaching, sectionId, subjectId),
      updatedAt: opts?.updatedAt ?? (assessment === "monthly1" ? "2026-10-29T12:00:00" : "2026-11-14T14:10:00"),
      note: opts?.note,
    });
  };
  for (const s of SECTIONS) for (const subj of GRADED_SUBJECTS) makeSheet(s.id, subj, "monthly1", "approved");
  [
    ["p4-b", "math"], ["p3-a", "arabic"], ["m2-a", "english"], ["s1-b", "science"], ["p6-a", "social"], ["m1-b", "science"],
  ].forEach(([sec, sub], i) => makeSheet(sec, sub, "midterm", "submitted", { updatedAt: `2026-11-${pad(12 + (i % 4))}T1${i}:20:00` }));
  makeSheet("p4-a", "math", "midterm", "draft", { blanks: 3 });
  makeSheet("p5-a", "math", "midterm", "draft", { blanks: 6 });
  makeSheet("p6-b", "math", "midterm", "rejected", {
    note: "يرجى مراجعة درجتي الطالبين الأخيرين؛ تتجاوزان متوسط الفصل بشكل غير معتاد.",
  });
  [["p4-a", "arabic"], ["p4-a", "english"], ["p4-a", "science"], ["m1-b", "arabic"], ["m1-b", "math"]].forEach(([sec, sub]) =>
    makeSheet(sec, sub, "midterm", "approved", { updatedAt: "2026-11-11T10:00:00" }),
  );

  // Finance.
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const tuition = { primary: 16500, preparatory: 18750, secondary: 21000 };
  const overdueSet = new Set<string>(["st-0002"]);
  others.filter((s) => s.status !== "withdrawn").forEach((s, i) => {
    if (i % 16 === 5 && overdueSet.size < 14) overdueSet.add(s.id);
  });
  let invN = 0;
  const methods: PayMethod[] = ["cash", "card", "transfer", "wallet"];
  const addInvoice = (studentId: string, kind: Invoice["kind"], amount: number, due: string, paid: number, issued: string) => {
    invN += 1;
    const inv: Invoice = {
      id: `inv-${pad(invN, 4)}`,
      number: `INV-26-${pad(invN, 4)}`,
      studentId,
      kind,
      amount,
      paid,
      dueDate: due,
      issuedAt: issued,
    };
    invoices.push(inv);
    if (paid > 0) {
      const h = hashStr(inv.id);
      const month = kind === "books" ? "09" : pick(["09", "10", "10", "11"]);
      const day = month === "11" ? 1 + (h % 15) : 1 + (h % 28);
      payments.push({
        id: `pay-${pad(invN, 4)}`,
        invoiceId: inv.id,
        amount: paid,
        method: methods[h % 4],
        date: `2026-${month}-${pad(day)}T${pad(9 + (h % 6))}:${pad(h % 60)}:00`,
        receivedBy: h % 2 ? l("رانيا مجدي", "Rania Magdy") : l("وليد عادل", "Walid Adel"),
        ref: `RC-${pad(10000 + invN, 5)}`,
      });
    }
  };
  for (const s of students) {
    if (s.status === "withdrawn") continue;
    const g = GRADES.find((x) => x.id === s.gradeId)!;
    const t = tuition[g.stage];
    const overdue = overdueSet.has(s.id);
    const tuitionPaid = overdue && s.id !== "st-0002" ? (hashStr(s.id) % 2 ? Math.round(t * 0.5) : 0) : t;
    addInvoice(s.id, "tuition", t, "2026-10-15", tuitionPaid, "2026-08-20");
    addInvoice(s.id, "books", 1250, "2026-09-30", 1250, "2026-08-20");
    const onBus = s.transport.en.startsWith("Bus");
    if (onBus) addInvoice(s.id, "bus", 3600, "2026-10-15", s.id === "st-0002" ? 1800 : 3600, "2026-08-20");
    if (s.familyId === "f-001" || hashStr(s.id + "act") % 10 < 3) {
      addInvoice(s.id, "activity", 850, "2026-11-30", s.id === "st-0002" ? 850 : 0, "2026-11-01");
    }
  }
  // Youssef needs a bus invoice for the overdue story even if not on bus.
  if (!invoices.some((i) => i.studentId === "st-0002" && i.kind === "bus")) {
    addInvoice("st-0002", "bus", 3600, "2026-10-15", 1800, "2026-08-20");
  }

  // Admissions.
  const appStatuses: ApplicationStatus[] = [
    ...Array<ApplicationStatus>(8).fill("new"),
    ...Array<ApplicationStatus>(5).fill("review"),
    ...Array<ApplicationStatus>(6).fill("accepted"),
    ...Array<ApplicationStatus>(3).fill("rejected"),
  ];
  const schools: L[] = [
    l("حضانة براعم المستقبل", "Future Buds Nursery"),
    l("مدرسة الفجر الخاصة", "Al-Fagr Private School"),
    l("مدرسة الأمل الرسمية للغات", "Al-Amal Language School"),
    l("حضانة زهرة المدائن", "Zahrat Al-Madaen Nursery"),
    l("مدرسة النيل التجريبية", "Nile Experimental School"),
  ];
  const applicants: Applicant[] = appStatuses.map((status, i) => {
    const gender: "m" | "f" = i % 2 ? "f" : "m";
    const first = gender === "m" ? MALE[(i * 5) % MALE.length] : FEMALE[(i * 3) % FEMALE.length];
    const father = MALE[(i * 7 + 3) % MALE.length];
    const fam = FAMILY[(i * 11 + 2) % FAMILY.length];
    const gradeId = i % 4 === 0 ? "p2" : i % 7 === 0 ? "m1" : i % 9 === 0 ? "s1" : "p1";
    const g = GRADES.find((x) => x.id === gradeId)!;
    const d = 30 - i;
    return {
      id: `ap-${pad(i + 1, 3)}`,
      code: `ADM-27-${pad(140 + i, 4)}`,
      name: l(`${first[0]} ${father[0]} ${fam[0]}`, `${first[1]} ${father[1]} ${fam[1]}`),
      gender,
      birthDate: `${2020 - (g.order - 1)}-${pad(1 + (i % 12))}-${pad(1 + ((i * 3) % 27))}`,
      gradeId,
      guardian: l(`${father[0]} ${MALE[(i + 9) % MALE.length][0]} ${fam[0]}`, `${father[1]} ${MALE[(i + 9) % MALE.length][1]} ${fam[1]}`),
      phone: `0120 555 ${pad(4100 + i * 29, 4)}`,
      previousSchool: schools[i % schools.length],
      submittedAt: d > 16 ? `2026-10-${pad(d)}T10:00:00` : `2026-11-${pad(16 - (i % 15))}T${pad(8 + (i % 9))}:15:00`,
      status,
      docsComplete: i % 5 !== 2,
      notes:
        status === "review"
          ? l("تمت جدولة مقابلة تعارف مع الطالب وولي الأمر.", "Introductory interview scheduled with student and guardian.")
          : status === "rejected"
            ? l("لا توجد أماكن متاحة في الصف المطلوب.", "No seats available in the requested grade.")
            : l("", ""),
    };
  });

  // Assignments.
  const asg = (
    id: string,
    sectionId: string,
    subjectId: string,
    title: L,
    description: L,
    dueDate: string,
    status: Assignment["status"],
    submittedShare: number,
    scored = false,
    extra: Record<string, { at: string; score?: number }> = {},
  ): Assignment => {
    const roster = rosterOf(sectionId).filter((s) => s.familyId !== "f-001");
    const submissions: Record<string, { at: string; score?: number }> = {};
    roster.slice(0, Math.round(roster.length * submittedShare)).forEach((s, i) => {
      submissions[s.id] = { at: `2026-11-${pad(Math.min(16, 10 + (i % 6)))}T19:${pad(i * 4)}:00`, ...(scored ? { score: 6 + (hashStr(s.id + id) % 5) } : {}) };
    });
    return {
      id,
      sectionId,
      subjectId,
      teacherId: teacherFor(teaching, sectionId, subjectId),
      title,
      description,
      dueDate,
      createdAt: "2026-11-08T10:00:00",
      status,
      maxScore: 10,
      submissions: { ...submissions, ...extra },
    };
  };
  const assignments: Assignment[] = [
    asg("a-01", "p4-a", "math", l("ورقة عمل: الكسور المتكافئة", "Worksheet: equivalent fractions"), l("حل التمارين من 1 إلى 12 في ورقة العمل المرفقة، مع توضيح خطوات الحل.", "Solve exercises 1–12 on the worksheet and show your steps."), "2026-11-18", "published", 0.45),
    asg("a-02", "p4-b", "math", l("مسائل القسمة المطوّلة", "Long division problems"), l("عشر مسائل قسمة مطوّلة من الكتاب صفحة 54.", "Ten long-division problems from the book, page 54."), "2026-11-17", "published", 0.8),
    asg("a-03", "p5-a", "math", l("مشروع: الأشكال الهندسية في بيتي", "Project: shapes in my home"), l("التقط صورًا أو ارسم خمسة أشكال هندسية في منزلك واكتب اسم كل شكل.", "Photograph or draw five shapes at home and label each one."), "2026-11-24", "published", 0.2),
    asg("a-04", "p6-b", "math", l("مراجعة النسبة والتناسب", "Ratio and proportion review"), l("مراجعة شاملة قبل امتحان منتصف الفصل.", "Full review before the midterm."), "2026-11-12", "closed", 1, true),
    asg("a-05", "p4-a", "math", l("تدريبات جدول الضرب", "Multiplication table drills"), l("تدريبات سريعة على جدول الضرب من 6 إلى 9.", "Quick drills on tables 6 to 9."), "2026-11-12", "closed", 0.9, true, { "st-0001": { at: "2026-11-11T18:30:00", score: 9 } }),
    asg("a-06", "p4-a", "arabic", l("تعبير: رحلة إلى الأقصر", "Composition: a trip to Luxor"), l("اكتب فقرة من ثمانية أسطر عن رحلة متخيلة إلى الأقصر.", "Write an eight-line paragraph about an imagined trip to Luxor."), "2026-11-19", "published", 0.3),
    asg("a-07", "p4-a", "science", l("تجربة: إنبات بذور الفول", "Experiment: sprouting bean seeds"), l("سجّل ملاحظاتك يوميًا لمدة خمسة أيام مع رسم بسيط.", "Log daily observations for five days with a simple drawing."), "2026-11-20", "published", 0.5, false, { "st-0001": { at: "2026-11-15T17:05:00" } }),
    asg("a-08", "p4-a", "english", l("Reading: My Family — أسئلة الفهم", "Reading: My Family — comprehension"), l("اقرأ النص وأجب عن الأسئلة الستة.", "Read the passage and answer the six questions."), "2026-11-17", "published", 0.6),
    asg("a-09", "m1-b", "science", l("بحث: مصادر الطاقة المتجددة", "Research: renewable energy sources"), l("بحث قصير من صفحتين عن طاقة الشمس والرياح في مصر.", "Two-page research on solar and wind energy in Egypt."), "2026-11-22", "published", 0.25),
    asg("a-10", "m1-b", "math", l("تمارين المعادلات من الدرجة الأولى", "Linear equations exercises"), l("التمارين من 1 إلى 15 صفحة 33.", "Exercises 1–15, page 33."), "2026-11-16", "published", 0.7),
    asg("a-11", "m1-b", "english", l("Grammar: Present Perfect", "Grammar: present perfect"), l("أكمل التدريبات في كراسة النشاط.", "Complete the workbook exercises."), "2026-11-10", "closed", 0.85, true),
  ];

  const messages: Message[] = [
    { id: "m-01", mailbox: "admin", box: "inbox", from: l("هشام فؤاد — وكيل المدرسة", "Hisham Fouad — Deputy"), to: l("مديرة المدرسة", "Principal"), subject: l("جدول المراقبة لامتحانات منتصف الفصل", "Midterm invigilation schedule"), body: l("أرفقت مسودة جدول المراقبة، أرجو المراجعة قبل الخميس.", "Draft invigilation schedule attached; please review before Thursday."), date: "2026-11-16T08:40:00", read: false },
    { id: "m-02", mailbox: "admin", box: "inbox", from: l("ولي أمر — أسرة منصور", "Parent — Mansour family"), to: l("الإدارة", "Administration"), subject: l("طلب تقسيط المصروفات", "Fee instalment request"), body: l("نرجو التكرم بالموافقة على تقسيط باقي مصروفات الفصل الأول على دفعتين.", "We kindly request splitting the remaining first-term fees into two instalments."), date: "2026-11-15T19:12:00", read: false },
    { id: "m-03", mailbox: "admin", box: "inbox", from: l("رانيا مجدي — الحسابات", "Rania Magdy — Accounts"), to: l("مديرة المدرسة", "Principal"), subject: l("ملخص التحصيل الأسبوعي", "Weekly collections summary"), body: l("تم تحصيل 86% من مصروفات الفصل الأول حتى الآن.", "86% of first-term fees have been collected so far."), date: "2026-11-13T13:00:00", read: true },
    { id: "m-04", mailbox: "admin", box: "sent", from: l("مديرة المدرسة", "Principal"), to: l("جميع المعلمين", "All teachers"), subject: l("موعد تسليم درجات منتصف الفصل", "Midterm grades deadline"), body: l("آخر موعد لرفع كشوف الدرجات يوم الخميس 19 نوفمبر.", "Grade sheets are due Thursday 19 November."), date: "2026-11-12T09:00:00", read: true },
    { id: "m-05", mailbox: "teacher", box: "inbox", from: l("م. أحمد سامي الشريف — ولي أمر ليلى", "Eng. Ahmed El-Sherif — Laila's parent"), to: l("أ. كريم حسن", "Mr. Karim Hassan"), subject: l("استفسار عن واجب الكسور", "Question about the fractions homework"), body: l("ليلى تسأل إن كان مطلوبًا رسم الكسور أم كتابتها فقط. شكرًا لحضرتك.", "Laila is asking whether fractions should be drawn or only written. Thank you."), date: "2026-11-15T20:05:00", read: false },
    { id: "m-06", mailbox: "teacher", box: "inbox", from: l("الإدارة — شؤون الطلاب", "Administration — Student affairs"), to: l("معلمو الصف الرابع", "Primary 4 teachers"), subject: l("لقاء أولياء الأمور يوم الخميس", "Parent meeting on Thursday"), body: l("يرجى تجهيز ملخص مستوى كل طالب قبل اللقاء.", "Please prepare a short level summary for each student."), date: "2026-11-14T11:30:00", read: true },
    { id: "m-07", mailbox: "teacher", box: "inbox", from: l("مديرة المدرسة", "Principal"), to: l("جميع المعلمين", "All teachers"), subject: l("موعد تسليم درجات منتصف الفصل", "Midterm grades deadline"), body: l("آخر موعد لرفع كشوف الدرجات يوم الخميس 19 نوفمبر.", "Grade sheets are due Thursday 19 November."), date: "2026-11-12T09:00:00", read: true },
    { id: "m-08", mailbox: "teacher", box: "sent", from: l("أ. كريم حسن", "Mr. Karim Hassan"), to: l("أولياء أمور 4 ابتدائي (ب)", "P4-B parents"), subject: l("مراجعة القسمة المطوّلة", "Long division revision"), body: l("سنراجع القسمة المطوّلة يوم الأحد، يرجى متابعة التدريبات بالمنزل.", "We'll revise long division on Sunday; please support practice at home."), date: "2026-11-11T15:00:00", read: true },
    { id: "m-09", mailbox: "parent", box: "inbox", from: l("أ. كريم حسن — معلم الرياضيات", "Mr. Karim Hassan — Mathematics"), to: l("ولي أمر ليلى", "Laila's parent"), subject: l("أداء ليلى في الرياضيات", "Laila's progress in mathematics"), body: l("ليلى متميزة في الحساب الذهني، ونعمل معها على مسائل الكسور. شكرًا لمتابعتكم.", "Laila excels at mental maths; we're working on fraction problems. Thank you for your support."), date: "2026-11-14T16:20:00", read: false },
    { id: "m-10", mailbox: "parent", box: "inbox", from: l("الحسابات — مدرسة النور الحديثة", "Accounts — Al-Nour Modern School"), to: l("أسرة الشريف", "El-Sherif family"), subject: l("تذكير: رسوم الحافلة المتأخرة", "Reminder: overdue bus fee"), body: l("نذكّركم بوجود مبلغ 1,800 ج.م متبقٍ من رسوم الحافلة ليوسف.", "A reminder that EGP 1,800 of Youssef's bus fee is outstanding."), date: "2026-11-10T10:00:00", read: true },
    { id: "m-11", mailbox: "parent", box: "inbox", from: l("الإدارة", "Administration"), to: l("أولياء أمور الصف الرابع", "Primary 4 parents"), subject: l("دعوة: لقاء أولياء الأمور", "Invitation: parent–teacher meeting"), body: l("يسعدنا حضوركم يوم الخميس 19 نوفمبر الساعة 1:30 ظهرًا بقاعة الأنشطة.", "Join us Thursday 19 November at 1:30 pm in the activity hall."), date: "2026-11-09T12:00:00", read: true },
    { id: "m-12", mailbox: "parent", box: "sent", from: l("م. أحمد سامي الشريف", "Eng. Ahmed El-Sherif"), to: l("أ. كريم حسن", "Mr. Karim Hassan"), subject: l("استفسار عن واجب الكسور", "Question about the fractions homework"), body: l("ليلى تسأل إن كان مطلوبًا رسم الكسور أم كتابتها فقط. شكرًا لحضرتك.", "Laila is asking whether fractions should be drawn or only written. Thank you."), date: "2026-11-15T20:05:00", read: true },
  ];

  const announcements: Announcement[] = [
    { id: "an-1", title: l("مواعيد امتحانات منتصف الفصل", "Midterm exam timetable"), body: l("تبدأ الامتحانات يوم الأحد 6 ديسمبر. الجداول التفصيلية متاحة لدى رواد الفصول.", "Exams start Sunday 6 December. Detailed timetables are with homeroom teachers."), audience: "all", date: "2026-11-15T09:00:00", author: l("الإدارة", "Administration") },
    { id: "an-2", title: l("معرض العلوم السنوي", "Annual science fair"), body: l("ندعو الطلاب للمشاركة بمشروعاتهم، آخر موعد للتسجيل 20 نوفمبر.", "Students are invited to present projects; registration closes 20 November."), audience: "students", date: "2026-11-12T10:00:00", author: l("قسم العلوم", "Science department") },
    { id: "an-3", title: l("تحديث خطوط الحافلات", "Bus route update"), body: l("تغيير بسيط في موعد خط الحافلة 3 ليصبح 6:50 صباحًا اعتبارًا من الأحد.", "Bus route 3 will depart at 6:50 am starting Sunday."), audience: "parents", date: "2026-11-10T08:00:00", author: l("شؤون النقل", "Transport office") },
  ];

  const notifications: AppNotification[] = [
    { id: "n-a1", role: "admin", title: l("6 كشوف درجات بانتظار الاعتماد", "6 grade sheets await approval"), body: l("أحدثها من أ. كريم حسن — 4 ابتدائي (ب)", "Latest from Mr. Karim Hassan — P4-B"), time: "2026-11-16T09:05:00", read: false, href: "/grades?tab=approvals", tone: "warning" },
    { id: "n-a2", role: "admin", title: l("طلب التحاق جديد", "New admission application"), body: l("تم استلام طلب جديد للصف الأول الابتدائي", "A new Primary 1 application was received"), time: "2026-11-16T08:15:00", read: false, href: "/admissions?status=new", tone: "info" },
    { id: "n-a3", role: "admin", title: l("استثناءات الحضور اليوم", "Today's attendance exceptions"), body: l("12 حالة غياب أو تأخير تحتاج متابعة", "12 absences or late arrivals need follow-up"), time: "2026-11-16T08:50:00", read: false, href: "/attendance?tab=exceptions", tone: "danger" },
    { id: "n-a4", role: "admin", title: l("ملخص التحصيل الأسبوعي جاهز", "Weekly collections summary ready"), body: l("من قسم الحسابات", "From the accounts office"), time: "2026-11-13T13:00:00", read: true, href: "/finance", tone: "success" },
    { id: "n-t1", role: "teacher", title: l("لم يُسجَّل حضور 4 ابتدائي (أ)", "P4-A attendance not recorded"), body: l("الحصة الأولى بدأت الساعة 8:00", "Period 1 started at 8:00"), time: "2026-11-16T08:20:00", read: false, href: "/attendance?section=p4-a", tone: "warning" },
    { id: "n-t2", role: "teacher", title: l("تم رفض كشف 6 ابتدائي (ب)", "P6-B sheet was returned"), body: l("ملاحظة من الإدارة على امتحان منتصف الفصل", "Admin note on the midterm sheet"), time: "2026-11-15T12:00:00", read: false, href: "/grades?section=p6-b", tone: "danger" },
    { id: "n-t3", role: "teacher", title: l("رسالة جديدة من ولي أمر", "New message from a parent"), body: l("م. أحمد الشريف — استفسار عن واجب الكسور", "Eng. Ahmed El-Sherif — fractions homework"), time: "2026-11-15T20:05:00", read: true, href: "/messages", tone: "info" },
    { id: "n-p1", role: "parent", title: l("ليلى: درجة جديدة في العلوم", "Laila: new science grade"), body: l("امتحان منتصف الفصل", "Midterm exam"), time: "2026-11-11T10:00:00", read: false, href: "/grades", tone: "success" },
    { id: "n-p2", role: "parent", title: l("يوسف: واجب مستحق اليوم", "Youssef: homework due today"), body: l("تمارين المعادلات — الرياضيات", "Linear equations — Mathematics"), time: "2026-11-16T07:00:00", read: false, href: "/assignments", tone: "warning" },
    { id: "n-p3", role: "parent", title: l("رسوم متأخرة", "Overdue fee"), body: l("رسوم الحافلة — يوسف", "Bus fee — Youssef"), time: "2026-11-10T10:00:00", read: true, href: "/finance", tone: "danger" },
    { id: "n-s1", role: "student", title: l("واجب الإنجليزي غدًا", "English homework due tomorrow"), body: l("Reading: My Family", "Reading: My Family"), time: "2026-11-16T07:00:00", read: false, href: "/assignments", tone: "warning" },
    { id: "n-s2", role: "student", title: l("أحسنتِ! شارة جديدة", "Well done! New badge"), body: l("شارة «قارئة متميزة»", "“Star reader” badge"), time: "2026-11-12T12:00:00", read: true, href: "/achievements", tone: "success" },
  ];

  const activity: Activity[] = [
    { id: "ac-1", actor: l("أ. سارة وجدي", "Ms. Sara Wagdy"), text: l("سجّلت حضور 3 ابتدائي (أ)", "recorded attendance for P3-A"), time: "2026-11-16T08:42:00", kind: "attendance" },
    { id: "ac-2", actor: l("ميرفت سعيد", "Mervat Saeed"), text: l("استلمت طلب التحاق جديد للصف الأول الابتدائي", "received a new Primary 1 application"), time: "2026-11-16T08:15:00", kind: "admissions" },
    { id: "ac-3", actor: l("رانيا مجدي", "Rania Magdy"), text: l("سجّلت دفعة بقيمة 8,250 ج.م", "recorded a payment of EGP 8,250"), time: "2026-11-15T13:20:00", kind: "finance" },
    { id: "ac-4", actor: l("أ. كريم حسن", "Mr. Karim Hassan"), text: l("أرسل كشف رياضيات 4 ابتدائي (ب) للاعتماد", "submitted the P4-B maths sheet for approval"), time: "2026-11-15T11:20:00", kind: "grades" },
    { id: "ac-5", actor: l("هشام فؤاد", "Hisham Fouad"), text: l("نشر إعلان مواعيد امتحانات منتصف الفصل", "published the midterm timetable notice"), time: "2026-11-15T09:00:00", kind: "message" },
    { id: "ac-6", actor: l("ميرفت سعيد", "Mervat Saeed"), text: l("حدّثت ملف الطالبة فريدة صبري", "updated student file for Farida Sabry"), time: "2026-11-14T12:10:00", kind: "student" },
  ];

  const permissions = Object.fromEntries(PERM_ROLES.map((r) => [r.id, presetMatrix(r.id)])) as Record<PermRoleId, PermMatrix>;

  return {
    version: STATE_VERSION,
    lang: "ar",
    role: "admin",
    parentChildId: "st-0001",
    students,
    families,
    staff: STAFF,
    teaching,
    attendance,
    sheets,
    applicants,
    invoices,
    payments,
    messages,
    announcements,
    notifications,
    activity,
    assignments,
    permissions,
    settings: {
      attendanceCutoff: "08:15",
      notifyAbsence: true,
      requireGradeApproval: true,
      weekStart: "sun",
      gradingScale: "percent",
    },
    seq: 1000,
  };
}