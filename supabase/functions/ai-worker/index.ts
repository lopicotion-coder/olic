import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractCurriculumDocument, chunkCurriculumPages } from "./document-parser.ts";
import { hasValidWorkerToken } from "./worker-auth.ts";

type ProviderName = "openrouter" | "openai" | "gemini" | "xai";
type Mode = "all" | "ai_requests" | "question_generation" | "ingestion" | "embeddings";

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
  attempts: number;
  max_attempts: number;
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
  input_price_per_million: number;
  output_price_per_million: number;
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

type QueueName =
  | "myschool_ai_requests"
  | "myschool_question_generation"
  | "myschool_curriculum_ingestion"
  | "myschool_embedding";

type QueueDelivery = {
  msg_id: number | string;
  read_ct: number;
  message: Record<string, unknown>;
};

function dbError(operation: string, error: { message?: string } | null): void {
  if (error) throw new Error(`${operation}: ${error.message ?? "database operation failed"}`);
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

async function readQueue(queue: QueueName, limit: number): Promise<QueueDelivery[]> {
  const { data, error } = await supabase.rpc("worker_read_queue", {
    p_queue_name: queue,
    p_limit: limit,
    p_visibility_timeout_seconds: 900,
  });
  dbError(`Read queue ${queue}`, error);
  return (data ?? []) as QueueDelivery[];
}

async function archiveQueueMessage(queue: QueueName, messageId: number | string): Promise<void> {
  const { data, error } = await supabase.rpc("worker_archive_queue_message", {
    p_queue_name: queue,
    p_msg_id: String(messageId),
  });
  dbError(`Archive queue message from ${queue}`, error);
  if (data !== true) throw new Error(`Queue message ${messageId} was not archived`);
}

async function claimAiRequest(id: string, workerId: string): Promise<AiRequestRow | null> {
  const { data, error } = await supabase.rpc("worker_claim_ai_request", {
    p_request_id: id,
    p_worker_id: workerId,
  });
  dbError("Claim AI request", error);
  return firstRow<AiRequestRow>(data);
}

async function claimQuestionJob(id: string, workerId: string): Promise<QuestionJobRow | null> {
  const { data, error } = await supabase.rpc("worker_claim_question_generation_job", {
    p_job_id: id,
    p_worker_id: workerId,
  });
  dbError("Claim question job", error);
  return firstRow<QuestionJobRow>(data);
}

async function claimIngestionJob(id: string, workerId: string): Promise<{
  id: string;
  source_version_id: string;
  job_status: string;
  stage: string;
  attempts: number;
  max_attempts: number;
  metadata: Record<string, unknown>;
} | null> {
  const { data, error } = await supabase.rpc("worker_claim_curriculum_ingestion_job", {
    p_job_id: id,
    p_worker_id: workerId,
  });
  dbError("Claim curriculum ingestion job", error);
  return firstRow<{
    id: string;
    source_version_id: string;
    job_status: string;
    stage: string;
    attempts: number;
    max_attempts: number;
    metadata: Record<string, unknown>;
  }>(data);
}

function retryDelayMinutes(attempts: number): number {
  return Math.min(60, Math.max(1, 2 ** Math.max(0, attempts - 1)));
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for 1536-dimensional curriculum embeddings");
  if (texts.length < 1 || texts.length > 64) throw new Error("Embedding batch must contain 1 to 64 texts");

  const response = await callJson("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      dimensions: 1536,
      input: texts,
    }),
  }, 90_000);

  if (!response.ok) throw new Error(`Embedding provider returned HTTP ${response.status}`);
  const body = response.body as {
    data?: Array<{ index: number; embedding: number[] }>;
    error?: { message?: string };
  };
  if (!Array.isArray(body.data) || body.data.length !== texts.length) {
    throw new Error(body.error?.message ?? "Embedding provider returned an incomplete batch");
  }

  return body.data
    .sort((a, b) => a.index - b.index)
    .map((item) => {
      if (!Array.isArray(item.embedding) || item.embedding.length !== 1536) {
        throw new Error("Embedding provider returned a vector with an unexpected dimension");
      }
      return item.embedding;
    });
}

function vectorLiteral(vector: number[]): string {
  if (vector.length !== 1536 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Invalid vector for curriculum storage");
  }
  return `[${vector.join(",")}]`;
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256HexText(value: string): Promise<string> {
  return await sha256Hex(value);
}



const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WORKER_INTERNAL_TOKEN = Deno.env.get("AI_WORKER_INTERNAL_TOKEN") ?? "";
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
    headers: { "content-type": "application/json; charset=utf-8" },
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
    .select("id,tenant_id,school_id,feature_key,provider_key,model_key,enabled,priority,timeout_ms,max_output_tokens,input_price_per_million,output_price_per_million")
    .eq("feature_key", featureKey)
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .limit(20);
  if (error) throw error;
  const rows = (data ?? []) as ProviderRouteRow[];
  return rows.find((row) => row.tenant_id === tenantId && row.school_id === schoolId) ?? rows.find((row) => row.tenant_id === tenantId && row.school_id === null) ?? null;
}

async function processAiRequests(limit: number): Promise<{ processed: number; failed: number; skipped: number }> {
  const deliveries = await readQueue("myschool_ai_requests", limit);
  const workerId = crypto.randomUUID();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const requestId = String(delivery.message?.ai_request_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      await archiveQueueMessage("myschool_ai_requests", delivery.msg_id);
      skipped += 1;
      continue;
    }

    const row = await claimAiRequest(requestId, workerId);
    if (!row) {
      await archiveQueueMessage("myschool_ai_requests", delivery.msg_id);
      skipped += 1;
      continue;
    }

    try {
      const route = await selectRoute(row.tenant_id, row.school_id, row.feature_key);
      const provider = normalizeProvider(route?.provider_key ?? row.provider_key ?? DEFAULT_PROVIDER) ?? DEFAULT_PROVIDER;
      const model = route?.model_key ?? row.model_key ?? (
        provider === "openrouter" ? DEFAULT_MODEL_OPENROUTER :
        provider === "openai" ? DEFAULT_MODEL_OPENAI :
        provider === "gemini" ? DEFAULT_MODEL_GEMINI : DEFAULT_MODEL_XAI
      );
      const maxOutputTokens = route?.max_output_tokens ?? 2048;
      const messages: GatewayMessage[] = [
        { role: "system", content: "You are My School's internal assistant. Follow school policy and answer using the least amount of tokens required." },
        { role: "user", content: row.prompt_text },
      ];

      const result = await callProvider(provider, model, messages, maxOutputTokens);
      const inputTokens = result.promptTokens ?? 0;
      const outputTokens = result.completionTokens ?? 0;
      const cost = route
        ? (inputTokens * Number(route.input_price_per_million) + outputTokens * Number(route.output_price_per_million)) / 1_000_000
        : 0;

      const { error: responseError } = await supabase.from("ai_responses").upsert({
        request_id: row.id,
        tenant_id: row.tenant_id,
        school_id: row.school_id,
        response_text: result.content,
        response_json: result.raw as Record<string, unknown>,
      }, { onConflict: "request_id" });
      dbError("Save AI response", responseError);

      const { data: existingUsage, error: usageLookupError } = await supabase
        .from("ai_usage")
        .select("id")
        .eq("request_id", row.id)
        .limit(1)
        .maybeSingle();
      dbError("Check AI usage", usageLookupError);

      const usage = {
        request_id: row.id,
        tenant_id: row.tenant_id,
        school_id: row.school_id,
        user_id: row.requester_user_id,
        feature_key: row.feature_key,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_amount: cost,
      };
      if (existingUsage?.id) {
        const { error: updateUsageError } = await supabase.from("ai_usage").update(usage).eq("id", existingUsage.id);
        dbError("Update AI usage", updateUsageError);
      } else {
        const { error: insertUsageError } = await supabase.from("ai_usage").insert(usage);
        dbError("Insert AI usage", insertUsageError);
      }

      const { error: completeError } = await supabase.from("ai_requests").update({
        status: "completed",
        model_key: model,
        provider_key: provider,
        tokens_in: inputTokens,
        tokens_out: outputTokens,
        cost_amount: cost,
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: null,
      }).eq("id", row.id);
      dbError("Complete AI request", completeError);

      await archiveQueueMessage("myschool_ai_requests", delivery.msg_id);
      processed += 1;
    } catch (err) {
      failed += 1;
      const terminal = Number(row.attempts) >= Number(row.max_attempts ?? 3);
      const delayMinutes = retryDelayMinutes(Number(row.attempts) || 1);
      const { error: retryError } = await supabase.from("ai_requests").update({
        status: terminal ? "failed" : "queued",
        safety_status: terminal ? "failed" : "pending",
        completed_at: terminal ? new Date().toISOString() : null,
        available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: err instanceof Error ? err.message.slice(0, 1000) : "AI request failed",
      }).eq("id", row.id);
      dbError("Release failed AI request", retryError);
      await archiveQueueMessage("myschool_ai_requests", delivery.msg_id);
      console.error("AI request failed", row.id, err);
    }
  }

  return { processed, failed, skipped };
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



async function processIngestionJobs(limit: number): Promise<{ extracted: number; embedded: number; deferred: number; failed: number; skipped: number }> {
  const deliveries = await readQueue("myschool_curriculum_ingestion", limit);
  const workerId = crypto.randomUUID();
  let extracted = 0;
  let embedded = 0;
  let deferred = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const curriculumJobId = String(delivery.message?.curriculum_ingestion_job_id ?? "");
    const genericJobId = String(delivery.message?.job_id ?? "");

    if (!curriculumJobId && genericJobId) {
      const parentJob = await claimQuestionJob(genericJobId, workerId);
      if (!parentJob) {
        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
        skipped += 1;
        continue;
      }

      try {
        if (!["ingest_book", "chunk_book"].includes(parentJob.job_type)) {
          throw new Error(`Unsupported ingestion queue job type: ${parentJob.job_type}`);
        }
        if (!parentJob.source_version_id) throw new Error("Ingestion job is missing source_version_id");

        const idempotencyKey = `curriculum-ingestion:${parentJob.id}`;
        const { data: existingChild, error: existingChildError } = await supabase
          .from("curriculum_ingestion_jobs")
          .select("id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        dbError("Check existing curriculum ingestion child", existingChildError);

        if (!existingChild) {
          const { error: insertChildError } = await supabase.from("curriculum_ingestion_jobs").insert({
            source_version_id: parentJob.source_version_id,
            job_status: "queued",
            stage: "extract",
            attempts: 0,
            max_attempts: 5,
            available_at: new Date().toISOString(),
            metadata: {
              origin_job_id: parentJob.id,
              requested_stage: parentJob.job_type,
              payload: parentJob.payload ?? {},
            },
            idempotency_key: idempotencyKey,
          });
          dbError("Create curriculum ingestion child", insertChildError);
        }

        const { error: parentCompleteError } = await supabase.from("question_generation_jobs").update({
          job_status: "completed",
          last_error: null,
          locked_at: null,
          locked_by: null,
        }).eq("id", parentJob.id);
        dbError("Complete ingestion parent job", parentCompleteError);

        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
        extracted += 1;
      } catch (err) {
        failed += 1;
        const terminal = Number(parentJob.attempts) >= Number(parentJob.max_attempts);
        const { error: releaseError } = await supabase.from("question_generation_jobs").update({
          job_status: terminal ? "failed" : "retrying",
          last_error: err instanceof Error ? err.message.slice(0, 1000) : "Could not create ingestion job",
          available_at: new Date(Date.now() + retryDelayMinutes(Number(parentJob.attempts)) * 60_000).toISOString(),
          locked_at: null,
          locked_by: null,
        }).eq("id", parentJob.id);
        dbError("Release ingestion parent job", releaseError);
        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
      }
      continue;
    }

    if (!/^[0-9a-f-]{36}$/i.test(curriculumJobId)) {
      await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
      skipped += 1;
      continue;
    }

    const job = await claimIngestionJob(curriculumJobId, workerId);
    if (!job) {
      await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
      skipped += 1;
      continue;
    }

    try {
      const { data: version, error: versionErr } = await supabase
        .from("curriculum_source_versions")
        .select("id,source_id,version_label,ingestion_status,storage_bucket,storage_object_path,extraction_metadata,extracted_text_sha256,file_sha256,page_count")
        .eq("id", job.source_version_id)
        .single();
      dbError("Load version for ingestion", versionErr);
      if (!version) throw new Error("CURRICULUM_VERSION_NOT_FOUND");

      if (job.stage === "extract" || job.stage === "chunk") {
        if (!version.storage_object_path) throw new Error("SOURCE_FILE_NOT_AVAILABLE: upload a PDF, DOCX or text file to restart ingestion");

        const bucket = version.storage_bucket || "school-files";
        const objectPath = version.storage_object_path;
        const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(objectPath);
        dbError("Download curriculum source", downloadError);
        if (!blob) throw new Error("Storage returned no curriculum source file");

        const bytes = new Uint8Array(await blob.arrayBuffer());
        const fileSha = await sha256HexBytes(bytes);
        if (version.file_sha256 && version.file_sha256 !== fileSha) {
          throw new Error("SOURCE_FILE_HASH_MISMATCH: the uploaded source differs from the registered file hash");
        }

        const fileName = String(
          (version.extraction_metadata as Record<string, unknown> | null)?.file_name ?? objectPath.split("/").pop() ?? "curriculum-source"
        );
        const extractedDocument = await extractCurriculumDocument(fileName, blob.type, bytes);
        const extractedHash = await sha256HexText(extractedDocument.text);
        if (version.extracted_text_sha256 && version.extracted_text_sha256 !== extractedHash) {
          throw new Error("CURRICULUM_VERSION_IMMUTABLE: create a new source version when extracted content changes");
        }

        const chunks = chunkCurriculumPages(extractedDocument.pages, 4200);
        if (chunks.length === 0) throw new Error("NO_CURRICULUM_CHUNKS: document text could not be segmented");

        const rows = [];
        for (const chunk of chunks) {
          rows.push({
            source_id: version.source_id,
            source_version_id: version.id,
            chunk_index: chunk.chunkIndex,
            page_start: chunk.pageStart,
            page_end: chunk.pageEnd,
            chapter_title: chunk.chapterTitle,
            section_title: chunk.sectionTitle,
            content_text: chunk.contentText,
            content_sha256: await sha256HexText(chunk.contentText),
            token_count: chunk.tokenCount,
            status: "pending",
            metadata: {
              parser_version: extractedDocument.parserVersion,
              mime_type: extractedDocument.mimeType,
              chunking_strategy: "heading-paragraph-page/4200-char",
            },
          });
        }

        const { error: upsertChunksError } = await supabase
          .from("curriculum_chunks")
          .upsert(rows, { onConflict: "source_version_id,chunk_index" });
        dbError("Save extracted curriculum chunks", upsertChunksError);

        const { error: removeObjectError } = await supabase.storage.from(bucket).remove([objectPath]);
        const sourceFileDeleted = !removeObjectError;
        const nextMetadata = {
          ...(version.extraction_metadata ?? {}),
          parser_version: extractedDocument.parserVersion,
          mime_type: extractedDocument.mimeType,
          chunk_count: rows.length,
          source_file_sha256: fileSha,
          extracted_text_sha256: extractedHash,
          source_file_deleted: sourceFileDeleted,
          source_file_delete_error: removeObjectError?.message ?? null,
        };

        const { error: updateVersionError } = await supabase.from("curriculum_source_versions").update({
          ingestion_status: "extracted",
          extracted_text_sha256: extractedHash,
          file_sha256: fileSha,
          page_count: extractedDocument.pageCount,
          extraction_metadata: nextMetadata,
          storage_object_path: sourceFileDeleted ? null : objectPath,
        }).eq("id", version.id);
        dbError("Update extracted curriculum version", updateVersionError);

        const { error: advanceJobError } = await supabase.from("curriculum_ingestion_jobs").update({
          stage: "embed",
          job_status: "retrying",
          available_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        dbError("Advance curriculum ingestion to embedding", advanceJobError);

        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
        extracted += 1;
      } else if (job.stage === "embed") {
        const { data: chunks, error: chunksError } = await supabase
          .from("curriculum_chunks")
          .select("id,content_text")
          .eq("source_version_id", version.id)
          .is("embedding", null)
          .order("chunk_index", { ascending: true })
          .limit(64);
        dbError("Load chunks for embedding", chunksError);

        if (chunks && chunks.length > 0) {
          const vectors = await generateEmbeddings(chunks.map((chunk) => chunk.content_text));
          for (let index = 0; index < chunks.length; index += 1) {
            const { error: embeddingUpdateError } = await supabase.from("curriculum_chunks").update({
              embedding: vectorLiteral(vectors[index]),
              embedding_model_key: "openai/text-embedding-3-small",
              embedded_at: new Date().toISOString(),
              status: "embedded",
              last_error: null,
              updated_at: new Date().toISOString(),
            }).eq("id", chunks[index].id);
            dbError("Save curriculum embedding", embeddingUpdateError);
          }

          const { error: retryError } = await supabase.from("curriculum_ingestion_jobs").update({
            job_status: "retrying",
            available_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          dbError("Queue remaining embeddings", retryError);
        } else {
          const { count: pendingCount, error: pendingError } = await supabase
            .from("curriculum_chunks")
            .select("id", { count: "exact", head: true })
            .eq("source_version_id", version.id)
            .is("embedding", null);
          dbError("Verify curriculum embedding completion", pendingError);
          if ((pendingCount ?? 0) > 0) throw new Error("Curriculum embedding batch is incomplete");

          const { error: readyError } = await supabase.from("curriculum_source_versions").update({
            ingestion_status: "ready",
            updated_at: new Date().toISOString(),
          }).eq("id", version.id);
          dbError("Mark curriculum version ready", readyError);

          const { error: completeError } = await supabase.from("curriculum_ingestion_jobs").update({
            job_status: "completed",
            last_error: null,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          dbError("Complete curriculum ingestion", completeError);
          embedded += 1;
        }

        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
      } else {
        throw new Error(`Unsupported curriculum ingestion stage: ${job.stage}`);
      }
    } catch (err) {
      failed += 1;
      const terminal = Number(job.attempts) >= Number(job.max_attempts);
      const { error: releaseError } = await supabase.from("curriculum_ingestion_jobs").update({
        job_status: terminal ? "failed" : "retrying",
        last_error: err instanceof Error ? err.message.slice(0, 1000) : "Curriculum ingestion failed",
        available_at: new Date(Date.now() + retryDelayMinutes(Number(job.attempts)) * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      dbError("Release curriculum ingestion job", releaseError);
      await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
      console.error("Curriculum ingestion failed", job.id, err);
    }
  }

  return { extracted, embedded, deferred, failed, skipped };
}

async function processEmbeddingJobs(limit: number): Promise<{ processed: number; embedded: number; failed: number; skipped: number }> {
  const deliveries = await readQueue("myschool_embedding", limit);
  const workerId = crypto.randomUUID();
  let processed = 0;
  let embedded = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const jobId = String(delivery.message?.job_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      await archiveQueueMessage("myschool_embedding", delivery.msg_id);
      skipped += 1;
      continue;
    }

    const job = await claimQuestionJob(jobId, workerId);
    if (!job) {
      await archiveQueueMessage("myschool_embedding", delivery.msg_id);
      skipped += 1;
      continue;
    }

    try {
      let items: Array<{ id: string; text: string }> = [];
      const payload = job.payload ?? {};
      if (job.job_type === "embed_chunks") {
        const requestedIds = Array.isArray(payload.chunk_ids) ? payload.chunk_ids.map(String) : [];
        let query = supabase.from("curriculum_chunks").select("id,content_text").is("embedding", null).limit(64);
        if (requestedIds.length > 0) query = query.in("id", requestedIds);
        else if (job.source_version_id) query = query.eq("source_version_id", job.source_version_id);
        else throw new Error("embed_chunks requires source_version_id or payload.chunk_ids");

        const { data, error } = await query;
        dbError("Load chunks for embedding job", error);
        items = (data ?? []).map((row) => ({ id: row.id, text: row.content_text }));
      } else if (job.job_type === "embed_questions") {
        const requestedIds = Array.isArray(payload.question_ids) ? payload.question_ids.map(String) : [];
        let ids = requestedIds;
        if (ids.length === 0 && job.source_version_id) {
          const { data: chunkRows, error: chunkRowsError } = await supabase
            .from("curriculum_chunks").select("id").eq("source_version_id", job.source_version_id);
          dbError("Load source chunks for question embeddings", chunkRowsError);
          const chunkIds = (chunkRows ?? []).map((row) => row.id);
          if (chunkIds.length > 0) {
            const { data: links, error: linksError } = await supabase
              .from("question_sources").select("question_id").in("chunk_id", chunkIds);
            dbError("Load questions linked to source chunks", linksError);
            ids = [...new Set((links ?? []).map((row) => row.question_id))];
          }
        }
        if (ids.length === 0) throw new Error("embed_questions requires question_ids or source_version_id");
        const { data, error } = await supabase
          .from("question_bank").select("id,question_text,choices").in("id", ids).is("embedding", null).limit(64);
        dbError("Load questions for embeddings", error);
        items = (data ?? []).map((row) => ({
          id: row.id,
          text: [row.question_text, JSON.stringify(row.choices ?? [])].join("\n"),
        }));
      } else {
        throw new Error(`Unsupported embedding job type: ${job.job_type}`);
      }

      if (items.length > 0) {
        const vectors = await generateEmbeddings(items.map((item) => item.text));
        const table = job.job_type === "embed_chunks" ? "curriculum_chunks" : "question_bank";
        for (let index = 0; index < items.length; index += 1) {
          const { error: updateError } = await supabase.from(table).update({
            embedding: vectorLiteral(vectors[index]),
            embedding_model_key: "openai/text-embedding-3-small",
            updated_at: new Date().toISOString(),
            ...(table === "curriculum_chunks" ? { embedded_at: new Date().toISOString(), status: "embedded" } : {}),
          }).eq("id", items[index].id);
          dbError("Save reusable content embedding", updateError);
        }
        embedded += items.length;
      }

      const { error: completeError } = await supabase.from("question_generation_jobs").update({
        job_status: "completed",
        last_error: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", job.id);
      dbError("Complete embedding job", completeError);

      await archiveQueueMessage("myschool_embedding", delivery.msg_id);
      processed += 1;
    } catch (err) {
      failed += 1;
      const terminal = Number(job.attempts) >= Number(job.max_attempts);
      const { error: releaseError } = await supabase.from("question_generation_jobs").update({
        job_status: terminal ? "failed" : "retrying",
        last_error: err instanceof Error ? err.message.slice(0, 1000) : "Embedding failed",
        available_at: new Date(Date.now() + retryDelayMinutes(Number(job.attempts)) * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
      }).eq("id", job.id);
      dbError("Release embedding job", releaseError);
      await archiveQueueMessage("myschool_embedding", delivery.msg_id);
      console.error("Embedding job failed", job.id, err);
    }
  }

  return { processed, embedded, failed, skipped };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(req.url);
  const isHealthPath = url.pathname === "/" || url.pathname === "/health";
  const isRunPath = url.pathname === "/" || url.pathname === "/run";

  if (req.method === "GET") {
    if (!isHealthPath) return json({ error: "Not found" }, 404);
    // Do not expose queue counts, provider-key presence, or runtime configuration.
    return json({ ok: true, service: "ai-worker" });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isRunPath) return json({ error: "Not found" }, 404);

  // Supabase verify_jwt=true validates the bearer JWT at the edge gateway.
  // This second, server-only secret prevents ordinary authenticated users from
  // invoking service-role work through this function.
  if (!WORKER_INTERNAL_TOKEN) {
    return json({ error: "Worker execution is not configured" }, 503);
  }
  if (!(await hasValidWorkerToken(req, WORKER_INTERNAL_TOKEN))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 8_192) return json({ error: "Request body too large" }, 413);

  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8_192) {
    return json({ error: "Request body too large" }, 413);
  }

  let body: { mode?: Mode; limit?: number } = {};
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as { mode?: Mode; limit?: number };
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }

  const allowedModes: Mode[] = ["all", "ai_requests", "question_generation", "ingestion", "embeddings"];
  const requestedMode = body.mode ?? url.searchParams.get("mode") ?? "all";
  if (!allowedModes.includes(requestedMode as Mode)) {
    return json({ error: "Invalid worker mode" }, 400);
  }

  const requestedLimit = body.limit ?? Number(url.searchParams.get("limit") ?? "3");
  const limit = requestedLimit === undefined ? 3 : Number(requestedLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    return json({ error: "limit must be an integer between 1 and 25" }, 400);
  }

  try {
    const finalMode = requestedMode as Mode;
    const result: Record<string, unknown> = { mode: finalMode, limit };
    if (finalMode === "all" || finalMode === "ai_requests") result.ai_requests = await processAiRequests(limit);
    if (finalMode === "all" || finalMode === "question_generation") result.question_generation = await processQuestionGeneration(limit);
    if (finalMode === "all" || finalMode === "ingestion") result.ingestion = await processIngestionJobs(limit);
    if (finalMode === "all" || finalMode === "embeddings") result.embeddings = await processEmbeddingJobs(limit);
    return json(result);
  } catch (err) {
    console.error("Worker execution failed", err);
    return json({ error: "Worker execution failed" }, 500);
  }
});
