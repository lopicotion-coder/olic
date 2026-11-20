const STORAGE_KEY = 'myschool-ui-demo-v1';

const ROLE_LABELS = {
  platform_admin: { ar: 'مدير المنصة', en: 'Platform Admin' },
  school_admin: { ar: 'مدير المدرسة', en: 'School Admin' },
  teacher: { ar: 'المعلم', en: 'Teacher' },
  parent: { ar: 'ولي الأمر', en: 'Parent' },
  student: { ar: 'الطالب', en: 'Student' },
};

const SECTION_MAP = {
  platform_admin: ['overview', 'platform', 'school', 'teacher', 'parent', 'student', 'learners', 'questions', 'curriculum', 'billing', 'operations'],
  school_admin: ['overview', 'school', 'learners', 'questions', 'curriculum', 'billing', 'operations'],
  teacher: ['overview', 'teacher', 'questions', 'curriculum'],
  parent: ['overview', 'parent', 'learners', 'billing'],
  student: ['overview', 'student', 'questions', 'curriculum'],
};

const TEXT = {
  ar: {
    title: 'My School',
    subtitle: 'لوحة تشغيل تعليمية متعددة الأدوار',
    demoBanner: 'بيانات تجريبية فقط — لا اتصال ببيانات حقيقية أو بوابة دفع',
    notConnected: 'غير متصل',
    simulated: 'SIMULATED / غير حقيقي',
    overview: 'نظرة عامة',
    platform: 'المنصة',
    school: 'المدرسة',
    teacher: 'المعلم',
    parent: 'ولي الأمر',
    student: 'الطالب',
    learners: 'الطلاب',
    questions: 'بنك الأسئلة',
    curriculum: 'المناهج',
    billing: 'الاشتراكات والدفع',
    operations: 'التشغيل والامتثال',
    role: 'الدور',
    language: 'اللغة',
    roleSwitch: 'تبديل الدور (تجريبي)',
    langAr: 'العربية',
    langEn: 'English',
    search: 'بحث',
    choosePlan: 'اختيار الخطة',
    processPayment: 'تنفيذ الدفع التجريبي',
    paymentMethod: 'طريقة الدفع',
    checkout: 'الدفع التجريبي',
    activityLog: 'سجل النشاط',
    paymentHistory: 'سجل المدفوعات',
    invoiceHistory: 'الفواتير',
    subscriptionActions: 'إجراءات الاشتراك',
    pause: 'إيقاف مؤقت',
    renew: 'تجديد',
    cancel: 'إلغاء',
    trial: 'تجربة',
    upgrade: 'ترقية',
    requestMembership: 'طلب انضمام',
    createChild: 'إنشاء طفل تجريبي',
    assignPractice: 'توليد حصة تدريب',
    markReady: 'اعتبار جاهز',
    chooseLearner: 'اختيار طالب',
    chooseTenant: 'اختيار مدرسة',
    chooseSubscription: 'اختيار اشتراك',
    currentStatus: 'الحالة الحالية',
    productionStatus: 'حالة الإنتاج',
    providerStatus: 'حالة مزود الدفع',
    providerNotConnected: 'Not connected',
    oneBanner: 'يوجد فقط state محلي مؤقت، ولا يتم إرسال أي بيانات للخارج.',
    backOffice: 'الواجهة الخلفية',
    studentView: 'عرض الطالب',
    schoolView: 'عرض المدرسة',
    parentView: 'عرض ولي الأمر',
    teacherView: 'عرض المعلم',
    platformView: 'عرض المنصة',
  },
  en: {
    title: 'My School',
    subtitle: 'Multi-role education operations dashboard',
    demoBanner: 'Demo data only — no live data or payment provider connected',
    notConnected: 'Not connected',
    simulated: 'SIMULATED / غير حقيقي',
    overview: 'Overview',
    platform: 'Platform',
    school: 'School',
    teacher: 'Teacher',
    parent: 'Parent',
    student: 'Student',
    learners: 'Learners',
    questions: 'Question Bank',
    curriculum: 'Curriculum',
    billing: 'Subscriptions & Billing',
    operations: 'Operations & Compliance',
    role: 'Role',
    language: 'Language',
    roleSwitch: 'Demo role switch',
    langAr: 'العربية',
    langEn: 'English',
    search: 'Search',
    choosePlan: 'Choose plan',
    processPayment: 'Run simulated payment',
    paymentMethod: 'Payment method',
    checkout: 'Simulated checkout',
    activityLog: 'Activity log',
    paymentHistory: 'Payment history',
    invoiceHistory: 'Invoices',
    subscriptionActions: 'Subscription actions',
    pause: 'Pause',
    renew: 'Renew',
    cancel: 'Cancel',
    trial: 'Trial',
    upgrade: 'Upgrade',
    requestMembership: 'Request membership',
    createChild: 'Create demo child',
    assignPractice: 'Generate practice set',
    markReady: 'Mark ready',
    chooseLearner: 'Select learner',
    chooseTenant: 'Select school',
    chooseSubscription: 'Select subscription',
    currentStatus: 'Current status',
    productionStatus: 'Production status',
    providerStatus: 'Payment provider status',
    providerNotConnected: 'Not connected',
    oneBanner: 'State is local and transient only; nothing is sent outside the browser.',
    backOffice: 'Back office',
    studentView: 'Student view',
    schoolView: 'School view',
    parentView: 'Parent view',
    teacherView: 'Teacher view',
    platformView: 'Platform view',
  },
};

const CYCLE_MULTIPLIER = { monthly: 1, quarterly: 3, annual: 12 };
const CYCLE_DISCOUNT = { monthly: 0, quarterly: 0.08, annual: 0.15 };

export const DEMO = {
  plans: [
    { id: 'starter', scope: 'family', nameAr: 'Starter', nameEn: 'Starter', baseMonthly: 1200, popular: false, descriptionAr: 'للاستخدام الفردي مع حدود واضحة', descriptionEn: 'Individual learner access with clear limits', featuresAr: ['AI Tutor', 'Practice sets', 'Progress tracking'], featuresEn: ['AI tutor', 'Practice sets', 'Progress tracking'] },
    { id: 'school', scope: 'school', nameAr: 'School', nameEn: 'School', baseMonthly: 8000, popular: true, descriptionAr: 'للمدرسة مع لوحات الإدارة', descriptionEn: 'School operations and dashboards', featuresAr: ['Teacher tools', 'Parent portal', 'Billing'], featuresEn: ['Teacher tools', 'Parent portal', 'Billing'] },
    { id: 'platform', scope: 'platform', nameAr: 'Platform', nameEn: 'Platform', baseMonthly: 18000, popular: false, descriptionAr: 'لمدير المنصة والتشغيل', descriptionEn: 'For platform admins and operations', featuresAr: ['Multi-tenant', 'Audit log', 'Global controls'], featuresEn: ['Multi-tenant', 'Audit log', 'Global controls'] },
  ],
  tenants: [
    { id: 'tenant-cairo', nameAr: 'مدرسة القاهرة التجريبية', nameEn: 'Cairo STEM School', status: 'active', planId: 'school', students: 1280, teachers: 63, attendance: 93, mrr: 25000, risk: 'low' },
    { id: 'tenant-giza', nameAr: 'أكاديمية الجيزة', nameEn: 'Giza Academy', status: 'trial', planId: 'school', students: 480, teachers: 26, attendance: 90, mrr: 9800, risk: 'medium' },
    { id: 'tenant-delta', nameAr: 'مدرسة الدلتا', nameEn: 'Delta Grammar', status: 'past_due', planId: 'school', students: 690, teachers: 41, attendance: 87, mrr: 0, risk: 'high' },
  ],
  subscriptions: [
    { id: 'sub-platform-pro', scope: 'platform', customer: 'My School Platform', customerAr: 'منصة My School', tenantId: null, schoolId: null, planId: 'platform', status: 'active', cycle: 'annual', amount: 183600, provider: 'Not connected', externalRef: '—', nextRenewal: '2027-09-30', createdAt: '2026-10-01' },
    { id: 'sub-cairo-school', scope: 'school', customer: 'Cairo STEM School', customerAr: 'مدرسة القاهرة التجريبية', tenantId: 'tenant-cairo', schoolId: 'school-cairo', planId: 'school', status: 'active', cycle: 'monthly', amount: 8000, provider: 'Not connected', externalRef: '—', nextRenewal: '2026-12-01', createdAt: '2026-10-01' },
    { id: 'sub-giza-school', scope: 'school', customer: 'Giza Academy', customerAr: 'أكاديمية الجيزة', tenantId: 'tenant-giza', schoolId: 'school-giza', planId: 'school', status: 'trialing', cycle: 'monthly', amount: 0, provider: 'Not connected', externalRef: '—', nextRenewal: '2026-12-05', createdAt: '2026-11-05' },
    { id: 'sub-delta-school', scope: 'school', customer: 'Delta Grammar', customerAr: 'مدرسة الدلتا', tenantId: 'tenant-delta', schoolId: 'school-delta', planId: 'school', status: 'past_due', cycle: 'monthly', amount: 8000, provider: 'Not connected', externalRef: '—', nextRenewal: '2026-11-12', createdAt: '2026-09-12' },
  ],
  platformInvoices: [
    { id: 'pf-001', customer: 'My School Platform', type: 'Platform subscription', amount: 183600, status: 'paid', issuedAt: '2026-10-01', paidAt: '2026-10-01', simulated: true },
    { id: 'pf-002', customer: 'Cairo STEM School', type: 'Platform subscription', amount: 8000, status: 'paid', issuedAt: '2026-11-01', paidAt: '2026-11-01', simulated: true },
    { id: 'pf-003', customer: 'Delta Grammar', type: 'Platform subscription', amount: 8000, status: 'past_due', issuedAt: '2026-11-01', paidAt: null, simulated: true },
  ],
  schoolFeeInvoices: [
    { id: 'tuition-lydia-01', learnerId: 'learner-lydia', learnerAr: 'ليديا محمود', schoolAr: 'مدرسة القاهرة التجريبية', amount: 5500, due: '2026-11-15', status: 'due', simulated: true },
    { id: 'tuition-mariam-01', learnerId: 'learner-mariam', learnerAr: 'مريم عادل', schoolAr: 'أكاديمية الجيزة', amount: 4200, due: '2026-12-03', status: 'upcoming', simulated: true },
    { id: 'tuition-omar-01', learnerId: 'learner-omar', learnerAr: 'عمر سعد', schoolAr: 'مدرسة الدلتا', amount: 6100, due: '2026-11-22', status: 'due', simulated: true },
  ],
  payments: [
    { id: 'pay-001', scope: 'platform', customer: 'My School Platform', amount: 183600, method: 'Card', status: 'SIMULATED / غير حقيقي', at: '2026-10-01T10:00:00Z' },
    { id: 'pay-002', scope: 'tuition', customer: 'ليديا محمود', amount: 5500, method: 'Fawry', status: 'SIMULATED / غير حقيقي', at: '2026-11-10T11:30:00Z' },
    { id: 'pay-003', scope: 'platform', customer: 'Cairo STEM School', amount: 8000, method: 'Instapay', status: 'SIMULATED / غير حقيقي', at: '2026-11-01T12:00:00Z' },
  ],
  learners: [
    { id: 'learner-lydia', nameAr: 'ليديا محمود', nameEn: 'Lydia Mahmoud', school: 'Cairo STEM School', schoolAr: 'مدرسة القاهرة التجريبية', role: 'student', attendance: 95, avgGrade: 88, progress: 74, guardian: 'أحمد محمود', guardianEn: 'Ahmed Mahmoud', status: 'active' },
    { id: 'learner-mariam', nameAr: 'مريم عادل', nameEn: 'Mariam Adel', school: 'Giza Academy', schoolAr: 'أكاديمية الجيزة', role: 'student', attendance: 91, avgGrade: 84, progress: 68, guardian: 'سلمى عادل', guardianEn: 'Salma Adel', status: 'active' },
    { id: 'learner-omar', nameAr: 'عمر سعد', nameEn: 'Omar Saad', school: 'Delta Grammar', schoolAr: 'مدرسة الدلتا', role: 'student', attendance: 87, avgGrade: 79, progress: 61, guardian: 'منى سعد', guardianEn: 'Mona Saad', status: 'active' },
  ],
  memberships: [
    { id: 'mem-001', learnerId: 'learner-lydia', schoolId: 'school-cairo', status: 'active', startedAt: '2026-09-01', history: 'current school' },
    { id: 'mem-002', learnerId: 'learner-mariam', schoolId: 'school-giza', status: 'active', startedAt: '2026-09-01', history: 'current school' },
    { id: 'mem-003', learnerId: 'learner-omar', schoolId: 'school-delta', status: 'pending', startedAt: null, history: 'join request pending' },
  ],
  teacherSchedule: [
    { time: '08:00', subject: 'Math', subjectAr: 'رياضيات', class: 'Grade 8 / B', classAr: 'الصف الثاني الإعدادي / ب', task: 'Teach fractions' },
    { time: '09:30', subject: 'Science', subjectAr: 'علوم', class: 'Grade 8 / C', classAr: 'الصف الثاني الإعدادي / ج', task: 'Lab review' },
    { time: '11:00', subject: 'English', subjectAr: 'لغة إنجليزية', class: 'Grade 7 / A', classAr: 'الصف الأول الإعدادي / أ', task: 'Vocabulary practice' },
  ],
  gradingQueue: [
    { id: 'g-001', title: 'Fractions worksheet', titleAr: 'ورقة الكسور', due: 'Today', count: 18 },
    { id: 'g-002', title: 'Science lab report', titleAr: 'تقرير المعمل', due: 'Today', count: 9 },
    { id: 'g-003', title: 'English paragraph', titleAr: 'فقرة إنجليزي', due: 'Tomorrow', count: 14 },
  ],
  studentPlan: [
    { time: '08:00', subjectAr: 'رياضيات', taskAr: 'حل مسائل الكسور', status: 'due' },
    { time: '10:00', subjectAr: 'علوم', taskAr: 'مراجعة الفيديو', status: 'open' },
    { time: '12:30', subjectAr: 'إنجليزي', taskAr: 'واجب المفردات', status: 'pending' },
  ],
  questionBank: [
    { id: 'q-001', subjectAr: 'رياضيات', grade: '8', status: 'approved', scope: 'platform', difficulty: 3, exposures: 238, attempts: 114, source: 'Math Book v3' },
    { id: 'q-002', subjectAr: 'علوم', grade: '8', status: 'approved', scope: 'platform', difficulty: 2, exposures: 182, attempts: 93, source: 'Science Book v2' },
    { id: 'q-003', subjectAr: 'لغة عربية', grade: '7', status: 'pending', scope: 'school', difficulty: 4, exposures: 14, attempts: 6, source: 'School Appendix' },
    { id: 'q-004', subjectAr: 'English', grade: '7', status: 'approved', scope: 'tenant', difficulty: 1, exposures: 312, attempts: 201, source: 'English Unit 4' },
  ],
  curriculumSources: [
    { id: 'src-001', title: 'Math Book v3', titleAr: 'كتاب الرياضيات الإصدار 3', version: '2026.1', status: 'ready', rights: 'approved', scope: 'platform', pages: 246 },
    { id: 'src-002', title: 'Science Book v2', titleAr: 'كتاب العلوم الإصدار 2', version: '2026.1', status: 'ready', rights: 'approved', scope: 'platform', pages: 198 },
    { id: 'src-003', title: 'School Appendix', titleAr: 'ملحق المدرسة', version: '2026.0', status: 'processing', rights: 'pending_review', scope: 'school', pages: 88 },
  ],
  curriculumJobs: [
    { id: 'job-001', title: 'Ingest Math Book v3', titleAr: 'استيعاب كتاب الرياضيات', status: 'completed', step: 'chunk + embed', updatedAt: '2026-11-19T08:10:00Z' },
    { id: 'job-002', title: 'Generate English questions', titleAr: 'توليد أسئلة الإنجليزي', status: 'queued', step: 'awaiting worker', updatedAt: '2026-11-20T08:45:00Z' },
    { id: 'job-003', title: 'Re-embed science chunks', titleAr: 'إعادة تضمين العلوم', status: 'processing', step: 'batch 2/4', updatedAt: '2026-11-20T09:00:00Z' },
  ],
  notifications: [
    { id: 'n-001', titleAr: 'فاتورة منصة متأخرة', titleEn: 'Past-due platform invoice', kind: 'warning' },
    { id: 'n-002', titleAr: 'دفعة تجريبية ناجحة', titleEn: 'Simulated payment succeeded', kind: 'success' },
    { id: 'n-003', titleAr: 'طلب انضمام طالب جديد', titleEn: 'New learner membership request', kind: 'info' },
  ],
  auditLog: [
    { id: 'a-001', at: '2026-11-20T08:30:00Z', actor: 'System', actorAr: 'النظام', action: 'seed', detailAr: 'تم تحميل بيانات تجريبية فقط', detailEn: 'Demo data loaded only' },
    { id: 'a-002', at: '2026-11-20T08:45:00Z', actor: 'Platform Admin', actorAr: 'مدير المنصة', action: 'subscription', detailAr: 'إيقاف تجريبي للاشتراك — غير حقيقي', detailEn: 'Simulated subscription pause' },
    { id: 'a-003', at: '2026-11-20T09:00:00Z', actor: 'Teacher', actorAr: 'المعلم', action: 'practice', detailAr: 'توليد مجموعة تدريب للطالب', detailEn: 'Generated a practice set' },
  ],
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInitialState() {
  return {
    ...deepClone(DEMO),
    locale: 'ar',
    role: 'platform_admin',
    section: 'overview',
    selectedTenantId: 'tenant-cairo',
    selectedLearnerId: 'learner-lydia',
    selectedSubscriptionId: 'sub-platform-pro',
    selectedPlanId: 'platform',
    selectedPaymentMethod: 'card',
    searchTerm: '',
    providerStatus: 'Not connected',
    checkout: { status: 'idle', message: 'SIMULATED / غير حقيقي' },
  };
}

export function getVisibleSections(role) {
  return SECTION_MAP[role] ?? SECTION_MAP.student;
}

export function calculateSubscriptionAmount(baseMonthly, cycle = 'monthly', quantity = 1) {
  const months = CYCLE_MULTIPLIER[cycle] ?? 1;
  const discount = CYCLE_DISCOUNT[cycle] ?? 0;
  const total = baseMonthly * months * quantity * (1 - discount);
  return Math.round(total);
}

export function getPlanById(state, planId) {
  return state.plans.find((plan) => plan.id === planId) ?? state.plans[0];
}

function audit(state, action, actorAr, detailAr, detailEn) {
  state.auditLog.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor: actorAr,
    actorAr,
    action,
    detailAr,
    detailEn,
  });
  state.auditLog = state.auditLog.slice(0, 50);
}

export function applySubscriptionAction(state, subscriptionId, action) {
  const next = deepClone(state);
  const sub = next.subscriptions.find((item) => item.id === subscriptionId);
  if (!sub) return next;
  if (action === 'pause') {
    sub.status = 'paused';
    sub.autoRenew = false;
    audit(next, 'subscription', ROLE_LABELS[next.role].ar, `إيقاف مؤقت للاشتراك ${sub.customerAr}`, `Paused ${sub.customer}`);
  } else if (action === 'renew') {
    sub.status = 'active';
    sub.autoRenew = true;
    audit(next, 'subscription', ROLE_LABELS[next.role].ar, `تجديد الاشتراك ${sub.customerAr}`, `Renewed ${sub.customer}`);
  } else if (action === 'cancel') {
    sub.status = 'canceled';
    sub.autoRenew = false;
    audit(next, 'subscription', ROLE_LABELS[next.role].ar, `إلغاء الاشتراك ${sub.customerAr}`, `Cancelled ${sub.customer}`);
  } else if (action === 'trial') {
    sub.status = 'trialing';
    audit(next, 'subscription', ROLE_LABELS[next.role].ar, `تحويل الاشتراك إلى فترة تجربة ${sub.customerAr}`, `Moved ${sub.customer} to trial`);
  } else if (action === 'upgrade') {
    sub.status = 'active';
    sub.planId = 'platform';
    audit(next, 'subscription', ROLE_LABELS[next.role].ar, `ترقية الاشتراك ${sub.customerAr}`, `Upgraded ${sub.customer}`);
  }
  return next;
}

export function applySimulatedPayment(state, { targetType, targetId, customer, amount, method }) {
  const next = deepClone(state);
  const amountNumber = Number(amount) || 0;
  const payment = {
    id: `pay-${Date.now()}`,
    scope: targetType,
    customer,
    amount: amountNumber,
    method,
    status: 'SIMULATED / غير حقيقي',
    providerStatus: 'Not connected',
    at: new Date().toISOString(),
  };
  next.payments.unshift(payment);
  next.checkout = {
    status: 'SIMULATED / غير حقيقي',
    message: `SIMULATED / غير حقيقي — ${customer} — ${method} — ${amountNumber} EGP`,
    lastTargetType: targetType,
    lastTargetId: targetId,
    lastMethod: method,
    lastAmount: amountNumber,
  };
  if (targetType === 'platform') {
    const invoice = {
      id: `pf-${Date.now()}`,
      customer,
      type: 'Platform subscription',
      amount: amountNumber,
      status: 'paid',
      issuedAt: new Date().toISOString().slice(0, 10),
      paidAt: new Date().toISOString(),
      simulated: true,
    };
    next.platformInvoices.unshift(invoice);
    const sub = next.subscriptions.find((item) => item.id === targetId);
    if (sub) sub.status = 'active';
  } else if (targetType === 'tuition') {
    const invoice = next.schoolFeeInvoices.find((item) => item.id === targetId);
    if (invoice) invoice.status = 'paid';
  }
  audit(next, 'payment', ROLE_LABELS[next.role].ar, `دفع تجريبي عبر ${method} بقيمة ${amountNumber} جنيه`, `Simulated payment via ${method} for EGP ${amountNumber}`);
  return next;
}

export function createChildProfile(state, { firstName, lastName, schoolAr, schoolId, guardianAr }) {
  const next = deepClone(state);
  const id = `learner-${Date.now()}`;
  const learner = {
    id,
    nameAr: `${firstName} ${lastName}`,
    nameEn: `${firstName} ${lastName}`,
    school: schoolId,
    schoolAr,
    role: 'student',
    attendance: 100,
    avgGrade: 0,
    progress: 0,
    guardian: guardianAr,
    guardianEn: guardianAr,
    status: 'active',
  };
  next.learners.unshift(learner);
  next.memberships.unshift({ id: `mem-${Date.now()}`, learnerId: id, schoolId, status: 'pending', startedAt: null, history: 'join request pending' });
  audit(next, 'learner', ROLE_LABELS[next.role].ar, `إنشاء ملف طفل جديد: ${learner.nameAr}`, `Created new child profile: ${learner.nameEn}`);
  return next;
}

export function requestMembership(state, learnerId, schoolId) {
  const next = deepClone(state);
  const learner = next.learners.find((item) => item.id === learnerId);
  if (!learner) return next;
  if (!next.memberships.some((item) => item.learnerId === learnerId && item.schoolId === schoolId && item.status !== 'rejected')) {
    next.memberships.unshift({ id: `mem-${Date.now()}`, learnerId, schoolId, status: 'pending', startedAt: null, history: 'join request pending' });
    audit(next, 'membership', ROLE_LABELS[next.role].ar, `طلب انضمام ${learner.nameAr} إلى مدرسة`, `Requested membership for ${learner.nameEn}`);
  }
  return next;
}

export function recordPracticeSet(state, learnerId) {
  const next = deepClone(state);
  const learner = next.learners.find((item) => item.id === learnerId);
  if (!learner) return next;
  const question = next.questionBank[0];
  question.exposures += 1;
  question.attempts += 1;
  audit(next, 'practice', ROLE_LABELS[next.role].ar, `توليد حصة تدريب للطالب ${learner.nameAr}`, `Generated practice for ${learner.nameEn}`);
  return next;
}

export function markCurriculumReady(state, sourceId) {
  const next = deepClone(state);
  const source = next.curriculumSources.find((item) => item.id === sourceId);
  if (!source) return next;
  source.status = 'ready';
  source.rights = 'approved';
  audit(next, 'curriculum', ROLE_LABELS[next.role].ar, `جاهز للاستيعاب: ${source.titleAr}`, `Curriculum ready: ${source.title}`);
  return next;
}

export function setSectionIfVisible(state, section) {
  const visible = getVisibleSections(state.role);
  if (!visible.includes(section)) return state;
  return { ...state, section };
}

export function setRoleAndResetSection(state, role) {
  const visible = getVisibleSections(role);
  return { ...state, role, section: visible[0] ?? 'overview' };
}

export function setLocale(state, locale) {
  return { ...state, locale };
}

function esc(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function money(value, locale) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-EG' : 'ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function number(value, locale) {
  return new Intl.NumberFormat(locale === 'en' ? 'en-EG' : 'ar-EG').format(Number(value || 0));
}

function dateText(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ar-EG', { dateStyle: 'medium' }).format(new Date(value));
}

function chip(status) {
  return `status-chip status-${String(status).replaceAll(' ', '-').toLowerCase()}`;
}

function planPrice(plan, cycle) {
  return calculateSubscriptionAmount(plan.baseMonthly, cycle, 1);
}

function metricCard({ title, value, sub, tone = 'neutral' }) {
  return `<article class="metric-card ${tone}"><div class="metric-title">${esc(title)}</div><div class="metric-value">${esc(value)}</div><div class="metric-sub">${esc(sub)}</div></article>`;
}

function table(headers, rows, rowClass = '') {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr class="${rowClass}">${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function statBar(label, value, total, locale) {
  const pct = Math.max(0, Math.min(100, total > 0 ? Math.round((value / total) * 100) : 0));
  return `<div class="stat-bar"><div class="stat-bar-head"><span>${esc(label)}</span><strong>${number(value, locale)} / ${number(total, locale)}</strong></div><div class="stat-track"><span style="width:${pct}%"></span></div></div>`;
}

function visiblePlans(state) {
  return state.plans;
}

function renderHeader(state) {
  const locale = state.locale;
  const role = ROLE_LABELS[state.role];
  return `
    <header class="topbar">
      <div>
        <div class="brand-row">
          <div class="logo">MS</div>
          <div>
            <h1>${TEXT[locale].title}</h1>
            <p>${TEXT[locale].subtitle}</p>
          </div>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="pill danger">${TEXT[locale].demoBanner}</div>
        <div class="pill">${TEXT[locale].providerStatus}: ${state.providerStatus}</div>
        <label class="searchbox"><span>${TEXT[locale].search}</span><input id="search-input" value="${esc(state.searchTerm)}" placeholder="${locale === 'en' ? 'Search learners, invoices, questions…' : 'ابحث في الطلاب والفواتير والأسئلة…'}"></label>
        <div class="lang-switch">
          <button data-action="set-locale" data-locale="ar" class="${locale === 'ar' ? 'active' : ''}">${TEXT[locale].langAr}</button>
          <button data-action="set-locale" data-locale="en" class="${locale === 'en' ? 'active' : ''}">${TEXT[locale].langEn}</button>
        </div>
      </div>
    </header>`;
}

function renderSidebar(state) {
  const locale = state.locale;
  const sections = getVisibleSections(state.role);
  const labels = {
    overview: TEXT[locale].overview,
    platform: TEXT[locale].platform,
    school: TEXT[locale].school,
    teacher: TEXT[locale].teacher,
    parent: TEXT[locale].parent,
    student: TEXT[locale].student,
    learners: TEXT[locale].learners,
    questions: TEXT[locale].questions,
    curriculum: TEXT[locale].curriculum,
    billing: TEXT[locale].billing,
    operations: TEXT[locale].operations,
  };
  return `
    <aside class="sidebar">
      <section class="panel">
        <div class="panel-title">${TEXT[locale].roleSwitch}</div>
        <div class="role-switcher">
          ${Object.entries(ROLE_LABELS).map(([key, label]) => `<button data-action="set-role" data-role="${key}" class="role-btn ${state.role === key ? 'active' : ''}">${locale === 'en' ? label.en : label.ar}</button>`).join('')}
        </div>
      </section>
      <section class="panel">
        <div class="panel-title">${locale === 'en' ? 'Navigation' : 'التنقل'}</div>
        <nav class="section-nav">
          ${sections.map((section) => `<button data-action="set-section" data-section="${section}" class="nav-btn ${state.section === section ? 'active' : ''}">${labels[section]}</button>`).join('')}
        </nav>
      </section>
      <section class="panel">
        <div class="panel-title">${TEXT[locale].currentStatus}</div>
        <div class="status-stack">
          <div class="mini-card"><strong>${role[locale]}</strong><span>${locale === 'en' ? 'Current view' : 'العرض الحالي'}</span></div>
          <div class="mini-card"><strong>${TEXT[locale].simulated}</strong><span>${locale === 'en' ? 'Local browser state only' : 'حالة محلية داخل المتصفح فقط'}</span></div>
        </div>
      </section>
    </aside>`;
}

function renderOverview(state) {
  const locale = state.locale;
  const platformActive = state.subscriptions.filter((s) => s.scope === 'platform' && s.status === 'active').length;
  const schoolActive = state.subscriptions.filter((s) => s.scope === 'school' && s.status === 'active').length;
  const learnerCount = state.learners.length;
  const pendingMemberships = state.memberships.filter((m) => m.status === 'pending').length;
  const approvedQuestions = state.questionBank.filter((q) => q.status === 'approved').length;
  const readySources = state.curriculumSources.filter((s) => s.status === 'ready').length;
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Active platform subscriptions' : 'الاشتراكات النشطة للمنصة', value: number(platformActive, locale), sub: locale === 'en' ? 'Live in demo state' : 'داخل الحالة التجريبية فقط', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Active school subscriptions' : 'اشتراكات المدارس النشطة', value: number(schoolActive, locale), sub: locale === 'en' ? 'School plans under demo' : 'خطط المدارس في الوضع التجريبي', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Learner profiles' : 'ملفات الطلاب', value: number(learnerCount, locale), sub: locale === 'en' ? 'Independent + school-linked' : 'مستقل + مرتبط بالمدرسة', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Pending memberships' : 'طلبات الانضمام المعلقة', value: number(pendingMemberships, locale), sub: locale === 'en' ? 'Awaiting review' : 'بانتظار المراجعة', tone: 'red' })}
      ${metricCard({ title: locale === 'en' ? 'Approved questions' : 'الأسئلة المعتمدة', value: number(approvedQuestions, locale), sub: locale === 'en' ? 'Reusable and grounded' : 'قابلة لإعادة الاستخدام ومربوطة بالمصدر', tone: 'purple' })}
      ${metricCard({ title: locale === 'en' ? 'Ready curriculum sources' : 'مصادر المناهج الجاهزة', value: number(readySources, locale), sub: locale === 'en' ? 'Approved for RAG and generation' : 'معتمدة للبحث والتوليد', tone: 'teal' })}
    </section>
    <section class="card-stack">
      <article class="panel wide">
        <div class="panel-head"><h2>${locale === 'en' ? 'Production readiness snapshot' : 'لقطة جاهزية الإنتاج'}</h2><span class="badge danger">${TEXT[locale].demoBanner}</span></div>
        <div class="readiness-grid">
          <div>${statBar(locale === 'en' ? 'Frontend source' : 'مصدر الواجهة', 1, 1, locale)}</div>
          <div>${statBar(locale === 'en' ? 'Supabase backend' : 'الـ Supabase backend', 1, 1, locale)}</div>
          <div>${statBar(locale === 'en' ? 'Payment provider connected' : 'بوابة الدفع متصلة', 0, 1, locale)}</div>
          <div>${statBar(locale === 'en' ? 'Live data allowed' : 'بيانات حية مسموحة', 0, 1, locale)}</div>
        </div>
      </article>
      <article class="panel wide">
        <div class="panel-head"><h2>${locale === 'en' ? 'Recent activity' : 'أحدث الأنشطة'}</h2></div>
        <div class="timeline">
          ${state.auditLog.slice(0, 5).map((item) => `<div class="timeline-item"><strong>${esc(item.detailAr)}</strong><span>${dateText(item.at, locale)} • ${esc(item.actorAr)}</span></div>`).join('')}
        </div>
      </article>
    </section>`;
}

function renderPlatform(state) {
  const locale = state.locale;
  const active = state.subscriptions.filter((s) => s.scope === 'platform' && s.status === 'active').length;
  const trialing = state.subscriptions.filter((s) => s.scope === 'platform' && s.status === 'trialing').length;
  const pastDue = state.subscriptions.filter((s) => s.scope === 'platform' && s.status === 'past_due').length;
  const mrr = state.tenants.reduce((sum, tenant) => sum + (tenant.status === 'active' ? tenant.mrr : 0), 0) + 183600 / 12;
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Platform MRR' : 'الإيراد الشهري للمنصة', value: money(mrr, locale), sub: locale === 'en' ? 'Demo revenue only' : 'إيراد تجريبي فقط', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Active' : 'نشط', value: number(active, locale), sub: locale === 'en' ? 'Platform subscriptions' : 'اشتراكات المنصة', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Trialing' : 'تجربة', value: number(trialing, locale), sub: locale === 'en' ? 'Trials in progress' : 'فترات تجربة جارية', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Past due' : 'متأخر', value: number(pastDue, locale), sub: locale === 'en' ? 'Needs attention' : 'يحتاج متابعة', tone: 'red' })}
    </section>
    <section class="panel wide">
      <div class="panel-head"><h2>${locale === 'en' ? 'Subscriptions' : 'الاشتراكات'}</h2><span class="badge">${TEXT[locale].platformView}</span></div>
      ${table(
        [locale === 'en' ? 'Customer' : 'العميل', locale === 'en' ? 'Plan' : 'الخطة', locale === 'en' ? 'Status' : 'الحالة', locale === 'en' ? 'Cycle' : 'الدورة', locale === 'en' ? 'Amount' : 'القيمة', locale === 'en' ? 'Next renewal' : 'التجديد القادم', locale === 'en' ? 'Actions' : 'إجراءات'],
        state.subscriptions.map((sub) => {
          const plan = getPlanById(state, sub.planId);
          return [
            `<strong>${esc(locale === 'en' ? sub.customer : sub.customerAr)}</strong>`,
            `${esc(locale === 'en' ? plan.nameEn : plan.nameAr)}<div class="subtle">${esc(plan.scope)}</div>`,
            `<span class="${chip(sub.status)}">${esc(sub.status)}</span>`,
            esc(sub.cycle),
            money(sub.amount || calculateSubscriptionAmount(plan.baseMonthly, sub.cycle), locale),
            dateText(sub.nextRenewal, locale),
            `<div class="action-row">${['pause', 'renew', 'cancel', 'trial'].map((action) => `<button class="tiny" data-action="subscription-action" data-sub-id="${sub.id}" data-sub-action="${action}">${TEXT[locale][action]}</button>`).join('')}</div>`,
          ];
        }).join ? state.subscriptions.map((sub) => {
          const plan = getPlanById(state, sub.planId);
          return [
            `<strong>${esc(locale === 'en' ? sub.customer : sub.customerAr)}</strong>`,
            `${esc(locale === 'en' ? plan.nameEn : plan.nameAr)}<div class="subtle">${esc(plan.scope)}</div>`,
            `<span class="${chip(sub.status)}">${esc(sub.status)}</span>`,
            esc(sub.cycle),
            money(sub.amount || calculateSubscriptionAmount(plan.baseMonthly, sub.cycle), locale),
            dateText(sub.nextRenewal, locale),
            `<div class="action-row">${['pause', 'renew', 'cancel', 'trial'].map((action) => `<button class="tiny" data-action="subscription-action" data-sub-id="${sub.id}" data-sub-action="${action}">${TEXT[locale][action]}</button>`).join('')}</div>`,
          ];
        }) : []
      )}
    </section>
    <section class="panel wide">
      <div class="panel-head"><h2>${locale === 'en' ? 'Tenant health' : 'صحة المدارس'}</h2></div>
      <div class="card-row">
        ${state.tenants.map((tenant) => `<article class="sub-card"><h3>${esc(locale === 'en' ? tenant.nameEn : tenant.nameAr)}</h3><div class="subtle">${esc(tenant.status)} • ${esc(tenant.risk)}</div><div>${money(tenant.mrr, locale)} MRR</div><div class="subtle">${tenant.students} students • ${tenant.teachers} teachers • ${tenant.attendance}% attendance</div></article>`).join('')}
      </div>
    </section>`;
}

function renderSchool(state) {
  const locale = state.locale;
  const tenant = state.tenants.find((item) => item.id === state.selectedTenantId) ?? state.tenants[0];
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Students' : 'الطلاب', value: number(tenant.students, locale), sub: locale === 'en' ? 'Active enrolled' : 'المقيدون فعليًا', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Teachers' : 'المعلمون', value: number(tenant.teachers, locale), sub: locale === 'en' ? 'Active staff' : 'الطاقم النشط', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Attendance' : 'الحضور', value: `${tenant.attendance}%`, sub: locale === 'en' ? 'This week' : 'هذا الأسبوع', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'School MRR' : 'الإيراد الشهري للمدرسة', value: money(tenant.mrr, locale), sub: locale === 'en' ? 'Demo only' : 'تجريبي فقط', tone: 'purple' })}
    </section>
    <section class="panel wide">
      <div class="panel-head"><h2>${locale === 'en' ? 'Select school' : 'اختيار المدرسة'}</h2></div>
      <div class="chips">
        ${state.tenants.map((item) => `<button class="chip ${state.selectedTenantId === item.id ? 'active' : ''}" data-action="set-tenant" data-tenant-id="${item.id}">${esc(locale === 'en' ? item.nameEn : item.nameAr)}</button>`).join('')}
      </div>
    </section>
    <section class="panel wide">
      <div class="panel-head"><h2>${locale === 'en' ? 'Fee invoices' : 'فواتير المصروفات'}</h2><span class="badge">${locale === 'en' ? 'Parent-only fee view' : 'عرض ولي الأمر فقط'}</span></div>
      ${table(
        [locale === 'en' ? 'Learner' : 'الطالب', locale === 'en' ? 'School' : 'المدرسة', locale === 'en' ? 'Amount' : 'القيمة', locale === 'en' ? 'Due' : 'الاستحقاق', locale === 'en' ? 'Status' : 'الحالة'],
        state.schoolFeeInvoices.map((invoice) => [
          esc(locale === 'en' ? state.learners.find((l) => l.id === invoice.learnerId)?.nameEn ?? invoice.learnerAr : invoice.learnerAr),
          esc(locale === 'en' ? invoice.schoolAr : invoice.schoolAr),
          money(invoice.amount, locale),
          dateText(invoice.due, locale),
          `<span class="${chip(invoice.status)}">${esc(invoice.status)}</span>`,
        ])
      )}
    </section>`;
}

function renderTeacher(state) {
  const locale = state.locale;
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Classes today' : 'حصص اليوم', value: number(state.teacherSchedule.length, locale), sub: locale === 'en' ? 'On the timetable' : 'على الجدول', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Pending grading' : 'التصحيح المعلق', value: number(state.gradingQueue.reduce((sum, item) => sum + item.count, 0), locale), sub: locale === 'en' ? 'Submissions waiting' : 'الواجبات المنتظرة', tone: 'red' })}
      ${metricCard({ title: locale === 'en' ? 'Average class grade' : 'متوسط الدرجات', value: '84%', sub: locale === 'en' ? 'Demo metrics' : 'مؤشرات تجريبية', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Assignments due' : 'الواجبات المستحقة', value: '12', sub: locale === 'en' ? 'Next 24 hours' : 'خلال 24 ساعة', tone: 'green' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Today\'s timetable' : 'جدول اليوم'}</h2></div>
        <div class="stack">
          ${state.teacherSchedule.map((item) => `<div class="stack-item"><strong>${item.time}</strong><div>${esc(locale === 'en' ? item.subject : item.subjectAr)} • ${esc(locale === 'en' ? item.class : item.classAr)}</div><div class="subtle">${esc(locale === 'en' ? item.task : item.task)}</div></div>`).join('')}
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Grading queue' : 'طابور التصحيح'}</h2></div>
        <div class="stack">
          ${state.gradingQueue.map((item) => `<div class="stack-item"><strong>${esc(locale === 'en' ? item.title : item.titleAr)}</strong><div class="subtle">${item.due} • ${item.count} ${locale === 'en' ? 'submissions' : 'واجب'}</div></div>`).join('')}
        </div>
      </article>
    </section>`;
}

function renderParent(state) {
  const locale = state.locale;
  const selected = state.learners.find((learner) => learner.id === state.selectedLearnerId) ?? state.learners[0];
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Linked children' : 'الأبناء المرتبطون', value: number(state.learners.length, locale), sub: locale === 'en' ? 'Demo family profiles' : 'ملفات أسرية تجريبية', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Average attendance' : 'متوسط الحضور', value: '91%', sub: locale === 'en' ? 'Across linked children' : 'بين الأبناء المرتبطين', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Fee due' : 'المبالغ المستحقة', value: money(state.schoolFeeInvoices.filter((i) => i.status !== 'paid').reduce((sum, item) => sum + item.amount, 0), locale), sub: locale === 'en' ? 'Tuition only' : 'مصروفات دراسية فقط', tone: 'red' })}
      ${metricCard({ title: locale === 'en' ? 'Notices' : 'الإشعارات', value: number(state.notifications.length, locale), sub: locale === 'en' ? 'Important updates' : 'تحديثات مهمة', tone: 'gold' })}
    </section>
    <section class="panel wide">
      <div class="panel-head"><h2>${locale === 'en' ? 'Select child' : 'اختيار الابن'}</h2></div>
      <div class="chips">
        ${state.learners.map((item) => `<button class="chip ${state.selectedLearnerId === item.id ? 'active' : ''}" data-action="set-learner" data-learner-id="${item.id}">${esc(locale === 'en' ? item.nameEn : item.nameAr)}</button>`).join('')}
      </div>
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Child profile' : 'ملف الابن'}</h2><span class="badge">${esc(selected.status)}</span></div>
        <div class="detail-list">
          <div><span>${locale === 'en' ? 'School' : 'المدرسة'}</span><strong>${esc(locale === 'en' ? selected.school : selected.schoolAr)}</strong></div>
          <div><span>${locale === 'en' ? 'Guardian' : 'ولي الأمر'}</span><strong>${esc(locale === 'en' ? selected.guardianEn : selected.guardian)}</strong></div>
          <div><span>${locale === 'en' ? 'Attendance' : 'الحضور'}</span><strong>${selected.attendance}%</strong></div>
          <div><span>${locale === 'en' ? 'Average grade' : 'متوسط الدرجة'}</span><strong>${selected.avgGrade}%</strong></div>
          <div><span>${locale === 'en' ? 'Learning progress' : 'التقدم التعليمي'}</span><strong>${selected.progress}%</strong></div>
        </div>
        <div class="button-row"><button data-action="request-membership" data-learner-id="${selected.id}" class="ghost">${TEXT[locale].requestMembership}</button></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Fee invoices' : 'فواتير المصروفات'}</h2></div>
        <div class="stack">
          ${state.schoolFeeInvoices.map((invoice) => `<div class="stack-item"><strong>${esc(invoice.learnerAr)}</strong><div class="subtle">${money(invoice.amount, locale)} • ${dateText(invoice.due, locale)} • <span class="${chip(invoice.status)}">${esc(invoice.status)}</span></div></div>`).join('')}
        </div>
      </article>
    </section>`;
}

function renderStudent(state) {
  const locale = state.locale;
  const selected = state.learners.find((learner) => learner.id === state.selectedLearnerId) ?? state.learners[0];
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Assignments due' : 'الواجبات المستحقة', value: '3', sub: locale === 'en' ? 'Today and tomorrow' : 'اليوم وغدًا', tone: 'red' })}
      ${metricCard({ title: locale === 'en' ? 'Average score' : 'متوسط الدرجات', value: `${selected.avgGrade}%`, sub: locale === 'en' ? 'Recent result' : 'آخر نتيجة', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Attendance' : 'الحضور', value: `${selected.attendance}%`, sub: locale === 'en' ? 'This term' : 'هذا الفصل', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Progress' : 'التقدم', value: `${selected.progress}%`, sub: locale === 'en' ? 'Learning passport' : 'جواز التعلم', tone: 'purple' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Today\'s plan' : 'خطة اليوم'}</h2></div>
        <div class="stack">
          ${state.studentPlan.map((item) => `<div class="stack-item"><strong>${item.time}</strong><div>${esc(item.subjectAr)} — ${esc(item.taskAr)}</div><div class="subtle"><span class="${chip(item.status)}">${esc(item.status)}</span></div></div>`).join('')}
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Select learner' : 'اختيار الطالب'}</h2></div>
        <div class="chips">
          ${state.learners.map((item) => `<button class="chip ${state.selectedLearnerId === item.id ? 'active' : ''}" data-action="set-learner" data-learner-id="${item.id}">${esc(locale === 'en' ? item.nameEn : item.nameAr)}</button>`).join('')}
        </div>
        <div class="detail-list small-top">
          <div><span>${locale === 'en' ? 'School' : 'المدرسة'}</span><strong>${esc(locale === 'en' ? selected.school : selected.schoolAr)}</strong></div>
          <div><span>${locale === 'en' ? 'Guardian' : 'ولي الأمر'}</span><strong>${esc(locale === 'en' ? selected.guardianEn : selected.guardian)}</strong></div>
          <div><span>${locale === 'en' ? 'Learning progress' : 'التقدم'}</span><strong>${selected.progress}%</strong></div>
        </div>
      </article>
    </section>`;
}

function renderLearners(state) {
  const locale = state.locale;
  const selected = state.learners.find((item) => item.id === state.selectedLearnerId) ?? state.learners[0];
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Global learner profiles' : 'الملفات العالمية', value: number(state.learners.length, locale), sub: locale === 'en' ? 'School-linked + family-linked' : 'مرتبطة بالمدرسة والعائلة', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Open memberships' : 'العضويات المفتوحة', value: number(state.memberships.filter((m) => m.status === 'pending').length, locale), sub: locale === 'en' ? 'Join requests waiting' : 'طلبات انضمام قيد الانتظار', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Parent links' : 'روابط أولياء الأمور', value: '3', sub: locale === 'en' ? 'Revocable and explicit' : 'صريحة وقابلة للإلغاء', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Identity fingerprints' : 'بصمات الهوية', value: 'HMAC ready', sub: locale === 'en' ? 'No raw national IDs shown' : 'بدون إظهار الأرقام القومية الخام', tone: 'purple' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Learner directory' : 'دليل الطلاب'}</h2></div>
        ${table(
          [locale === 'en' ? 'Learner' : 'الطالب', locale === 'en' ? 'School' : 'المدرسة', locale === 'en' ? 'Attendance' : 'الحضور', locale === 'en' ? 'Progress' : 'التقدم'],
          state.learners.map((learner) => [
            `<button class="text-btn" data-action="set-learner" data-learner-id="${learner.id}">${esc(locale === 'en' ? learner.nameEn : learner.nameAr)}</button>`,
            esc(locale === 'en' ? learner.school : learner.schoolAr),
            `${learner.attendance}%`,
            `${learner.progress}%`,
          ])
        )}
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Selected learner' : 'الطالب المحدد'}</h2></div>
        <div class="detail-list">
          <div><span>${locale === 'en' ? 'Name' : 'الاسم'}</span><strong>${esc(locale === 'en' ? selected.nameEn : selected.nameAr)}</strong></div>
          <div><span>${locale === 'en' ? 'Guardian' : 'ولي الأمر'}</span><strong>${esc(locale === 'en' ? selected.guardianEn : selected.guardian)}</strong></div>
          <div><span>${locale === 'en' ? 'School' : 'المدرسة'}</span><strong>${esc(locale === 'en' ? selected.school : selected.schoolAr)}</strong></div>
          <div><span>${locale === 'en' ? 'Status' : 'الحالة'}</span><strong>${esc(selected.status)}</strong></div>
        </div>
        <div class="button-row"><button class="ghost" data-action="request-membership" data-learner-id="${selected.id}">${TEXT[locale].requestMembership}</button><button class="ghost" data-action="create-child">${TEXT[locale].createChild}</button></div>
      </article>
    </section>`;
}

function renderQuestions(state) {
  const locale = state.locale;
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Approved reusable questions' : 'أسئلة معتمدة قابلة لإعادة الاستخدام', value: number(state.questionBank.filter((q) => q.status === 'approved').length, locale), sub: locale === 'en' ? 'Server-only answer keys' : 'المفاتيح محفوظة في الخادم فقط', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Exposures' : 'العروض', value: number(state.questionBank.reduce((sum, q) => sum + q.exposures, 0), locale), sub: locale === 'en' ? 'Delivery count' : 'عدد مرات التوزيع', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Attempts' : 'المحاولات', value: number(state.questionBank.reduce((sum, q) => sum + q.attempts, 0), locale), sub: locale === 'en' ? 'Practice entries' : 'مدخلات التدريب', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Grounded sources' : 'المصادر المربوطة', value: number(state.curriculumSources.filter((s) => s.rights === 'approved').length, locale), sub: locale === 'en' ? 'Ready for RAG and generation' : 'جاهزة للبحث والتوليد', tone: 'purple' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Question inventory' : 'مخزون الأسئلة'}</h2><button class="ghost" data-action="practice-session">${TEXT[locale].assignPractice}</button></div>
        ${table(
          [locale === 'en' ? 'Subject' : 'المادة', locale === 'en' ? 'Grade' : 'الصف', locale === 'en' ? 'Scope' : 'النطاق', locale === 'en' ? 'Difficulty' : 'الصعوبة', locale === 'en' ? 'Status' : 'الحالة', locale === 'en' ? 'Source' : 'المصدر'],
          state.questionBank.map((q) => [esc(q.subjectAr), esc(q.grade), esc(q.scope), esc(q.difficulty), `<span class="${chip(q.status)}">${esc(q.status)}</span>`, esc(q.source)])
        )}
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Answer-key policy' : 'سياسة مفاتيح الإجابة'}</h2></div>
        <div class="detail-list">
          <div><span>${locale === 'en' ? 'Browser access' : 'الوصول من المتصفح'}</span><strong>${locale === 'en' ? 'Blocked' : 'ممنوع'}</strong></div>
          <div><span>${locale === 'en' ? 'Server access' : 'الوصول من الخادم'}</span><strong>${locale === 'en' ? 'Service only' : 'الخادم فقط'}</strong></div>
          <div><span>${locale === 'en' ? 'Student attempts' : 'محاولات الطالب'}</span><strong>${locale === 'en' ? 'Logged separately' : 'تسجل منفصلة'}</strong></div>
          <div><span>${locale === 'en' ? 'Reuse' : 'إعادة الاستخدام'}</span><strong>${locale === 'en' ? 'Allowed after review' : 'مسموح بعد المراجعة'}</strong></div>
        </div>
      </article>
    </section>`;
}

function renderCurriculum(state) {
  const locale = state.locale;
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Ready sources' : 'المصادر الجاهزة', value: number(state.curriculumSources.filter((s) => s.status === 'ready').length, locale), sub: locale === 'en' ? 'Approved rights only' : 'الحقوق المعتمدة فقط', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Processing sources' : 'المصادر قيد المعالجة', value: number(state.curriculumSources.filter((s) => s.status !== 'ready').length, locale), sub: locale === 'en' ? 'Need ingestion' : 'تحتاج استيعاب', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Jobs' : 'الوظائف', value: number(state.curriculumJobs.length, locale), sub: locale === 'en' ? 'Pipeline activity' : 'نشاط خط المعالجة', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'RAG evidence' : 'أدلة RAG', value: 'Enabled', sub: locale === 'en' ? 'Stable citations only' : 'اقتباسات مستقرة فقط', tone: 'purple' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Curriculum sources' : 'مصادر المنهج'}</h2><button class="ghost" data-action="mark-ready">${TEXT[locale].markReady}</button></div>
        ${table(
          [locale === 'en' ? 'Title' : 'العنوان', locale === 'en' ? 'Version' : 'الإصدار', locale === 'en' ? 'Scope' : 'النطاق', locale === 'en' ? 'Rights' : 'الحقوق', locale === 'en' ? 'Status' : 'الحالة'],
          state.curriculumSources.map((source) => [esc(locale === 'en' ? source.title : source.titleAr), esc(source.version), esc(source.scope), esc(source.rights), `<span class="${chip(source.status)}">${esc(source.status)}</span>`])
        )}
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Ingestion jobs' : 'وظائف الاستيعاب'}</h2></div>
        <div class="stack">
          ${state.curriculumJobs.map((job) => `<div class="stack-item"><strong>${esc(locale === 'en' ? job.title : job.titleAr)}</strong><div class="subtle">${esc(job.step)} • ${dateText(job.updatedAt, locale)}</div><div><span class="${chip(job.status)}">${esc(job.status)}</span></div></div>`).join('')}
        </div>
      </article>
    </section>`;
}

function renderBilling(state) {
  const locale = state.locale;
  const selectedPlan = getPlanById(state, state.selectedPlanId);
  const selectedSubscription = state.subscriptions.find((item) => item.id === state.selectedSubscriptionId) ?? state.subscriptions[0];
  const selectedPrice = planPrice(selectedPlan, selectedSubscription?.cycle ?? 'monthly');
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Provider status' : 'حالة المزوّد', value: state.providerStatus, sub: locale === 'en' ? 'Not connected / demo only' : 'غير متصل / تجريبي فقط', tone: 'red' })}
      ${metricCard({ title: locale === 'en' ? 'Selected plan' : 'الخطة المحددة', value: locale === 'en' ? selectedPlan.nameEn : selectedPlan.nameAr, sub: locale === 'en' ? 'Pricing is local only' : 'التسعير محلي فقط', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Checkout amount' : 'قيمة الدفع', value: money(selectedPrice, locale), sub: locale === 'en' ? 'SIMULATED / not real' : 'تجريبي وغير حقيقي', tone: 'gold' })}
      ${metricCard({ title: locale === 'en' ? 'Payments logged' : 'المدفوعات المسجلة', value: number(state.payments.length, locale), sub: locale === 'en' ? 'Local browser history only' : 'سجل محلي داخل المتصفح', tone: 'green' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Plans and pricing' : 'الخطط والتسعير'}</h2></div>
        <div class="card-row">
          ${visiblePlans(state).map((plan) => `<article class="sub-card ${plan.id === selectedPlan.id ? 'selected' : ''}"><div class="sub-card-head"><h3>${esc(locale === 'en' ? plan.nameEn : plan.nameAr)}</h3>${plan.popular ? '<span class="badge">Popular</span>' : ''}</div><p>${esc(locale === 'en' ? plan.descriptionEn : plan.descriptionAr)}</p><div class="price">${money(plan.baseMonthly, locale)} <small>${locale === 'en' ? 'per month' : 'شهريًا'}</small></div><div class="feature-list">${(locale === 'en' ? plan.featuresEn : plan.featuresAr).map((feature) => `<span>${esc(feature)}</span>`).join('')}</div><button class="ghost" data-action="set-plan" data-plan-id="${plan.id}">${TEXT[locale].choosePlan}</button></article>`).join('')}
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${TEXT[locale].checkout}</h2><span class="badge danger">${TEXT[locale].simulated}</span></div>
        <div class="detail-list">
          <div><span>${TEXT[locale].chooseSubscription}</span><strong>${esc(locale === 'en' ? selectedSubscription.customer : selectedSubscription.customerAr)}</strong></div>
          <div><span>${TEXT[locale].paymentMethod}</span><strong>${esc(state.selectedPaymentMethod)}</strong></div>
          <div><span>${TEXT[locale].providerStatus}</span><strong>${state.providerStatus}</strong></div>
          <div><span>${locale === 'en' ? 'Cycle' : 'الدورة'}</span><strong>${esc(selectedSubscription.cycle)}</strong></div>
        </div>
        <div class="chips payment-methods">
          ${['card', 'wallet', 'fawry', 'instapay', 'offline'].map((method) => `<button class="chip ${state.selectedPaymentMethod === method ? 'active' : ''}" data-action="set-payment-method" data-method="${method}">${method}</button>`).join('')}
        </div>
        <div class="button-row">
          <button class="primary" data-action="checkout">${TEXT[locale].processPayment}</button>
          <button class="ghost" data-action="subscription-action" data-sub-id="${selectedSubscription.id}" data-sub-action="upgrade">${TEXT[locale].upgrade}</button>
        </div>
        <div class="checkout-box ${state.checkout.status === 'SIMULATED / غير حقيقي' ? 'success' : ''}">
          <strong>${state.checkout.message || TEXT[locale].simulated}</strong>
          <div class="subtle">${TEXT[locale].oneBanner}</div>
        </div>
      </article>
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${TEXT[locale].paymentHistory}</h2></div>
        ${table(
          [locale === 'en' ? 'Customer' : 'العميل', locale === 'en' ? 'Type' : 'النوع', locale === 'en' ? 'Method' : 'الطريقة', locale === 'en' ? 'Amount' : 'القيمة', locale === 'en' ? 'Status' : 'الحالة'],
          state.payments.map((payment) => [esc(payment.customer), esc(payment.scope), esc(payment.method), money(payment.amount, locale), `<span class="${chip(payment.status)}">${esc(payment.status)}</span>`])
        )}
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${TEXT[locale].invoiceHistory}</h2></div>
        <div class="stack">
          ${state.platformInvoices.map((invoice) => `<div class="stack-item"><strong>${esc(invoice.customer)}</strong><div class="subtle">${esc(invoice.type)} • ${money(invoice.amount, locale)} • ${dateText(invoice.issuedAt, locale)}</div><div><span class="${chip(invoice.status)}">${esc(invoice.status)}</span></div></div>`).join('')}
        </div>
      </article>
    </section>`;
}

function renderOperations(state) {
  const locale = state.locale;
  return `
    <section class="content-grid">
      ${metricCard({ title: locale === 'en' ? 'Frontend status' : 'حالة الواجهة', value: 'Ready', sub: locale === 'en' ? 'Static SPA with local state' : 'SPA ثابتة بحالة محلية', tone: 'green' })}
      ${metricCard({ title: locale === 'en' ? 'Supabase status' : 'حالة Supabase', value: 'Ready', sub: locale === 'en' ? 'Backend contracts already exist' : 'عقود البيانات موجودة مسبقًا', tone: 'blue' })}
      ${metricCard({ title: locale === 'en' ? 'Payment provider' : 'بوابة الدفع', value: state.providerStatus, sub: locale === 'en' ? 'Not connected' : 'غير متصلة', tone: 'red' })}
      ${metricCard({ title: locale === 'en' ? 'Audit events' : 'أحداث التدقيق', value: number(state.auditLog.length, locale), sub: locale === 'en' ? 'Locally persisted' : 'محفوظة محليًا', tone: 'gold' })}
    </section>
    <section class="grid-2">
      <article class="panel">
        <div class="panel-head"><h2>${locale === 'en' ? 'Integration matrix' : 'مصفوفة التكامل'}</h2></div>
        <div class="detail-list">
          <div><span>Supabase</span><strong>Connected by contract only</strong></div>
          <div><span>Payment gateway</span><strong>${state.providerStatus}</strong></div>
          <div><span>OpenAI</span><strong>Not connected</strong></div>
          <div><span>Browser state</span><strong>Local only</strong></div>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>${TEXT[locale].activityLog}</h2></div>
        <div class="stack">
          ${state.auditLog.map((item) => `<div class="stack-item"><strong>${esc(item.detailAr)}</strong><div class="subtle">${dateText(item.at, locale)} • ${esc(item.actorAr)}</div></div>`).join('')}
        </div>
      </article>
    </section>`;
}

function renderSection(state) {
  switch (state.section) {
    case 'platform': return renderPlatform(state);
    case 'school': return renderSchool(state);
    case 'teacher': return renderTeacher(state);
    case 'parent': return renderParent(state);
    case 'student': return renderStudent(state);
    case 'learners': return renderLearners(state);
    case 'questions': return renderQuestions(state);
    case 'curriculum': return renderCurriculum(state);
    case 'billing': return renderBilling(state);
    case 'operations': return renderOperations(state);
    case 'overview':
    default: return renderOverview(state);
  }
}

function renderApp(state) {
  const locale = state.locale;
  return `
  <div class="app-shell" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale === 'ar' ? 'ar' : 'en'}">
    ${renderHeader(state)}
    <div class="layout">
      ${renderSidebar(state)}
      <main class="main">
        <section class="banner">
          <div>
            <strong>${TEXT[locale].simulated}</strong>
            <p>${TEXT[locale].demoBanner}</p>
          </div>
          <div class="banner-actions">
            <span class="badge">${TEXT[locale].providerStatus}: ${state.providerStatus}</span>
            <span class="badge">${TEXT[locale].title}</span>
          </div>
        </section>
        ${renderSection(state)}
      </main>
    </div>
  </div>`;
}

function saveState(state) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const payload = {
    locale: state.locale,
    role: state.role,
    section: state.section,
    selectedTenantId: state.selectedTenantId,
    selectedLearnerId: state.selectedLearnerId,
    selectedSubscriptionId: state.selectedSubscriptionId,
    selectedPlanId: state.selectedPlanId,
    selectedPaymentMethod: state.selectedPaymentMethod,
    auditLog: state.auditLog,
    subscriptions: state.subscriptions,
    platformInvoices: state.platformInvoices,
    schoolFeeInvoices: state.schoolFeeInvoices,
    payments: state.payments,
    learners: state.learners,
    memberships: state.memberships,
    questionBank: state.questionBank,
    curriculumSources: state.curriculumSources,
    curriculumJobs: state.curriculumJobs,
    notifications: state.notifications,
    checkout: state.checkout,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadState() {
  const base = createInitialState();
  if (typeof window === 'undefined' || !window.localStorage) return base;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return base;
  try {
    const saved = JSON.parse(raw);
    return {
      ...base,
      ...saved,
      plans: base.plans,
      tenants: base.tenants,
      providerStatus: 'Not connected',
    };
  } catch {
    return base;
  }
}

function bindEvents(root, stateRef, rerender) {
  root.querySelectorAll('[data-action="set-role"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = setRoleAndResetSection(stateRef.current, button.dataset.role);
      rerender();
    });
  });
  root.querySelectorAll('[data-action="set-section"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = setSectionIfVisible(stateRef.current, button.dataset.section);
      rerender();
    });
  });
  root.querySelectorAll('[data-action="set-locale"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = setLocale(stateRef.current, button.dataset.locale);
      rerender();
    });
  });
  root.querySelectorAll('[data-action="set-tenant"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = { ...stateRef.current, selectedTenantId: button.dataset.tenantId };
      rerender();
    });
  });
  root.querySelectorAll('[data-action="set-learner"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = { ...stateRef.current, selectedLearnerId: button.dataset.learnerId };
      rerender();
    });
  });
  root.querySelectorAll('[data-action="set-plan"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = { ...stateRef.current, selectedPlanId: button.dataset.planId };
      rerender();
    });
  });
  root.querySelectorAll('[data-action="set-payment-method"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = { ...stateRef.current, selectedPaymentMethod: button.dataset.method };
      rerender();
    });
  });
  root.querySelectorAll('[data-action="subscription-action"]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!window.confirm(`${button.dataset.subAction} ${button.dataset.subId}?`)) return;
      stateRef.current = applySubscriptionAction(stateRef.current, button.dataset.subId, button.dataset.subAction);
      rerender();
    });
  });
  root.querySelectorAll('[data-action="checkout"]').forEach((button) => {
    button.addEventListener('click', () => {
      const sub = stateRef.current.subscriptions.find((item) => item.id === stateRef.current.selectedSubscriptionId) ?? stateRef.current.subscriptions[0];
      const plan = getPlanById(stateRef.current, stateRef.current.selectedPlanId);
      const amount = planPrice(plan, sub.cycle);
      stateRef.current = applySimulatedPayment(stateRef.current, {
        targetType: sub.scope === 'platform' ? 'platform' : 'tuition',
        targetId: sub.id,
        customer: sub.customerAr ?? sub.customer,
        amount,
        method: stateRef.current.selectedPaymentMethod,
      });
      rerender();
    });
  });
  root.querySelectorAll('[data-action="request-membership"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = requestMembership(stateRef.current, button.dataset.learnerId, stateRef.current.selectedTenantId);
      rerender();
    });
  });
  root.querySelectorAll('[data-action="create-child"]').forEach((button) => {
    button.addEventListener('click', () => {
      const firstName = window.prompt('First name / الاسم الأول', 'Yara')?.trim() || 'Yara';
      const lastName = window.prompt('Last name / اسم العائلة', 'Hassan')?.trim() || 'Hassan';
      stateRef.current = createChildProfile(stateRef.current, {
        firstName,
        lastName,
        schoolAr: 'مدرسة القاهرة التجريبية',
        schoolId: 'school-cairo',
        guardianAr: 'ولي أمر تجريبي',
      });
      rerender();
    });
  });
  root.querySelectorAll('[data-action="practice-session"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = recordPracticeSet(stateRef.current, stateRef.current.selectedLearnerId);
      rerender();
    });
  });
  root.querySelectorAll('[data-action="mark-ready"]').forEach((button) => {
    button.addEventListener('click', () => {
      stateRef.current = markCurriculumReady(stateRef.current, 'src-003');
      rerender();
    });
  });
  const searchInput = root.querySelector('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      stateRef.current = { ...stateRef.current, searchTerm: searchInput.value };
      rerender(false);
    });
  }
}

function mount() {
  const root = document.getElementById('app');
  if (!root) return;
  const stateRef = { current: loadState() };
  const rerender = (persist = true) => {
    root.innerHTML = renderApp(stateRef.current);
    bindEvents(root, stateRef, rerender);
    if (persist) saveState(stateRef.current);
  };
  rerender(false);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.MySchoolDemo = {
    createInitialState,
    getVisibleSections,
    calculateSubscriptionAmount,
    applySubscriptionAction,
    applySimulatedPayment,
    createChildProfile,
    requestMembership,
    recordPracticeSet,
    markCurriculumReady,
  };
  window.addEventListener('DOMContentLoaded', mount);
}
