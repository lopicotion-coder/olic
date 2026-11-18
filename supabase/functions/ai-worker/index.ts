import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { extractCurriculumDocument, chunkCurriculumPages } from "./document-parser.ts";
import { hasValidWorkerToken } from "./worker-auth.ts";
import { isUnsettledPaidProviderError } from "./background-budget-errors.ts";
import { estimateInputTokens, estimateOutputTokens, estimateUsdCost } from "./budget-math.ts";

type ProviderName = "openrouter" | "openai" | "gemini" | "xai";
type Mode = "all" | "ai_requests" | "learner_ai_requests" | "question_generation" | "ingestion" | "embeddings";

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

type CurriculumRetrievalRow = {
  chunk_id: string;
  source_id: string;
  source_version_id: string;
  source_title: string;
  version_label: string;
  subject_code: string;
  grade_code: string;
  sharing_scope: string;
  chapter_title: string | null;
  section_title: string | null;
  page_start: number | null;
  page_end: number | null;
  content_text: string;
  similarity_score: number;
  lexical_rank: number | null;
  semantic_rank: number | null;
  retrieval_score: number;
  citation_label: string;
};

type LearnerAiRequestRow = {
  id: string;
  learner_profile_id: string;
  requester_user_id: string;
  membership_id: string | null;
  tenant_id: string | null;
  school_id: string | null;
  feature_key: string;
  subject_code: string | null;
  grade_code: string | null;
  source_version_id: string | null;
  prompt_text: string;
  input_context: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  max_output_tokens: number;
};

type QueueName =
  | "myschool_ai_requests"
  | "myschool_learner_ai_requests"
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

type EmbeddingBatch = { vectors: number[][]; promptTokens: number };

async function generateEmbeddings(texts: string[]): Promise<EmbeddingBatch> {
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
    usage?: { prompt_tokens?: number; total_tokens?: number };
  };
  if (!Array.isArray(body.data) || body.data.length !== texts.length) {
    throw new Error(body.error?.message ?? "Embedding provider returned an incomplete batch");
  }

  const vectors = body.data
    .sort((a, b) => a.index - b.index)
    .map((item) => {
      if (!Array.isArray(item.embedding) || item.embedding.length !== 1536) {
        throw new Error("Embedding provider returned a vector with an unexpected dimension");
      }
      return item.embedding;
    });
  const promptTokens = body.usage?.prompt_tokens ??
    estimateInputTokens(texts.map((content) => ({ role: "user" as const, content })));
  return { vectors, promptTokens };
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

const EMBEDDING_PRICE_PER_MILLION = Number(Deno.env.get("AI_EMBEDDING_PRICE_PER_MILLION") ?? "0");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeProvider(value: unknown): ProviderName | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "openrouter" || v === "openai" || v === "gemini" || v === "xai") return v;
  return null;
}


type BackgroundBudgetScope = {
  tenantId: string | null;
  schoolId: string | null;
  userId?: string | null;
  featureKey: string;
  operationKind: string;
};

async function reserveBackgroundAiOperation(args: {
  operationKey: string;
  scope: BackgroundBudgetScope;
  provider: ProviderName;
  model: string;
  estimatedAmount: number;
  estimatedInputTokens: number;
  requestedOutputTokens: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { data, error } = await supabase.rpc("worker_reserve_background_ai_operation", {
    p_operation_key: args.operationKey,
    p_tenant_id: args.scope.tenantId,
    p_school_id: args.scope.schoolId,
    p_requester_user_id: args.scope.userId ?? null,
    p_feature_key: args.scope.featureKey,
    p_operation_kind: args.scope.operationKind,
    p_provider_key: args.provider,
    p_model_key: args.model,
    p_estimated_amount: args.estimatedAmount,
    p_estimated_input_tokens: args.estimatedInputTokens,
    p_requested_output_tokens: args.requestedOutputTokens,
    p_metadata: args.metadata ?? {},
  });
  dbError("Reserve background AI operation budget", error);
  const reservation = firstRow<{ reservation_id: string }>(data);
  if (!reservation?.reservation_id) throw new Error("BACKGROUND_AI_BUDGET_RESERVATION_FAILED");
}

async function finalizeBackgroundAiOperation(args: {
  operationKey: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  billedAmount: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.rpc("worker_finalize_background_ai_operation", {
    p_operation_key: args.operationKey,
    p_provider_key: args.provider,
    p_model_key: args.model,
    p_input_tokens: args.inputTokens,
    p_output_tokens: args.outputTokens,
    p_billed_amount: args.billedAmount,
    p_metadata: args.metadata ?? {},
  });
  dbError("Settle background AI operation budget", error);
}

async function releaseBackgroundAiOperation(operationKey: string): Promise<void> {
  const { error } = await supabase.rpc("worker_release_background_ai_operation", {
    p_operation_key: operationKey,
  });
  if (error) console.error("Could not release unused background AI reservation", operationKey, error);
}

async function callProviderWithBackgroundBudget(
  provider: ProviderName,
  model: string,
  messages: GatewayMessage[],
  maxOutputTokens: number,
  prices: { inputPricePerMillion: number; outputPricePerMillion: number },
  scope: BackgroundBudgetScope,
): Promise<ProviderResponse> {
  const estimatedInputTokens = estimateInputTokens(messages);
  const estimatedAmount = estimateUsdCost(estimatedInputTokens, maxOutputTokens, prices);
  const operationKey = crypto.randomUUID();
  await reserveBackgroundAiOperation({
    operationKey, scope, provider, model, estimatedAmount, estimatedInputTokens,
    requestedOutputTokens: maxOutputTokens,
    metadata: { phase: "pre-provider-reservation" },
  });

  let providerCompleted = false;
  let providerResult: ProviderResponse | null = null;
  let providerSettlement: { inputTokens: number; outputTokens: number; billedAmount: number } | null = null;
  try {
    providerResult = await callProvider(provider, model, messages, maxOutputTokens);
    providerCompleted = true;
    const result = providerResult;
    const inputTokens = result.promptTokens ?? estimatedInputTokens;
    const outputTokens = result.completionTokens ?? estimateOutputTokens(result.content);
    const billedAmount = estimateUsdCost(inputTokens, outputTokens, prices);
    providerSettlement = { inputTokens, outputTokens, billedAmount };
    await finalizeBackgroundAiOperation({
      operationKey, provider, model, inputTokens, outputTokens, billedAmount,
      metadata: { fallback_usage_estimate: result.promptTokens == null || result.completionTokens == null },
    });
    return result;
  } catch (err) {
    if (!providerCompleted) {
      await releaseBackgroundAiOperation(operationKey);
    } else if (providerSettlement) {
      const { error: failedSettlementError } = await supabase.rpc("worker_fail_background_ai_operation", {
        p_operation_key: operationKey,
        p_provider_key: provider,
        p_model_key: model,
        p_input_tokens: providerSettlement.inputTokens,
        p_output_tokens: providerSettlement.outputTokens,
        p_billed_amount: providerSettlement.billedAmount,
        p_failure_reason: err instanceof Error ? err.message.slice(0, 1000) : "Background provider result could not be finalized",
        p_metadata: { stage: "post_provider_settlement" },
      });
      if (failedSettlementError) {
        console.error("CRITICAL: provider succeeded but background AI spend settlement failed", operationKey, failedSettlementError);
        throw new Error(`BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:${operationKey}`);
      }
      // The fallback RPC recorded the actual successful provider call; retain and
      // return the response so the parent job can persist it without another charge.
      if (providerResult) return providerResult;
    } else if (providerCompleted) {
      console.error("CRITICAL: provider succeeded but usage could not be estimated", operationKey, err);
      throw new Error(`BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:${operationKey}`);
    }
    throw err;
  }
}

async function generateEmbeddingsWithBackgroundBudget(
  texts: string[],
  scope: BackgroundBudgetScope,
): Promise<EmbeddingBatch> {
  if (!Number.isFinite(EMBEDDING_PRICE_PER_MILLION) || EMBEDDING_PRICE_PER_MILLION <= 0) {
    throw new Error("AI_EMBEDDING_PRICE_PER_MILLION must be configured before background embeddings can run");
  }
  if (texts.length === 0) return { vectors: [], promptTokens: 0 };

  const model = "text-embedding-3-small";
  const provider: ProviderName = "openai";
  const messages: GatewayMessage[] = [{ role: "user", content: texts.join("\n") }];
  const estimatedInputTokens = estimateInputTokens(messages);
  const prices = {
    inputPricePerMillion: EMBEDDING_PRICE_PER_MILLION,
    outputPricePerMillion: EMBEDDING_PRICE_PER_MILLION,
  };
  const estimatedAmount = estimateUsdCost(estimatedInputTokens, 0, prices);
  const operationKey = crypto.randomUUID();

  const { data, error: reserveError } = await supabase.rpc("worker_reserve_background_ai_operation", {
    p_operation_key: operationKey,
    p_tenant_id: scope.tenantId,
    p_school_id: scope.schoolId,
    p_requester_user_id: scope.userId ?? null,
    p_feature_key: scope.featureKey,
    p_operation_kind: scope.operationKind,
    p_provider_key: provider,
    p_model_key: model,
    p_estimated_amount: estimatedAmount,
    p_estimated_input_tokens: estimatedInputTokens,
    p_requested_output_tokens: 1,
    p_metadata: { item_count: texts.length },
  });

  if (reserveError) {
    const message = String(reserveError.message ?? "");
    if (message.toLowerCase().includes("input token limit") && texts.length > 1) {
      // Respect tenant/platform input caps by splitting a large embedding batch.
      const midpoint = Math.ceil(texts.length / 2);
      const first = await generateEmbeddingsWithBackgroundBudget(texts.slice(0, midpoint), scope);
      const second = await generateEmbeddingsWithBackgroundBudget(texts.slice(midpoint), scope);
      return {
        vectors: [...first.vectors, ...second.vectors],
        promptTokens: first.promptTokens + second.promptTokens,
      };
    }
    throw reserveError;
  }
  const reservation = firstRow<{ reservation_id: string }>(data);
  if (!reservation?.reservation_id) throw new Error("BACKGROUND_EMBEDDING_BUDGET_RESERVATION_FAILED");

  let providerCompleted = false;
  let embeddingResult: EmbeddingBatch | null = null;
  let providerSettlement: { inputTokens: number; billedAmount: number } | null = null;
  try {
    embeddingResult = await generateEmbeddings(texts);
    providerCompleted = true;
    const batch = embeddingResult;
    const inputTokens = batch.promptTokens || estimatedInputTokens;
    const billedAmount = estimateUsdCost(inputTokens, 0, prices);
    providerSettlement = { inputTokens, billedAmount };
    await finalizeBackgroundAiOperation({
      operationKey, provider, model, inputTokens, outputTokens: 0, billedAmount,
      metadata: { item_count: texts.length, fallback_usage_estimate: batch.promptTokens <= 0 },
    });
    return batch;
  } catch (err) {
    if (!providerCompleted) {
      await releaseBackgroundAiOperation(operationKey);
    } else if (providerSettlement) {
      const { error: failedSettlementError } = await supabase.rpc("worker_fail_background_ai_operation", {
        p_operation_key: operationKey,
        p_provider_key: provider,
        p_model_key: model,
        p_input_tokens: providerSettlement.inputTokens,
        p_output_tokens: 0,
        p_billed_amount: providerSettlement.billedAmount,
        p_failure_reason: err instanceof Error ? err.message.slice(0, 1000) : "Embedding provider result could not be finalized",
        p_metadata: { item_count: texts.length, stage: "post_provider_settlement" },
      });
      if (failedSettlementError) {
        console.error("CRITICAL: provider succeeded but embedding spend settlement failed", operationKey, failedSettlementError);
        throw new Error(`BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:${operationKey}`);
      }
      if (embeddingResult) return embeddingResult;
    } else if (providerCompleted) {
      console.error("CRITICAL: provider succeeded but embedding usage could not be estimated", operationKey, err);
      throw new Error(`BACKGROUND_AI_SETTLEMENT_UNAVAILABLE_AFTER_PROVIDER_SUCCESS:${operationKey}`);
    }
    throw err;
  }
}

async function loadCurriculumBudgetScope(
  sourceVersionId: string,
  featureKey: string,
  operationKind: string,
): Promise<BackgroundBudgetScope> {
  const { data: version, error: versionError } = await supabase
    .from("curriculum_source_versions")
    .select("source_id")
    .eq("id", sourceVersionId)
    .single();
  dbError("Load curriculum source owner for AI budget", versionError);
  if (!version?.source_id) throw new Error("CURRICULUM_BUDGET_SOURCE_NOT_FOUND");

  const { data: source, error: sourceError } = await supabase
    .from("curriculum_sources")
    .select("tenant_id,school_id,created_by")
    .eq("id", version.source_id)
    .single();
  dbError("Load curriculum source budget scope", sourceError);
  if (!source) throw new Error("CURRICULUM_BUDGET_SCOPE_NOT_FOUND");
  return {
    tenantId: source.tenant_id ?? null,
    schoolId: source.school_id ?? null,
    userId: source.created_by ?? null,
    featureKey,
    operationKind,
  };
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
    `Each question object must include question_text, question_type, choices, answer_payload, explanation, difficulty (integer 1-5), tags (array of strings), and grounded_chunk_indexes (non-empty array of integer indexes from the supplied excerpts).`,
    `For multiple_choice: choices must be objects [{id:"A",text:"..."},...], with stable short ids; answer_payload must be {"correct_choice_id":"A"} and exactly one id must be correct.`,
    `For true_false: choices must identify true and false; answer_payload must be {"correct_answer":true} or {"correct_answer":false}.`,
    `For fill_blank: answer_payload must be {"accepted_answers":["...","..."]} with every acceptable exact answer. Keep answer case/diacritic normalization in mind.`,
    `For short_answer/essay: answer_payload must be {"reference_answer":"...","rubric":[{"criterion":"...","points":...}]}; these are routed to manual review, not auto-marked.`,
    `Never put the correct answer in question_text, choices beyond the intended correct choice, tags, or metadata. Do not output an answer key outside answer_payload.`,
    `grounded_chunk_indexes must point to the exact supplied [#index] chunks supporting both the stem and correct answer; do not invent indexes.`,
    `Generate exactly the number requested by the batch when possible, but prioritize factual correctness and source grounding.`,
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

async function retrieveTutorEvidence(row: AiRequestRow): Promise<{ evidence: CurriculumRetrievalRow[]; embeddingTokens: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for curriculum-grounded tutor retrieval");
  }
  if (!Number.isFinite(EMBEDDING_PRICE_PER_MILLION) || EMBEDDING_PRICE_PER_MILLION <= 0) {
    throw new Error("AI_EMBEDDING_PRICE_PER_MILLION must be configured before RAG requests can run");
  }

  const context = row.input_context ?? {};
  const subjectCode = typeof context.subject_code === "string" ? context.subject_code : null;
  const gradeCode = typeof context.grade_code === "string" ? context.grade_code : null;
  const sourceVersionId = typeof context.source_version_id === "string" ? context.source_version_id : null;

  const embeddingBatch = await generateEmbeddingsWithBackgroundBudget([row.prompt_text], {
    tenantId: row.tenant_id,
    schoolId: row.school_id,
    userId: row.requester_user_id,
    featureKey: "tutor",
    operationKind: "tenant_rag_query_embedding",
  });
  const queryEmbedding = embeddingBatch.vectors[0];
  const { data, error } = await supabase.rpc("search_curriculum_hybrid", {
    p_query_text: row.prompt_text,
    p_query_embedding: vectorLiteral(queryEmbedding),
    p_tenant_id: row.tenant_id,
    p_school_id: row.school_id,
    p_subject_code: subjectCode,
    p_grade_code: gradeCode,
    p_source_version_id: sourceVersionId,
    p_limit: 8,
  });
  dbError("Retrieve approved curriculum evidence", error);
  return { evidence: (data ?? []) as CurriculumRetrievalRow[], embeddingTokens: embeddingBatch.promptTokens };
}

function tutorSystemPrompt(evidence: CurriculumRetrievalRow[]): string {
  if (evidence.length === 0) {
    return [
      "You are My School's curriculum-grounded tutor.",
      "No approved matching curriculum evidence was found for this student's selected school, subject, grade and edition.",
      "Do not invent textbook explanations, page numbers, curriculum standards, or claim that something is in the book.",
      "Politely say that you could not find a matching approved passage, ask the student to verify the subject/grade/edition or provide the correct lesson, and offer only general study guidance clearly labeled as general rather than curriculum content.",
      "Respond in the student's language, using age-appropriate and supportive wording.",
    ].join("\n");
  }

  const evidenceText = evidence.map((item, index) => [
    `[E${index + 1}] ${item.citation_label}`,
    `Subject: ${item.subject_code}; Grade: ${item.grade_code}; Chapter: ${item.chapter_title ?? "N/A"}; Section: ${item.section_title ?? "N/A"}`,
    item.content_text,
  ].join("\n")).join("\n\n---\n\n");

  return [
    "You are My School's curriculum-grounded tutor.",
    "Answer the student's question using only the approved curriculum evidence supplied below.",
    "Explain the idea step by step in the student's language and at the selected grade level.",
    "Cite factual explanations with the exact bracketed evidence label, for example [E1]. Include the book/edition/page from that label in the answer.",
    "Never fabricate a citation, page number, textbook fact, curriculum standard or formula that is not supported by the evidence.",
    "If the evidence is incomplete or conflicting, say so clearly and ask one focused follow-up question.",
    "Do not reveal answer keys for active assessments or help bypass assessment integrity rules.",
    "Approved curriculum evidence:",
    evidenceText,
  ].join("\n\n");
}

async function processLearnerAiRequests(limit: number): Promise<{ processed: number; failed: number; skipped: number }> {
  const deliveries = await readQueue("myschool_learner_ai_requests", limit);
  const workerId = crypto.randomUUID();
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const requestId = String(delivery.message?.learner_ai_request_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
      await archiveQueueMessage("myschool_learner_ai_requests", delivery.msg_id);
      skipped += 1;
      continue;
    }

    const { data: claimedData, error: claimError } = await supabase.rpc("worker_claim_learner_ai_request", {
      p_request_id: requestId,
      p_worker_id: workerId,
    });
    dbError("Claim independent learner AI request", claimError);
    const row = firstRow<LearnerAiRequestRow>(claimedData);
    if (!row) {
      await archiveQueueMessage("myschool_learner_ai_requests", delivery.msg_id);
      skipped += 1;
      continue;
    }

    let finalized = false;
    let reservationCreated = false;
    let providerSettlement: { provider: ProviderName; model: string; inputTokens: number; outputTokens: number; billedAmount: number } | null = null;
    try {
      const { data: runtimeData, error: runtimeError } = await supabase.rpc("worker_get_platform_ai_runtime");
      dbError("Load platform learner AI runtime settings", runtimeError);
      const runtime = firstRow<{
        provider_key: string;
        model_key: string;
        input_price_per_million: number;
        output_price_per_million: number;
        monthly_budget_amount: number;
        monthly_request_limit: number;
        max_input_tokens: number;
        max_output_tokens: number;
        currency: string;
      }>(runtimeData);
      if (!runtime) throw new Error("PLATFORM_AI_RUNTIME_NOT_CONFIGURED");

      const provider = normalizeProvider(runtime.provider_key);
      if (!provider) throw new Error("PLATFORM_AI_PROVIDER_NOT_SUPPORTED");
      if (runtime.currency !== "USD" || Number(runtime.input_price_per_million) <= 0 ||
          Number(runtime.output_price_per_million) <= 0) {
        throw new Error("PLATFORM_AI_PRICING_CONFIGURATION_INVALID");
      }
      const model = runtime.model_key;
      const maxOutputTokens = Math.min(Number(row.max_output_tokens), Number(runtime.max_output_tokens));
      if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
        throw new Error("PLATFORM_AI_OUTPUT_TOKEN_LIMIT_INVALID");
      }

      if (!Number.isFinite(EMBEDDING_PRICE_PER_MILLION) || EMBEDDING_PRICE_PER_MILLION <= 0) {
        throw new Error("AI_EMBEDDING_PRICE_PER_MILLION must be configured before learner RAG requests can run");
      }
      const queryEmbeddingBatch = await generateEmbeddingsWithBackgroundBudget([row.prompt_text], {
        tenantId: null,
        schoolId: null,
        userId: row.requester_user_id,
        featureKey: "tutor",
        operationKind: "learner_rag_query_embedding",
      });
      const queryEmbedding = queryEmbeddingBatch.vectors[0];
      const { data: evidenceData, error: evidenceError } = await supabase.rpc("search_curriculum_hybrid", {
        p_query_text: row.prompt_text,
        p_query_embedding: vectorLiteral(queryEmbedding),
        p_tenant_id: row.tenant_id,
        p_school_id: row.school_id,
        p_subject_code: row.subject_code,
        p_grade_code: row.grade_code,
        p_source_version_id: row.source_version_id,
        p_limit: 8,
      });
      dbError("Retrieve curriculum evidence for independent learner", evidenceError);
      const evidence = (evidenceData ?? []) as CurriculumRetrievalRow[];

      const messages: GatewayMessage[] = [
        { role: "system", content: tutorSystemPrompt(evidence) },
        { role: "user", content: row.prompt_text },
      ];
      const estimatedInputTokens = estimateInputTokens(messages);
      const estimatedCost = estimateUsdCost(estimatedInputTokens, maxOutputTokens, {
        inputPricePerMillion: Number(runtime.input_price_per_million),
        outputPricePerMillion: Number(runtime.output_price_per_million),
      });

      const { data: reservationData, error: reservationError } = await supabase.rpc(
        "worker_reserve_learner_ai_budget",
        {
          p_request_id: row.id,
          p_estimated_amount: estimatedCost,
          p_estimated_input_tokens: estimatedInputTokens,
          p_requested_output_tokens: maxOutputTokens,
        },
      );
      dbError("Reserve platform learner AI budget", reservationError);
      const reservation = firstRow<{ reservation_id: string }>(reservationData);
      if (!reservation?.reservation_id) throw new Error("PLATFORM_AI_BUDGET_RESERVATION_FAILED");
      reservationCreated = true;

      const startedAt = Date.now();
      const result = await callProvider(provider, model, messages, maxOutputTokens);
      const latencyMs = Date.now() - startedAt;
      const inputTokens = result.promptTokens ?? estimatedInputTokens;
      const outputTokens = result.completionTokens ?? estimateOutputTokens(result.content);
      const cost = estimateUsdCost(inputTokens, outputTokens, {
        inputPricePerMillion: Number(runtime.input_price_per_million),
        outputPricePerMillion: Number(runtime.output_price_per_million),
      });
      providerSettlement = { provider, model, inputTokens, outputTokens, billedAmount: cost };

      const { data: savedResponse, error: responseError } = await supabase
        .from("learner_ai_responses")
        .upsert({
          request_id: row.id,
          learner_profile_id: row.learner_profile_id,
          response_text: result.content,
          response_json: result.raw as Record<string, unknown>,
          provider_key: provider,
          model_key: model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_amount: cost,
          latency_ms: latencyMs,
        }, { onConflict: "request_id" })
        .select("id")
        .single();
      dbError("Save learner AI response", responseError);

      if (evidence.length > 0 && savedResponse?.id) {
        const evidenceRows = evidence.map((item, index) => ({
          request_id: row.id,
          response_id: savedResponse.id,
          learner_profile_id: row.learner_profile_id,
          chunk_id: item.chunk_id,
          retrieval_rank: index + 1,
          similarity_score: item.similarity_score,
          source_excerpt: item.content_text.slice(0, 2000),
          citation_label: item.citation_label,
          selected_for_answer: true,
        }));
        const { error: saveEvidenceError } = await supabase
          .from("learner_ai_rag_evidence")
          .upsert(evidenceRows, { onConflict: "request_id,chunk_id" });
        dbError("Save independent learner RAG citations", saveEvidenceError);
      }

      const { error: usageError } = await supabase.from("learner_ai_usage").upsert({
        request_id: row.id,
        learner_profile_id: row.learner_profile_id,
        requester_user_id: row.requester_user_id,
        feature_key: row.feature_key,
        provider_key: provider,
        model_key: model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_amount: cost,
      }, { onConflict: "request_id" });
      dbError("Save independent learner AI usage", usageError);

      const { error: finalizeError } = await supabase.rpc("worker_finalize_learner_ai_request", {
        p_request_id: row.id,
        p_provider_key: provider,
        p_model_key: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_billed_amount: cost,
        p_metadata: { latency_ms: latencyMs, source_count: evidence.length },
      });
      dbError("Finalize learner AI request and settle platform budget", finalizeError);
      finalized = true;

      await archiveQueueMessage("myschool_learner_ai_requests", delivery.msg_id);
      processed += 1;
    } catch (err) {
      if (finalized) {
        console.error("Learner tutor request completed but queue archive failed", row.id, err);
        processed += 1;
        continue;
      }

      if (providerSettlement) {
        const { data: failureSettled, error: settlementError } = await supabase.rpc("worker_fail_learner_ai_request_after_provider", {
          p_request_id: row.id,
          p_provider_key: providerSettlement.provider,
          p_model_key: providerSettlement.model,
          p_input_tokens: providerSettlement.inputTokens,
          p_output_tokens: providerSettlement.outputTokens,
          p_billed_amount: providerSettlement.billedAmount,
          p_failure_reason: err instanceof Error ? err.message.slice(0, 1000) : "Provider succeeded but response persistence failed",
          p_metadata: { stage: "post_provider_persistence" },
        });
        if (settlementError) {
          console.error("CRITICAL: provider succeeded but platform AI spend settlement failed", row.id, settlementError);
        } else if (failureSettled === false) {
          // An event already exists: the normal finalizer may have committed even
          // though its HTTP/RPC response was lost. Do not overwrite completed state.
          await archiveQueueMessage("myschool_learner_ai_requests", delivery.msg_id);
          processed += 1;
          continue;
        }
      } else if (reservationCreated) {
        const { error: reservationReleaseError } = await supabase.rpc(
          "worker_release_learner_ai_budget_reservation",
          { p_request_id: row.id },
        );
        if (reservationReleaseError) console.error("Could not release learner AI budget reservation", row.id, reservationReleaseError);
      }

      failed += 1;
      const terminal = providerSettlement !== null || Number(row.attempts) >= Number(row.max_attempts);
      const { error: releaseError } = await supabase.from("learner_ai_requests").update({
        status: terminal ? "failed" : "queued",
        completed_at: terminal ? new Date().toISOString() : null,
        available_at: new Date(Date.now() + retryDelayMinutes(Number(row.attempts)) * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: err instanceof Error ? err.message.slice(0, 1000) : "Learner tutor request failed",
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      dbError("Release independent learner AI request", releaseError);
      await archiveQueueMessage("myschool_learner_ai_requests", delivery.msg_id);
      console.error("Independent learner tutor request failed", row.id, err);
    }
  }

  return { processed, failed, skipped };
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

    let finalized = false;
    let reservationCreated = false;
    let providerSettlement: { provider: ProviderName; model: string; budgetId: string; inputTokens: number; outputTokens: number; billedAmount: number } | null = null;
    try {
      const route = await selectRoute(row.tenant_id, row.school_id, row.feature_key);
      if (!route) throw new Error("AI_PROVIDER_ROUTE_NOT_CONFIGURED");
      const provider = normalizeProvider(route.provider_key);
      if (!provider) throw new Error("AI_PROVIDER_ROUTE_IS_NOT_SUPPORTED");
      const model = route.model_key;
      const maxOutputTokens = Number(route.max_output_tokens);
      if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 ||
          Number(route.input_price_per_million) <= 0 || Number(route.output_price_per_million) <= 0) {
        throw new Error("AI_PROVIDER_ROUTE_PRICING_OR_TOKEN_LIMIT_INVALID");
      }

      const tutorEvidence = row.feature_key === "tutor"
        ? await retrieveTutorEvidence(row)
        : { evidence: [] as CurriculumRetrievalRow[], embeddingTokens: 0 };
      const evidence = tutorEvidence.evidence;
      const messages: GatewayMessage[] = [
        {
          role: "system",
          content: row.feature_key === "tutor"
            ? tutorSystemPrompt(evidence)
            : "You are My School's internal assistant. Follow school policy and answer using the least amount of tokens required.",
        },
        { role: "user", content: row.prompt_text },
      ];

      const estimatedInputTokens = estimateInputTokens(messages);
      const estimatedCost = estimateUsdCost(estimatedInputTokens, maxOutputTokens, {
        inputPricePerMillion: Number(route.input_price_per_million),
        outputPricePerMillion: Number(route.output_price_per_million),
      });

      const { data: reservationData, error: reservationError } = await supabase.rpc("worker_reserve_ai_budget", {
        p_request_id: row.id,
        p_tenant_id: row.tenant_id,
        p_school_id: row.school_id,
        p_user_id: row.requester_user_id,
        p_feature_key: row.feature_key,
        p_estimated_amount: estimatedCost,
        p_estimated_input_tokens: estimatedInputTokens,
        p_requested_output_tokens: maxOutputTokens,
      });
      dbError("Reserve tenant AI budget", reservationError);
      const reservation = firstRow<{ reservation_id: string; budget_id: string }>(reservationData);
      if (!reservation?.reservation_id || !reservation.budget_id) {
        throw new Error("TENANT_AI_BUDGET_RESERVATION_FAILED");
      }
      reservationCreated = true;

      const result = await callProvider(provider, model, messages, maxOutputTokens);
      const inputTokens = result.promptTokens ?? estimatedInputTokens;
      const outputTokens = result.completionTokens ?? estimateOutputTokens(result.content);
      const cost = estimateUsdCost(inputTokens, outputTokens, {
        inputPricePerMillion: Number(route.input_price_per_million),
        outputPricePerMillion: Number(route.output_price_per_million),
      });
      providerSettlement = { provider, model, budgetId: reservation.budget_id, inputTokens, outputTokens, billedAmount: cost };

      const { data: savedResponse, error: responseError } = await supabase.from("ai_responses").upsert({
        request_id: row.id,
        tenant_id: row.tenant_id,
        school_id: row.school_id,
        response_text: result.content,
        response_json: result.raw as Record<string, unknown>,
      }, { onConflict: "request_id" }).select("id").single();
      dbError("Save AI response", responseError);

      if (evidence.length > 0 && savedResponse?.id) {
        const evidenceRows = evidence.map((item, index) => ({
          request_id: row.id,
          response_id: savedResponse.id,
          chunk_id: item.chunk_id,
          tenant_id: row.tenant_id,
          school_id: row.school_id,
          retrieval_rank: index + 1,
          similarity_score: item.similarity_score,
          source_excerpt: item.content_text.slice(0, 2000),
          citation_label: item.citation_label,
          selected_for_answer: true,
        }));
        const { error: evidenceError } = await supabase.from("ai_rag_evidence").upsert(
          evidenceRows,
          { onConflict: "request_id,chunk_id" },
        );
        dbError("Save RAG evidence citations", evidenceError);
      }

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

      const { error: finalizeError } = await supabase.rpc("worker_finalize_ai_request", {
        p_request_id: row.id,
        p_budget_id: reservation.budget_id,
        p_provider_key: provider,
        p_model_key: model,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_billed_amount: cost,
        p_metadata: { route_id: route.id },
      });
      dbError("Finalize AI request and settle tenant budget", finalizeError);
      finalized = true;

      await archiveQueueMessage("myschool_ai_requests", delivery.msg_id);
      processed += 1;
    } catch (err) {
      if (finalized) {
        console.error("AI request completed but queue archive failed", row.id, err);
        processed += 1;
        continue;
      }

      if (providerSettlement) {
        const { data: failureSettled, error: settlementError } = await supabase.rpc("worker_fail_ai_request_after_provider", {
          p_request_id: row.id,
          p_budget_id: providerSettlement.budgetId,
          p_provider_key: providerSettlement.provider,
          p_model_key: providerSettlement.model,
          p_input_tokens: providerSettlement.inputTokens,
          p_output_tokens: providerSettlement.outputTokens,
          p_billed_amount: providerSettlement.billedAmount,
          p_failure_reason: err instanceof Error ? err.message.slice(0, 1000) : "Provider succeeded but response persistence failed",
          p_metadata: { stage: "post_provider_persistence" },
        });
        if (settlementError) {
          console.error("CRITICAL: provider succeeded but tenant AI spend settlement failed", row.id, settlementError);
        } else if (failureSettled === false) {
          // An event already exists: normal finalization may have committed but the
          // caller lost its response. Preserve the committed state and don't retry.
          await archiveQueueMessage("myschool_ai_requests", delivery.msg_id);
          processed += 1;
          continue;
        }
      } else if (reservationCreated) {
        const { error: reservationReleaseError } = await supabase.rpc(
          "worker_release_ai_budget_reservation",
          { p_request_id: row.id },
        );
        if (reservationReleaseError) console.error("Could not release tenant AI budget reservation", row.id, reservationReleaseError);
      }

      failed += 1;
      const terminal = providerSettlement !== null || Number(row.attempts) >= Number(row.max_attempts ?? 3);
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

async function processQuestionGeneration(limit: number): Promise<{ processed: number; generated: number; failed: number; skipped: number }> {
  const deliveries = await readQueue("myschool_question_generation", limit);
  const workerId = crypto.randomUUID();
  let processed = 0;
  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of deliveries) {
    const jobId = String(delivery.message?.job_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      await archiveQueueMessage("myschool_question_generation", delivery.msg_id);
      skipped += 1;
      continue;
    }

    const job = await claimQuestionJob(jobId, workerId);
    if (!job) {
      await archiveQueueMessage("myschool_question_generation", delivery.msg_id);
      skipped += 1;
      continue;
    }

    let finalized = false;
    let accepted = 0;
    let rejected = 0;

    try {
      if (job.job_type !== "generate_questions") {
        throw new Error(`Unsupported question generation job type: ${job.job_type}`);
      }
      if (!job.batch_id || !job.source_version_id) {
        throw new Error("Question generation job is missing its batch or source version");
      }

      const { data: batch, error: batchError } = await supabase
        .from("question_generation_batches")
        .select("id,sharing_scope,tenant_id,school_id,source_version_id,subject_code,grade_code,unit_title,lesson_title,question_types,requested_count,generated_count,accepted_count,rejected_count,batch_status,provider_key,model_key,prompt_version")
        .eq("id", job.batch_id)
        .single();
      dbError("Load question generation batch", batchError);
      if (!batch) throw new Error("QUESTION_BATCH_NOT_FOUND");

      const { data: version, error: versionError } = await supabase
        .from("curriculum_source_versions")
        .select("id,source_id,version_label,ingestion_status,storage_bucket,storage_object_path,extraction_metadata")
        .eq("id", batch.source_version_id)
        .single();
      dbError("Load curriculum version for question generation", versionError);
      if (!version || version.ingestion_status !== "ready") {
        throw new Error("CURRICULUM_VERSION_NOT_READY");
      }

      const { data: source, error: sourceError } = await supabase
        .from("curriculum_sources")
        .select("id,title,subject_code,subject_name,grade_code,grade_label,sharing_scope,tenant_id,school_id,status,rights_status,permitted_uses")
        .eq("id", version.source_id)
        .single();
      dbError("Load curriculum source for question generation", sourceError);
      if (!source || source.status !== "active" || source.rights_status !== "approved" ||
          !Array.isArray(source.permitted_uses) || !source.permitted_uses.includes("question_generation")) {
        throw new Error("CURRICULUM_SOURCE_NOT_APPROVED_FOR_QUESTION_GENERATION");
      }

      const { data: chunks, error: chunksError } = await supabase
        .from("curriculum_chunks")
        .select("id,source_id,source_version_id,chunk_index,page_start,page_end,chapter_title,section_title,content_text,content_sha256,token_count,metadata")
        .eq("source_version_id", batch.source_version_id)
        .eq("status", "embedded")
        .not("embedding", "is", null)
        .order("chunk_index", { ascending: true })
        .limit(20);
      dbError("Load embedded curriculum chunks", chunksError);
      if (!chunks || chunks.length === 0) {
        throw new Error("NO_EMBEDDED_CURRICULUM_CHUNKS");
      }

      const route = await selectRoute(batch.tenant_id, batch.school_id, "exam_generator");
      if (!route) throw new Error("QUESTION_GENERATION_PROVIDER_ROUTE_NOT_CONFIGURED");
      const provider = normalizeProvider(route.provider_key);
      if (!provider || !route.model_key ||
          Number(route.input_price_per_million) <= 0 ||
          Number(route.output_price_per_million) <= 0) {
        throw new Error("QUESTION_GENERATION_PROVIDER_ROUTE_PRICING_INVALID");
      }
      const model = route.model_key;
      const maxOutputTokens = Math.min(8192, Number(route.max_output_tokens));
      if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) {
        throw new Error("QUESTION_GENERATION_OUTPUT_TOKEN_LIMIT_INVALID");
      }

      let jobResult: {
        questions: unknown[];
        provider_key: string;
        model_key: string;
        prompt_version: string | null;
      } | null = null;

      const { data: previousResult, error: previousResultError } = await supabase
        .from("question_generation_job_results")
        .select("questions,provider_key,model_key,prompt_version,finalized_at")
        .eq("job_id", job.id)
        .maybeSingle();
      dbError("Load saved question generation result", previousResultError);

      if (previousResult?.finalized_at) {
        finalized = true;
        await archiveQueueMessage("myschool_question_generation", delivery.msg_id);
        processed += 1;
        continue;
      }

      if (previousResult) {
        if (!Array.isArray(previousResult.questions)) {
          throw new Error("SAVED_QUESTION_GENERATION_RESULT_IS_INVALID");
        }
        jobResult = {
          questions: previousResult.questions,
          provider_key: previousResult.provider_key,
          model_key: previousResult.model_key,
          prompt_version: previousResult.prompt_version,
        };
      } else {
        const prompt = systemPromptForQuestionGeneration(
          source as CurriculumSourceRow,
          version as CurriculumVersionRow,
          chunks as CurriculumChunkRow[],
          batch as QuestionBatchRow,
        );
        const response = await callProviderWithBackgroundBudget(provider, model, [
          { role: "system", content: prompt },
          { role: "user", content: `Generate exactly ${batch.requested_count} questions grounded only in these approved chunks. Every question must include non-empty grounded_chunk_indexes.` },
        ], maxOutputTokens, {
          inputPricePerMillion: Number(route.input_price_per_million),
          outputPricePerMillion: Number(route.output_price_per_million),
        }, {
          tenantId: batch.tenant_id,
          schoolId: batch.school_id,
          userId: null,
          featureKey: "exam_generator",
          operationKind: "question_generation",
        });
        const parsed = parseQuestionPayload(response.content);
        const responseHash = await sha256Hex(response.content);

        const { data: insertedResult, error: insertResultError } = await supabase
          .from("question_generation_job_results")
          .insert({
            job_id: job.id,
            batch_id: batch.id,
            provider_key: provider,
            model_key: model,
            prompt_version: batch.prompt_version ?? "phase9-v1",
            response_sha256: responseHash,
            questions: parsed.questions,
          })
          .select("questions,provider_key,model_key,prompt_version")
          .single();

        if (insertResultError?.code === "23505") {
          const { data: concurrentResult, error: concurrentResultError } = await supabase
            .from("question_generation_job_results")
            .select("questions,provider_key,model_key,prompt_version")
            .eq("job_id", job.id)
            .single();
          dbError("Read concurrent saved question result", concurrentResultError);
          jobResult = concurrentResult;
        } else {
          dbError("Persist question generation result", insertResultError);
          jobResult = insertedResult;
        }
      }

      if (!jobResult || !Array.isArray(jobResult.questions)) {
        throw new Error("QUESTION_GENERATION_RESULT_NOT_AVAILABLE");
      }

      const allowedTypes = Array.isArray(batch.question_types) ? batch.question_types.map(String) : [];
      const usedChunkIndexes = new Set<number>();
      for (const rawQuestion of jobResult.questions) {
        if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
          rejected += 1;
          continue;
        }

        const item = rawQuestion as Record<string, unknown>;
        const questionText = String(item.question_text ?? "").trim();
        const questionType = String(item.question_type ?? "").trim();
        const answerPayload = item.answer_payload ?? item.answer ?? item.correct_answer;
        const choices = normalizeChoices(item.choices);
        const explanation = String(item.explanation ?? "").trim();
        const difficultyRaw = Number(item.difficulty ?? 3);
        const difficulty = Number.isFinite(difficultyRaw)
          ? Math.min(5, Math.max(1, Math.round(difficultyRaw)))
          : 3;
        const tags = Array.isArray(item.tags) ? item.tags.map((value) => String(value).slice(0, 80)).slice(0, 20) : [];

        const rawChunkIndexes = Array.isArray(item.grounded_chunk_indexes)
          ? item.grounded_chunk_indexes
          : [];
        const chunkIndexes = [...new Set(
          rawChunkIndexes
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value < chunks.length),
        )];
        const groundedChunks = chunkIndexes.map((index) => chunks[index]).filter(Boolean) as CurriculumChunkRow[];

        const structurallyValid =
          questionText.length >= 5 &&
          questionText.length <= 4000 &&
          allowedTypes.includes(questionType) &&
          answerPayload !== undefined &&
          answerPayload !== null &&
          groundedChunks.length > 0 &&
          (questionType !== "multiple_choice" || choices.length >= 2);

        if (!structurallyValid) {
          rejected += 1;
          continue;
        }

        const answerJson = JSON.stringify(answerPayload);
        const fingerprint = await sha256Hex(
          [
            source.subject_code,
            source.grade_code,
            questionType,
            questionText.normalize("NFC").trim(),
            answerJson,
            batch.source_version_id,
          ].join("\\n").toLowerCase(),
        );

        let existingQuestionQuery = supabase
          .from("question_bank")
          .select("id,review_status")
          .eq("sharing_scope", batch.sharing_scope)
          .eq("subject_code", source.subject_code)
          .eq("grade_code", source.grade_code)
          .eq("content_fingerprint", fingerprint);

        if (batch.tenant_id) existingQuestionQuery = existingQuestionQuery.eq("tenant_id", batch.tenant_id);
        else existingQuestionQuery = existingQuestionQuery.is("tenant_id", null);
        if (batch.school_id) existingQuestionQuery = existingQuestionQuery.eq("school_id", batch.school_id);
        else existingQuestionQuery = existingQuestionQuery.is("school_id", null);

        const { data: existingQuestion, error: existingQuestionError } = await existingQuestionQuery.maybeSingle();
        dbError("Check reusable question fingerprint", existingQuestionError);

        let questionId: string;
        if (existingQuestion?.id) {
          questionId = existingQuestion.id;
        } else {
          const { data: insertedQuestion, error: insertQuestionError } = await supabase
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
              provider_key: jobResult.provider_key,
              model_key: jobResult.model_key,
              prompt_version: jobResult.prompt_version ?? "phase9-v1",
              generated_by_request_id: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (insertQuestionError?.code === "23505") {
            let duplicateQuery = supabase
              .from("question_bank")
              .select("id,review_status")
              .eq("sharing_scope", batch.sharing_scope)
              .eq("subject_code", source.subject_code)
              .eq("grade_code", source.grade_code)
              .eq("content_fingerprint", fingerprint);
            if (batch.tenant_id) duplicateQuery = duplicateQuery.eq("tenant_id", batch.tenant_id);
            else duplicateQuery = duplicateQuery.is("tenant_id", null);
            if (batch.school_id) duplicateQuery = duplicateQuery.eq("school_id", batch.school_id);
            else duplicateQuery = duplicateQuery.is("school_id", null);
            const { data: duplicateQuestion, error: duplicateError } = await duplicateQuery.maybeSingle();
            dbError("Load concurrently inserted reusable question", duplicateError);
            if (!duplicateQuestion?.id) throw insertQuestionError;
            questionId = duplicateQuestion.id;
          } else {
            dbError("Insert reusable question", insertQuestionError);
            if (!insertedQuestion?.id) throw new Error("QUESTION_INSERT_RETURNED_NO_ID");
            questionId = insertedQuestion.id;
          }
        }

        // Preserve an existing answer key if a teacher has already reviewed or edited it.
        const { data: existingAnswer, error: answerLookupError } = await supabase
          .from("question_bank_answers")
          .select("question_id")
          .eq("question_id", questionId)
          .maybeSingle();
        dbError("Check protected question answer", answerLookupError);

        if (!existingAnswer) {
          const { error: answerInsertError } = await supabase.from("question_bank_answers").insert({
            question_id: questionId,
            answer_payload: answerPayload,
            explanation,
            marking_rubric: {
              source: "ai-worker",
              grounded_chunk_indexes: chunkIndexes,
              source_version_id: batch.source_version_id,
            },
            answer_reveal_policy: "after_submission",
          });
          if (answerInsertError && answerInsertError.code !== "23505") {
            dbError("Save protected question answer", answerInsertError);
          }
        }

        const sourceRows = groundedChunks.map((chunk, index) => ({
          question_id: questionId,
          chunk_id: chunk.id,
          relation_type: index === 0 ? "question_grounding" : "reference",
          evidence_excerpt: chunk.content_text.slice(0, 2000),
          citation_order: index + 1,
          grounding_score: 0.85,
        }));
        const { error: sourcesError } = await supabase
          .from("question_sources")
          .upsert(sourceRows, { onConflict: "question_id,chunk_id,relation_type" });
        dbError("Save question curriculum references", sourcesError);

        const qualityRows = [
          {
            question_id: questionId,
            check_key: "schema",
            result: "passed",
            score: 1,
            details: { validation_level: "structural", question_type: questionType },
            validator_provider: jobResult.provider_key,
            validator_model: jobResult.model_key,
          },
          {
            question_id: questionId,
            check_key: "curriculum_grounding",
            result: "passed",
            score: 1,
            details: {
              validation_level: "source_link_exists",
              chunk_indexes: chunkIndexes,
              source_version_id: batch.source_version_id,
            },
            validator_provider: jobResult.provider_key,
            validator_model: jobResult.model_key,
          },
        ];
        const { error: qualityError } = await supabase
          .from("question_quality_checks")
          .upsert(qualityRows, {
            onConflict: "question_id,check_key,validator_provider,validator_model",
          });
        dbError("Save question quality checks", qualityError);

        chunkIndexes.forEach((index) => usedChunkIndexes.add(index));
        accepted += 1;
        generated += 1;
      }

      const { data: finalizedResult, error: finalizeError } = await supabase.rpc(
        "worker_finalize_question_generation_job",
        {
          p_job_id: job.id,
          p_batch_id: batch.id,
          p_accepted_count: accepted,
          p_rejected_count: rejected,
          p_provider_key: jobResult.provider_key,
          p_model_key: jobResult.model_key,
        },
      );
      dbError("Finalize question generation job", finalizeError);
      finalized = finalizedResult === true || finalizedResult === false;

      await archiveQueueMessage("myschool_question_generation", delivery.msg_id);
      processed += 1;
    } catch (err) {
      if (finalized) {
        // Completion was committed; a failed archive is safe because the next
        // delivery will observe a completed job and archive without regenerating.
        console.error("Question job completed but queue archive failed", job.id, err);
        processed += 1;
        continue;
      }

      failed += 1;
      const terminal = isUnsettledPaidProviderError(err) || Number(job.attempts) >= Number(job.max_attempts);
      const { error: releaseError } = await supabase.from("question_generation_jobs").update({
        job_status: terminal ? "failed" : "retrying",
        last_error: err instanceof Error ? err.message.slice(0, 1000) : "Question generation failed",
        available_at: new Date(Date.now() + retryDelayMinutes(Number(job.attempts)) * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      dbError("Release failed question generation job", releaseError);
      await archiveQueueMessage("myschool_question_generation", delivery.msg_id);
      console.error("Question generation failed", job.id, err);
    }
  }

  return { processed, generated, failed, skipped };
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

      let parentFinalized = false;
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
        parentFinalized = true;

        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
        extracted += 1;
      } catch (err) {
        if (parentFinalized) {
          console.error("Ingestion parent completed but queue archive failed", parentJob.id, err);
          extracted += 1;
          continue;
        }
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

    let ingestionFinalized = false;
    let ingestionHandedOff = false;
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

        const nextMetadata = {
          ...(version.extraction_metadata ?? {}),
          parser_version: extractedDocument.parserVersion,
          mime_type: extractedDocument.mimeType,
          chunk_count: rows.length,
          source_file_sha256: fileSha,
          extracted_text_sha256: extractedHash,
          source_file_deleted: false,
          source_file_delete_pending: true,
          source_file_delete_error: null,
          pending_source_bucket: bucket,
          pending_source_object_path: objectPath,
        };

        const { error: updateVersionError } = await supabase.from("curriculum_source_versions").update({
          ingestion_status: "extracted",
          extracted_text_sha256: extractedHash,
          file_sha256: fileSha,
          page_count: extractedDocument.pageCount,
          extraction_metadata: nextMetadata,
          storage_object_path: objectPath,
        }).eq("id", version.id);
        dbError("Update extracted curriculum version", updateVersionError);

        const { error: advanceJobError } = await supabase.from("curriculum_ingestion_jobs").update({
          stage: "embed",
          job_status: "retrying",
          available_at: new Date().toISOString(),
          attempts: Math.max(0, Number(job.attempts) - 1),
          last_error: null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        dbError("Advance curriculum ingestion to embedding", advanceJobError);
        ingestionHandedOff = true;

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
          const budgetScope = await loadCurriculumBudgetScope(
            version.id,
            "document_understanding",
            "curriculum_ingestion_embedding",
          );
          const embeddingBatch = await generateEmbeddingsWithBackgroundBudget(
            chunks.map((chunk) => chunk.content_text),
            budgetScope,
          );
          const vectors = embeddingBatch.vectors;
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
            attempts: Math.max(0, Number(job.attempts) - 1),
            available_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          dbError("Queue remaining embeddings", retryError);
          ingestionHandedOff = true;
        } else {
          const { count: pendingCount, error: pendingError } = await supabase
            .from("curriculum_chunks")
            .select("id", { count: "exact", head: true })
            .eq("source_version_id", version.id)
            .is("embedding", null);
          dbError("Verify curriculum embedding completion", pendingError);
          if ((pendingCount ?? 0) > 0) throw new Error("Curriculum embedding batch is incomplete");

          let sourceFileDeleted = version.storage_object_path === null;
          let sourceFileDeleteError: string | null = null;
          if (version.storage_object_path) {
            const bucket = version.storage_bucket || "school-files";
            const { error: removeObjectError } = await supabase.storage
              .from(bucket)
              .remove([version.storage_object_path]);
            sourceFileDeleted = !removeObjectError;
            sourceFileDeleteError = removeObjectError?.message ?? null;
          }

          const finalMetadata = {
            ...(version.extraction_metadata ?? {}),
            source_file_deleted: sourceFileDeleted,
            source_file_delete_pending: false,
            source_file_delete_error: sourceFileDeleteError,
            pending_source_bucket: null,
            pending_source_object_path: null,
          };
          const { error: readyError } = await supabase.from("curriculum_source_versions").update({
            ingestion_status: "ready",
            storage_object_path: sourceFileDeleted ? null : version.storage_object_path,
            extraction_metadata: finalMetadata,
            updated_at: new Date().toISOString(),
          }).eq("id", version.id);
          dbError("Mark curriculum version ready", readyError);

          const { error: completeError } = await supabase.from("curriculum_ingestion_jobs").update({
            job_status: "completed",
            last_error: sourceFileDeleteError ? `SOURCE_FILE_CLEANUP_REQUIRED: ${sourceFileDeleteError}` : null,
            locked_at: null,
            locked_by: null,
            updated_at: new Date().toISOString(),
          }).eq("id", job.id);
          dbError("Complete curriculum ingestion", completeError);
          ingestionFinalized = true;
          embedded += 1;
        }

        if (!ingestionHandedOff && !ingestionFinalized) {
          // The embed stage may have completed without any new chunks (for example,
          // after recovering a previous partial run); completion is finalized above.
        }
        await archiveQueueMessage("myschool_curriculum_ingestion", delivery.msg_id);
      } else {
        throw new Error(`Unsupported curriculum ingestion stage: ${job.stage}`);
      }
    } catch (err) {
      if (ingestionFinalized || ingestionHandedOff) {
        console.error("Curriculum ingestion progress committed but queue archive failed", job.id, err);
        if (ingestionFinalized) embedded += 1;
        else extracted += 1;
        continue;
      }
      failed += 1;
      const terminal = isUnsettledPaidProviderError(err) || Number(job.attempts) >= Number(job.max_attempts);
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

    let handedOff = false;
    let finalized = false;
    try {
      const payload = job.payload ?? {};
      let items: Array<{ id: string; text: string }> = [];
      let targetIds: string[] = [];
      let embeddingBudgetScope: BackgroundBudgetScope | null = null;

      if (job.job_type === "embed_chunks") {
        const requestedIds = Array.isArray(payload.chunk_ids) ? [...new Set(payload.chunk_ids.map(String))] : [];
        let query = supabase
          .from("curriculum_chunks")
          .select("id,content_text,source_version_id")
          .is("embedding", null)
          .order("chunk_index", { ascending: true })
          .limit(64);
        if (requestedIds.length > 0) {
          query = query.in("id", requestedIds);
          targetIds = requestedIds;
        } else if (job.source_version_id) {
          query = query.eq("source_version_id", job.source_version_id);
        } else {
          throw new Error("embed_chunks requires source_version_id or payload.chunk_ids");
        }

        const { data, error } = await query;
        dbError("Load chunks for embedding job", error);
        items = (data ?? []).map((row) => ({ id: row.id, text: row.content_text }));
        if (items.length > 0) {
          const sourceVersionIds = [...new Set((data ?? []).map((row) => row.source_version_id))];
          if (sourceVersionIds.length !== 1) {
            throw new Error("An embedding batch must belong to one curriculum source version");
          }
          embeddingBudgetScope = await loadCurriculumBudgetScope(
            sourceVersionIds[0],
            "document_understanding",
            "queued_curriculum_embedding",
          );
        }
      } else if (job.job_type === "embed_questions") {
        const requestedIds = Array.isArray(payload.question_ids) ? [...new Set(payload.question_ids.map(String))] : [];
        let ids = requestedIds;
        if (ids.length === 0 && job.source_version_id) {
          const { data: chunkRows, error: chunkRowsError } = await supabase
            .from("curriculum_chunks")
            .select("id")
            .eq("source_version_id", job.source_version_id);
          dbError("Load source chunks for question embeddings", chunkRowsError);
          const chunkIds = (chunkRows ?? []).map((row) => row.id);
          if (chunkIds.length > 0) {
            const { data: links, error: linksError } = await supabase
              .from("question_sources")
              .select("question_id")
              .in("chunk_id", chunkIds);
            dbError("Load questions linked to source chunks", linksError);
            ids = [...new Set((links ?? []).map((row) => row.question_id))];
          }
        }
        if (ids.length === 0) throw new Error("embed_questions requires question_ids or source_version_id");
        targetIds = ids;

        const { data, error } = await supabase
          .from("question_bank")
          .select("id,question_text,choices,tenant_id,school_id,created_by")
          .in("id", ids)
          .is("embedding", null)
          .order("created_at", { ascending: true })
          .limit(64);
        dbError("Load questions for embeddings", error);
        items = (data ?? []).map((row) => ({
          id: row.id,
          text: [row.question_text, JSON.stringify(row.choices ?? [])].join("\n"),
        }));
        if (items.length > 0) {
          const first = data![0];
          const mixedScope = (data ?? []).some((row) =>
            row.tenant_id !== first.tenant_id || row.school_id !== first.school_id
          );
          if (mixedScope) throw new Error("An embedding batch cannot mix tenant/school question scopes");
          embeddingBudgetScope = {
            tenantId: first.tenant_id ?? null,
            schoolId: first.school_id ?? null,
            userId: first.created_by ?? null,
            featureKey: "exam_generator",
            operationKind: "reusable_question_embedding",
          };
        }
      } else {
        throw new Error(`Unsupported embedding job type: ${job.job_type}`);
      }

      if (items.length > 0) {
        if (!embeddingBudgetScope) throw new Error("EMBEDDING_BUDGET_SCOPE_NOT_AVAILABLE");
        const embeddingBatch = await generateEmbeddingsWithBackgroundBudget(
          items.map((item) => item.text),
          embeddingBudgetScope,
        );
        const vectors = embeddingBatch.vectors;
        const table = job.job_type === "embed_chunks" ? "curriculum_chunks" : "question_bank";
        for (let index = 0; index < items.length; index += 1) {
          const { error: updateError } = await supabase.from(table).update({
            embedding: vectorLiteral(vectors[index]),
            embedding_model_key: "openai/text-embedding-3-small",
            updated_at: new Date().toISOString(),
            ...(table === "curriculum_chunks"
              ? { embedded_at: new Date().toISOString(), status: "embedded" }
              : {}),
          }).eq("id", items[index].id);
          dbError("Save reusable content embedding", updateError);
        }
        embedded += items.length;
      }

      let pendingCount = 0;
      if (job.job_type === "embed_chunks") {
        let remainingQuery = supabase
          .from("curriculum_chunks")
          .select("id", { count: "exact", head: true })
          .is("embedding", null);
        if (targetIds.length > 0) remainingQuery = remainingQuery.in("id", targetIds);
        else if (job.source_version_id) remainingQuery = remainingQuery.eq("source_version_id", job.source_version_id);
        const { count, error } = await remainingQuery;
        dbError("Count remaining chunk embeddings", error);
        pendingCount = count ?? 0;
      } else {
        let remainingQuery = supabase
          .from("question_bank")
          .select("id", { count: "exact", head: true })
          .is("embedding", null);
        if (targetIds.length > 0) remainingQuery = remainingQuery.in("id", targetIds);
        const { count, error } = await remainingQuery;
        dbError("Count remaining question embeddings", error);
        pendingCount = count ?? 0;
      }

      if (pendingCount > 0) {
        const { error: continueError } = await supabase.from("question_generation_jobs").update({
          job_status: "retrying",
          attempts: Math.max(0, Number(job.attempts) - 1),
          available_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        dbError("Queue next embedding batch", continueError);
        handedOff = true;
      } else {
        const { error: completeError } = await supabase.from("question_generation_jobs").update({
          job_status: "completed",
          last_error: null,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        }).eq("id", job.id);
        dbError("Complete embedding job", completeError);
        finalized = true;
      }

      await archiveQueueMessage("myschool_embedding", delivery.msg_id);
      processed += 1;
    } catch (err) {
      if (finalized || handedOff) {
        console.error("Embedding progress committed but queue archive failed", job.id, err);
        processed += 1;
        continue;
      }

      failed += 1;
      const terminal = isUnsettledPaidProviderError(err) || Number(job.attempts) >= Number(job.max_attempts);
      const { error: releaseError } = await supabase.from("question_generation_jobs").update({
        job_status: terminal ? "failed" : "retrying",
        last_error: err instanceof Error ? err.message.slice(0, 1000) : "Embedding failed",
        available_at: new Date(Date.now() + retryDelayMinutes(Number(job.attempts)) * 60_000).toISOString(),
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      dbError("Release failed embedding job", releaseError);
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

  const allowedModes: Mode[] = ["all", "ai_requests", "learner_ai_requests", "question_generation", "ingestion", "embeddings"];
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
    if (finalMode === "all" || finalMode === "learner_ai_requests") result.learner_ai_requests = await processLearnerAiRequests(limit);
    if (finalMode === "all" || finalMode === "question_generation") result.question_generation = await processQuestionGeneration(limit);
    if (finalMode === "all" || finalMode === "ingestion") result.ingestion = await processIngestionJobs(limit);
    if (finalMode === "all" || finalMode === "embeddings") result.embeddings = await processEmbeddingJobs(limit);
    return json(result);
  } catch (err) {
    console.error("Worker execution failed", err);
    return json({ error: "Worker execution failed" }, 500);
  }
});
