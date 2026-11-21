# Platform Knowledge Engine and Student Intelligence

## Ownership and ingestion

Only My School platform operators with `platform.knowledge.manage` can register, review, approve, or reject sources. Teachers, schools, parents, and learners do not upload knowledge files.

A source is registered with an HTTPS PDF URL, country, education system, curriculum board, subject, grade, language, and version. The worker downloads the PDF into process memory (maximum 50 MiB), validates the destination and PDF signature, parses it, and clears the byte buffer after extraction. It does not create a Supabase Storage object for URL-based sources. The URL, source version, SHA-256 hashes, extraction metadata, page references, chunks, and embeddings remain stored.

Configure `CURRICULUM_SOURCE_ALLOWED_HOSTS` on the AI worker as a comma-separated allowlist of trusted PDF hostnames. URL ingestion intentionally fails closed when the allowlist is unset. Every redirect target is validated. Private, loopback, link-local, and non-public DNS results are rejected.

## Separate knowledge classes

- Curriculum sources are indexed in `curriculum_chunks` and served by country-aware curriculum retrieval.
- Answer-model files are indexed in `model_answer_chunks`, which is not readable by browser roles. A separate service-role RPC exposes only embedded, approved, active answer-model passages with `model_answer_retrieval` permission.
- Rights status begins as `pending_review`. Public accessibility alone is not a reuse license: the review basis must record a defensible basis such as public-domain status, an applicable license, written permission, or legal approval. No source is automatically approved. The platform review RPC requires a recorded basis, reference if available, and explicit permitted uses. A source must finish ingestion before approval.

## Extraction profiles

Only `standard` PDF text extraction is currently enabled. The `diagram_ocr` and `science_hybrid` profiles are represented in source metadata but rejected by the worker until an OCR / diagram-analysis provider is configured and tested. Scanned PDFs that yield no extractable text fail visibly; they are not marked ready.

## Multi-country and language context

Schools and source records carry ISO alpha-2 country codes, education system, curriculum board, grade, and subject. Existing schools and sources remain unconfigured until an authorized operator confirms their country; NULL-country records receive no curriculum or answer-model matches. New schools, sources, and concepts require an explicit country selection; the application does not infer Egypt or any other country. Curriculum retrieval filters by country, subject, grade, sharing scope, rights approval, and ready version.

School track and instruction language are explicit school settings. They are never inferred from a school name. Per-subject policy can override the school default. The tutor uses verified settings to distinguish Arabic-national, national-language, and international tracks; it must not translate English grammar or subject content by default for a configured English-track learner.

## Student intelligence and practice

Question-to-concept relationships are explicitly reviewed by platform operators. The database records skill observations only from graded attempts against mapped questions. Mastery and confidence are calculated from those real observations. The confidence value is an evidence-volume indicator (`1 - exp(-n/4)`), not a statistically calibrated probability. Concepts with no evidence have no mastery row and are not labeled as weaknesses.

Adaptive practice chooses only approved, active, mapped objective questions (multiple choice, true/false, and fill-in-the-blank) whose answer reveal policy is `after_submission`. Standalone practice exposures can be reused for revision, but assignment and assessment exposures are never reused. Submission rechecks active school enrollment. Answer keys remain server-side. A protected RPC grades objective answers and idempotently records attempts; the database trigger updates mastery. Essays and short answers are not returned by this first practice selector until a tested grading workflow exists.

## Exam isolation

The AI tutor uses approved model answers only through its learning-mode worker path. No exam module or exam browser UI is enabled by these migrations. Exam delivery must use a separate restricted runtime that has no route to `search_model_answer_hybrid` or `question_bank_answers`.

## Migration order

Apply these branch migrations to an isolated Supabase staging branch/database only, in timestamp order:

1. `20261120121500_platform_knowledge_and_student_intelligence.sql`
2. `20261120121600_adaptive_practice_and_question_mapping.sql`
3. `20261120121700_country_rag_and_adaptive_submission.sql`

Do not apply them directly to production before staging validation and a verified backup. The repository branch and Draft PR are not a production release.

## Current gaps

- Configure the allowed PDF source hostnames in worker secrets.
- OCR / diagram understanding and science-formula extraction are not implemented.
- Automatic grading of written/essay responses is not enabled.
- Concepts, mappings, books, answer models, and questions must be entered and reviewed by the platform team; none are seeded.
- School language settings must be explicitly configured by an authorized school/platform operator.
- The migrations and worker require isolated staging integration tests before production deployment.
- Mastery in this delivery is attached only to school-linked `students` records. The independent-learner identity/request schema from earlier branch work is incomplete, so it is not coupled to this feature until its actual schema and ownership relationship are verified.
