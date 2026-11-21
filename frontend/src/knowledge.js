import { getNextLearningAction } from "./engagement.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function empty(message, hint = "") {
  return `<div class="empty-state"><span class="empty-icon">⌕</span><strong>${esc(message)}</strong>${hint ? `<p>${esc(hint)}</p>` : ""}</div>`;
}

function head(title, description = "") {
  return `<div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div></div>`;
}

function panel(title, body) {
  return `<section class="panel"><div class="panel-heading"><h3>${esc(title)}</h3></div>${body}</section>`;
}

function table(headers, rows, emptyMessage = "لا توجد سجلات لعرضها.") {
  if (!rows.length) return empty(emptyMessage);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function field(label, name, type = "text", options = {}) {
  if (type === "select") {
    return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}" ${options.required ? "required" : ""}>${(options.choices ?? []).map((item) => `<option value="${esc(item.value)}" ${item.disabled ? "disabled" : ""}>${esc(item.label)}</option>`).join("")}</select></label>`;
  }
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${type}" ${options.required ? "required" : ""} ${options.maxLength ? `maxlength="${options.maxLength}"` : ""} ${options.pattern ? `pattern="${options.pattern}"` : ""} ${options.placeholder ? `placeholder="${esc(options.placeholder)}"` : ""} ${options.dir ? `dir="${options.dir}"` : ""} ${options.value ? `value="${esc(options.value)}"` : ""}/></label>`;
}

function status(value) {
  const labels = {
    draft: "مسودة", active: "نشط", blocked: "موقوف", archived: "مؤرشف",
    queued: "في قائمة المعالجة", processing: "قيد المعالجة", extracted: "تم استخراج النص",
    ready: "جاهز للمراجعة", failed: "فشلت المعالجة", pending: "بانتظار المعالجة",
    pending_review: "بانتظار المراجعة", approved: "معتمد", denied: "مرفوض",
    restricted: "مقيّد", expired: "منتهي",
  };
  const safe = String(value ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `<span class="status-badge status-${safe}">${esc(labels[value] ?? value ?? "—")}</span>`;
}

function sourceVersions(source, versions) {
  return versions.filter((item) => item.source_id === source.id);
}

function metricCard(title, value, note = "") {
  return `<article class="metric-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
}

function renderGrowthPanel(data) {
  const sources = data.sources ?? [];
  const versions = data.versions ?? [];
  const concepts = data.concepts ?? [];
  const questions = data.questions ?? [];
  const mappings = data.mappings ?? [];
  const approvedSources = sources.filter((source) => source.status === "active" && source.rights_status === "approved");
  const readyVersions = versions.filter((version) => version.ingestion_status === "ready");
  const readinessScore = Math.min(100,
    (sources.length ? 15 : 0)
    + (approvedSources.length ? 20 : 0)
    + (readyVersions.length ? 20 : 0)
    + (concepts.length ? 15 : 0)
    + (questions.length ? 15 : 0)
    + (mappings.length ? 15 : 0),
  );
  const checklist = [
    ["تسجيل المدرسة ذاتيًا", "النمو يبدأ من طلب بسيط ثم تأهيل آلي، وليس من مكالمة تعريفية طويلة."],
    ["AI Sales Agent منفصل", "نفس المزود ممكن، لكن الـRAG والأسلوب والصلاحيات لازم يكونوا مختلفين عن المساعد التعليمي."],
    ["إغلاق الصفقة عندك", "الـAI يجمع الاحتياج ويصفّي الـLeads، وأنت تقفل فقط الحالات الجادة."],
    ["Zero-budget mode", "لا نربط النمو باشتراكات مدفوعة قبل أول إيراد حقيقي."],
    ["Pilot ثم توسّع", "ابدأ ببضع مدارس/معلمين مختارين، ثم وسّع فقط بعد تحقق واضح."],
  ];
  const checklistRows = checklist.map(([title, note]) => `<div class="list-row"><strong>${esc(title)}</strong><small>${esc(note)}</small></div>`).join("");
  return `
    <section class="panel growth-ops-panel">
      <div class="section-head">
        <div>
          <h3>النمو والتفعيل</h3>
          <p>لوحة مختصرة تجمع جاهزية المحتوى، وخطة التسجيل الذاتي، ونقاط التشغيل التي تحتاج تفعيل قبل التوسع.</p>
        </div>
        <span class="status-badge status-active">جاهز للتوسع التدريجي</span>
      </div>
      <div class="metrics-grid">
        ${metricCard("مصادر المعرفة", String(sources.length), "الكتب ونماذج الإجابة المسجلة")}
        ${metricCard("الإصدارات الجاهزة", String(readyVersions.length), "ما وصل لحالة المعالجة الجاهزة")}
        ${metricCard("مفاهيم المنهج", String(concepts.length), "خريطة المفاهيم المتاحة الآن")}
        ${metricCard("الأسئلة المربوطة", String(mappings.length), "روابط الأسئلة بالمفاهيم")}
        ${metricCard("قابلية الإطلاق", `${readinessScore}%`, "مؤشر تشغيل داخلي وليس مقياسًا تجاريًا نهائيًا")}
      </div>
      <div class="info-banner">هذا القسم لا يعتمد على إنفاق مدفوع. هو مصمم ليرشدك لما يجب أن يكون جاهزًا قبل استقبال أول مدارس أو معلمين أو طلاب مدفوعين.</div>
      <div class="growth-checklist">${checklistRows}</div>
    </section>`;
}

export function renderKnowledgeConsole(data) {
  const growthPanel = renderGrowthPanel(data);
  const sourceCards = (data.sources ?? []).map((source) => {
    const versions = sourceVersions(source, data.versions ?? []);
    const kind = source.source_kind === "model_answer_document" ? "نموذج إجابة" : "محتوى منهج";
    const versionRows = versions.length ? versions.map((version) => `
      <div class="list-row">
        <div><strong>${esc(version.version_label)}</strong><small>${esc(version.academic_year_label ?? "من دون سنة دراسية")}</small></div>
        <div>${status(version.ingestion_status)}</div>
        <small>${version.page_count == null ? "عدد الصفحات غير معروف" : `${esc(version.page_count)} صفحة`}</small>
        ${version.source_url ? `<a href="${esc(version.source_url)}" target="_blank" rel="noopener noreferrer">فتح المصدر</a>` : ""}
        <small>${esc(version.extraction_profile ?? "standard")}</small>
      </div>`).join("") : empty("لا توجد إصدارات مسجلة لهذا المصدر.");
    const requiredUse = source.source_kind === "model_answer_document"
      ? `<label class="check-field"><input type="checkbox" name="permitted_uses" value="model_answer_retrieval" checked/><span>استخدام نماذج الإجابة في وضع التعلم فقط</span></label>`
      : `<label class="check-field"><input type="checkbox" name="permitted_uses" value="rag" checked/><span>الشرح والبحث المعتمد RAG</span></label>
         <label class="check-field"><input type="checkbox" name="permitted_uses" value="question_generation"/><span>توليد أسئلة مرتبطة بالمحتوى</span></label>`;
    const latestReady = versions[0]?.ingestion_status === "ready";
    const reviewForm = source.status === "active" && source.rights_status === "approved" ? "" : `
      <form class="form-grid compact-form knowledge-review-form" data-form="review-knowledge-source" data-source-id="${esc(source.id)}">
        <input type="hidden" name="source_id" value="${esc(source.id)}"/>
        ${field("أساس المراجعة","rights_basis","text",{required:true,maxLength:1000,placeholder:"أساس السماح باستخدام هذا المصدر"})}
        ${field("مرجع المراجعة (اختياري)","rights_reference","text",{maxLength:2048,placeholder:"رابط أو مرجع داخلي"})}
        <label class="field"><span>قرار المراجعة</span><select name="decision"><option value="approve" ${latestReady ? "" : "disabled"}>اعتماد المصدر</option><option value="reject">رفض المصدر</option></select></label>
        <div class="form-actions">${requiredUse}<button class="button button-primary" type="submit" ${latestReady ? "" : "disabled"}>حفظ قرار المراجعة</button></div>
        ${latestReady ? "" : `<p class="field-hint">لا يمكن الاعتماد قبل اكتمال المعالجة وإنتاج المقاطع المطلوبة. الرفض متاح في أي وقت.</p>`}
      </form>`;
    return `<article class="panel knowledge-source-card">
      <div class="section-head"><div><h3>${esc(source.title)}</h3><p>${esc(kind)} · ${esc(source.country_code)} · ${esc(source.subject_name)} · ${esc(source.grade_label)}</p></div><div>${status(source.status)} ${status(source.rights_status)}</div></div>
      <div class="list-row"><span>النظام/المجلس</span><strong>${esc([source.education_system,source.curriculum_board].filter(Boolean).join(" / ") || "غير محدد")}</strong></div>
      <div class="list-row"><span>اللغة</span><strong>${esc(source.language_code)}</strong></div>
      ${versionRows}
      ${reviewForm}
    </article>`;
  }).join("");

  const subjectOptions = [...new Map((data.questions ?? []).map((q) => [q.subject_code, q])).values()];
  const questionOptions = (data.questions ?? []).map((q) => ({
    value:q.id, label:`${q.subject_code} / ${q.grade_code} · ${String(q.question_text).slice(0,100)}`,
  }));
  const conceptOptions = (data.concepts ?? []).map((c) => ({
    value:c.id,label:`${c.country_code} / ${c.subject_code} / ${c.grade_code} · ${c.title}`,
  }));
  const mappingRows = (data.mappings ?? []).map((mapping) => `
    <tr><td>${esc(mapping.question_id)}</td><td>${esc(mapping.concept?.title ?? mapping.concept_id)}</td><td>${esc(mapping.mapping_type)}</td><td>${esc(mapping.relevance_weight)}</td></tr>`);
  const conceptRows = (data.concepts ?? []).map((concept) => `
    <tr><td>${esc(concept.country_code)}</td><td>${esc(concept.subject_code)}</td><td>${esc(concept.grade_code)}</td><td><strong>${esc(concept.title)}</strong><small>${esc(concept.concept_key)}</small></td><td>${status(concept.status)}</td></tr>`);

  const addSource = `
    <form class="form-grid compact-form" data-form="create-knowledge-source">
      ${field("عنوان المصدر","title","text",{required:true,maxLength:300})}
      ${field("رابط PDF مباشر (HTTPS)","source_url","url",{required:true,maxLength:2048,placeholder:"https://example.org/book.pdf",dir:"ltr"})}
      ${field("نوع المعرفة","knowledge_role","select",{required:true,choices:[{value:"curriculum",label:"كتاب / مرجع منهج"},{value:"model_answer",label:"نموذج إجابة / حلول"}]})}
      ${field("الدولة (ISO 3166-1 alpha-2)","country_code","text",{required:true,maxLength:2,pattern:"[A-Z]{2}",dir:"ltr"})}
      ${field("النظام التعليمي","education_system","text",{maxLength:120})}
      ${field("المجلس / المنهج","curriculum_board","text",{maxLength:160})}
      ${field("رمز المادة","subject_code","text",{required:true,maxLength:80,dir:"ltr"})}
      ${field("اسم المادة","subject_name","text",{required:true,maxLength:160})}
      ${field("رمز الصف","grade_code","text",{required:true,maxLength:80,dir:"ltr"})}
      ${field("اسم / وصف الصف","grade_label","text",{required:true,maxLength:160})}
      ${field("لغة المصدر","language_code","select",{required:true,choices:[{value:"ar",label:"العربية"},{value:"en",label:"English"},{value:"bilingual",label:"ثنائي اللغة"},{value:"other",label:"أخرى"}]})}
      ${field("الإصدار","version_label","text",{required:true,maxLength:120})}
      ${field("السنة الدراسية","academic_year_label","text",{maxLength:80})}
      ${field("سنة النشر","publication_year","number",{maxLength:4})}
      ${field("الناشر","publisher","text",{maxLength:160})}
      ${field("طريقة الاستخراج","extraction_profile","select",{required:true,choices:[{value:"standard",label:"استخراج نص عادي"},{value:"diagram_ocr",label:"OCR ورسوم — غير متاح بعد",disabled:true},{value:"science_hybrid",label:"فيزياء/كيمياء — غير متاح بعد",disabled:true}]})}
      <div class="info-banner">المنصة تسجل الرابط وتحمّل الـPDF مؤقتًا داخل عامل المعالجة. لا يُحفظ الملف في Storage؛ يحتفظ النظام بالنص والمقاطع والـembeddings والهاش والإصدار فقط.</div>
      <div class="form-actions"><button class="button button-primary" type="submit">إضافة المصدر إلى قائمة المعالجة</button></div>
    </form>`;

  const addConcept = `
    <form class="form-grid compact-form" data-form="create-curriculum-concept">
      ${field("الدولة","country_code","text",{required:true,maxLength:2,pattern:"[A-Z]{2}",dir:"ltr"})}
      ${field("النظام التعليمي","education_system","text",{maxLength:120})}
      ${field("المجلس / المنهج","curriculum_board","text",{maxLength:160})}
      ${field("رمز المادة","subject_code","text",{required:true,maxLength:80,dir:"ltr"})}
      ${field("رمز الصف","grade_code","text",{required:true,maxLength:80,dir:"ltr"})}
      ${field("مفتاح المفهوم الفريد","concept_key","text",{required:true,maxLength:120,dir:"ltr"})}
      ${field("اسم المفهوم","title","text",{required:true,maxLength:300})}
      <label class="field"><span>وصف المفهوم</span><textarea name="description" rows="3" maxlength="4000"></textarea></label>
      <div class="form-actions"><button class="button button-primary" type="submit">إضافة المفهوم</button></div>
    </form>`;

  const mapQuestion = `
    <form class="form-grid compact-form" data-form="map-question-concept">
      ${field("السؤال المعتمد","question_id","select",{required:true,choices:[{value:"",label:"اختر سؤالًا"},...questionOptions]})}
      ${field("المفهوم","concept_id","select",{required:true,choices:[{value:"",label:"اختر مفهومًا"},...conceptOptions]})}
      ${field("نوع الربط","mapping_type","select",{required:true,choices:[{value:"assesses",label:"يقيس هذا المفهوم"},{value:"prerequisite",label:"متطلب سابق"},{value:"application",label:"تطبيق للمفهوم"}]})}
      ${field("وزن الصلة (0.1 - 1)","relevance_weight","number",{required:true,value:"1"})}
      <div class="form-actions"><button class="button button-primary" type="submit" ${questionOptions.length&&conceptOptions.length?"":"disabled"}>ربط السؤال بالمفهوم</button></div>
    </form>`;

  return head("محرك المعرفة","إدارة مركزية للمصادر التعليمية ونماذج الإجابة والمفاهيم. الإضافة والاعتماد من خلال المنصة فقط.")
    + growthPanel
    + panel("إضافة كتاب أو نموذج إجابة",addSource)
    + head("المصادر المسجلة", "كل مصدر يظهر بحالته الحقيقية وإصداراته.")
    + (sourceCards || empty("لا توجد مصادر معرفة مسجلة بعد.","لم تتم إضافة كتب أو نماذج إجابة إلى النظام حتى الآن."))
    + panel("خريطة المفاهيم",addConcept)
    + table(["الدولة","المادة","الصف","المفهوم","الحالة"],conceptRows,"لا توجد مفاهيم معتمدة/مسجلة بعد.")
    + panel("ربط سؤال بمفهوم",mapQuestion)
    + table(["معرّف السؤال","المفهوم","العلاقة","الوزن"],mappingRows,"لا توجد روابط أسئلة بمفاهيم بعد.");
}

export function renderLearningDashboard(data) {
  const dateLabel=(value)=>{
    if(!value)return "—";
    const date=new Date(value);
    if(Number.isNaN(date.valueOf()))return esc(value);
    return new Intl.DateTimeFormat("ar-EG",{dateStyle:"medium",timeZone:"Africa/Cairo"}).format(date);
  };
  const classNameById=new Map((data.classes??[]).map((item)=>[item.id,item.name]));
  const classRows=(data.classes??[]).map((item)=>`<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.grade_name||"—")}</td><td>${esc(item.academic_year_name||"—")}</td><td>${status(item.status)}</td></tr>`);
  const lessonRows=(data.lessons??[]).map((item)=>`<tr><td><strong>${esc(item.title)}</strong><small>${esc(item.summary||"")}</small></td><td>${esc(classNameById.get(item.class_id)||"كل المدرسة")}</td><td>${esc(item.resource_type||"درس")}</td><td>${dateLabel(item.published_at)}</td><td><button class="button button-small button-primary" data-action="open-learning-lesson" data-id="${esc(item.id)}">ابدأ التعلم</button></td></tr>`);
  const submissionByPair=new Map((data.submissions??[]).map((item)=>[`${item.student_id}|${item.assignment_id}`,item]));
  const assignmentRows=(data.assignments??[]).map((item)=>{
    const enrolledForAssignment=(data.enrollments??[]).filter((enrollment)=>enrollment.class_id===item.class_id);
    const perStudent=enrolledForAssignment.map((enrollment)=>{
      const student=(data.students??[]).find((row)=>row.id===enrollment.student_id);
      const submission=submissionByPair.get(`${enrollment.student_id}|${item.id}`);
      const name=student?[student.first_name,student.middle_name,student.last_name].filter(Boolean).join(" "):"الطالب";
      return `${name}: ${submission?submission.status:"لم يسلّم بعد"}`;
    });
    const submissionLabel=perStudent.length?perStudent.join(" · "):"لا يوجد تسجيل نشط";
    return `<tr><td><strong>${esc(item.title)}</strong><small>${esc(item.instructions||"")}</small></td><td>${esc(classNameById.get(item.class_id)||"—")}</td><td>${dateLabel(item.due_at)}</td><td>${esc(submissionLabel)}</td><td><button class="button button-small button-secondary" data-action="open-learning-assignments">فتح الواجبات</button></td></tr>`;
  });
  const showStudentColumn=(data.students??[]).length>1;
  const gradeHeaders=showStudentColumn?["الطالب","التقييم","الدرجة","الدرجة القصوى","تاريخ النشر"]:["التقييم","الدرجة","الدرجة القصوى","تاريخ النشر"];
  const gradeRows=(data.grades??[]).map((item)=>`<tr>${showStudentColumn?`<td>${esc(item.student_name||"الطالب")}</td>`:""}<td>${esc(item.assessment_title)}</td><td>${esc(item.score)}</td><td>${item.max_score==null?"—":esc(item.max_score)}</td><td>${dateLabel(item.published_at)}</td></tr>`);
  const adaptiveNotice=data.adaptiveUnavailable
    ? empty("التدريب التكيفي غير متاح على قاعدة الإنتاج الحالية.","يمكنك قراءة الدروس المنشورة وتسليم الواجبات ومراجعة الدرجات. سيظهر التدريب التكيفي بعد اعتماد ترحيلات التعلم واختبارها.")
    : "";
  const coreLearning= `
    ${panel("فصولك الدراسية",table(["الفصل","الصف","السنة الدراسية","الحالة"],classRows,"لا توجد تسجيلات نشطة في فصول دراسية بعد."))}
    ${panel("الدروس المتاحة",table(["الدرس","الفصل","النوع","تاريخ النشر","إجراء"],lessonRows,"لم تنشر المدرسة دروسًا متاحة لهذا الحساب بعد."))}
    ${panel("الواجبات القادمة",table(["الواجب","الفصل","موعد التسليم","حالة التسليم","إجراء"],assignmentRows,"لا توجد واجبات منشورة لهذه الفصول حاليًا."))}
    ${panel("آخر الدرجات المنشورة",table(gradeHeaders,gradeRows,"لا توجد درجات منشورة لهذا الحساب بعد."))}
    ${adaptiveNotice}
  `;
  const masteryRows=(data.mastery??[]).map((row)=>{
    const concept=data.conceptsById?.[row.concept_id];
    const score=Math.round(Number(row.mastery_score)*100);
    const confidence=Math.round(Number(row.confidence_score)*100);
    const strength=row.evidence_count>=2 && score<60;
    return `<tr><td>${esc(row.student_name || "الطالب")}</td><td><strong>${esc(concept?.title ?? "مفهوم غير متاح")}</strong><small>${esc([concept?.subject_code,concept?.grade_code].filter(Boolean).join(" / "))}</small></td><td>${score}%</td><td>${confidence}%</td><td>${esc(row.evidence_count)}</td><td>${strength?'<span class="status-badge status-warning">نقطة تحتاج تقوية</span>':'<span class="status-badge status-active">قيد القياس / متقن</span>'}</td></tr>`;
  });
  const studentRows=(data.students??[]).map((student)=>`<option value="${esc(student.id)}">${esc([student.first_name,student.middle_name,student.last_name].filter(Boolean).join(" "))}</option>`).join("");
  const trackRows=(data.tracks??[]).map((track)=>`<option value="${esc(track.student_id)}|${esc(track.subject_code)}|${esc(track.grade_code)}">${esc(track.student_name)} · ${esc(track.subject_code)} · ${esc(track.grade_code)}</option>`).join("");
  const practice=(data.practice??[]).map((q,index)=>{
    let controls="";
    if(q.question_type==="multiple_choice"){
      controls=(q.choices??[]).map((choice)=>`<label class="check-field"><input type="radio" name="choice_id" value="${esc(choice.id)}" required/><span>${esc(choice.text)}</span></label>`).join("");
    }else if(q.question_type==="true_false"){
      controls=`<label class="check-field"><input type="radio" name="value" value="true" required/><span>صح / True</span></label><label class="check-field"><input type="radio" name="value" value="false" required/><span>خطأ / False</span></label>`;
    }else if(q.question_type==="fill_blank"){
      controls=`<label class="field"><span>إجابتك</span><input name="text" required maxlength="500"/></label>`;
    }
    const mastery=q.mastery_score==null?"لم يُقيّم بعد":`إتقان سابق ${Math.round(Number(q.mastery_score)*100)}%`;
    return `<form class="panel practice-question" data-form="submit-adaptive-answer">
      <input type="hidden" name="exposure_id" value="${esc(q.exposure_id)}"/>
      <input type="hidden" name="question_type" value="${esc(q.question_type)}"/>
      <div class="list-row"><strong>السؤال ${index+1}</strong><small>${esc(q.concept_title)} · ${esc(mastery)}</small></div>
      <p>${esc(q.question_text)}</p>
      <div class="form-grid">${controls}</div>
      <div class="form-actions"><button class="button button-primary" type="submit">إرسال الإجابة</button></div>
    </form>`;
  }).join("");
  const results=data.lastPracticeResult
    ? `<div class="info-banner">${data.lastPracticeResult.is_correct===true?"إجابة صحيحة.":data.lastPracticeResult.is_correct===false?"الإجابة غير صحيحة. راجع الدرس وحاول في جلسة جديدة.":"تم استلام الإجابة وتحتاج إلى تقييم إضافي."} ${esc(data.lastPracticeResult.feedback??"")}</div>`
    : "";
  const startPractice=(data.tracks??[]).length ? `
    <form class="form-grid compact-form" data-form="start-adaptive-practice">
      ${field("المادة والصف","track","select",{required:true,choices:[{value:"",label:"اختر مادة وصفًا متاحين فعليًا"},...(data.tracks??[]).map((track)=>({value:`${track.student_id}|${track.subject_code}|${track.grade_code}`,label:`${track.student_name} · ${track.subject_code} · ${track.grade_code}`}))]})}
      <div class="form-actions"><button class="button button-primary" type="submit">ابدأ تدريبًا مخصصًا</button></div>
    </form>` : empty("لا توجد مجموعة أسئلة تدريبية متاحة بعد.","يظهر التدريب عندما توجد أسئلة معتمدة ومربوطة بمفاهيم المنهج الخاصة بالطالب. لا ينشئ النظام نقاط ضعف أو أسئلة افتراضية.");

  const nextAction = data.canPractice
    ? getNextLearningAction({ tracks:data.tracks??[], mastery:data.mastery??[], conceptsById:data.conceptsById??{} })
    : null;
  const nextActionCard = nextAction ? `
    <section class="panel learning-next-action">
      <div class="learning-next-copy">
        <span class="eyebrow">خطوتك التالية</span>
        <h3>${nextAction.kind==="reinforce" ? `راجع مفهوم: ${esc(nextAction.conceptTitle)}` : "ابدأ بتقييم مستواك"}</h3>
        <p>${esc(nextAction.reason)}</p>
        ${nextAction.kind==="reinforce"
          ? `<div class="learning-evidence"><span>${esc(nextAction.subjectCode)} · ${esc(nextAction.gradeCode)}</span><strong>الإتقان المسجل: ${nextAction.masteryPercent}%</strong><small>بناءً على ${nextAction.evidenceCount} أدلة تقييم</small></div>`
          : `<div class="learning-evidence"><span>${esc(nextAction.subjectCode)} · ${esc(nextAction.gradeCode)}</span><small>لن نفترض وجود نقطة ضعف قبل جمع أدلة كافية.</small></div>`}
      </div>
      <form data-form="start-adaptive-practice" class="learning-next-action-cta">
        <input type="hidden" name="track" value="${esc(nextAction.trackValue)}"/>
        <button class="button button-primary" type="submit">ابدأ جلسة تدريب قصيرة</button>
        <small>حتى 8 أسئلة معتمدة حسب المتاح</small>
      </form>
    </section>`
    : (data.canPractice ? empty("لا يوجد تدريب متاح حاليًا.","ستظهر خطوة مقترحة عندما يتوفر مسار دراسي وأسئلة معتمدة.") : "");
  const session = data.practiceSession;
  const sessionComplete = Boolean(session && session.total > 0 && session.completed >= session.total);
  const sessionPercent = session?.total ? Math.round((session.completed / session.total) * 100) : 0;
  const practiceStatus = data.canPractice && session
    ? `<section class="panel practice-session-status">
        <div class="practice-session-copy">
          <div class="practice-session-title"><h3>${sessionComplete ? "أحسنت، أنهيت الجلسة" : "تقدم جلسة التدريب"}</h3><span class="status-badge ${sessionComplete ? "status-completed" : "status-active"}">${sessionComplete ? "مكتملة" : "جلسة نشطة"}</span></div>
          <p>${sessionComplete
            ? `أنجزت ${session.completed} أسئلة في ${esc(session.subjectCode)}. تقدر تراجع إجابتك أو تكتفي بالنهارده.`
            : `أجبت عن ${session.completed} من ${session.total} أسئلة. متبقي ${session.total-session.completed}.`}</p>
          <div class="practice-progress-track" role="progressbar" aria-label="تقدم جلسة التدريب" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${sessionPercent}"><span style="width:${sessionPercent}%"></span></div>
        </div>
        <strong class="practice-progress-value">${sessionPercent}%</strong>
      </section>`
    : "";
  return head("مساحة التعلم","دروسك وفصولك وواجباتك ونتائجك من السجلات المنشورة فعليًا.")
    + coreLearning
    + nextActionCard
    + results
    + practiceStatus
    + panel("المهارات ونقاط التطوير",table(["الطالب","المفهوم","الإتقان","الثقة في القياس","عدد الأدلة","الحالة"],masteryRows,"لا توجد أدلة تقييم معتمدة بعد."))
    + ((data.students?.length && data.canPractice) ? panel("اختيار مادة أخرى",startPractice) : "")
    + (practice || "");
}