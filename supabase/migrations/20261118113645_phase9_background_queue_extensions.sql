
create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select pgmq.create('myschool_curriculum_ingestion');
select pgmq.create('myschool_question_generation');
select pgmq.create('myschool_embedding');
