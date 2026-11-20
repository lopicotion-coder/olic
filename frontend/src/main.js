import "./styles.css";
import { supabase, supabaseConfigReady } from "./client.js";
import { hasPermission, visibleSections, roleLabel } from "./access.js";
import {
  loadAccessModel,
  fetchScoped,
  countScoped,
  fetchMyStudentRecords,
  fetchGuardianStudentRecords,
} from "./repository.js";
import {
  renderFees,
  renderTimetable,
  renderExams,
  renderContent,
  renderSupport,
} from "./sections.js";

const root = document.querySelector("#app");
const STORAGE_CONTEXT_KEY = "my-school:last-context";
const STATUS_LABELS = {
  active: "نشط",
  inactive: "غير نشط",
  archived: "مؤرشف",
  draft: "مسودة",
  published: "منشور",
  closed: "مغلق",
  submitted: "تم التسليم",
  late: "متأخر",
  graded: "تم التصحيح",
  returned: "مُعاد",
  present: "حاضر",
  absent: "غائب",
  excused: "بعذر",
  trialing: "فترة تجريبية",
  past_due: "متأخر السداد",
  in_progress: "قيد المعالجة",
  waiting: "بانتظار رد",
  resolved: "تم الحل",
  closed: "مغلق",
  scheduled: "مجدول",
  completed: "مكتمل",
  cancelled: "ملغي",
  read: "مقروء",
  unread: "غير مقروء",
  suspended: "موقوف",
  paid: "مدفوع",
  issued: "صادر",
  overdue: "متأخر",
  partially_paid: "مدفوع جزئيًا",
};
const NAV_LABELS = {
  overview: "نظرة عامة",
  tenants: "المؤسسات",
  schools: "المدارس",
  students: "الطلاب",
  teachers: "المعلمون",
  classes: "الفصول",
  attendance: "الحضور",
  assignments: "الواجبات",
  grades: "الدرجات",
  messages: "الرسائل",
  notifications: "الإشعارات",
  billing: "الاشتراكات والفواتير",
  questions: "بنك الأسئلة",
  fees: "الرسوم والمدفوعات",
  timetable: "الجدول الدراسي",
  exams: "الامتحانات",
  content: "المحتوى التعليمي",
  support: "الدعم الفني",
  profile: "حسابي",
};
const NAV_ICONS = {
  overview: "◫", tenants: "▦", schools: "⌂", students: "♙", teachers: "♟",
  classes: "▤", attendance: "◷", assignments: "✓", grades: "▥", messages: "✉",
  notifications: "♧", billing: "¤", questions: "◇", profile: "◎",
};
const ATTENDANCE_VALUES = ["present", "absent", "late", "excused"];
const CONVERSATION_SCOPES = ["school", "class"];
const CURRENCY = "EGP";

const state = {
  session: null,
  user: null,
  access: null,
  context: null,
  section: "overview",
  data: null,
  loading: false,
  pageError: "",
  locale: "ar",
  selectedConversationId: "",
  selectedAttendanceSessionId: "",
  search: "",
  authMessage: "",
  authError: "",
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function money(value, currency = CURRENCY) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(state.locale === "ar" ? "ar-EG" : "en-GB", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(Number(value));
}

function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return esc(value);
  const locale = state.locale === "ar" ? "ar-EG" : "en-GB";
  const timezone = state.access?.profile?.timezone || "Africa/Cairo";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  }
}

function statusText(status) {
  return STATUS_LABELS[status] ?? status ?? "—";
}

function badge(status) {
  const safe = String(status ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `<span class="status-badge status-${safe}">${esc(statusText(status))}</span>`;
}

function table(headers, rows, emptyMessage = "لا توجد سجلات لعرضها.") {
  if (!rows.length) return emptyState(emptyMessage);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((v) => `<th>${esc(v)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function emptyState(message, hint = "") {
  return `<div class="empty-state"><span class="empty-icon">⌕</span><strong>${esc(message)}</strong>${hint ? `<p>${esc(hint)}</p>` : ""}</div>`;
}

function sectionHead(title, description = "", action = "") {
  return `<div class="section-head"><div><h2>${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ""}</div>${action}</div>`;
}

function metricCard(title, value, note = "") {
  return `<article class="metric-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function showToast(message, kind = "success") {
  const host = document.querySelector("#toast-host");
  if (!host) return;
  host.innerHTML = `<div class="toast toast-${kind}" role="status">${esc(message)}</div>`;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { host.innerHTML = ""; }, 4200);
}

function setDirection() {
  const isArabic = state.locale === "ar";
  document.documentElement.lang = isArabic ? "ar" : "en";
  document.documentElement.dir = isArabic ? "rtl" : "ltr";
}

function activeContextKey(context) {
  return context?.key ?? "";
}

function saveContextPreference(context) {
  if (state.user && context) {
    localStorage.setItem(`${STORAGE_CONTEXT_KEY}:${state.user.id}`, activeContextKey(context));
  }
}

function selectInitialContext(contexts) {
  const saved = localStorage.getItem(`${STORAGE_CONTEXT_KEY}:${state.user.id}`);
  return contexts.find((context) => context.key === saved) ?? contexts[0] ?? null;
}

function contextOptions() {
  return (state.access?.contexts ?? []).map((context) =>
    `<option value="${esc(context.key)}" ${context.key === state.context?.key ? "selected" : ""}>${esc(roleLabel(context))}</option>`
  ).join("");
}

function currentSections() {
  return state.context ? visibleSections(state.context) : [];
}

function has(permission) {
  return hasPermission(state.context, permission);
}

function contextFilter() {
  return {
    tenant_id: state.context?.tenantId ?? "",
    school_id: state.context?.schoolId ?? "",
    class_id: state.context?.classId ?? "",
  };
}

function canWriteSchoolData() {
  return Boolean(state.context?.tenantId && state.context?.schoolId);
}

function schoolOptions(selected = "") {
  const ctx = state.context;
  const schools = (state.access?.schools ?? [])
    .filter((school) => !ctx?.tenantId || school.tenant_id === ctx.tenantId);
  if (ctx?.schoolId) {
    const school = schools.find((item) => item.id === ctx.schoolId);
    return school ? `<option value="${esc(school.id)}" selected>${esc(school.name)}</option>` : "";
  }
  return schools.map((school) =>
    `<option value="${esc(school.id)}" ${selected === school.id ? "selected" : ""}>${esc(school.name)}</option>`
  ).join("");
}

function selectedSchoolId(formData) {
  return state.context?.schoolId || formData.get("school_id") || "";
}

function applyContext(context) {
  state.context = context;
  saveContextPreference(context);
  const visible = currentSections();
  if (!visible.includes(state.section)) state.section = visible[0] ?? "overview";
  state.selectedConversationId = "";
  state.selectedAttendanceSessionId = "";
  return loadSection();
}

function shell() {
  const ctx = state.context;
  const sections = currentSections();
  const profile = state.access?.profile;
  const displayName = profile?.display_name || profile?.email || state.user?.email || "";
  return `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><div class="brand-mark">MS</div><div><b>My School</b><small>مساحة العمل التعليمية</small></div></div>
        <div class="sidebar-context">
          <span class="eyebrow">مساحة العمل الحالية</span>
          <strong>${esc(ctx?.roleName ?? "")}</strong>
          <small>${esc([ctx?.tenantName, ctx?.schoolName].filter(Boolean).join(" · ") || ctx?.scope || "")}</small>
        </div>
        <nav class="main-nav" aria-label="التنقل">
          ${sections.map((section) => `
            <button class="nav-item ${state.section === section ? "active" : ""}" data-action="navigate" data-section="${section}">
              <span class="nav-icon">${NAV_ICONS[section] ?? "·"}</span>
              <span>${NAV_LABELS[section]}</span>
            </button>
          `).join("")}
        </nav>
        <div class="sidebar-bottom">
          <div class="privacy-note"><span class="privacy-dot"></span><span>الوصول محكوم بصلاحيات حسابك</span></div>
          <button class="nav-item signout" data-action="signout"><span class="nav-icon">↪</span><span>تسجيل الخروج</span></button>
        </div>
      </aside>
      <div class="content-area">
        <header class="topbar">
          <button class="icon-button mobile-menu" data-action="toggle-sidebar" aria-label="فتح القائمة">☰</button>
          <div class="topbar-title"><strong>${esc(NAV_LABELS[state.section] ?? "My School")}</strong><small>${esc(displayName)}</small></div>
          <div class="topbar-actions">
            ${state.access.contexts.length > 1 ? `<label class="context-picker"><span>السياق</span><select id="context-select">${contextOptions()}</select></label>` : ""}
            <button class="icon-button" data-action="refresh" title="تحديث البيانات" aria-label="تحديث البيانات">↻</button>
            <span class="user-avatar">${esc((displayName.trim()[0] || "U").toUpperCase())}</span>
          </div>
        </header>
        <main class="main-content">
          ${state.loading ? loadingView() : state.pageError ? errorView(state.pageError) : renderSection()}
        </main>
        <footer class="app-footer"><span>My School</span><span>لا يتم عرض بيانات غير موجودة في قاعدة البيانات</span></footer>
      </div>
    </div>
    <div id="toast-host" class="toast-host"></div>
  `;
}

function loadingView() {
  return `<div class="loading-card"><div class="spinner"></div><span>جارٍ تحميل بيانات حسابك…</span></div>`;
}

function errorView(message) {
  return `<div class="error-card"><strong>تعذّر تحميل هذا القسم</strong><p>${esc(message)}</p><button class="button button-secondary" data-action="refresh">إعادة المحاولة</button></div>`;
}

function renderAuth() {
  return `
    <div class="auth-layout">
      <section class="auth-aside">
        <div class="brand brand-light"><div class="brand-mark">MS</div><div><b>My School</b><small>منظومة إدارة وتعليم</small></div></div>
        <div class="auth-aside-copy"><span class="eyebrow">مساحة واحدة لكل أطراف العملية التعليمية</span><h1>إدارة التعليم،<br/>بصلاحيات واضحة.</h1><p>سجّل الدخول بحسابك المعتمد للوصول إلى المدرسة أو المؤسسة أو مساحة التعلم الخاصة بك.</p></div>
        <div class="auth-aside-foot">يتم تحديد دورك وبياناتك من العضويات والصلاحيات المسجلة في النظام.</div>
      </section>
      <section class="auth-panel">
        <form id="login-form" class="auth-form">
          <div class="auth-heading"><span class="eyebrow">مرحبًا بعودتك</span><h2>تسجيل الدخول</h2><p>استخدم البريد الإلكتروني وكلمة المرور المرتبطين بحسابك.</p></div>
          ${state.authError ? `<div class="form-alert error">${esc(state.authError)}</div>` : ""}
          ${state.authMessage ? `<div class="form-alert success">${esc(state.authMessage)}</div>` : ""}
          <label class="field"><span>البريد الإلكتروني</span><input type="email" name="email" autocomplete="username" required maxlength="254" placeholder="name@example.com"/></label>
          <label class="field"><span>كلمة المرور</span><input type="password" name="password" autocomplete="current-password" required minlength="8" maxlength="128" placeholder="••••••••••"/></label>
          <button class="button button-primary button-block" type="submit">دخول إلى حسابي</button>
          <button class="text-button" type="button" data-action="forgot-password">نسيت كلمة المرور؟</button>
          <p class="auth-footnote">الحسابات تُنشأ وتُمنح الأدوار من خلال إجراءات الإدارة المعتمدة. لا يمكن اختيار دور أو إنشاء صلاحيات من شاشة الدخول.</p>
        </form>
      </section>
    </div>
    <div id="toast-host" class="toast-host"></div>
  `;
}

function renderNoAccess() {
  return `
    <div class="no-access-layout">
      <div class="no-access-card">
        <div class="brand"><div class="brand-mark">MS</div><b>My School</b></div>
        <h1>لا توجد عضوية نشطة مرتبطة بهذا الحساب</h1>
        <p>تم تسجيل الدخول بنجاح، لكن لا توجد عضوية ودور نشط يسمحان بفتح مساحة عمل. تواصل مع مسؤول المؤسسة أو المدرسة لمراجعة الدعوة والصلاحيات.</p>
        <button class="button button-secondary" data-action="signout">تسجيل الخروج</button>
      </div>
    </div>
    <div id="toast-host" class="toast-host"></div>
  `;
}

function renderSection() {
  const data = state.data;
  if (!data) return emptyState("لا توجد بيانات لهذا القسم.");
  switch (state.section) {
    case "overview": return renderOverview(data);
    case "tenants": return renderTenants(data);
    case "schools": return renderSchools(data);
    case "students": return renderStudents(data);
    case "teachers": return renderTeachers(data);
    case "classes": return renderClasses(data);
    case "attendance": return renderAttendance(data);
    case "assignments": return renderAssignments(data);
    case "grades": return renderGrades(data);
    case "messages": return renderMessages(data);
    case "notifications": return renderNotifications(data);
    case "billing": return renderBilling(data);
    case "fees": return renderFees(data, state.context, { has });
    case "timetable": return renderTimetable(data, state.context, { has });
    case "exams": return renderExams(data, state.context, { has });
    case "content": return renderContent(data, state.context, { has });
    case "support": return renderSupport(data, state.context, { has }, state.user.id);
    case "questions": return renderQuestions(data);
    case "profile": return renderProfile(data);
    default: return emptyState("هذا القسم غير متاح في السياق الحالي.");
  }
}

async function loadSection() {
  if (!state.context || !state.session) return;
  state.loading = true;
  state.pageError = "";
  render();
  try {
    state.data = await loadSectionData();
  } catch (error) {
    console.error("My School page load failed", error);
    state.pageError = "قد لا تسمح صلاحيات هذا السياق بقراءة البيانات المطلوبة، أو تعذّر الاتصال بالخدمة. راجع العضوية وسياسات الوصول ثم أعد المحاولة.";
  } finally {
    state.loading = false;
    render();
  }
}

async function rows(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data ?? [];
}

function scoped(tableName, columns, options = {}) {
  let query = supabase.from(tableName).select(columns);
  const ctx = state.context;
  if (ctx?.tenantId && options.tenant !== false) query = query.eq("tenant_id", ctx.tenantId);
  if (ctx?.schoolId && options.school !== false) query = query.eq("school_id", ctx.schoolId);
  if (ctx?.classId && options.classScope) query = query.eq("class_id", ctx.classId);
  if (options.order) query = query.order(options.order, { ascending: options.ascending ?? false });
  if (options.limit) query = query.limit(options.limit);
  return query;
}

async function lookupRows(tableName, columns, options = {}) {
  let query = supabase.from(tableName).select(columns);
  if (state.context?.tenantId && options.tenant !== false) query = query.eq("tenant_id", state.context.tenantId);
  if (state.context?.schoolId && options.school !== false) query = query.eq("school_id", state.context.schoolId);
  if (options.classScope && state.context?.classId && tableName === "classes") query = query.eq("id", state.context.classId);
  if (options.order) query = query.order(options.order, { ascending: true });
  return rows(query.limit(options.limit ?? 250));
}

async function loadSectionData() {
  const ctx = state.context;
  switch (state.section) {
    case "overview": {
      const requests = [];
      const labels = [];
      const add = (permission, tableName, label) => {
        if (has(permission)) {
          requests.push(countScoped(supabase, tableName, ctx, { classScope: ["assignments", "attendance_sessions", "grades"].includes(tableName) }));
          labels.push(label);
        }
      };
      add("students.read", "students", "الطلاب");
      add("teachers.read", "teachers", "المعلمون");
      add("classes.read", "classes", "الفصول");
      add("assignments.read", "assignments", "الواجبات");
      add("attendance.read", "attendance_sessions", "جلسات الحضور");
      add("notifications.read", "notifications", "الإشعارات");
      const results = await Promise.all(requests);
      return { metrics: results.map((result, index) => ({ label: labels[index], ...result })) };
    }
    case "tenants":
      return { rows: await rows(supabase.from("tenants").select("id,legal_name,display_name,slug,status,created_at").order("display_name").limit(300)) };
    case "schools":
      return { rows: await rows(scoped("schools", "id,tenant_id,name,code,slug,status,default_locale,timezone,created_at", { tenant: true, school: false, order: "name", limit: 300 })) };
    case "students": {
      let studentRows = [];
      if (ctx.roleKey === "student") studentRows = await fetchMyStudentRecords(supabase, state.user.id);
      else if (ctx.roleKey === "parent") studentRows = await fetchGuardianStudentRecords(supabase, state.user.id);
      else studentRows = await fetchScoped(supabase, "students", "id,tenant_id,school_id,student_number,first_name,middle_name,last_name,date_of_birth,admission_date,status,created_at", ctx, { order: "created_at", limit: 300 });
      return { rows: studentRows };
    }
    case "teachers":
      return { rows: await fetchScoped(supabase, "teachers", "id,tenant_id,school_id,employee_number,first_name,last_name,email,phone,status,created_at", ctx, { order: "created_at", limit: 300 }) };
    case "classes": {
      const [classRows, grades, years] = await Promise.all([
        fetchScoped(supabase, "classes", "id,tenant_id,school_id,name,capacity,status,grade_level_id,academic_year_id,campus_id", ctx, { order: "name", limit: 250 }),
        lookupRows("grade_levels", "id,name,code,status"),
        lookupRows("academic_years", "id,name,status,is_current,starts_on,ends_on"),
      ]);
      return { rows: classRows, grades, years };
    }
    case "attendance": {
      const [sessions, classRows] = await Promise.all([
        fetchScoped(supabase, "attendance_sessions", "id,tenant_id,school_id,class_id,subject_id,session_date,period_number,notes,finalized_at,created_at", ctx, { classScope: true, order: "session_date", limit: 200 }),
        lookupRows("classes", "id,name,status,school_id", { classScope: true }),
      ]);
      let roster = [];
      let existingRecords = [];
      if (state.selectedAttendanceSessionId) {
        const session = sessions.find((item) => item.id === state.selectedAttendanceSessionId);
        if (session) {
          const enrollments = await rows(
            supabase.from("student_enrollments").select("student_id").eq("tenant_id", session.tenant_id)
              .eq("school_id", session.school_id).eq("class_id", session.class_id).eq("status", "active"),
          );
          const studentIds = [...new Set(enrollments.map((item) => item.student_id))];
          if (studentIds.length) {
            roster = await rows(supabase.from("students")
              .select("id,student_number,first_name,middle_name,last_name")
              .in("id", studentIds).order("first_name"));
          }
          existingRecords = await rows(supabase.from("attendance_records")
            .select("id,student_id,status,note").eq("session_id", session.id));
        }
      }
      return { sessions, classes: classRows, roster, existingRecords };
    }
    case "assignments": {
      const [assignments, classRows, subjects, submissions] = await Promise.all([
        fetchScoped(supabase, "assignments", "id,tenant_id,school_id,class_id,subject_id,title,instructions,status,due_at,max_score,allow_late_submission,published_at,created_at", ctx, { classScope: true, order: "created_at", limit: 200 }),
        lookupRows("classes", "id,name,status,school_id", { classScope: true }),
        lookupRows("subjects", "id,name,code,status,school_id"),
        fetchScoped(supabase, "assignment_submissions", "id,assignment_id,student_id,submission_text,status,submitted_at,score,feedback,graded_at", ctx, { limit: 500 }),
      ]);
      const ownStudents = ctx.roleKey === "student" ? await fetchMyStudentRecords(supabase, state.user.id) : [];
      return { assignments, classes: classRows, subjects, submissions, ownStudents };
    }
    case "grades": {
      const [assessments, gradeRows, studentRows] = await Promise.all([
        fetchScoped(supabase, "assessments", "id,tenant_id,school_id,class_id,subject_id,title,assessment_type,max_score,weight,assessment_date,is_published", ctx, { classScope: true, order: "assessment_date", limit: 250 }),
        fetchScoped(supabase, "grades", "id,assessment_id,student_id,score,feedback,published_at,created_at", ctx, { limit: 500 }),
        ctx.roleKey === "student" ? fetchMyStudentRecords(supabase, state.user.id) : has("students.read")
          ? fetchScoped(supabase, "students", "id,tenant_id,school_id,student_number,first_name,middle_name,last_name", ctx, { limit: 500 })
          : Promise.resolve([]),
      ]);
      return { assessments, rows: gradeRows, students: studentRows };
    }
    case "messages": {
      const conversations = await fetchScoped(supabase, "conversations", "id,tenant_id,school_id,scope_type,title,class_id,student_id,created_by,last_message_at,archived_at,created_at", ctx, { classScope: true, order: "last_message_at", limit: 150 });
      const selected = conversations.find((item) => item.id === state.selectedConversationId) ?? conversations[0] ?? null;
      const messages = selected
        ? await rows(supabase.from("messages").select("id,conversation_id,sender_user_id,body,message_type,created_at,edited_at,deleted_at")
            .eq("conversation_id", selected.id).order("created_at", { ascending: true }).limit(300))
        : [];
      return { conversations, selected, messages, classes: await lookupRows("classes", "id,name,status") };
    }
    case "notifications":
      return { rows: await rows(supabase.from("notifications")
        .select("id,tenant_id,school_id,class_id,recipient_user_id,sender_user_id,title,body,notification_type,is_read,read_at,created_at")
        .order("created_at", { ascending: false }).limit(250)) };
    case "billing": {
      const [subscriptions, invoices, payments] = await Promise.all([
        fetchScoped(supabase, "tenant_subscriptions", "id,tenant_id,subscription_plan_id,status,starts_on,ends_on,trial_ends_on,auto_renew,seats,monthly_price,currency,external_reference,created_at", ctx, { tenant: true, school: false, order: "created_at", limit: 200 }),
        fetchScoped(supabase, "subscription_invoices", "id,tenant_id,subscription_id,invoice_number,period_start,period_end,amount_due,amount_paid,status,issued_on,due_on,paid_on,notes,created_at", ctx, { tenant: true, school: false, order: "created_at", limit: 250 }),
        fetchScoped(supabase, "subscription_payments", "id,tenant_id,invoice_id,receipt_number,amount,payment_method,reference,notes,received_at", ctx, { tenant: true, school: false, order: "received_at", limit: 250 }),
      ]);
      let plans = [];
      if (has("platform.billing.manage")) plans = await rows(supabase.from("subscription_plans").select("id,code,display_name,billing_cycle,base_price,currency,status").order("display_name"));
      return { subscriptions, invoices, payments, plans };
    }
    case "fees": {
      let linkedStudents = [];
      if (ctx.roleKey === "student") linkedStudents = await fetchMyStudentRecords(supabase, state.user.id);
      else if (ctx.roleKey === "parent") linkedStudents = await fetchGuardianStudentRecords(supabase, state.user.id);

      let accounts = [];
      if (["student","parent"].includes(ctx.roleKey)) {
        const ids = [...new Set(linkedStudents.map((row) => row.id))];
        accounts = ids.length
          ? await rows(supabase.from("student_fee_accounts")
              .select("id,tenant_id,school_id,student_id,fee_plan_id,discount_amount,created_at")
              .in("student_id", ids).order("created_at", { ascending: false }))
          : [];
      } else {
        accounts = await fetchScoped(supabase, "student_fee_accounts", "id,tenant_id,school_id,student_id,fee_plan_id,discount_amount,created_at", ctx, { order: "created_at", limit: 300 });
      }

      const accountIds = accounts.map((row) => row.id);
      const feePlanIds = [...new Set(accounts.map((row) => row.fee_plan_id))];
      const [plans, installments, payments, students, years] = await Promise.all([
        has("fees.manage") || has("fees.read")
          ? lookupRows("fee_plans", "id,tenant_id,school_id,academic_year_id,name,currency,total_amount,is_active")
          : feePlanIds.length
            ? rows(supabase.from("fee_plans").select("id,name,currency,total_amount,is_active").in("id", feePlanIds))
            : Promise.resolve([]),
        accountIds.length
          ? rows(supabase.from("fee_installments").select("id,tenant_id,school_id,fee_account_id,sequence_number,due_on,amount").in("fee_account_id", accountIds).order("due_on"))
          : Promise.resolve([]),
        accountIds.length
          ? rows(supabase.from("fee_payments").select("id,tenant_id,school_id,fee_account_id,installment_id,receipt_number,amount,currency,payment_method,reference,received_at,notes").in("fee_account_id", accountIds).order("received_at", { ascending: false }))
          : Promise.resolve([]),
        has("fees.manage") || has("fees.read")
          ? lookupRows("students", "id,tenant_id,student_number,first_name,middle_name,last_name,school_id")
          : Promise.resolve(linkedStudents),
        has("fees.manage") ? lookupRows("academic_years", "id,tenant_id,name,school_id,is_current,status") : Promise.resolve([]),
      ]);
      return { accounts, plans, installments, payments, students, years, schools: state.access.schools };
    }
    case "timetable": {
      const [entries, classes, subjects, teachers, years] = await Promise.all([
        fetchScoped(supabase, "timetable_entries", "id,tenant_id,school_id,academic_year_id,class_id,subject_id,teacher_id,day_of_week,period_number,starts_at,ends_at,room_name,status,published_at", ctx, { classScope: true, order: "day_of_week", limit: 1000 }),
        lookupRows("classes", "id,name,status,school_id", { classScope: true }),
        lookupRows("subjects", "id,name,code,status,school_id"),
        has("timetable.manage") || has("teachers.read")
          ? lookupRows("teachers", "id,tenant_id,first_name,last_name,school_id")
          : Promise.resolve([]),
        lookupRows("academic_years", "id,tenant_id,name,is_current,status,school_id"),
      ]);
      return { entries, classes, subjects, teachers, years, schools: state.access.schools };
    }
    case "exams": {
      const [sessions, classes, subjects, candidates, students] = await Promise.all([
        fetchScoped(supabase, "exam_sessions", "id,tenant_id,school_id,class_id,subject_id,term_id,title,exam_type,scheduled_at,duration_minutes,room_name,max_score,status,published_at", ctx, { classScope: true, order: "scheduled_at", limit: 300 }),
        lookupRows("classes", "id,name,status,school_id", { classScope: true }),
        lookupRows("subjects", "id,name,code,status,school_id"),
        fetchScoped(supabase, "exam_candidates", "id,tenant_id,school_id,exam_session_id,student_id,seat_number,committee_name", ctx, { limit: 1000 }),
        has("students.read")
          ? fetchScoped(supabase, "students", "id,tenant_id,school_id,student_number,first_name,middle_name,last_name", ctx, { limit: 1000 })
          : ctx.roleKey === "student" ? fetchMyStudentRecords(supabase, state.user.id)
          : ctx.roleKey === "parent" ? fetchGuardianStudentRecords(supabase, state.user.id)
          : Promise.resolve([]),
      ]);
      return { sessions, classes, subjects, candidates, students, schools: state.access.schools };
    }
    case "content": {
      const [contentRows, classes, subjects] = await Promise.all([
        fetchScoped(supabase, "content_items", "id,tenant_id,school_id,class_id,subject_id,title,summary,body,resource_type,status,published_at,created_by,created_at,updated_at", ctx, { classScope: true, order: "created_at", limit: 300 }),
        has("content.manage") ? lookupRows("classes", "id,name,status,school_id", { classScope: true }) : Promise.resolve([]),
        has("content.manage") ? lookupRows("subjects", "id,name,code,status,school_id") : Promise.resolve([]),
      ]);
      return { rows: contentRows, classes, subjects, schools: state.access.schools };
    }
    case "support":
      return { rows: await fetchScoped(supabase, "support_tickets", "id,tenant_id,school_id,created_by,created_for_user_id,assigned_to_user_id,title,description,category,status,priority,source,resolved_at,closed_at,created_at,updated_at,closure_reason", ctx, { tenant: true, school: true, order: "created_at", limit: 300 }), schools: state.access.schools };
    case "questions":
      return { rows: await fetchScoped(supabase, "question_bank", "id,sharing_scope,tenant_id,school_id,subject_code,subject_name,grade_code,grade_label,unit_title,lesson_title,question_type,question_text,choices,language_code,difficulty,review_status,record_status,origin_type,approved_at,created_at", ctx, { tenant: true, school: true, order: "created_at", limit: 250 }) };
    case "profile": {
      const { data, error } = await supabase.from("profiles")
        .select("id,email,display_name,preferred_locale,timezone,created_at,updated_at")
        .eq("id", state.user.id).maybeSingle();
      if (error) throw error;
      return { profile: data };
    }
    default: return {};
  }
}

function renderOverview(data) {
  const cards = (data.metrics ?? []).map((metric) => metricCard(
    metric.label,
    metric.error ? "—" : new Intl.NumberFormat(state.locale === "ar" ? "ar-EG" : "en-GB").format(metric.count),
    metric.error ? "تعذّر تحميل العدد من قاعدة البيانات" : "عدد السجلات التي يسمح سياقك بقراءتها",
  ));
  return `
    <section class="welcome-panel">
      <div><span class="eyebrow">مساحة عملك</span><h1>أهلًا ${esc(state.access?.profile?.display_name || state.user?.email || "")}</h1>
      <p>البيانات الظاهرة هنا تُقرأ مباشرة من قاعدة My School وتخضع لصلاحيات عضويتك الحالية.</p></div>
      <div class="welcome-mark">MS</div>
    </section>
    <section class="metrics-grid">${cards.length ? cards.join("") : emptyState("لا توجد مؤشرات متاحة في هذا السياق.", "ستظهر المؤشرات عند منح صلاحيات قراءة الوحدات المناسبة.")}</section>
    <section class="panel"><div class="panel-heading"><div><h3>حالة مساحة العمل</h3><p>السياق الحالي مستمد من عضويتك الفعلية.</p></div></div>
      <div class="context-summary"><div><span>الدور</span><strong>${esc(state.context.roleName)}</strong></div>
      <div><span>نوع الصلاحية</span><strong>${esc(state.context.scope)}</strong></div>
      <div><span>المؤسسة</span><strong>${esc(state.context.tenantName || "—")}</strong></div>
      <div><span>المدرسة</span><strong>${esc(state.context.schoolName || "—")}</strong></div></div>
    </section>`;
}

function renderTenants(data) {
  const rowsHtml = data.rows.map((row) => `<tr><td><strong>${esc(row.display_name)}</strong><small>${esc(row.legal_name)}</small></td><td>${esc(row.slug)}</td><td>${badge(row.status)}</td><td>${dateText(row.created_at)}</td></tr>`);
  return sectionHead("المؤسسات", "المؤسسات التي تسمح عضويتك وصلاحيات المنصة بالوصول إليها.")
    + table(["اسم المؤسسة","المعرّف","الحالة","تاريخ الإنشاء"], rowsHtml, "لا توجد مؤسسات متاحة لهذا الحساب.");
}

function renderSchools(data) {
  const rowsHtml = data.rows.map((row) => `<tr><td><strong>${esc(row.name)}</strong><small>${esc(row.code)}</small></td><td>${esc(row.slug)}</td><td>${badge(row.status)}</td><td>${esc(row.default_locale)}</td><td>${esc(row.timezone)}</td></tr>`);
  return sectionHead("المدارس", "المدارس المتاحة ضمن نطاق العضوية والصلاحيات الحالية.")
    + table(["المدرسة","الرابط المختصر","الحالة","اللغة","المنطقة الزمنية"], rowsHtml, "لا توجد مدارس متاحة لهذا الحساب.");
}

function renderStudents(data) {
  const rowsHtml = data.rows.map((row) => `<tr><td>${esc(row.student_number)}</td><td><strong>${esc([row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" "))}</strong></td><td>${dateText(row.date_of_birth)}</td><td>${dateText(row.admission_date)}</td><td>${badge(row.status)}</td></tr>`);
  const canManage = has("students.manage") && (state.context.tenantId || state.context.scope === "platform");
  const form = canManage ? `
    <form class="form-grid compact-form" data-form="create-student">
      ${state.context.schoolId ? "" : `<label class="field"><span>المدرسة</span><select name="school_id" required><option value="">اختر مدرسة مسجلة</option>${schoolOptions()}</select></label>`}
      <label class="field"><span>رقم الطالب</span><input name="student_number" required maxlength="64" /></label>
      <label class="field"><span>الاسم الأول</span><input name="first_name" required maxlength="100" /></label>
      <label class="field"><span>الاسم الأوسط</span><input name="middle_name" maxlength="100" /></label>
      <label class="field"><span>اسم العائلة</span><input name="last_name" required maxlength="100" /></label>
      <label class="field"><span>تاريخ الميلاد</span><input name="date_of_birth" type="date" /></label>
      <label class="field"><span>تاريخ الالتحاق</span><input name="admission_date" type="date" /></label>
      <div class="form-actions"><button class="button button-primary" type="submit">إضافة طالب</button></div>
    </form>` : "";
  const notice = ["parent","student"].includes(state.context.roleKey)
    ? `<div class="info-banner">يعرض هذا القسم سجلات الطلاب المرتبطة بحسابك فقط. إنشاء ملف طالب مستقل يحتاج تفعيل migration الهوية العالمية على قاعدة الإنتاج.</div>`
    : "";
  return sectionHead("الطلاب", "السجلات المدرسية التي تسمح صلاحياتك بقراءتها.", canManage ? `<button class="button button-secondary" data-action="toggle-form" data-target="student-form">إضافة طالب</button>` : "")
    + notice
    + (canManage ? `<section id="student-form" class="panel form-panel hidden">${form}</section>` : "")
    + table(["رقم الطالب","الاسم","تاريخ الميلاد","تاريخ الالتحاق","الحالة"], rowsHtml, "لا توجد سجلات طلاب متاحة في هذا النطاق.");
}

function renderTeachers(data) {
  const rowsHtml = data.rows.map((row) => `<tr><td>${esc(row.employee_number)}</td><td><strong>${esc([row.first_name,row.last_name].filter(Boolean).join(" "))}</strong></td><td>${esc(row.email)}</td><td>${esc(row.phone)}</td><td>${badge(row.status)}</td></tr>`);
  const canManage = has("teachers.manage") && state.context.tenantId;
  const form = canManage ? `
    <form class="form-grid compact-form" data-form="create-teacher">
      ${state.context.schoolId ? "" : `<label class="field"><span>المدرسة</span><select name="school_id" required><option value="">اختر مدرسة مسجلة</option>${schoolOptions()}</select></label>`}
      <label class="field"><span>الرقم الوظيفي</span><input name="employee_number" maxlength="64"/></label>
      <label class="field"><span>الاسم الأول</span><input name="first_name" required maxlength="100"/></label>
      <label class="field"><span>اسم العائلة</span><input name="last_name" required maxlength="100"/></label>
      <label class="field"><span>البريد الإلكتروني</span><input name="email" type="email" maxlength="254"/></label>
      <label class="field"><span>الهاتف</span><input name="phone" type="tel" maxlength="40"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit">إضافة معلم</button></div>
    </form>` : "";
  return sectionHead("المعلمون", "سجلات أعضاء هيئة التدريس ضمن نطاقك.", canManage ? `<button class="button button-secondary" data-action="toggle-form" data-target="teacher-form">إضافة معلم</button>` : "")
    + (canManage ? `<section id="teacher-form" class="panel form-panel hidden">${form}</section>` : "")
    + table(["الرقم الوظيفي","الاسم","البريد الإلكتروني","الهاتف","الحالة"], rowsHtml, "لا توجد سجلات معلمين متاحة في هذا النطاق.");
}

function renderClasses(data) {
  const gradeMap = new Map(data.grades.map((item) => [item.id,item.name]));
  const yearMap = new Map(data.years.map((item) => [item.id,item.name]));
  const rowsHtml = data.rows.map((row) => `<tr><td><strong>${esc(row.name)}</strong></td><td>${esc(gradeMap.get(row.grade_level_id) || "—")}</td><td>${esc(yearMap.get(row.academic_year_id) || "—")}</td><td>${row.capacity ?? "—"}</td><td>${badge(row.status)}</td></tr>`);
  const canManage = has("classes.manage") && state.context.tenantId;
  const form = canManage ? `
    <form class="form-grid compact-form" data-form="create-class">
      ${state.context.schoolId ? "" : `<label class="field"><span>المدرسة</span><select name="school_id" required><option value="">اختر مدرسة مسجلة</option>${schoolOptions()}</select></label>`}
      <label class="field"><span>اسم الفصل</span><input name="name" required maxlength="80"/></label>
      <label class="field"><span>الصف الدراسي</span><select name="grade_level_id" required><option value="">اختر صفًا مسجلًا</option>${data.grades.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label>
      <label class="field"><span>السنة الدراسية</span><select name="academic_year_id" required><option value="">اختر سنة مسجلة</option>${data.years.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label>
      <label class="field"><span>السعة</span><input name="capacity" type="number" min="1" max="1000"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" ${!data.grades.length || !data.years.length ? "disabled" : ""}>إنشاء فصل</button></div>
    </form>` : "";
  return sectionHead("الفصول", "الفصول والسنة الدراسية والصفوف المسجلة.", canManage ? `<button class="button button-secondary" data-action="toggle-form" data-target="class-form">إنشاء فصل</button>` : "")
    + (canManage ? `<section id="class-form" class="panel form-panel hidden">${data.grades.length && data.years.length ? form : emptyState("لا توجد صفوف أو سنوات دراسية مسجلة تسمح بإنشاء فصل.")}</section>` : "")
    + table(["الفصل","الصف الدراسي","السنة الدراسية","السعة","الحالة"], rowsHtml, "لا توجد فصول مسجلة في هذا النطاق.");
}

function renderAttendance(data) {
  const classMap = new Map(data.classes.map((item) => [item.id,item.name]));
  const sessionRows = data.sessions.map((session) => `<tr><td>${dateText(session.session_date)}</td><td>${esc(classMap.get(session.class_id) || session.class_id)}</td><td>${session.period_number ?? "—"}</td><td>${session.finalized_at ? badge("finalized") : badge("active")}</td><td><button class="button button-small button-secondary" data-action="open-attendance" data-id="${esc(session.id)}">فتح التحضير</button></td></tr>`);
  const canManage = has("attendance.manage") && state.context.tenantId;
  const createForm = canManage ? `
    <form class="form-grid compact-form" data-form="create-attendance">
      ${state.context.schoolId ? "" : `<label class="field"><span>المدرسة</span><select name="school_id" required><option value="">اختر مدرسة مسجلة</option>${schoolOptions()}</select></label>`}
      <label class="field"><span>الفصل</span><select name="class_id" required><option value="">اختر فصلًا</option>${data.classes.map((item) => `<option value="${esc(item.id)}" data-school-id="${esc(item.school_id)}">${esc(item.name)}</option>`).join("")}</select></label>
      <label class="field"><span>التاريخ</span><input name="session_date" type="date" required value="${new Date().toISOString().slice(0,10)}"/></label>
      <label class="field"><span>رقم الحصة</span><input name="period_number" type="number" min="1" max="20"/></label>
      <label class="field"><span>ملاحظات</span><input name="notes" maxlength="500"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit">إنشاء جلسة حضور</button></div>
    </form>` : "";
  let rosterPanel = "";
  if (state.selectedAttendanceSessionId) {
    const current = data.sessions.find((item) => item.id === state.selectedAttendanceSessionId);
    if (current) {
      const existing = new Map(data.existingRecords.map((item) => [item.student_id,item]));
      const studentRows = data.roster.map((student) => {
        const previous = existing.get(student.id);
        return `<tr><td>${esc(student.student_number)}</td><td>${esc([student.first_name,student.middle_name,student.last_name].filter(Boolean).join(" "))}</td><td><select name="status_${esc(student.id)}" form="attendance-mark-form" required><option value="">حدد الحالة</option>${ATTENDANCE_VALUES.map((value) => `<option value="${value}" ${previous?.status === value ? "selected" : ""}>${statusText(value)}</option>`).join("")}</select></td><td><input name="note_${esc(student.id)}" form="attendance-mark-form" value="${esc(previous?.note ?? "")}" maxlength="300" placeholder="ملاحظة اختيارية"/></td></tr>`;
      });
      rosterPanel = `
        <section class="panel attendance-roster">
          <div class="panel-heading"><div><h3>تحضير ${dateText(current.session_date)} — ${esc(classMap.get(current.class_id) || "")}</h3><p>اختر الحالة لكل طالب قبل الحفظ. لن يتم افتراض حالة حضور لأي طالب.</p></div><button class="icon-button" data-action="close-attendance" title="إغلاق">×</button></div>
          <form id="attendance-mark-form" data-form="save-attendance">
            <input type="hidden" name="session_id" value="${esc(current.id)}"/>
            ${table(["رقم الطالب","اسم الطالب","الحالة","ملاحظة"], studentRows, "لا يوجد طلاب مقيدون حاليًا في هذا الفصل.")}
            ${data.roster.length ? `<div class="form-actions"><button class="button button-primary" type="submit">حفظ سجل الحضور</button></div>` : ""}
          </form>
        </section>`;
    }
  }
  return sectionHead("الحضور", "جلسات الحضور المسجلة وسجلاتها الفعلية.", canManage ? `<button class="button button-secondary" data-action="toggle-form" data-target="attendance-create-form">جلسة جديدة</button>` : "")
    + (canManage ? `<section id="attendance-create-form" class="panel form-panel hidden">${createForm}</section>` : "")
    + (rosterPanel)
    + table(["التاريخ","الفصل","الحصة","الحالة","إجراء"], sessionRows, "لا توجد جلسات حضور مسجلة في هذا النطاق.");
}

function renderAssignments(data) {
  const classMap = new Map(data.classes.map((item) => [item.id,item.name]));
  const subjectMap = new Map(data.subjects.map((item) => [item.id,item.name]));
  const rowsHtml = data.assignments.map((assignment) => {
    const publish = has("assignments.manage") && assignment.status === "draft"
      ? `<button class="button button-small button-secondary" data-action="publish-assignment" data-id="${esc(assignment.id)}">نشر</button>` : "";
    const submissions = data.submissions.filter((row) => row.assignment_id === assignment.id);
    return `<tr><td><strong>${esc(assignment.title)}</strong><small>${esc(assignment.instructions)}</small></td><td>${esc(classMap.get(assignment.class_id) || "—")}</td><td>${esc(subjectMap.get(assignment.subject_id) || "—")}</td><td>${dateText(assignment.due_at)}</td><td>${badge(assignment.status)}</td><td>${submissions.length}</td><td>${publish}</td></tr>`;
  });
  const canManage = has("assignments.manage") && state.context.tenantId;
  const createForm = canManage ? `
    <form class="form-grid compact-form" data-form="create-assignment">
      ${state.context.schoolId ? "" : `<label class="field"><span>المدرسة</span><select name="school_id" required><option value="">اختر مدرسة</option>${schoolOptions()}</select></label>`}
      <label class="field"><span>الفصل</span><select name="class_id" required><option value="">اختر فصلًا</option>${data.classes.map((row) => `<option value="${esc(row.id)}" data-school-id="${esc(row.school_id)}">${esc(row.name)}</option>`).join("")}</select></label>
      <label class="field"><span>المادة</span><select name="subject_id" required><option value="">اختر مادة</option>${data.subjects.map((row) => `<option value="${esc(row.id)}" data-school-id="${esc(row.school_id)}">${esc(row.name)}</option>`).join("")}</select></label>
      <label class="field"><span>عنوان الواجب</span><input name="title" required maxlength="180"/></label>
      <label class="field"><span>موعد التسليم</span><input name="due_at" type="datetime-local"/></label>
      <label class="field"><span>الدرجة القصوى</span><input name="max_score" type="number" min="0" step="0.01"/></label>
      <label class="field field-wide"><span>التعليمات</span><textarea name="instructions" rows="3" maxlength="6000"></textarea></label>
      <label class="check-field"><input type="checkbox" name="allow_late_submission"/><span>السماح بالتسليم المتأخر</span></label>
      <div class="form-actions"><button class="button button-primary" type="submit" ${!data.classes.length || !data.subjects.length ? "disabled" : ""}>حفظ كمسودة</button></div>
    </form>` : "";
  const studentForm = has("assignments.submit") && data.ownStudents.length
    ? `<section class="panel"><h3>تسليم واجب</h3><form class="form-grid compact-form" data-form="submit-assignment"><label class="field"><span>سجلك الدراسي</span><select name="student_id" required><option value="">اختر سجلّك</option>${data.ownStudents.map((item) => `<option value="${esc(item.id)}">${esc([item.first_name,item.middle_name,item.last_name].filter(Boolean).join(" "))} — ${esc(item.student_number)}</option>`).join("")}</select></label><label class="field"><span>الواجب المنشور</span><select name="assignment_id" required><option value="">اختر واجبًا</option>${data.assignments.filter((item) => item.status === "published").map((item) => `<option value="${esc(item.id)}">${esc(item.title)}</option>`).join("")}</select></label><label class="field field-wide"><span>إجابتك</span><textarea name="submission_text" rows="4" required maxlength="12000"></textarea></label><div class="form-actions"><button class="button button-primary" type="submit">إرسال الإجابة</button></div></form></section>`
    : "";
  const submissionsPanel = has("assignments.manage") && data.submissions.length
    ? `<section class="panel"><div class="panel-heading"><div><h3>تسليمات الطلاب</h3><p>الدرجات والتعليقات المسجلة على التسليمات.</p></div></div>${table(["الواجب","الحالة","تاريخ التسليم","الدرجة","تعليق المعلم"],data.submissions.map((item) => `<tr><td>${esc(data.assignments.find((a) => a.id === item.assignment_id)?.title || "—")}</td><td>${badge(item.status)}</td><td>${dateText(item.submitted_at)}</td><td>${item.score ?? "—"}</td><td>${esc(item.feedback || "—")}</td></tr>`))}</section>` : "";
  return sectionHead("الواجبات", "الواجبات المسجلة وتسليمات الطلاب.", canManage ? `<button class="button button-secondary" data-action="toggle-form" data-target="assignment-create-form">إنشاء واجب</button>` : "")
    + (canManage ? `<section id="assignment-create-form" class="panel form-panel hidden">${createForm}</section>` : "")
    + studentForm
    + table(["الواجب","الفصل","المادة","موعد التسليم","الحالة","عدد التسليمات","إجراء"], rowsHtml, "لا توجد واجبات مسجلة في هذا النطاق.")
    + submissionsPanel;
}

function renderGrades(data) {
  const assessmentMap = new Map(data.assessments.map((item) => [item.id,item]));
  const studentMap = new Map(data.students.map((item) => [item.id,[item.first_name,item.middle_name,item.last_name].filter(Boolean).join(" ")]));
  const gradeRows = data.rows.map((row) => `<tr><td>${esc(assessmentMap.get(row.assessment_id)?.title || row.assessment_id)}</td><td>${esc(studentMap.get(row.student_id) || row.student_id)}</td><td>${esc(row.score)}</td><td>${esc(row.feedback || "—")}</td><td>${row.published_at ? badge("published") : badge("draft")}</td></tr>`);
  const canManage = has("grades.manage") && state.context.tenantId;
  const createForm = canManage ? `
    <form class="form-grid compact-form" data-form="create-grade">
      <label class="field"><span>التقييم</span><select name="assessment_id" required><option value="">اختر تقييمًا</option>${data.assessments.map((row) => `<option value="${esc(row.id)}" data-school-id="${esc(row.school_id)}">${esc(row.title)} — ${esc(row.max_score)}</option>`).join("")}</select></label>
      <label class="field"><span>الطالب</span><select name="student_id" required><option value="">اختر طالبًا</option>${data.students.map((row) => `<option value="${esc(row.id)}" data-school-id="${esc(row.school_id)}">${esc([row.first_name,row.middle_name,row.last_name].filter(Boolean).join(" "))}</option>`).join("")}</select></label>
      <label class="field"><span>الدرجة</span><input type="number" name="score" min="0" step="0.01" required/></label>
      <label class="field field-wide"><span>تعليق</span><textarea name="feedback" rows="2" maxlength="2000"></textarea></label>
      <div class="form-actions"><button class="button button-primary" type="submit" ${!data.assessments.length || !data.students.length ? "disabled" : ""}>حفظ الدرجة</button></div>
    </form>` : "";
  return sectionHead("الدرجات", "درجات التقييمات المنشأة في قاعدة النظام.", canManage ? `<button class="button button-secondary" data-action="toggle-form" data-target="grade-create-form">إضافة درجة</button>` : "")
    + (canManage ? `<section id="grade-create-form" class="panel form-panel hidden">${createForm}</section>` : "")
    + table(["التقييم","الطالب","الدرجة","التعليق","النشر"], gradeRows, "لا توجد درجات منشورة أو مسجلة في هذا النطاق.");
}

function renderMessages(data) {
  const conversationButtons = data.conversations.map((item) => `
    <button class="conversation-item ${item.id === data.selected?.id ? "active" : ""}" data-action="open-conversation" data-id="${esc(item.id)}">
      <strong>${esc(item.title || "محادثة")}</strong><small>${esc(item.scope_type)} · ${dateText(item.last_message_at)}</small>
    </button>`).join("");
  const messageRows = data.messages.map((item) => `
    <article class="message-bubble ${item.sender_user_id === state.user.id ? "mine" : ""}">
      <p>${esc(item.deleted_at ? "تم حذف هذه الرسالة" : item.body)}</p><small>${dateText(item.created_at)}</small>
    </article>`).join("");
  const create = has("conversations.create") && state.context.schoolId ? `
    <form class="inline-create" data-form="create-conversation">
      <input name="title" required maxlength="160" placeholder="عنوان المحادثة"/>
      <select name="scope_type">${CONVERSATION_SCOPES.map((value) => `<option value="${value}">${value === "school" ? "المدرسة" : "الفصل"}</option>`).join("")}</select>
      <select name="class_id"><option value="">كل المدرسة</option>${(data.classes ?? []).map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select>
      <button class="button button-primary" type="submit">إنشاء</button>
    </form>` : "";
  const conversation = data.selected ? `
    <div class="chat-pane">
      <div class="chat-heading"><strong>${esc(data.selected.title || "محادثة")}</strong><small>${esc(data.selected.scope_type)}</small></div>
      <div class="message-list">${messageRows || emptyState("لا توجد رسائل في هذه المحادثة.")}</div>
      <form class="chat-compose" data-form="send-message"><input type="hidden" name="conversation_id" value="${esc(data.selected.id)}"/><textarea name="body" required rows="2" maxlength="5000" placeholder="اكتب رسالتك…"></textarea><button class="button button-primary" type="submit">إرسال</button></form>
    </div>` : emptyState("اختر محادثة لعرض الرسائل.");
  return sectionHead("الرسائل", "المحادثات التي تسمح صلاحياتك بالوصول إليها.", create)
    + `<section class="messages-layout"><div class="conversation-list">${conversationButtons || emptyState("لا توجد محادثات متاحة.")}</div>${conversation}</section>`;
}

function renderNotifications(data) {
  const rowsHtml = data.rows.map((item) => `<tr><td><strong>${esc(item.title)}</strong><small>${esc(item.body)}</small></td><td>${esc(item.notification_type)}</td><td>${dateText(item.created_at)}</td><td>${item.is_read ? badge("read") : badge("unread")}</td><td>${item.is_read ? "" : `<button class="button button-small button-secondary" data-action="mark-notification" data-id="${esc(item.id)}">تحديد كمقروء</button>`}</td></tr>`);
  const canSend = has("notifications.manage") && state.context.tenantId && state.context.schoolId;
  const form = canSend ? `
    <form class="form-grid compact-form" data-form="send-notification">
      <label class="field"><span>العنوان</span><input name="title" required maxlength="180"/></label>
      <label class="field"><span>النوع</span><select name="notification_type"><option value="announcement">إعلان</option><option value="reminder">تذكير</option><option value="alert">تنبيه</option><option value="direct">مباشر</option></select></label>
      <label class="field field-wide"><span>النص</span><textarea name="body" required rows="3" maxlength="4000"></textarea></label>
      <div class="form-actions"><button class="button button-primary" type="submit">إرسال للمدرسة</button></div>
    </form>` : "";
  return sectionHead("الإشعارات", "الإشعارات التي يحق لهذا الحساب قراءتها.", canSend ? `<button class="button button-secondary" data-action="toggle-form" data-target="notification-form">إشعار جديد</button>` : "")
    + (canSend ? `<section id="notification-form" class="panel form-panel hidden">${form}</section>` : "")
    + table(["الإشعار","النوع","التاريخ","الحالة","إجراء"], rowsHtml, "لا توجد إشعارات لهذا الحساب.");
}

function renderBilling(data) {
  const plans = new Map(data.plans.map((row) => [row.id,row]));
  const subRows = data.subscriptions.map((row) => `<tr><td>${esc(plans.get(row.subscription_plan_id)?.display_name || row.subscription_plan_id)}</td><td>${badge(row.status)}</td><td>${money(row.monthly_price,row.currency || CURRENCY)}</td><td>${row.seats}</td><td>${dateText(row.starts_on)}</td><td>${dateText(row.ends_on || row.trial_ends_on)}</td><td>${row.auto_renew ? "مفعل" : "متوقف"}</td></tr>`);
  const invoiceRows = data.invoices.map((row) => `<tr><td>${esc(row.invoice_number)}</td><td>${dateText(row.due_on)}</td><td>${money(row.amount_due)}</td><td>${money(row.amount_paid)}</td><td>${badge(row.status)}</td><td>${dateText(row.paid_on)}</td></tr>`);
  const paymentRows = data.payments.map((row) => `<tr><td>${esc(row.receipt_number)}</td><td>${esc(row.invoice_id)}</td><td>${money(row.amount)}</td><td>${esc(row.payment_method)}</td><td>${esc(row.reference || "—")}</td><td>${dateText(row.received_at)}</td></tr>`);
  const canRecord = (has("tenant.billing.manage") || has("platform.billing.manage")) && data.invoices.length;
  const paymentForm = canRecord ? `
    <form class="form-grid compact-form" data-form="record-payment">
      <label class="field"><span>الفاتورة</span><select name="invoice_id" required><option value="">اختر فاتورة</option>${data.invoices.filter((row) => row.status !== "paid" && row.status !== "void").map((row) => `<option value="${esc(row.id)}">${esc(row.invoice_number)} — ${money(Math.max(0,Number(row.amount_due)-Number(row.amount_paid)))}</option>`).join("")}</select></label>
      <label class="field"><span>رقم الإيصال</span><input name="receipt_number" required maxlength="100"/></label>
      <label class="field"><span>المبلغ</span><input name="amount" type="number" min="0.01" step="0.01" required/></label>
      <label class="field"><span>طريقة الدفع المسجلة</span><select name="payment_method"><option value="cash">نقدي</option><option value="bank_transfer">تحويل بنكي</option><option value="card">بطاقة</option><option value="cheque">شيك</option><option value="other">أخرى</option></select></label>
      <label class="field"><span>مرجع العملية</span><input name="reference" maxlength="180"/></label>
      <label class="field"><span>ملاحظات</span><input name="notes" maxlength="500"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit">تسجيل الدفعة</button></div>
    </form>` : "";
  return sectionHead("الاشتراكات والفواتير", "سجلات الاشتراك والفواتير والمدفوعات المحفوظة بالفعل.")
    + `<section class="panel"><div class="panel-heading"><div><h3>الاشتراكات</h3><p>الأسعار وحالات الاشتراك من سجلات قاعدة البيانات.</p></div></div>${table(["الخطة","الحالة","السعر الشهري","المقاعد","البداية","النهاية/التجربة","التجديد"],subRows,"لا توجد اشتراكات في هذا النطاق.")}</section>`
    + `<section class="panel"><div class="panel-heading"><div><h3>الفواتير</h3><p>فواتير اشتراك المنصة أو المؤسسة، وليست مصروفات الطلاب.</p></div></div>${table(["رقم الفاتورة","الاستحقاق","المستحق","المدفوع","الحالة","تاريخ الدفع"],invoiceRows,"لا توجد فواتير اشتراك في هذا النطاق.")}</section>`
    + (canRecord ? `<section class="panel"><div class="panel-heading"><div><h3>تسجيل دفعة مستلمة</h3><p>يسجل دفعة مالية فعلية؛ لا يتم الاتصال ببوابة دفع إلكترونية.</p></div></div>${paymentForm}</section>` : "")
    + `<section class="panel"><div class="panel-heading"><div><h3>المدفوعات المسجلة</h3></div></div>${table(["الإيصال","الفاتورة","القيمة","الطريقة","المرجع","تاريخ الاستلام"],paymentRows,"لا توجد دفعات مسجلة.")}</section>`;
}

function renderQuestions(data) {
  const rowsHtml = data.rows.map((row) => `<tr><td><strong>${esc(row.subject_name)}</strong><small>${esc(row.grade_label)} · ${esc(row.unit_title || "—")}</small></td><td>${esc(row.question_text)}</td><td>${esc(row.question_type)}</td><td>${esc(row.difficulty)}</td><td>${badge(row.review_status)}</td><td>${badge(row.record_status)}</td></tr>`);
  return sectionHead("بنك الأسئلة", "الأسئلة المتاحة لهذا السياق فقط. مفاتيح الإجابات لا تُرسل إلى المتصفح.")
    + `<div class="info-banner">هذه شاشة قراءة للأسئلة التي تسمح سياسات قاعدة البيانات بعرضها. تشغيل التوليد والتوزيع والاختبارات يعتمد على نشر خدمات الذكاء الاصطناعي والـmigrations المطابقة أولًا.</div>`
    + table(["المادة والصف","السؤال","النوع","الصعوبة","المراجعة","الحالة"],rowsHtml,"لا توجد أسئلة متاحة للقراءة في هذا النطاق.");
}

function renderProfile(data) {
  const profile = data.profile;
  if (!profile) return emptyState("لم يتم العثور على ملف الحساب في قاعدة البيانات.", "اطلب من مسؤول النظام مراجعة تهيئة الحساب.");
  return sectionHead("حسابي", "تعديل تفضيلات الحساب المرتبطة بالمستخدم المسجل دخوله.")
    + `<section class="panel profile-panel"><form class="form-grid" data-form="save-profile">
      <label class="field"><span>البريد الإلكتروني</span><input value="${esc(profile.email || state.user.email || "")}" disabled/></label>
      <label class="field"><span>الاسم الظاهر</span><input name="display_name" value="${esc(profile.display_name || "")}" maxlength="120"/></label>
      <label class="field"><span>لغة الواجهة</span><select name="preferred_locale"><option value="ar" ${profile.preferred_locale === "ar" ? "selected" : ""}>العربية</option><option value="en" ${profile.preferred_locale === "en" ? "selected" : ""}>English</option></select></label>
      <label class="field"><span>المنطقة الزمنية</span><input name="timezone" value="${esc(profile.timezone || "Africa/Cairo")}" maxlength="80" required/></label>
      <div class="form-actions"><button class="button button-primary" type="submit">حفظ التفضيلات</button></div>
    </form></section>`;
}

function render() {
  setDirection();
  if (!supabaseConfigReady) {
    root.innerHTML = `<div class="setup-screen"><div class="setup-card"><div class="brand"><div class="brand-mark">MS</div><b>My School</b></div><h1>إعداد الاتصال بقاعدة البيانات مطلوب</h1><p>أضف <code>VITE_SUPABASE_URL</code> و<code>VITE_SUPABASE_ANON_KEY</code> في إعدادات البيئة الخاصة بالواجهة. لا تضف service role key إلى المتصفح.</p></div></div>`;
    return;
  }
  if (!state.session) {
    root.innerHTML = renderAuth();
    return;
  }
  if (state.loading && !state.access) {
    root.innerHTML = loadingView();
    return;
  }
  if (!state.access && state.pageError) {
    root.innerHTML = `<div class="no-access-layout"><div class="no-access-card"><div class="brand"><div class="brand-mark">MS</div><b>My School</b></div><h1>تعذّر تحميل صلاحيات الحساب</h1><p>${esc(state.pageError)}</p><button class="button button-secondary" data-action="retry-access">إعادة المحاولة</button><button class="text-button" data-action="signout">تسجيل الخروج</button></div></div><div id="toast-host" class="toast-host"></div>`;
    return;
  }
  if (!state.access?.contexts?.length) {
    root.innerHTML = renderNoAccess();
    return;
  }
  root.innerHTML = shell();
}

async function refreshAccess() {
  state.loading = true;
  state.pageError = "";
  state.access = null;
  state.context = null;
  state.data = null;
  render();
  try {
    state.access = await loadAccessModel(supabase, state.user);
    state.locale = state.access.profile?.preferred_locale === "en" ? "en" : "ar";
    state.context = selectContext(state.access.contexts);
    if (state.context) await loadSection();
    else {
      state.loading = false;
      render();
    }
  } catch (error) {
    console.error("My School authorization context failed", error);
    state.pageError = "تعذّر تحميل عضويات وصلاحيات الحساب. تأكد من أن ملف الحساب والعضويات منشأة بشكل صحيح.";
    state.loading = false;
    render();
  }
}

function selectContext(contexts) {
  const saved = state.user ? localStorage.getItem(`my-school:last-context:${state.user.id}`) : null;
  return contexts.find((context) => context.key === saved) ?? contexts[0] ?? null;
}

async function handleSession(session) {
  state.session = session;
  state.user = session?.user ?? null;
  state.authError = "";
  state.authMessage = "";
  state.access = null;
  state.context = null;
  state.data = null;
  if (!session?.user) {
    state.loading = false;
    render();
    return;
  }
  await refreshAccess();
}

async function signIn(form) {
  state.authError = "";
  state.authMessage = "";
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const { data: result, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    state.authError = "تعذّر تسجيل الدخول. راجع البريد الإلكتروني وكلمة المرور أو حالة الحساب.";
    render();
    return;
  }
  await handleSession(result.session);
}

async function forgotPassword() {
  const email = root.querySelector('input[name="email"]')?.value?.trim();
  if (!email) {
    state.authError = "اكتب البريد الإلكتروني أولًا لإرسال رابط إعادة تعيين كلمة المرور.";
    render();
    return;
  }
  const redirectTo = `${window.location.origin}/`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    state.authError = "تعذّر إرسال رابط إعادة التعيين. تأكد من إعدادات Auth والبريد الإلكتروني.";
    state.authMessage = "";
  } else {
    state.authError = "";
    state.authMessage = "لو كان البريد مسجلًا ومسموحًا له باستقبال الرسائل، فسيصلك رابط إعادة تعيين كلمة المرور.";
  }
  render();
}

async function perform(action) {
  const ctx = state.context;
  switch (action.type) {
    case "create-student": {
      if (!has("students.manage")) throw new Error("لا تملك صلاحية إدارة الطلاب.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        student_number: required(action.formData, "student_number"),
        first_name: required(action.formData, "first_name"),
        last_name: required(action.formData, "last_name"),
      };
      const middle = optional(action.formData, "middle_name");
      const dob = optional(action.formData, "date_of_birth");
      const admission = optional(action.formData, "admission_date");
      if (middle) payload.middle_name = middle;
      if (dob) payload.date_of_birth = dob;
      if (admission) payload.admission_date = admission;
      await mutation(supabase.from("students").insert(payload), "إضافة الطالب");
      break;
    }
    case "create-teacher": {
      if (!has("teachers.manage")) throw new Error("لا تملك صلاحية إدارة المعلمين.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        first_name: required(action.formData, "first_name"),
        last_name: required(action.formData, "last_name"),
      };
      for (const field of ["employee_number","email","phone"]) {
        const value = optional(action.formData, field);
        if (value) payload[field] = value;
      }
      await mutation(supabase.from("teachers").insert(payload), "إضافة المعلم");
      break;
    }
    case "create-class": {
      if (!has("classes.manage")) throw new Error("لا تملك صلاحية إدارة الفصول.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        name: required(action.formData, "name"),
        grade_level_id: required(action.formData, "grade_level_id"),
        academic_year_id: required(action.formData, "academic_year_id"),
      };
      const capacity = optional(action.formData, "capacity");
      if (capacity) payload.capacity = Number(capacity);
      await mutation(supabase.from("classes").insert(payload), "إنشاء الفصل");
      break;
    }
    case "create-assignment": {
      if (!has("assignments.manage")) throw new Error("لا تملك صلاحية إدارة الواجبات.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const classId = required(action.formData, "class_id");
      const subjectId = required(action.formData, "subject_id");
      const classRow = state.data.classes.find((row) => row.id === classId && row.school_id === schoolId);
      const subjectRow = state.data.subjects.find((row) => row.id === subjectId && row.school_id === schoolId);
      if (!classRow || !subjectRow) throw new Error("الفصل والمادة يجب أن يكونا تابعين للمدرسة المختارة.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        class_id: classRow.id,
        subject_id: subjectRow.id,
        title: required(action.formData, "title"),
        created_by: state.user.id,
        status: "draft",
        allow_late_submission: action.formData.get("allow_late_submission") === "on",
      };
      const dueAt = optional(action.formData, "due_at");
      const instructions = optional(action.formData, "instructions");
      const maxScore = optional(action.formData, "max_score");
      if (dueAt) payload.due_at = new Date(dueAt).toISOString();
      if (instructions) payload.instructions = instructions;
      if (maxScore) payload.max_score = Number(maxScore);
      await mutation(supabase.from("assignments").insert(payload), "حفظ الواجب");
      break;
    }
    case "publish-assignment": {
      if (!has("assignments.manage")) throw new Error("لا تملك صلاحية نشر الواجبات.");
      const { error } = await supabase.from("assignments")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", action.id);
      if (error) throw error;
      break;
    }
    case "submit-assignment": {
      if (!has("assignments.submit") || !state.data?.ownStudents?.length) throw new Error("لا يوجد سجل طالب مرتبط بهذا الحساب أو لا تملك صلاحية التسليم.");
      const assignmentId = required(action.formData, "assignment_id");
      const studentId = required(action.formData, "student_id");
      if (!state.data.ownStudents.some((item) => item.id === studentId)) throw new Error("سجل الطالب المختار غير مرتبط بحسابك.");
      const assignment = state.data.assignments.find((item) => item.id === assignmentId && item.status === "published");
      if (!assignment) throw new Error("الواجب غير متاح للتسليم.");
      const payload = {
        tenant_id: assignment.tenant_id, school_id: assignment.school_id,
        assignment_id: assignment.id, student_id: studentId,
        submission_text: required(action.formData, "submission_text"),
        status: "submitted", submitted_at: new Date().toISOString(),
      };
      await mutation(supabase.from("assignment_submissions").insert(payload), "إرسال الواجب");
      break;
    }
    case "create-attendance": {
      if (!has("attendance.manage")) throw new Error("لا تملك صلاحية تسجيل الحضور.");
      const schoolId = selectedSchoolId(action.formData);
      const classId = required(action.formData, "class_id");
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const classRow = state.data.classes.find((row) => row.id === classId && row.school_id === schoolId);
      if (!classRow) throw new Error("الفصل لا ينتمي إلى المدرسة المختارة.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId, class_id: classRow.id,
        session_date: required(action.formData, "session_date"), recorded_by: state.user.id,
      };
      const period = optional(action.formData, "period_number");
      const notes = optional(action.formData, "notes");
      if (period) payload.period_number = Number(period);
      if (notes) payload.notes = notes;
      const { data, error } = await supabase.from("attendance_sessions").insert(payload).select("id").single();
      if (error) throw error;
      state.selectedAttendanceSessionId = data.id;
      break;
    }
    case "save-attendance": {
      if (!has("attendance.manage")) throw new Error("لا تملك صلاحية تعديل الحضور.");
      const sessionId = required(action.formData, "session_id");
      const session = state.data.sessions.find((item) => item.id === sessionId);
      if (!session) throw new Error("جلسة الحضور غير موجودة في النطاق الحالي.");
      const existing = new Map(state.data.existingRecords.map((row) => [row.student_id,row]));
      const inserts = [];
      const updates = [];
      for (const student of state.data.roster) {
        const value = required(action.formData, `status_${student.id}`);
        if (!ATTENDANCE_VALUES.includes(value)) throw new Error("حالة حضور غير صحيحة.");
        const note = optional(action.formData, `note_${student.id}`);
        const previous = existing.get(student.id);
        if (previous) updates.push(supabase.from("attendance_records").update({ status: value, note: note || null }).eq("id", previous.id));
        else inserts.push({ tenant_id: session.tenant_id, school_id: session.school_id, session_id: session.id, student_id: student.id, status: value, note: note || null, recorded_by: state.user.id });
      }
      const updateResults = await Promise.all(updates);
      const failedUpdate = updateResults.find((result) => result.error);
      if (failedUpdate?.error) throw failedUpdate.error;
      if (inserts.length) {
        const { error } = await supabase.from("attendance_records").insert(inserts);
        if (error) throw error;
      }
      break;
    }
    case "create-grade": {
      if (!has("grades.manage")) throw new Error("لا تملك صلاحية إدخال الدرجات.");
      const assessment = state.data.assessments.find((item) => item.id === required(action.formData,"assessment_id"));
      if (!assessment) throw new Error("التقييم غير موجود ضمن نطاقك.");
      const studentId = required(action.formData,"student_id");
      const student = state.data.students.find((item) => item.id === studentId);
      if (!student || student.school_id !== assessment.school_id || student.tenant_id !== assessment.tenant_id) {
        throw new Error("الطالب والتقييم يجب أن يكونا ضمن المدرسة نفسها.");
      }
      const enrollment = await rows(supabase.from("student_enrollments").select("id")
        .eq("tenant_id", assessment.tenant_id)
        .eq("school_id", assessment.school_id)
        .eq("class_id", assessment.class_id)
        .eq("student_id", studentId)
        .eq("status", "active").limit(1));
      if (!enrollment.length) throw new Error("الطالب غير مقيد حاليًا في فصل التقييم.");
      const score = Number(required(action.formData,"score"));
      if (!Number.isFinite(score) || score < 0 || score > Number(assessment.max_score)) throw new Error("الدرجة يجب أن تكون بين صفر والدرجة القصوى للتقييم.");
      const payload = {
        tenant_id: assessment.tenant_id, school_id: assessment.school_id,
        assessment_id: assessment.id, student_id: studentId,
        score, entered_by: state.user.id,
      };
      const feedback = optional(action.formData,"feedback");
      if (feedback) payload.feedback = feedback;
      await mutation(supabase.from("grades").insert(payload), "حفظ الدرجة");
      break;
    }
    case "send-message": {
      if (!has("conversations.create")) throw new Error("لا تملك صلاحية إرسال الرسائل.");
      const conversationId = required(action.formData,"conversation_id");
      const conversation = state.data.conversations.find((item) => item.id === conversationId);
      if (!conversation) throw new Error("المحادثة غير متاحة.");
      await mutation(supabase.from("messages").insert({
        conversation_id: conversation.id,
        tenant_id: conversation.tenant_id,
        school_id: conversation.school_id,
        sender_user_id: state.user.id,
        body: required(action.formData,"body"),
        message_type: "text",
      }), "إرسال الرسالة");
      break;
    }
    case "create-conversation": {
      if (!has("conversations.create") || !ctx.tenantId || !ctx.schoolId) throw new Error("لا تملك صلاحية إنشاء محادثة مدرسية.");
      const scope = required(action.formData,"scope_type");
      if (!CONVERSATION_SCOPES.includes(scope)) throw new Error("نوع المحادثة غير مدعوم.");
      const classId = optional(action.formData,"class_id");
      if (scope === "class" && !classId) throw new Error("اختر الفصل للمحادثة.");
      if (scope === "class" && !state.data.classes.some((row) => row.id === classId && row.school_id === ctx.schoolId)) {
        throw new Error("الفصل المختار لا ينتمي إلى المدرسة الحالية.");
      }
      const payload = {
        tenant_id: ctx.tenantId, school_id: ctx.schoolId,
        scope_type: scope, title: required(action.formData,"title"), created_by: state.user.id,
      };
      if (scope === "class") payload.class_id = classId;
      const { data, error } = await supabase.from("conversations").insert(payload).select("id").single();
      if (error) throw error;
      state.selectedConversationId = data.id;
      break;
    }
    case "mark-notification": {
      const { error } = await supabase.from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", action.id).eq("recipient_user_id", state.user.id);
      if (error) throw error;
      break;
    }
    case "send-notification": {
      if (!has("notifications.manage") || !ctx.tenantId || !ctx.schoolId) throw new Error("لا تملك صلاحية إرسال إشعارات للمدرسة.");
      await mutation(supabase.from("notifications").insert({
        tenant_id: ctx.tenantId, school_id: ctx.schoolId,
        sender_user_id: state.user.id,
        title: required(action.formData,"title"),
        body: required(action.formData,"body"),
        notification_type: required(action.formData,"notification_type"),
      }), "إرسال الإشعار");
      break;
    }
    case "record-payment": {
      if (!(has("tenant.billing.manage") || has("platform.billing.manage"))) throw new Error("لا تملك صلاحية تسجيل دفعة.");
      const invoiceId = required(action.formData,"invoice_id");
      const invoice = state.data.invoices.find((item) => item.id === invoiceId);
      if (!invoice) throw new Error("الفاتورة غير متاحة.");
      const amount = Number(required(action.formData,"amount"));
      const outstanding = Number(invoice.amount_due) - Number(invoice.amount_paid);
      if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) throw new Error("قيمة الدفعة تتجاوز الرصيد المتبقي أو غير صحيحة.");
      const payload = {
        tenant_id: invoice.tenant_id, invoice_id: invoice.id,
        receipt_number: required(action.formData,"receipt_number"),
        amount,
        payment_method: required(action.formData,"payment_method"),
        created_by: state.user.id,
      };
      const reference = optional(action.formData,"reference");
      const notes = optional(action.formData,"notes");
      if (reference) payload.reference = reference;
      if (notes) payload.notes = notes;
      await mutation(supabase.from("subscription_payments").insert(payload), "تسجيل الدفعة");
      break;
    }
    case "create-fee-plan": {
      if (!has("fees.manage")) throw new Error("لا تملك صلاحية إدارة خطط الرسوم.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const year = state.data.years.find((row) => row.id === required(action.formData,"academic_year_id"));
      if (!year || year.tenant_id !== ctx.tenantId || year.school_id !== schoolId) throw new Error("السنة الدراسية لا تنتمي إلى المدرسة المختارة.");
      const total = Number(required(action.formData,"total_amount"));
      if (!Number.isFinite(total) || total < 0) throw new Error("إجمالي الخطة يجب أن يكون صفرًا أو أكثر.");
      const currency = required(action.formData,"currency").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error("أدخل رمز عملة مكوّنًا من ثلاثة أحرف.");
      await mutation(supabase.from("fee_plans").insert({
        tenant_id: ctx.tenantId, school_id: schoolId, academic_year_id: year.id,
        name: required(action.formData,"name"), total_amount: total, currency,
        is_active: action.formData.get("is_active") === "on",
      }), "إنشاء خطة الرسوم");
      break;
    }
    case "create-fee-account": {
      if (!has("fees.manage")) throw new Error("لا تملك صلاحية إنشاء حساب رسوم.");
      const studentId = required(action.formData,"student_id");
      const planId = required(action.formData,"fee_plan_id");
      const student = state.data.students.find((row) => row.id === studentId);
      const plan = state.data.plans.find((row) => row.id === planId);
      if (!student || !plan || student.tenant_id !== plan.tenant_id || student.school_id !== plan.school_id) {
        throw new Error("الطالب وخطة الرسوم يجب أن يكونا في المدرسة نفسها.");
      }
      const discount = Number(optional(action.formData,"discount_amount") || "0");
      if (!Number.isFinite(discount) || discount < 0 || discount > Number(plan.total_amount)) {
        throw new Error("قيمة الخصم خارج النطاق المسموح.");
      }
      await mutation(supabase.from("student_fee_accounts").insert({
        tenant_id: student.tenant_id, school_id: student.school_id,
        student_id: student.id, fee_plan_id: plan.id, discount_amount: discount,
      }), "ربط خطة الرسوم بالطالب");
      break;
    }
    case "create-fee-installment": {
      if (!has("fees.manage")) throw new Error("لا تملك صلاحية إدارة الأقساط.");
      const account = state.data.accounts.find((row) => row.id === required(action.formData,"fee_account_id"));
      if (!account) throw new Error("حساب الرسوم غير متاح.");
      const sequence = Number(required(action.formData,"sequence_number"));
      const amount = Number(required(action.formData,"amount"));
      if (!Number.isInteger(sequence) || sequence < 1 || !Number.isFinite(amount) || amount < 0) {
        throw new Error("رقم القسط أو قيمته غير صحيحة.");
      }
      await mutation(supabase.from("fee_installments").insert({
        tenant_id: account.tenant_id, school_id: account.school_id, fee_account_id: account.id,
        sequence_number: sequence, due_on: required(action.formData,"due_on"), amount,
      }), "إضافة القسط");
      break;
    }
    case "record-fee-payment": {
      if (!has("fees.payments.record")) throw new Error("لا تملك صلاحية تسجيل دفعات الرسوم.");
      const account = state.data.accounts.find((row) => row.id === required(action.formData,"fee_account_id"));
      if (!account) throw new Error("حساب الرسوم غير متاح.");
      const plan = state.data.plans.find((row) => row.id === account.fee_plan_id);
      const installments = state.data.installments.filter((row) => row.fee_account_id === account.id);
      const payments = state.data.payments.filter((row) => row.fee_account_id === account.id);
      const scheduled = installments.length
        ? installments.reduce((sum,row) => sum + Number(row.amount),0)
        : Number(plan?.total_amount ?? 0);
      const outstanding = Math.max(0,scheduled - Number(account.discount_amount ?? 0) - payments.reduce((sum,row) => sum + Number(row.amount),0));
      const amount = Number(required(action.formData,"amount"));
      if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) throw new Error("المبلغ يتجاوز المتبقي أو غير صحيح.");
      const payload = {
        tenant_id: account.tenant_id, school_id: account.school_id, fee_account_id: account.id,
        receipt_number: required(action.formData,"receipt_number"), amount,
        currency: plan?.currency || "EGP",
        payment_method: required(action.formData,"payment_method"),
        received_by: state.user.id, received_at: new Date().toISOString(),
      };
      const reference = optional(action.formData,"reference");
      const notes = optional(action.formData,"notes");
      if (reference) payload.reference = reference;
      if (notes) payload.notes = notes;
      await mutation(supabase.from("fee_payments").insert(payload), "تسجيل دفعة الرسوم");
      break;
    }
    case "create-timetable-entry": {
      if (!has("timetable.manage")) throw new Error("لا تملك صلاحية إدارة الجدول.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const findSchoolRow = (rowsList,key) => rowsList.find((row) => row.id === key && row.school_id === schoolId);
      const academicYear = findSchoolRow(state.data.years, required(action.formData,"academic_year_id"));
      const classRow = findSchoolRow(state.data.classes, required(action.formData,"class_id"));
      const subject = findSchoolRow(state.data.subjects, required(action.formData,"subject_id"));
      const teacher = findSchoolRow(state.data.teachers, required(action.formData,"teacher_id"));
      if (!academicYear || !classRow || !subject || !teacher) throw new Error("السنة والفصل والمادة والمعلم يجب أن يكونوا ضمن المدرسة المختارة.");
      const day = Number(required(action.formData,"day_of_week"));
      const period = Number(required(action.formData,"period_number"));
      const start = required(action.formData,"starts_at");
      const end = required(action.formData,"ends_at");
      if (!Number.isInteger(day) || day < 1 || day > 7 || !Number.isInteger(period) || period < 1 || period > 20 || end <= start) {
        throw new Error("راجع اليوم ورقم الحصة ووقت البداية والنهاية.");
      }
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        academic_year_id: academicYear.id, class_id: classRow.id,
        subject_id: subject.id, teacher_id: teacher.id,
        day_of_week: day, period_number: period, starts_at: start, ends_at: end,
        status: "draft", created_by: state.user.id,
      };
      const room = optional(action.formData,"room_name");
      if (room) payload.room_name = room;
      await mutation(supabase.from("timetable_entries").insert(payload), "حفظ الحصة");
      break;
    }
    case "publish-timetable": {
      if (!has("timetable.manage")) throw new Error("لا تملك صلاحية نشر الجدول.");
      const { error } = await supabase.from("timetable_entries").update({ status: "published" }).eq("id",action.id);
      if (error) throw error;
      break;
    }
    case "create-exam": {
      if (!has("exams.manage")) throw new Error("لا تملك صلاحية إدارة الامتحانات.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const classRow = state.data.classes.find((row) => row.id === required(action.formData,"class_id") && row.school_id === schoolId);
      const subject = state.data.subjects.find((row) => row.id === required(action.formData,"subject_id") && row.school_id === schoolId);
      if (!classRow || !subject) throw new Error("الفصل والمادة يجب أن يكونا في المدرسة نفسها.");
      const type = required(action.formData,"exam_type");
      if (!["quiz","midterm","final","practical","oral","other"].includes(type)) throw new Error("نوع الامتحان غير صالح.");
      const duration = Number(required(action.formData,"duration_minutes"));
      const maxScore = Number(required(action.formData,"max_score"));
      if (!Number.isInteger(duration) || duration < 5 || duration > 600 || !Number.isFinite(maxScore) || maxScore <= 0) {
        throw new Error("راجع مدة الامتحان والدرجة القصوى.");
      }
      const scheduled = new Date(required(action.formData,"scheduled_at"));
      if (Number.isNaN(scheduled.valueOf())) throw new Error("موعد الامتحان غير صحيح.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId, class_id: classRow.id, subject_id: subject.id,
        title: required(action.formData,"title"), exam_type: type,
        scheduled_at: scheduled.toISOString(), duration_minutes: duration, max_score: maxScore,
        status: "draft", created_by: state.user.id,
      };
      const room = optional(action.formData,"room_name");
      if (room) payload.room_name = room;
      await mutation(supabase.from("exam_sessions").insert(payload), "إنشاء الامتحان");
      break;
    }
    case "schedule-exam": {
      if (!has("exams.manage")) throw new Error("لا تملك صلاحية جدولة الامتحانات.");
      const { error } = await supabase.from("exam_sessions")
        .update({ status: "scheduled", published_at: new Date().toISOString() }).eq("id",action.id);
      if (error) throw error;
      break;
    }
    case "add-exam-candidate": {
      if (!has("exams.manage")) throw new Error("لا تملك صلاحية إدارة المرشحين.");
      const exam = state.data.sessions.find((row) => row.id === required(action.formData,"exam_session_id"));
      const student = state.data.students.find((row) => row.id === required(action.formData,"student_id"));
      if (!exam || !student || exam.tenant_id !== student.tenant_id || exam.school_id !== student.school_id) {
        throw new Error("الطالب وجلسة الامتحان يجب أن يكونا في المدرسة نفسها.");
      }
      const enrollment = await rows(supabase.from("student_enrollments").select("id")
        .eq("tenant_id",exam.tenant_id).eq("school_id",exam.school_id)
        .eq("class_id",exam.class_id).eq("student_id",student.id).eq("status","active").limit(1));
      if (!enrollment.length) throw new Error("الطالب غير مقيد حاليًا في فصل الامتحان.");
      const payload = {
        tenant_id: exam.tenant_id, school_id: exam.school_id,
        exam_session_id: exam.id, student_id: student.id,
        seat_number: required(action.formData,"seat_number"),
      };
      const committee = optional(action.formData,"committee_name");
      if (committee) payload.committee_name = committee;
      await mutation(supabase.from("exam_candidates").insert(payload), "إضافة مرشح للامتحان");
      break;
    }
    case "create-content": {
      if (!has("content.manage")) throw new Error("لا تملك صلاحية إدارة المحتوى.");
      const schoolId = selectedSchoolId(action.formData);
      if (!ctx.tenantId || !schoolId) throw new Error("اختر مدرسة ضمن عضويتك.");
      const classId = optional(action.formData,"class_id");
      const subjectId = optional(action.formData,"subject_id");
      const classRow = classId ? state.data.classes.find((row) => row.id === classId && row.school_id === schoolId) : null;
      const subject = subjectId ? state.data.subjects.find((row) => row.id === subjectId && row.school_id === schoolId) : null;
      if (classId && !classRow) throw new Error("الفصل لا ينتمي إلى المدرسة المختارة.");
      if (subjectId && !subject) throw new Error("المادة لا تنتمي إلى المدرسة المختارة.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        title: required(action.formData,"title"),
        resource_type: required(action.formData,"resource_type"),
        body: required(action.formData,"body"),
        status: "draft", created_by: state.user.id, updated_by: state.user.id,
      };
      const summary = optional(action.formData,"summary");
      if (summary) payload.summary = summary;
      if (classRow) payload.class_id = classRow.id;
      if (subject) payload.subject_id = subject.id;
      await mutation(supabase.from("content_items").insert(payload), "حفظ المحتوى");
      break;
    }
    case "publish-content": {
      if (!has("content.manage")) throw new Error("لا تملك صلاحية نشر المحتوى.");
      const { error } = await supabase.from("content_items").update({
        status: "published", published_at: new Date().toISOString(), updated_by: state.user.id,
      }).eq("id",action.id);
      if (error) throw error;
      break;
    }
    case "create-support-ticket": {
      if (!(has("support.create") || has("support.manage"))) throw new Error("لا تملك صلاحية إنشاء طلب دعم.");
      if (!ctx.tenantId) throw new Error("اختر سياق مؤسسة لفتح طلب الدعم.");
      const schoolId = selectedSchoolId(action.formData);
      if (!schoolId) throw new Error("اختر المدرسة المرتبطة بطلب الدعم.");
      const payload = {
        tenant_id: ctx.tenantId, school_id: schoolId,
        created_by: state.user.id, created_for_user_id: state.user.id,
        title: required(action.formData,"title"),
        category: required(action.formData,"category"),
        description: required(action.formData,"description"),
        priority: required(action.formData,"priority"),
        status: "open", source: "web",
      };
      await mutation(supabase.from("support_tickets").insert(payload), "إرسال طلب الدعم");
      break;
    }
    case "resolve-ticket": {
      if (!has("support.manage")) throw new Error("لا تملك صلاحية إدارة طلبات الدعم.");
      const ticket = state.data.rows.find((row) => row.id === action.id);
      if (!ticket) throw new Error("طلب الدعم غير متاح.");
      const { error } = await supabase.from("support_tickets").update({
        status: "resolved", resolved_at: new Date().toISOString(), resolved_by: state.user.id,
      }).eq("id",ticket.id);
      if (error) throw error;
      break;
    }
    case "save-profile": {
      const payload = {
        display_name: optional(action.formData,"display_name") || null,
        preferred_locale: required(action.formData,"preferred_locale"),
        timezone: required(action.formData,"timezone"),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("profiles").update(payload).eq("id", state.user.id);
      if (error) throw error;
      state.locale = payload.preferred_locale === "en" ? "en" : "ar";
      break;
    }
    default: throw new Error("إجراء غير معروف.");
  }
}

function required(formData, name) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) throw new Error("أكمل الحقول المطلوبة قبل الحفظ.");
  return value;
}
function optional(formData, name) {
  const value = String(formData.get(name) ?? "").trim();
  return value || "";
}
async function mutation(query, label) {
  const { error } = await query;
  if (error) throw error;
  return label;
}

async function refreshPage() {
  state.search = "";
  await loadSection();
}

root.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const type = button.dataset.action;
  try {
    if (type === "navigate") {
      const section = button.dataset.section;
      if (!currentSections().includes(section)) return;
      state.section = section;
      state.data = null;
      await loadSection();
    } else if (type === "signout") {
      await supabase.auth.signOut();
    } else if (type === "refresh") {
      await refreshPage();
    } else if (type === "forgot-password") {
      await forgotPassword();
    } else if (type === "toggle-form") {
      const target = document.getElementById(button.dataset.target);
      target?.classList.toggle("hidden");
    } else if (type === "open-conversation") {
      state.selectedConversationId = button.dataset.id;
      await loadSection();
    } else if (type === "open-attendance") {
      state.selectedAttendanceSessionId = button.dataset.id;
      await loadSection();
    } else if (type === "close-attendance") {
      state.selectedAttendanceSessionId = "";
      await loadSection();
    } else if (type === "mark-notification" || type === "publish-assignment") {
      await perform({ type, id: button.dataset.id });
      showToast(type === "mark-notification" ? "تم تحديث حالة الإشعار." : "تم نشر الواجب.");
      await loadSection();
    } else if (type === "toggle-sidebar") {
      document.querySelector("#sidebar")?.classList.toggle("sidebar-open");
    } else if (type === "retry-access") {
      await refreshAccess();
    }
  } catch (error) {
    console.error("My School action failed", error);
    showToast(error.message || "تعذّر تنفيذ الإجراء.", "error");
  }
});

root.addEventListener("change", async (event) => {
  if (event.target.id === "context-select") {
    const context = state.access.contexts.find((item) => item.key === event.target.value);
    if (context) {
      await applyContext(context);
      showToast("تم تغيير مساحة العمل وفق العضوية المختارة.");
    }
    return;
  }

  const form = event.target.closest("form");
  if (event.target.name === "school_id" && form) {
    const schoolId = event.target.value;
    for (const dependentName of ["class_id", "subject_id"]) {
      const dependent = form.querySelector(`select[name="${dependentName}"]`);
      if (!dependent) continue;
      const previous = dependent.value;
      for (const option of dependent.options) {
        if (!option.value) continue;
        const belongs = option.dataset.schoolId === schoolId;
        option.hidden = Boolean(schoolId && !belongs);
        option.disabled = Boolean(schoolId && !belongs);
      }
      if (previous && dependent.selectedOptions[0]?.disabled) dependent.value = "";
    }
  }

  if (event.target.name === "assessment_id" && form) {
    const selected = event.target.selectedOptions[0];
    const schoolId = selected?.dataset.schoolId || "";
    const studentSelect = form.querySelector('select[name="student_id"]');
    if (studentSelect && schoolId) {
      for (const option of studentSelect.options) {
        if (!option.value) continue;
        const belongs = option.dataset.schoolId === schoolId;
        option.hidden = !belongs;
        option.disabled = !belongs;
      }
      if (studentSelect.selectedOptions[0]?.disabled) studentSelect.value = "";
    }
  }
});

root.addEventListener("submit", async (event) => {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  if (form.id === "login-form") {
    try {
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      await signIn(form);
    } catch {
      state.authError = "تعذّر تسجيل الدخول. راجع بيانات الحساب.";
      render();
    }
    return;
  }
  const type = form.dataset.form;
  if (!type) return;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    await perform({ type, formData: new FormData(form) });
    showToast("تم حفظ التغيير في قاعدة البيانات.");
    await loadSection();
  } catch (error) {
    console.error("My School form action failed", error);
    showToast(error.message || "تعذّر حفظ التغيير. راجع صلاحيات الحساب.", "error");
    if (submit) submit.disabled = false;
  }
});

function renderAndLoad() {
  state.loading = false;
  render();
}

if (supabaseConfigReady) {
  supabase.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => handleSession(session).catch((error) => {
      console.error(error);
      state.pageError = "تعذّر فتح مساحة العمل.";
      renderAndLoad();
    }));
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      state.authError = "تعذّر التحقق من جلسة الدخول.";
      render();
      return;
    }
    return handleSession(data.session);
  }).catch((error) => {
    console.error(error);
    render();
  });
} else {
  render();
}
