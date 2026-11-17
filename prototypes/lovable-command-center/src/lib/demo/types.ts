export type Lang = "ar" | "en";
export type Role = "admin" | "teacher" | "parent" | "student";

/** A localized string. */
export interface L {
  ar: string;
  en: string;
}

export type StageId = "primary" | "preparatory" | "secondary";

export interface Grade {
  id: string;
  stage: StageId;
  level: number;
  order: number;
  name: L;
  short: L;
}

export interface Section {
  id: string;
  gradeId: string;
  letter: L;
  room: string;
  capacity: number;
}

export interface Subject {
  id: string;
  name: L;
}

export type StudentStatus = "active" | "new" | "suspended" | "withdrawn";

export interface BehaviourNote {
  id: string;
  date: string;
  type: "positive" | "concern";
  note: L;
  by: L;
}

export interface Student {
  id: string;
  code: string;
  name: L;
  gender: "m" | "f";
  nationalId: string;
  birthDate: string;
  gradeId: string;
  sectionId: string;
  familyId: string;
  status: StudentStatus;
  enrolledAt: string;
  missingDocs: L[];
  transport: L;
  health: {
    bloodType: string;
    allergies: L;
    conditions: L;
    medication: L;
  };
  behaviour: BehaviourNote[];
}

export interface Family {
  id: string;
  guardian: L;
  relation: L;
  phone: string;
  email: string;
  job: L;
  address: L;
  second?: undefined | { name: L; relation: L; phone: string };
}

export type StaffRole =
  | "teacher"
  | "principal"
  | "deputy"
  | "accountant"
  | "registrar"
  | "counselor"
  | "nurse"
  | "it";

export type PermRoleId = "admin" | "teacher" | "accountant" | "registrar" | "readonly";

export interface Staff {
  id: string;
  name: L;
  role: StaffRole;
  subjectId?: string | undefined;
  email: string;
  phone: string;
  status: "active" | "leave";
  joinedAt: string;
  permRole: PermRoleId;
}

export interface Teaching {
  sectionId: string;
  subjectId: string;
  teacherId: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface AttendanceSession {
  sectionId: string;
  date: string;
  marks: Record<string, AttendanceStatus>;
  savedAt: string;
  savedBy: L;
}

export type AssessmentId = "monthly1" | "midterm" | "final";
export type SheetStatus = "draft" | "submitted" | "approved" | "rejected";

export interface GradeSheet {
  id: string;
  sectionId: string;
  subjectId: string;
  assessment: AssessmentId;
  maxMark: number;
  marks: Record<string, number | null>;
  status: SheetStatus;
  teacherId: string;
  updatedAt: string;
  note?: string | undefined;
}

export type ApplicationStatus = "new" | "review" | "accepted" | "rejected";

export interface Applicant {
  id: string;
  code: string;
  name: L;
  gender: "m" | "f";
  birthDate: string;
  gradeId: string;
  guardian: L;
  phone: string;
  previousSchool: L;
  submittedAt: string;
  status: ApplicationStatus;
  docsComplete: boolean;
  notes: L;
}

export interface Invoice {
  id: string;
  number: string;
  studentId: string;
  kind: "tuition" | "books" | "bus" | "activity";
  amount: number;
  paid: number;
  dueDate: string;
  issuedAt: string;
}

export type PayMethod = "cash" | "card" | "transfer" | "wallet";

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PayMethod;
  date: string;
  receivedBy: L;
  ref: string;
}

export interface Message {
  id: string;
  mailbox: Role;
  box: "inbox" | "sent";
  from: L;
  to: L;
  subject: L;
  body: L;
  date: string;
  read: boolean;
}

export interface Announcement {
  id: string;
  title: L;
  body: L;
  audience: "all" | "parents" | "teachers" | "students";
  date: string;
  author: L;
}

export type Tone = "info" | "success" | "warning" | "danger" | "neutral";

export interface AppNotification {
  id: string;
  role: Role;
  title: L;
  body: L;
  time: string;
  read: boolean;
  href: string;
  tone: Tone;
}

export interface Activity {
  id: string;
  actor: L;
  text: L;
  time: string;
  kind: "student" | "attendance" | "grades" | "finance" | "admissions" | "message" | "settings";
}

export interface Assignment {
  id: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  title: L;
  description: L;
  dueDate: string;
  createdAt: string;
  status: "published" | "closed";
  maxScore: number;
  submissions: Record<string, { at: string; score?: number }>;
}

export type PermAction = "view" | "create" | "edit" | "delete";
export type PermMatrix = Record<string, Record<PermAction, boolean>>;

export interface Settings {
  attendanceCutoff: string;
  notifyAbsence: boolean;
  requireGradeApproval: boolean;
  weekStart: "sun" | "sat";
  gradingScale: "percent" | "letters";
}

export interface DemoState {
  version: number;
  lang: Lang;
  role: Role;
  parentChildId: string;
  students: Student[];
  families: Family[];
  staff: Staff[];
  teaching: Teaching[];
  attendance: Record<string, AttendanceSession>;
  sheets: GradeSheet[];
  applicants: Applicant[];
  invoices: Invoice[];
  payments: Payment[];
  messages: Message[];
  announcements: Announcement[];
  notifications: AppNotification[];
  activity: Activity[];
  assignments: Assignment[];
  permissions: Record<PermRoleId, PermMatrix>;
  settings: Settings;
  seq: number;
}