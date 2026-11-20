const DAYS = ["اليوم 1","اليوم 2","اليوم 3","اليوم 4","اليوم 5","اليوم 6","اليوم 7"];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}
function money(value, currency="EGP") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ar-EG",{style:"currency",currency:String(currency || "EGP").trim(),maximumFractionDigits:2}).format(Number(value));
}
function dateText(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return esc(value);
  return new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium",timeZone:"Africa/Cairo"}).format(date);
}
function statusLabel(value) {
  const labels = {
    active:"نشط",inactive:"غير نشط",archived:"مؤرشف",draft:"مسودة",published:"منشور",
    scheduled:"مجدول",completed:"مكتمل",cancelled:"ملغي",open:"مفتوح",in_progress:"قيد المعالجة",
    waiting:"بانتظار رد",resolved:"تم الحل",closed:"مغلق",low:"منخفض",normal:"عادي",
    high:"مرتفع",urgent:"عاجل",paid:"مدفوع",late:"متأخر",present:"حاضر",absent:"غائب"
  };
  return labels[value] ?? value ?? "—";
}
function badge(status) {
  const key=String(status??"").toLowerCase().replace(/[^a-z0-9_-]/g,"");
  return \`<span class="status-badge status-\${key}">\${esc(statusLabel(status))}</span>\`;
}
function table(headers, rows, empty="لا توجد سجلات في قاعدة البيانات.") {
  if (!rows.length) return \`<div class="empty-state"><span class="empty-icon">⌕</span><strong>\${esc(empty)}</strong></div>\`;
  return \`<div class="table-wrap"><table><thead><tr>\${headers.map((h)=>\`<th>\${esc(h)}</th>\`).join("")}</tr></thead><tbody>\${rows.join("")}</tbody></table></div>\`;
}
function heading(title, description, action="") {
  return \`<div class="section-head"><div><h2>\${esc(title)}</h2><p>\${esc(description)}</p></div>\${action}</div>\`;
}
function formPanel(id, html) {
  return \`<section id="\${id}" class="panel form-panel hidden">\${html}</section>\`;
}
function schoolField(context, schools) {
  if (context.schoolId) return "";
  const rows=schools.filter((s)=>!context.tenantId||s.tenant_id===context.tenantId);
  return \`<label class="field"><span>المدرسة</span><select name="school_id" required><option value="">اختر مدرسة</option>\${rows.map((s)=>\`<option value="\${esc(s.id)}">\${esc(s.name)}</option>\`).join("")}</select></label>\`;
}
function selectOptions(items, label, extra=()=>"", selectedId="") {
  return items.map((item)=>\`<option value="\${esc(item.id)}" data-school-id="\${esc(item.school_id)}" \${item.id===selectedId?"selected":""}>\${esc(label(item))}\${extra(item)}</option>\`).join("");
}

export function renderFees(data, context, permissions) {
  const plans=new Map(data.plans.map((p)=>[p.id,p]));
  const students=new Map(data.students.map((s)=>[s.id,s]));
  const installmentsByAccount=new Map();
  const paymentsByAccount=new Map();
  for (const row of data.installments) {
    const list=installmentsByAccount.get(row.fee_account_id)??[];
    list.push(row); installmentsByAccount.set(row.fee_account_id,list);
  }
  for (const row of data.payments) {
    const list=paymentsByAccount.get(row.fee_account_id)??[];
    list.push(row); paymentsByAccount.set(row.fee_account_id,list);
  }
  const accountRows=data.accounts.map((account)=>{
    const plan=plans.get(account.fee_plan_id);
    const installments=installmentsByAccount.get(account.id)??[];
    const payments=paymentsByAccount.get(account.id)??[];
    const scheduled=installments.length
      ? installments.reduce((sum,item)=>sum+Number(item.amount),0)
      : Number(plan?.total_amount??0);
    const paid=payments.reduce((sum,item)=>sum+Number(item.amount),0);
    const discounted=Math.max(0,scheduled-Number(account.discount_amount??0));
    const remaining=Math.max(0,discounted-paid);
    const student=students.get(account.student_id);
    return \`<tr><td><strong>\${esc(student?[student.first_name,student.middle_name,student.last_name].filter(Boolean).join(" "):account.student_id)}</strong><small>\${esc(student?.student_number??"")}</small></td><td>\${esc(plan?.name??"—")}</td><td>\${money(discounted,plan?.currency)}</td><td>\${money(paid,plan?.currency)}</td><td>\${money(remaining,plan?.currency)}</td><td>\${badge(remaining===0?"paid":"open")}</td></tr>\`;
  });
  const canManage=permissions.has("fees.manage");
  const canRecord=permissions.has("fees.payments.record");
  const planForm=canManage? \`
    <form class="form-grid compact-form" data-form="create-fee-plan">
      \${schoolField(context,data.schools)}
      <label class="field"><span>السنة الدراسية</span><select name="academic_year_id" required><option value="">اختر سنة دراسية</option>\${selectOptions(data.years,(x)=>x.name)}</select></label>
      <label class="field"><span>اسم الخطة</span><input name="name" required maxlength="160"/></label>
      <label class="field"><span>إجمالي الخطة</span><input name="total_amount" type="number" min="0" step="0.01" required/></label>
      <label class="field"><span>العملة</span><input name="currency" value="EGP" minlength="3" maxlength="3" required/></label>
      <label class="check-field"><input type="checkbox" name="is_active" checked/><span>خطة نشطة</span></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.years.length?"disabled":""}>إنشاء خطة رسوم</button></div>
    </form>\`:"";
  const accountForm=canManage? \`
    <form class="form-grid compact-form" data-form="create-fee-account">
      <label class="field"><span>الطالب</span><select name="student_id" required><option value="">اختر طالبًا</option>\${selectOptions(data.students,(s)=>[s.first_name,s.middle_name,s.last_name].filter(Boolean).join(" "))}</select></label>
      <label class="field"><span>خطة الرسوم</span><select name="fee_plan_id" required><option value="">اختر خطة</option>\${selectOptions(data.plans,(p)=>p.name,(p)=>\` — \${money(p.total_amount,p.currency)}\`)}</select></label>
      <label class="field"><span>الخصم</span><input name="discount_amount" type="number" min="0" step="0.01" value="0"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.students.length||!data.plans.length?"disabled":""}>ربط الخطة بالطالب</button></div>
    </form>\`:"";
  const installmentForm=canManage? \`
    <form class="form-grid compact-form" data-form="create-fee-installment">
      <label class="field"><span>حساب الرسوم</span><select name="fee_account_id" required><option value="">اختر حسابًا</option>\${data.accounts.map((a)=>\`<option value="\${esc(a.id)}">\${esc(students.get(a.student_id)?[students.get(a.student_id).first_name,students.get(a.student_id).last_name].join(" "):a.student_id)}</option>\`).join("")}</select></label>
      <label class="field"><span>رقم القسط</span><input name="sequence_number" type="number" min="1" max="100" required/></label>
      <label class="field"><span>تاريخ الاستحقاق</span><input name="due_on" type="date" required/></label>
      <label class="field"><span>قيمة القسط</span><input name="amount" type="number" min="0" step="0.01" required/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.accounts.length?"disabled":""}>إضافة قسط</button></div>
    </form>\`:"";
  const paymentForm=canRecord? \`
    <form class="form-grid compact-form" data-form="record-fee-payment">
      <label class="field"><span>حساب الرسوم</span><select name="fee_account_id" required><option value="">اختر حسابًا</option>\${data.accounts.map((a)=>\`<option value="\${esc(a.id)}">\${esc(students.get(a.student_id)?[students.get(a.student_id).first_name,students.get(a.student_id).last_name].join(" "):a.student_id)}</option>\`).join("")}</select></label>
      <label class="field"><span>رقم الإيصال</span><input name="receipt_number" required maxlength="100"/></label>
      <label class="field"><span>المبلغ المستلم</span><input name="amount" type="number" min="0.01" step="0.01" required/></label>
      <label class="field"><span>طريقة الدفع</span><select name="payment_method"><option value="cash">نقدي</option><option value="bank_transfer">تحويل بنكي</option><option value="card">بطاقة</option><option value="cheque">شيك</option><option value="other">أخرى</option></select></label>
      <label class="field"><span>رقم مرجعي</span><input name="reference" maxlength="180"/></label>
      <label class="field"><span>ملاحظات</span><input name="notes" maxlength="500"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.accounts.length?"disabled":""}>تسجيل الدفعة المستلمة</button></div>
    </form>\`:"";
  const instalRows=data.installments.map((row)=>\`<tr><td>\${esc(row.fee_account_id)}</td><td>\${row.sequence_number}</td><td>\${dateText(row.due_on)}</td><td>\${money(row.amount)}</td></tr>\`);
  const paymentRows=data.payments.map((row)=>\`<tr><td>\${esc(row.receipt_number)}</td><td>\${esc(row.fee_account_id)}</td><td>\${money(row.amount,row.currency)}</td><td>\${esc(row.payment_method)}</td><td>\${dateText(row.received_at)}</td></tr>\`);
  const plansRows=data.plans.map((row)=>\`<tr><td><strong>\${esc(row.name)}</strong></td><td>\${money(row.total_amount,row.currency)}</td><td>\${esc(row.currency)}</td><td>\${badge(row.is_active?"active":"inactive")}</td></tr>\`);
  const notices=["parent","student"].includes(context.roleKey)
    ? \`<div class="info-banner">تعرض هذه الصفحة الحسابات والأقساط والمدفوعات المسجلة فقط. لا توجد بوابة دفع إلكترونية مفعّلة في إعدادات الإنتاج، لذلك لن يظهر زر دفع غير متصل بخدمة فعلية.</div>\`
    : "";
  return heading("الرسوم والمدفوعات","الحسابات وخطط الرسوم والأقساط والمدفوعات المسجلة فعليًا.")
    + notices
    + (canManage?\`<div class="section-head"><div><h3>إدارة حسابات الرسوم</h3><p>الخطط والحسابات تخص المدرسة والسنة الدراسية المختارة.</p></div><button class="button button-secondary" data-action="toggle-form" data-target="fee-plan-form">خطة جديدة</button></div>\`:"")
    + (canManage?formPanel("fee-plan-form",planForm):"")
    + (canManage? \`<section class="panel"><div class="panel-heading"><div><h3>خطط الرسوم</h3></div><button class="button button-small button-secondary" data-action="toggle-form" data-target="fee-account-form">ربط خطة بطالب</button></div>\${table(["الخطة","الإجمالي","العملة","الحالة"],plansRows,"لا توجد خطط رسوم مسجلة.")}</section>\`:"")
    + (canManage?formPanel("fee-account-form",accountForm):"")
    + \`<section class="panel"><div class="panel-heading"><div><h3>حسابات الطلاب</h3><p>المستحق يحسب من الأقساط المسجلة أو إجمالي الخطة، بعد الخصم والمدفوعات المسجلة.</p></div>\${canManage?\`<button class="button button-small button-secondary" data-action="toggle-form" data-target="fee-installment-form">إضافة قسط</button>\`:""}</div>\${table(["الطالب","الخطة","المستحق بعد الخصم","المدفوع","المتبقي","الحالة"],accountRows,"لا توجد حسابات رسوم متاحة لهذا الحساب.")}</section>\`
    + (canManage?formPanel("fee-installment-form",installmentForm):"")
    + (canRecord?\`<section class="panel"><div class="panel-heading"><div><h3>تسجيل دفعة</h3><p>يسجل مبلغًا مستلمًا بالفعل، ولا ينفّذ تحصيلًا إلكترونيًا.</p></div></div>\${paymentForm}</section>\`:"")
    + \`<section class="panel"><div class="panel-heading"><div><h3>الأقساط المسجلة</h3></div></div>\${table(["حساب الرسوم","رقم القسط","الاستحقاق","المبلغ"],instalRows,"لا توجد أقساط مسجلة.")}</section>\`
    + \`<section class="panel"><div class="panel-heading"><div><h3>المدفوعات المسجلة</h3></div></div>\${table(["الإيصال","حساب الرسوم","المبلغ","الطريقة","تاريخ الاستلام"],paymentRows,"لا توجد مدفوعات مسجلة.")}</section>\`;
}

export function renderTimetable(data, context, permissions) {
  const classMap=new Map(data.classes.map((x)=>[x.id,x.name]));
  const subjectMap=new Map(data.subjects.map((x)=>[x.id,x.name]));
  const teacherMap=new Map(data.teachers.map((x)=>[x.id,[x.first_name,x.last_name].filter(Boolean).join(" ")]));
  const entries=data.entries.map((row)=>\`<tr><td>\${DAYS[row.day_of_week-1]??row.day_of_week}</td><td>\${row.period_number}</td><td>\${esc(row.starts_at)} — \${esc(row.ends_at)}</td><td>\${esc(classMap.get(row.class_id)??row.class_id)}</td><td>\${esc(subjectMap.get(row.subject_id)??row.subject_id)}</td><td>\${esc(teacherMap.get(row.teacher_id)??row.teacher_id)}</td><td>\${esc(row.room_name||"—")}</td><td>\${badge(row.status)}</td><td>\${permissions.has("timetable.manage")&&row.status==="draft"?\`<button class="button button-small button-secondary" data-action="publish-timetable" data-id="\${esc(row.id)}">نشر</button>\`:""}</td></tr>\`);
  const form=permissions.has("timetable.manage")?\`
    <form class="form-grid compact-form" data-form="create-timetable-entry">
      \${schoolField(context,data.schools)}
      <label class="field"><span>السنة الدراسية</span><select name="academic_year_id" required><option value="">اختر سنة</option>\${selectOptions(data.years,(x)=>x.name)}</select></label>
      <label class="field"><span>الفصل</span><select name="class_id" required><option value="">اختر فصلًا</option>\${selectOptions(data.classes,(x)=>x.name)}</select></label>
      <label class="field"><span>المادة</span><select name="subject_id" required><option value="">اختر مادة</option>\${selectOptions(data.subjects,(x)=>x.name)}</select></label>
      <label class="field"><span>المعلم</span><select name="teacher_id" required><option value="">اختر معلمًا</option>\${selectOptions(data.teachers,(x)=>[x.first_name,x.last_name].filter(Boolean).join(" "))}</select></label>
      <label class="field"><span>اليوم (1–7 حسب إعداد المدرسة)</span><select name="day_of_week" required>\${DAYS.map((x,i)=>\`<option value="\${i+1}">\${x}</option>\`).join("")}</select></label>
      <label class="field"><span>رقم الحصة</span><input name="period_number" type="number" min="1" max="20" required/></label>
      <label class="field"><span>من</span><input name="starts_at" type="time" required/></label>
      <label class="field"><span>إلى</span><input name="ends_at" type="time" required/></label>
      <label class="field"><span>الغرفة</span><input name="room_name" maxlength="80"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.years.length||!data.classes.length||!data.subjects.length||!data.teachers.length?"disabled":""}>حفظ مسودة الحصة</button></div>
    </form>\`:"";
  return heading("الجدول الدراسي","الحصص المنشورة والمسودات المسجلة في نطاق المدرسة.",permissions.has("timetable.manage")?\`<button class="button button-secondary" data-action="toggle-form" data-target="timetable-create-form">إضافة حصة</button>\`:"")
    + (permissions.has("timetable.manage")?formPanel("timetable-create-form",form):"")
    + table(["اليوم","الحصة","الوقت","الفصل","المادة","المعلم","الغرفة","الحالة","إجراء"],entries,"لا توجد حصص جدول مسجلة في هذا النطاق.");
}

export function renderExams(data, context, permissions) {
  const classMap=new Map(data.classes.map((x)=>[x.id,x.name]));
  const subjectMap=new Map(data.subjects.map((x)=>[x.id,x.name]));
  const students=new Map(data.students.map((x)=>[x.id,x]));
  const rows=data.sessions.map((exam)=>\`<tr><td><strong>\${esc(exam.title)}</strong><small>\${esc(exam.exam_type)}</small></td><td>\${esc(classMap.get(exam.class_id)??exam.class_id)}</td><td>\${esc(subjectMap.get(exam.subject_id)??exam.subject_id)}</td><td>\${dateText(exam.scheduled_at)}</td><td>\${exam.duration_minutes} دقيقة</td><td>\${money(exam.max_score)}</td><td>\${badge(exam.status)}</td><td>\${data.candidates.filter((x)=>x.exam_session_id===exam.id).length}</td><td>\${permissions.has("exams.manage")&&exam.status==="draft"?\`<button class="button button-small button-secondary" data-action="schedule-exam" data-id="\${esc(exam.id)}">جدولة</button>\`:""}</td></tr>\`);
  const form=permissions.has("exams.manage")?\`
    <form class="form-grid compact-form" data-form="create-exam">
      \${schoolField(context,data.schools)}
      <label class="field"><span>الفصل</span><select name="class_id" required><option value="">اختر فصلًا</option>\${selectOptions(data.classes,(x)=>x.name)}</select></label>
      <label class="field"><span>المادة</span><select name="subject_id" required><option value="">اختر مادة</option>\${selectOptions(data.subjects,(x)=>x.name)}</select></label>
      <label class="field"><span>عنوان الامتحان</span><input name="title" required maxlength="180"/></label>
      <label class="field"><span>النوع</span><select name="exam_type"><option value="quiz">اختبار قصير</option><option value="midterm">منتصف الفصل</option><option value="final">نهائي</option><option value="practical">عملي</option><option value="oral">شفهي</option><option value="other">أخرى</option></select></label>
      <label class="field"><span>موعد الامتحان</span><input name="scheduled_at" type="datetime-local" required/></label>
      <label class="field"><span>المدة بالدقائق</span><input name="duration_minutes" type="number" min="5" max="600" value="60" required/></label>
      <label class="field"><span>الدرجة القصوى</span><input name="max_score" type="number" min="0.01" step="0.01" required/></label>
      <label class="field"><span>القاعة</span><input name="room_name" maxlength="80"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.classes.length||!data.subjects.length?"disabled":""}>حفظ كمسودة</button></div>
    </form>\`:"";
  const candidateForm=permissions.has("exams.manage")?\`
    <form class="form-grid compact-form" data-form="add-exam-candidate">
      <label class="field"><span>جلسة الامتحان</span><select name="exam_session_id" required><option value="">اختر جلسة</option>\${data.sessions.map((x)=>\`<option value="\${esc(x.id)}" data-school-id="\${esc(x.school_id)}">\${esc(x.title)}</option>\`).join("")}</select></label>
      <label class="field"><span>الطالب</span><select name="student_id" required><option value="">اختر طالبًا</option>\${data.students.map((x)=>\`<option value="\${esc(x.id)}" data-school-id="\${esc(x.school_id)}">\${esc([x.first_name,x.middle_name,x.last_name].filter(Boolean).join(" "))} — \${esc(x.student_number||"")}</option>\`).join("")}</select></label>
      <label class="field"><span>رقم الجلوس</span><input name="seat_number" required maxlength="60"/></label>
      <label class="field"><span>اللجنة</span><input name="committee_name" maxlength="100"/></label>
      <div class="form-actions"><button class="button button-primary" type="submit" \${!data.sessions.length||!data.students.length?"disabled":""}>إضافة مرشح</button></div>
    </form>\`:"";
  const candidateRows=data.candidates.map((row)=> {
    const student=students.get(row.student_id);
    return \`<tr><td>\${esc(data.sessions.find((x)=>x.id===row.exam_session_id)?.title??row.exam_session_id)}</td><td>\${esc(student?[student.first_name,student.middle_name,student.last_name].filter(Boolean).join(" "):row.student_id)}</td><td>\${esc(row.seat_number)}</td><td>\${esc(row.committee_name||"—")}</td></tr>\`;
  });
  return heading("الامتحانات","جلسات الامتحانات ومواعيدها والمرشحون المسجلون.",permissions.has("exams.manage")?\`<div class="action-row"><button class="button button-secondary" data-action="toggle-form" data-target="exam-create-form">إنشاء امتحان</button><button class="button button-secondary" data-action="toggle-form" data-target="exam-candidate-form">إضافة مرشح</button></div>\`:"")
    + (permissions.has("exams.manage")?formPanel("exam-create-form",form):"")
    + (permissions.has("exams.manage")?formPanel("exam-candidate-form",candidateForm):"")
    + table(["الامتحان","الفصل","المادة","الموعد","المدة","الدرجة","الحالة","المرشحون","إجراء"],rows,"لا توجد جلسات امتحانات في هذا النطاق.")
    + \`<section class="panel"><div class="panel-heading"><div><h3>قائمة المرشحين</h3><p>المرشحون الذين تسمح صلاحياتك بقراءتهم.</p></div></div>\${table(["جلسة الامتحان","الطالب","رقم الجلوس","اللجنة"],candidateRows,"لا توجد سجلات مرشحين متاحة.")}</section>\`;
}

export function renderContent(data, context, permissions) {
  const rows=data.rows.map((item)=>\`<tr><td><strong>\${esc(item.title)}</strong><small>\${esc(item.summary||"")}</small></td><td>\${esc(item.resource_type)}</td><td>\${badge(item.status)}</td><td>\${dateText(item.published_at)}</td><td>\${dateText(item.updated_at)}</td><td>\${permissions.has("content.manage")&&item.status==="draft"?\`<button class="button button-small button-secondary" data-action="publish-content" data-id="\${esc(item.id)}">نشر</button>\`:""}</td></tr>\`);
  const classes=data.classes??[];
  const subjects=data.subjects??[];
  const form=permissions.has("content.manage")?\`
    <form class="form-grid compact-form" data-form="create-content">
      \${schoolField(context,data.schools)}
      <label class="field"><span>العنوان</span><input name="title" required maxlength="180"/></label>
      <label class="field"><span>نوع المورد</span><input name="resource_type" required maxlength="80" placeholder="نوع المحتوى كما تعتمدونه"/></label>
      <label class="field"><span>الفصل (اختياري)</span><select name="class_id"><option value="">كل المدرسة</option>\${selectOptions(classes,(x)=>x.name)}</select></label>
      <label class="field"><span>المادة (اختياري)</span><select name="subject_id"><option value="">بدون تحديد مادة</option>\${selectOptions(subjects,(x)=>x.name)}</select></label>
      <label class="field field-wide"><span>ملخص</span><textarea name="summary" rows="2" maxlength="1000"></textarea></label>
      <label class="field field-wide"><span>المحتوى</span><textarea name="body" rows="6" required maxlength="30000"></textarea></label>
      <div class="form-actions"><button class="button button-primary" type="submit">حفظ كمسودة</button></div>
    </form>\`:"";
  return heading("المحتوى التعليمي","المصادر والمنشورات التعليمية الموجودة فعلًا في مساحة المدرسة.",permissions.has("content.manage")?\`<button class="button button-secondary" data-action="toggle-form" data-target="content-create-form">إضافة محتوى</button>\`:"")
    + (permissions.has("content.manage")?formPanel("content-create-form",form):"")
    + table(["العنوان","النوع","الحالة","تاريخ النشر","آخر تحديث","إجراء"],rows,"لا يوجد محتوى مسجل أو منشور في هذا النطاق.");
}

export function renderSupport(data, context, permissions, userId) {
  const rows=data.rows.map((ticket)=>\`<tr><td><strong>\${esc(ticket.title)}</strong><small>\${esc(ticket.category)} · \${esc(ticket.source)}</small></td><td>\${badge(ticket.status)}</td><td>\${badge(ticket.priority)}</td><td>\${dateText(ticket.created_at)}</td><td>\${dateText(ticket.updated_at)}</td><td>\${permissions.has("support.manage")&& !["closed","resolved"].includes(ticket.status)?\`<button class="button button-small button-secondary" data-action="resolve-ticket" data-id="\${esc(ticket.id)}">حل الطلب</button>\`:""}</td></tr>\`);
  const form=permissions.has("support.create")||permissions.has("support.manage")?\`
    <form class="form-grid compact-form" data-form="create-support-ticket">
      \${schoolField(context,data.schools)}
      <label class="field"><span>العنوان</span><input name="title" required maxlength="180"/></label>
      <label class="field"><span>التصنيف</span><input name="category" required maxlength="80"/></label>
      <label class="field"><span>الأولوية</span><select name="priority"><option value="normal">عادية</option><option value="low">منخفضة</option><option value="high">مرتفعة</option><option value="urgent">عاجلة</option></select></label>
      <label class="field field-wide"><span>وصف المشكلة أو الطلب</span><textarea name="description" rows="5" required maxlength="12000"></textarea></label>
      <div class="form-actions"><button class="button button-primary" type="submit">إرسال طلب الدعم</button></div>
    </form>\`:"";
  return heading("الدعم الفني","طلبات الدعم التي أنشأتها أو تسمح لك صلاحياتك بمتابعتها.",permissions.has("support.create")||permissions.has("support.manage")?\`<button class="button button-secondary" data-action="toggle-form" data-target="support-create-form">طلب جديد</button>\`:"")
    + ((permissions.has("support.create")||permissions.has("support.manage"))?formPanel("support-create-form",form):"")
    + table(["الطلب","الحالة","الأولوية","تاريخ الإنشاء","آخر تحديث","إجراء"],rows,"لا توجد طلبات دعم متاحة لهذا الحساب.");
}
