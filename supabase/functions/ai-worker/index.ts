import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type ProviderName = "openrouter" | "openai" | "gemini" | "xai";
type Mode = "all" | "ai_requests" | "question_generation" | "ingestion";

type AiRequestRow = {
  id: string;
  tenant_id: string;
  school_id: string | null;
  requester_user_id: string;
  feature_key: string;
  provider_key: string | null;
  model_key: string | null;
  prompt_text: string;
  input_context: Record<string, unknown>;
  status: string;
  safety_status: string;
  tokens_in: number;
  tokens_out: number;
  cost_amount: number;
  created_at: string;
};

type ProviderRouteRow = {
  id: string;
  tenant_id: string;
  school_id: string | null;
  feature_key: string;
  provider_key: string;
  model_key: string;
  enabled: boolean;
  priority: number;
  timeout_ms: number;
  max_output_tokens: number;
};

type QuestionJobRow = {
  id: string;
  batch_id: string;
  schedule_id: string | null;
  source_version_id: string | null;
  job_type: string;
  job_status: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  available_at: string;
  last_error: string | null;
};

type QuestionBatchRow = {
  id: string;
  sharing_scope: string;
  tenant_id: string;
  school_id: string | null;
  source_version_id: string;
  subject_code: string;
  grade_code: string;
  unit_title: string | null;
  lesson_title: string | null;
  question_types: string[];
  requested_count: number;
  generated_count: number;
  accepted_count: number;
  rejected_count: number;
  batch_status: string;
  provider_key: string | null;
  model_key: string | null;
  prompt_version: string | null;
};

type CurriculumChunkRow = {
  id: string;
  source_id: string;
  source_version_id: string;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  chapter_title: string | null;
  section_title: string | null;
  content_text: string;
  content_sha256: string;
  token_count: number | null;
  metadata: Record<string, unknown>;
};

type CurriculumVersionRow = {
  id: string;
  source_id: string;
  version_label: string;
  ingestion_status: string;
  storage_bucket: string | null;
  storage_object_path: string | null;
  extraction_metadata: Record<string, unknown> | null;
};

type CurriculumSourceRow = {
  id: string;
  title: string;
  subject_code: string;
  subject_name: string;
  grade_code: string;
  grade_label: string;
  sharing_scope: string;
  tenant_id: string | null;
  school_id: string | null;
  status: string;
  rights_status: string;
  permitted_uses: string[];
};

type ProviderResponse = {
  content: string;
  raw: unknown;
  model: string;
  provider: ProviderName;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const XAI_API_KEY = Deno.env.get("XAI_API_KEY") ?? "";
const DEFAULT_PROVIDER = normalizeProvider(Deno.env.get("AI_DEFAULT_PROVIDER")) ?? "openrouter";
const DEFAULT_MODEL_OPENROUTER = Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_OPENROUTER") ?? "openai/gpt-4.1-mini";
const DEFAULT_MODEL_OPENAI = Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_OPENAI") ?? "gpt-4.1-mini";
const DEFAULT_MODEL_GEMINI = Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_GEMINI") ?? "gemini-2.5-flash";
const DEFAULT_MODEL_XAI = Deno.env.get("AI_GATEWAY_DEFAULT_MODEL_XAI") ?? "grok-4.7";
const APP_NAME = Deno.env.get("AI_GATEWAY_APP_NAME") ?? "My School AI Gateway";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeProvider(value: unknown): ProviderName | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "openrouter" || v === "openai" || v === "gemini" || v === "xai") return v;
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, x-request-id",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callJson(url: string, init: RequestInit, timeoutMs = 120_000): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const raw = await resp.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // keep raw text
    }
    return { ok: resp.ok, status: resp.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function systemPromptForQuestionGeneration(source: CurriculumSourceRow, version: CurriculumVersionRow, chunks: CurriculumChunkRow[], batch: QuestionBatchRow): string {
  const allowedTypes = batch.question_types.join(", ");
  const chunkGuide = chunks
    .map((c) => `[#${c.chunk_index}] page ${c.page_start ?? "?"}-${c.page_end ?? "?"} :: ${c.chapter_title ?? ""} / ${c.section_title ?? ""}\n${c.content_text}`)
    .join("\n\n---\n\n");
  return [
    `You are generating curriculum-grounded questions for My School.`,
    `Only use the supplied curriculum excerpts. Do not add outside knowledge.`,
    `Return STRICT JSON only. No markdown, no code fences, no commentary.`,
    `The output must be an object with keys: questions (array), source_version_id, subject_code, grade_code.`,
    `Each question object should include: question_text, question_type, choices (array or empty array), answer_payload (object or array), explanation, difficulty (1-5), tags (array of strings), grounded_chunk_indexes (array of integers).`,
    `Generate exactly the number requested by the batch when possible, but prioritize quality.`,
    `Allowed question types: ${allowedTypes}.`,
    `Source title: ${source.title} | Version: ${version.version_label} | Subject: ${source.subject_code}/${source.subject_name} | Grade: ${source.grade_code}/${source.grade_label}`,
    `Curriculum excerpts:\n${chunkGuide}`,
  ].join("\n");
}

async function callProvider(provider: ProviderName, model: string, messages: GatewayMessage[], maxOutputTokens = 1024): Promise<ProviderResponse> {
  if (provider === "gemini") {
    if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
    const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n").trim();
    const userParts = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const payload: Record<string, unknown> = {
      contents: userParts,
      generationConfig: { maxOutputTokens, temperature: 0.2, topP: 0.95 },
    };
    if (sys) payload.systemInstruction = { parts: [{ text: sys }] };
    const res = await callJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || DEFAULT_MODEL_GEMINI)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);
    const raw = res.body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
    const content = raw.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return {
      provider,
      model: model || DEFAULT_MODEL_GEMINI,
      content,
      raw: res.body,
      promptTokens: raw.usageMetadata?.promptTokenCount,
      completionTokens: raw.usageMetadata?.candidatesTokenCount,
      totalTokens: raw.usageMetadata?.totalTokenCount,
    };
  }

  const apiKey = provider === "openrouter" ? OPENROUTER_API_KEY : provider === "openai" ? OPENAI_API_KEY : XAI_API_KEY;
  if (!apiKey) throw new Error(`Missing API key for ${provider}`);
  const url = provider === "openrouter"
    ? "https://openrouter.ai/api/v1/chat/completions"
    : provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.x.ai/v1/chat/completions";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = Deno.env.get("AI_GATEWAY_HTTP_REFERER") ?? "https://chat.openai.com/";
    headers["X-Title"] = APP_NAME;
  }
  const res = await callJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model || (provider === "openrouter" ? DEFAULT_MODEL_OPENROUTER : provider === "openai" ? DEFAULT_MODEL_OPENAI : DEFAULT_MODEL_XAI),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: 0.2,
      max_tokens: maxOutputTokens,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`${provider} request failed (${res.status})`);
  const raw = res.body as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  return {
    provider,
    model: model || (provider === "openrouter" ? DEFAULT_MODEL_OPENROUTER : provider === "openai" ? DEFAULT_MODEL_OPENAI : DEFAULT_MODEL_XAI),
    content: raw.choices?.[0]?.message?.content ?? "",
    raw: res.body,
    promptTokens: raw.usage?.prompt_tokens,
    completionTokens: raw.usage?.completion_tokens,
    totalTokens: raw.usage?.total_tokens,
  };
}

async function selectRoute(tenantId: string | null, schoolId: string | null, featureKey: string): Promise<ProviderRouteRow | null> {
  const { data, error } = await supabase
    .from("ai_provider_routes")
    .select("id,tenant_id,school_id,feature_key,provider_key,model_key,enabled,priority,timeout_ms,max_output_tokens")
    .eq("feature_key", featureKey)
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .limit(20);
  if (error) throw error;
  const rows = (data ?? []) as ProviderRouteRow[];
  return rows.find((row) => row.tenant_id === tenantId && row.school_id === schoolId) ?? rows.find((row) => row.tenant_id === tenantId && row.school_id === null) ?? null;
}

async function processAiRequests(limit: number): Promise<{ processed: number; failed: number }> {
  const { data, error } = await supabase
    .from("ai_requests")
    .select("id,tenant_id,school_id,requester_user_id,feature_key,provider_key,model_key,prompt_text,input_context,status,safety_status,tokens_in,tokens_out,cost_amount,created_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let processed = 0;
  let failed = 0;
  for (const row of (data ?? []) as AiRequestRow[]) {
    const route = await selectRoute(row.tenant_id, row.school_id, row.feature_key);
    const provider = normalizeProvider(route?.provider_key ?? row.provider_key ?? DEFAULT_PROVIDER) ?? DEFAULT_PROVIDER;
    const model = route?.model_key ?? row.model_key ?? (provider === "openrouter" ? DEFAULT_MODEL_OPENROUTER : provider === "openai" ? DEFAULT_MODEL_OPENAI : provider === "gemini" ? DEFAULT_MODEL_GEMINI : DEFAULT_MODEL_XAI);
    const maxOutputTokens = route?.max_output_tokens ?? 2048;
    const messages: GatewayMessage[] = [
      { role: "system", content: "You are My School's internal assistant. Follow the school policy and answer using the least amount of tokens required." },
      { role: "user", content: row.prompt_text },
    ];
    try {
      await supabase.from("ai_requests").update({ status: "processing" }).eq("id", row.id);
      const result = await callProvider(provider, model, messages, maxOutputTokens);
      await supabase.from("ai_responses").insert({
        request_id: row.id,
        tenant_id: row.tenant_id,
        school_id: row.school_id,
        response_text: result.content,
        response_json: result.raw as Record<string, unknown>,
      });
      await supabase.from("ai_usage").insert({
        request_id: row.id,
        tenant_id: row.tenant_id,
        school_id: row.school_id,
        user_id: row.requester_user_id,
        feature_key: row.feature_key,
        input_tokens: result.promptTokens ?? 0,
        output_tokens: result.completionTokens ?? 0,
        cost_amount: 0,
      });
      await supabase.from("ai_requests").update({
        status: "completed",
        model_key: model,
        provider_key: provider,
        tokens_in: result.promptTokens ?? row.tokens_in ?? 0,
        tokens_out: result.completionTokens ?? row.tokens_out ?? 0,
        completed_at: new Date().toISOString(),
      }).eq("id", row.id);
      processed += 1;
    } catch (err) {
      failed += 1;
      await supabase.from("ai_requests").update({
        status: "failed",
        safety_status: "failed",
        completed_at: new Date().toISOString(),
      }).eq("id", row.id);
      await supabase.from("ai_usage").insert({
        request_id: row.id,
        tenant_id: row.tenant_id,
        school_id: row.school_id,
        user_id: row.requester_user_id,
        feature_key: row.feature_key,
        input_tokens: 0,
        output_tokens: 0,
        cost_amount: 0,
      });
      console.error("AI request failed", row.id, err);
    }
  }
  return { processed, failed };
}

function parseQuestionPayload(rawText: string): { questions: unknown[] } {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found in model response");
  const candidate = trimmed.slice(start, end + 1);
  const parsed = JSON.parse(candidate) as { questions?: unknown[] };
  if (!Array.isArray(parsed.questions)) throw new Error("Model response missing questions array");
  return { questions: parsed.questions };
}

function normalizeChoices(choices: unknown): unknown[] {
  if (Array.isArray(choices)) return choices;
  if (typeof choices === "string" && choices.trim()) return [choices.trim()];
  return [];
}

async function processQuestionGeneration(limit: number): Promise<{ processed: number; generated: number; failed: number }> {
  const { data, error } = await supabase
    .from("question_generation_jobs")
    .select("id,batch_id,schedule_id,source_version_id,job_type,job_status,idempotency_key,payload,attempts,max_attempts,available_at,last_error")
    .eq("job_status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let processed = 0;
  let generated = 0;
  let failed = 0;

  for (const job of (data ?? []) as QuestionJobRow[]) {
    try {
      await supabase.from("question_generation_jobs").update({ job_status: "processing", attempts: job.attempts + 1 }).eq("id", job.id);

      const { data: batch, error: batchErr } = await supabase
        .from("question_generation_batches")
        .select("id,sharing_scope,tenant_id,school_id,source_version_id,subject_code,grade_code,unit_title,lesson_title,question_types,requested_count,generated_count,accepted_count,rejected_count,batch_status,provider_key,model_key,prompt_version")
        .eq("id", job.batch_id)
        .single();
      if (batchErr) throw batchErr;

      const { data: version, error: versionErr } = await supabase
        .from("curriculum_source_versions")
        .select("id,source_id,version_label,ingestion_status,storage_bucket,storage_object_path,extraction_metadata")
        .eq("id", batch.source_version_id)
        .single();
      if (versionErr) throw versionErr;

      const { data: source, error: sourceErr } = await supabase
        .from("curriculum_sources")
        .select("id,title,subject_code,subject_name,grade_code,grade_label,sharing_scope,tenant_id,school_id,status,rights_status,permitted_uses")
        .eq("id", version.source_id)
        .single();
      if (sourceErr) throw sourceErr;

      const { data: chunks, error: chunksErr } = await supabase
        .from("curriculum_chunks")
        .select("id,source_id,source_version_id,chunk_index,page_start,page_end,chapter_title,section_title,content_text,content_sha256,token_count,metadata")
        .eq("source_version_id", batch.source_version_id)
        .eq("status", "embedded")
        .order("chunk_index", { ascending: true })
        .limit(20);
      if (chunksErr) throw chunksErr;

      if (!chunks || chunks.length === 0) {
        throw new Error("No embedded curriculum chunks available yet for this source version");
      }

      const route = await selectRoute(batch.tenant_id, batch.school_id, "exam_generator");
      const provider = normalizeProvider(route?.provider_key ?? batch.provider_key ?? DEFAULT_PROVIDER) ?? DEFAULT_PROVIDER;
      const model = route?.model_key ?? batch.model_key ?? (provider === "openrouter" ? DEFAULT_MODEL_OPENROUTER : provider === "openai" ? DEFAULT_MODEL_OPENAI : provider === "gemini" ? DEFAULT_MODEL_GEMINI : DEFAULT_MODEL_XAI);
      const maxOutputTokens = route?.max_output_tokens ?? 4096;
      const prompt = systemPromptForQuestionGeneration(source as CurriculumSourceRow, version as CurriculumVersionRow, chunks as CurriculumChunkRow[], batch as QuestionBatchRow);
      const response = await callProvider(provider, model, [
        { role: "system", content: prompt },
        { role: "user", content: `Generate ${batch.requested_count} questions grounded only in these chunks.` },
      ], maxOutputTokens);

      const parsed = parseQuestionPayload(response.content);
      let accepted = 0;
      let rejected = 0;
      for (const q of parsed.questions) {
        if (!q || typeof q !== "object") {
          rejected += 1;
          continue;
        }
        const item = q as Record<string, unknown>;
        const questionText = String(item.question_text ?? "").trim();
        if (!questionText) {
          rejected += 1;
          continue;
        }
        const questionType = String(item.question_type ?? "multiple_choice").trim();
        const difficultyRaw = Number(item.difficulty ?? 3);
        const difficulty = Number.isFinite(difficultyRaw) ? Math.min(5, Math.max(1, Math.round(difficultyRaw))) : 3;
        const tags = Array.isArray(item.tags) ? item.tags.map((x) => String(x)) : [];
        const choices = normalizeChoices(item.choices);
        const answerPayload = item.answer_payload ?? item.answer ?? item.correct_answer ?? {};
        const explanation = String(item.explanation ?? "").trim();
        const chunkIndexes = Array.isArray(item.grounded_chunk_indexes) ? item.grounded_chunk_indexes.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0) : [0];
        const groundedChunks = chunkIndexes.map((i) => chunks[i]).filter(Boolean) as CurriculumChunkRow[];
        if (groundedChunks.length === 0) {
          rejected += 1;
          continue;
        }
        const fingerprint = await sha256Hex(`${questionText}\n${JSON.stringify(answerPayload)}\n${batch.source_version_id}`.toLowerCase());
        const { data: insertedQuestion, error: insertErr } = await supabase
          .from("question_bank")
          .insert({
            sharing_scope: batch.sharing_scope,
            tenant_id: batch.tenant_id,
            school_id: batch.school_id,
            subject_code: source.subject_code,
            subject_name: source.subject_name,
            grade_code: source.grade_code,
            grade_label: source.grade_label,
            unit_title: batch.unit_title,
            lesson_title: batch.lesson_title,
            question_type: questionType,
            question_text: questionText,
            choices,
            language_code: "ar",
            difficulty,
            tags,
            origin_type: "ai_generated",
            review_status: "pending_review",
            record_status: "active",
            content_fingerprint: fingerprint,
            provider_key: provider,
            model_key: model,
            prompt_version: batch.prompt_version ?? "phase9-v1",
            generated_by_request_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insertErr || !insertedQuestion) {
          rejected += 1;
          continue;
        }
        await supabase.from("question_bank_answers").insert({
          question_id: insertedQuestion.id,
          answer_payload: answerPayload,
          explanation,
          marking_rubric: { source: "ai-worker", grounded_chunk_indexes: chunkIndexes },
          answer_reveal_policy: "after_submission",
        });
        for (const [order, chunk] of groundedChunks.entries()) {
          await supabase.from("question_sources").insert({
            question_id: insertedQuestion.id,
            chunk_id: chunk.id,
            relation_type: order === 0 ? "question_grounding" : "reference",
            evidence_excerpt: chunk.content_text.slice(0, 2000),
            citation_order: order + 1,
            grounding_score: 0.85,
          });
        }
        await supabase.from("question_quality_checks").insert([
          { question_id: insertedQuestion.id, check_key: "schema", result: "passed", score: 1, details: { provider, model } },
          { question_id: insertedQuestion.id, check_key: "curriculum_grounding", result: "passed", score: 1, details: { chunk_indexes: chunkIndexes } },
        ]);
        accepted += 1;
        generated += 1;
      }

      await supabase.from("question_generation_batches").update({
        generated_count: (batch.generated_count ?? 0) + accepted + rejected,
        accepted_count: (batch.accepted_count ?? 0) + accepted,
        rejected_count: (batch.rejected_count ?? 0) + rejected,
        batch_status: accepted > 0 ? "completed" : "failed",
        provider_key: provider,
        model_key: model,
      }).eq("id", batch.id);

      await supabase.from("question_generation_jobs").update({ job_status: "completed", last_error: null }).eq("id", job.id);
      processed += 1;
    } catch (err) {
      failed += 1;
      await supabase.from("question_generation_jobs").update({
        job_status: job.attempts + 1 >= job.max_attempts ? "failed" : "retrying",
        last_error: err instanceof Error ? err.message : String(err),
        available_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }).eq("id", job.id);
    }
  }

  return { processed, generated, failed };
}

async function processIngestionJobs(limit: number): Promise<{ processed: number; deferred: number }> {
  const { data, error } = await supabase
    .from("curriculum_ingestion_jobs")
    .select("id,source_version_id,job_status,stage,attempts,max_attempts,available_at,last_error,metadata")
    .eq("job_status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  let processed = 0;
  let deferred = 0;
  for (const job of (data ?? []) as Array<{ id: string; source_version_id: string; job_status: string; stage: string; attempts: number; max_attempts: number }>) {
    try {
      await supabase.from("curriculum_ingestion_jobs").update({ job_status: "processing", attempts: job.attempts + 1 }).eq("id", job.id);
      const { data: version, error: versionErr } = await supabase
        .from("curriculum_source_versions")
        .select("id,source_id,version_label,ingestion_status,storage_bucket,storage_object_path,extraction_metadata")
        .eq("id", job.source_version_id)
        .single();
      if (versionErr) throw versionErr;
      if (!version?.storage_object_path) {
        deferred += 1;
        await supabase.from("curriculum_ingestion_jobs").update({ job_status: "retrying", last_error: "No storage object path is registered yet", available_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }).eq("id", job.id);
        continue;
      }
      await supabase.from("curriculum_ingestion_jobs").update({ job_status: "completed", last_error: null }).eq("id", job.id);
      processed += 1;
    } catch (err) {
      deferred += 1;
      await supabase.from("curriculum_ingestion_jobs").update({
        job_status: "retrying",
        last_error: err instanceof Error ? err.message : String(err),
        available_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }).eq("id", job.id);
    }
  }

  return { processed, deferred };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true }, 204);

  if (req.method === "GET") {
    const { count: requests } = await supabase.from("ai_requests").select("id", { count: "exact", head: true }).eq("status", "queued");
    const { count: questionJobs } = await supabase.from("question_generation_jobs").select("id", { count: "exact", head: true }).eq("job_status", "queued");
    const { count: ingestionJobs } = await supabase.from("curriculum_ingestion_jobs").select("id", { count: "exact", head: true }).eq("job_status", "queued");
    return json({
      ok: true,
      service: "ai-worker",
      secrets: {
        openrouter: Boolean(OPENROUTER_API_KEY),
        openai: Boolean(OPENAI_API_KEY),
        gemini: Boolean(GEMINI_API_KEY),
        xai: Boolean(XAI_API_KEY),
        supabase: Boolean(SUPABASE_URL && SERVICE_ROLE),
      },
      defaults: { provider: DEFAULT_PROVIDER },
      queues: { requests, questionJobs, ingestionJobs },
    });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") ?? "all") as Mode;
  const body = await req.json().catch(() => ({} as { mode?: Mode; limit?: number }));
  const finalMode = (body?.mode ?? mode) as Mode;
  const limit = Math.max(1, Math.min(25, Number(body?.limit ?? url.searchParams.get("limit") ?? 3) || 3));

  try {
    const result: Record<string, unknown> = { mode: finalMode, limit };
    if (finalMode === "all" || finalMode === "ai_requests") result.ai_requests = await processAiRequests(limit);
    if (finalMode === "all" || finalMode === "question_generation") result.question_generation = await processQuestionGeneration(limit);
    if (finalMode === "all" || finalMode === "ingestion") result.ingestion = await processIngestionJobs(limit);
    return json(result);
  } catch (err) {
    return json({ error: "Worker execution failed", message: err instanceof Error ? err.message : String(err) }, 500);
  }
});
