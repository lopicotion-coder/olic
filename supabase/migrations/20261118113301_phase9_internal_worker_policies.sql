
create policy curriculum_ingestion_jobs_worker_only
on public.curriculum_ingestion_jobs
for all to service_role
using (true) with check (true);

create policy question_bank_answers_worker_only
on public.question_bank_answers
for all to service_role
using (true) with check (true);

create policy question_exposure_events_worker_only
on public.question_exposure_events
for all to service_role
using (true) with check (true);

create policy question_generation_jobs_worker_only
on public.question_generation_jobs
for all to service_role
using (true) with check (true);

create policy question_quality_checks_worker_only
on public.question_quality_checks
for all to service_role
using (true) with check (true);
