"""
Gives /api/arc-keeper a heartbeat, and makes its `ok` mean something.

THE GAP. cron_runs covers /api/cron only. /api/arc-keeper runs every 60
seconds, creates and settles your ON-CHAIN battles, claims winners, claims
combos and credits referrals - and records nothing. If it stopped tomorrow you
would see the same column of green 200s on cron-job.org that you saw for 82
days, with no way to tell the difference.

IT IS ACTUALLY WORSE THAN /api/cron WAS. Look at what it returns today:

    const results = { ok: true, timestamp: ... }
    try { results.createArcBattles = await createArcBattles(contract) }
      catch (e) { results.createError = e.message }
    ... four more stages, same shape ...
    res.status(200).json(results)

`ok` is a LITERAL TRUE that no error path ever touches. A run where all five
stages threw still answers {"ok":true} with HTTP 200. At least cron.mjs
computed ok from its error list.

WHAT THIS DOES
  1. Adds `job` and `details` to cron_runs (migration below, run it FIRST).
     Existing rows default to job='cron', so nothing is lost.
  2. arc-keeper writes a row per run with REAL counts - every stage already
     returns one ({created}, {settled}, {claimed, battlesSwept},
     {combosClaimed}, {referralsCredited}), they were simply being thrown away.
  3. `ok` is computed from the five error fields instead of being asserted.
  4. Labels cron.mjs's own rows job='cron' explicitly rather than relying on
     the column default.

ON STRICT STATUS, WHICH DIFFERS FROM /api/cron ON PURPOSE. For cron, a run
that saved no prices did nothing useful, so that is the 503 signal. For the
keeper, a run with nothing to do is NORMAL - there is not always a battle to
settle or a payout to claim. Firing 503 on an empty run would cry wolf every
minute and get the job disabled. So the keeper's strict signal is a THROWN
STAGE, not an empty one.

NOT FIXED HERE. cron.mjs's own battles_created / battles_settled are still
success flags set to 1, not counts, because createBattles returns prices and
settleBattlesFixed returns a failure array - making them counts means changing
both signatures and their callers. The keeper's numbers are real from today;
cron's are still booleans wearing an integer column. Worth doing, separately.

Safe by construction: every anchor verified to occur EXACTLY ONCE before
anything is written. Backs each file up to .bak.

RUN THE SQL FIRST, then:  python3 migrations/patch_keeper_heartbeat.py
"""
import sys, os, shutil

KEEPER_OLD = '''  res.status(200).json(results)
}'''

KEEPER_NEW = '''  // Heartbeat. Same table as /api/cron, told apart by `job`. This endpoint had
  // the identical blind spot cron had for 82 days, and one worse: `ok` above
  // was a literal true that no error path touched, so a run where all five
  // stages threw still answered {"ok":true} with HTTP 200.
  const errors = [
    results.createError      && 'create: '   + results.createError,
    results.settleError      && 'settle: '   + results.settleError,
    results.claimError       && 'claim: '    + results.claimError,
    results.comboClaimError  && 'combo: '    + results.comboClaimError,
    results.referralError    && 'referral: ' + results.referralError,
  ].filter(Boolean)

  results.ok = errors.length === 0

  try {
    await supabase.from('cron_runs').insert({
      job: 'arc-keeper',
      ok: results.ok,
      battles_created: results.createArcBattles?.created ?? null,
      battles_settled: results.settleArcBattles?.settled ?? null,
      errors: errors.length ? errors : null,
      details: {
        attempted:          results.createArcBattles?.attempted ?? null,
        create_failures:    results.createArcBattles?.failures ?? null,
        claimed:            results.claimArcWinners?.claimed ?? null,
        battles_swept:      results.claimArcWinners?.battlesSwept ?? null,
        combos_claimed:     results.claimArcCombos?.combosClaimed ?? null,
        referrals_credited: results.creditArcReferrals?.referralsCredited ?? null,
      },
    })
  } catch (e) {
    console.error('arc-keeper heartbeat insert failed:', e.message)
  }

  // Deliberately NOT the same strict rule as /api/cron. There, a run that
  // saved no prices did nothing useful, so emptiness is the alarm. Here, a run
  // with nothing to settle or claim is the normal case most minutes - alarming
  // on that would cry wolf every 60 seconds until the job got disabled. The
  // signal that matters for the keeper is a stage that THREW.
  const strict = process.env.CRON_STRICT_STATUS === '1'
  res.status(errors.length && strict ? 503 : 200).json(results)
}'''

EDITS = [
  ("api/arc-keeper.mjs", [
    ("keeper heartbeat", KEEPER_OLD, KEEPER_NEW),
  ]),

  ("api/cron.mjs", [
    ("label cron rows",
     "    await supabase.from('cron_runs').insert({\n"
     "      ok: results.errors.length === 0,",
     "    await supabase.from('cron_runs').insert({\n"
     "      job: 'cron',\n"
     "      ok: results.errors.length === 0,"),
  ]),
]

MIGRATION = '''-- Adds job labelling and a details blob to cron_runs, so /api/arc-keeper can
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
'''


def main():
    problems, contents = [], {}
    for path, edits in EDITS:
        if not os.path.exists(path):
            problems.append("  %s: file not found (run from repo root)" % path)
            continue
        s = open(path).read()
        contents[path] = s
        for label, anchor, _ in edits:
            n = s.count(anchor)
            if n != 1:
                problems.append("  [%s :: %s] anchor found %d times (expected 1)" % (path, label, n))

    if problems:
        print("ABORTED - nothing written. Anchor mismatch:")
        print("\n".join(problems))
        sys.exit(1)

    for path, edits in EDITS:
        shutil.copy(path, path + ".bak")
        s = contents[path]
        for _, anchor, repl in edits:
            s = s.replace(anchor, repl, 1)
        open(path, "w").write(s)
        print("Patched %s (backup at %s.bak)" % (path, path))

    os.makedirs("migrations", exist_ok=True)
    open("migrations/cron_runs_job.sql", "w").write(MIGRATION)
    print("Created migrations/cron_runs_job.sql")

    print("")
    print("arc-keeper now writes a cron_runs row every minute with real counts,")
    print("and its `ok` is computed rather than asserted.")
    print("")
    print("RUN migrations/cron_runs_job.sql FIRST if you have not already.")
    print("")
    print("AFTER DEPLOY, confirm BOTH jobs are writing:")
    print("  select job, max(ran_at), now() - max(ran_at) as age")
    print("  from cron_runs group by job order by job;")
    print("")
    print("Two rows is health. One row means the other job is not writing.")
    print("")
    print("Then:  rm -f .eslintcache && CI=true npm run build")


if __name__ == "__main__":
    main()
