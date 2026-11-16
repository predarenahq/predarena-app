-- Heartbeat table for /api/cron.
--
-- The August 2026 outage lasted 82 days because the endpoint returned HTTP 200
-- on every run while settling nothing, creating nothing and recording no
-- prices. Nothing anywhere said "this run did no work". This fixes that.
--
-- Service role writes it; RLS is on with no policies, so nothing client-side
-- can read or write it. Same posture as the rest of the schema.

create table if not exists cron_runs (
  id              bigserial primary key,
  ran_at          timestamptz not null default now(),
  ok              boolean     not null,
  prices_saved    int,
  battles_created int,
  battles_settled int,
  errors          jsonb
);

create index if not exists cron_runs_ran_at_idx on cron_runs (ran_at desc);

alter table cron_runs enable row level security;

-- Is the cron alive? Run this any time.
--
--   select max(ran_at)                                  as last_run,
--          now() - max(ran_at)                          as age,
--          max(ran_at) filter (where prices_saved > 0)  as last_useful_run,
--          now() - max(ran_at) filter (where prices_saved > 0) as useful_age
--   from cron_runs;
--
-- last_run recent but last_useful_run old is the exact shape of the August
-- failure: the job is firing, the work is not happening.
