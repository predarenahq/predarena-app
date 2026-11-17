-- Adds job labelling and a details blob to cron_runs, so /api/arc-keeper can
-- share the table with /api/cron.
--
-- RUN THIS BEFORE DEPLOYING patch_keeper_heartbeat.py. Without it every keeper
-- run logs a caught insert error and records nothing - harmless, but you would
-- be flying blind on the exact job this is meant to make visible.
--
-- Existing rows default to 'cron', which is accurate: cron.mjs was the only
-- writer until now.

alter table cron_runs add column if not exists job     text not null default 'cron';
alter table cron_runs add column if not exists details jsonb;

create index if not exists cron_runs_job_ran_at_idx on cron_runs (job, ran_at desc);

-- Are BOTH jobs alive and working? This is the query to actually watch.
--
--   select job,
--          max(ran_at)                                             as last_run,
--          now() - max(ran_at)                                     as age,
--          count(*) filter (where not ok
--                             and ran_at > now() - interval '1 hour') as failed_last_hour
--   from cron_runs
--   group by job
--   order by job;
--
-- Two rows, both with a small age and zero failures, is health. One row means
-- the other job is not writing - which is itself the alarm.
