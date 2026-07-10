-- ============================================================================
-- PredArena — fixed-odds money layer migration
-- Run top to bottom in the Supabase SQL editor. Idempotent where possible.
-- ============================================================================

-- 1. Base probabilities, stored at battle creation so in-play pricing is
--    deterministic and never re-fetches momentum per bet.
alter table battles add column if not exists base_prob_a    numeric;
alter table battles add column if not exists base_prob_b    numeric;
alter table battles add column if not exists base_prob_draw numeric;

-- Backfill existing live battles with an even prior so pricing doesn't divide
-- by null. New battles get real values from createBattles.
update battles
   set base_prob_a = coalesce(base_prob_a, 0.40),
       base_prob_b = coalesce(base_prob_b, 0.40),
       base_prob_draw = coalesce(base_prob_draw, 0.20)
 where status in ('live','upcoming') and base_prob_a is null;

-- 2. pending_deposits — the retry backstop. A 202 (finality not yet reached)
--    writes here; the cron sweep drains it. No RLS policies: service_role only.
create table if not exists pending_deposits (
  signature      text primary key,
  wallet_address text        not null,
  attempts       int         not null default 0,
  last_error     text,
  created_at     timestamptz not null default now(),
  checked_at     timestamptz
);
alter table pending_deposits enable row level security;

-- 3. platform_treasury is now a running house-PnL LEDGER, not a pot. It may go
--    negative; that is visible on purpose (the old Math.max(0,...) is gone in
--    settlement). Ensure the single row exists.
insert into platform_treasury (balance_usd, total_earned_usd, total_paid_out_usd, updated_at)
select 0, 0, 0, now()
where not exists (select 1 from platform_treasury);

-- ============================================================================
-- 4. place_bet — rewritten.
--    Changes vs the old function:
--      * odds in p_legs are now SERVER-COMPUTED (place-bet.mjs prices the bet
--        and passes trusted odds). The RPC no longer trusts a client price.
--      * combo odds capped at MAX_COMBO_ODDS (100x).
--      * single odds capped at MAX_SINGLE_ODDS (30x) — defence in depth.
--      * transaction-level advisory lock serialises the solvency gate so two
--        concurrent bets on different battles cannot jointly break the vault.
--      * SOLVENCY GATE: rejects if accepting the bet would push total claims
--        (all user balances + all open bet liabilities) past the vault balance.
--        Conservative: it sums every open ticket's max payout, which
--        overstates true (mutually-exclusive) liability. That errs toward
--        rejecting a safe bet, never toward accepting a ruinous one.
--      * pool bumps RETAINED — pools feed the odds engine's imbalance signal.
--        The double-count bug was in settlement's PAYOUT path, not here.
-- ============================================================================
create or replace function place_bet(
  p_wallet         text,
  p_stake          numeric,
  p_legs           jsonb,
  p_sol_price      numeric,
  p_vault_lamports bigint,
  p_chain          text default 'solana'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leg            jsonb;
  v_battle         battles%rowtype;
  v_progress       numeric;
  v_lamports       bigint;
  v_combo_id       uuid;
  v_combo_odds     numeric := 1;
  v_leg_count      int;
  v_is_combo       boolean;
  v_new_balance    bigint;
  v_effective_odds numeric;
  v_exposure_usd     numeric;
  v_balances_usd     numeric;
  v_vault_usd        numeric;
  MAX_SINGLE constant numeric := 30.0;
  MAX_COMBO  constant numeric := 100.0;
begin
  v_leg_count := coalesce(jsonb_array_length(p_legs), 0);
  if v_leg_count < 1     then raise exception 'no_legs';           end if;
  if p_stake <= 0        then raise exception 'invalid_stake';     end if;
  if p_sol_price <= 0    then raise exception 'invalid_sol_price'; end if;
  if p_vault_lamports < 0 then raise exception 'invalid_vault';    end if;

  v_is_combo := v_leg_count > 1;

  -- Serialise all bet placement so the solvency check + insert are atomic
  -- across concurrent callers. One constant key = one queue.
  perform pg_advisory_xact_lock(hashtext('predarena_place_bet'));

  -- 1. Validate every leg, lock battle rows, accumulate combo odds.
  for v_leg in select * from jsonb_array_elements(p_legs) loop
    select * into v_battle from battles
      where id = (v_leg->>'battle_id')::uuid for update;

    if not found                 then raise exception 'battle_not_found'; end if;
    if v_battle.status <> 'live'  then raise exception 'battle_not_live';  end if;
    if (v_leg->>'side')::int not in (1,2,3) then raise exception 'invalid_side'; end if;

    v_effective_odds := round((v_leg->>'odds')::numeric, 2);
    if v_effective_odds < 1.01        then raise exception 'invalid_odds'; end if;
    if v_effective_odds > MAX_SINGLE  then raise exception 'odds_too_high'; end if;

    v_progress := extract(epoch from (now() - v_battle.start_time))
                / nullif(extract(epoch from (v_battle.end_time - v_battle.start_time)), 0);
    if v_progress is null or v_progress >= 0.80 then
      raise exception 'betting_locked';
    end if;

    v_combo_odds := v_combo_odds * v_effective_odds;
  end loop;

  -- Cap the combo multiplier. Singles are already bounded by the per-leg cap.
  if v_is_combo and v_combo_odds > MAX_COMBO then
    v_combo_odds := MAX_COMBO;
  end if;


  -- 3. Atomic debit. The balance check lives inside the UPDATE so two bets
  --    cannot both pass.
  v_lamports := floor((p_stake / p_sol_price) * 1e9);
  if v_lamports <= 0 then raise exception 'stake_too_small'; end if;

  update user_balances
     set balance_lamports = balance_lamports - v_lamports, updated_at = now()
   where wallet_address = p_wallet and balance_lamports >= v_lamports
  returning balance_lamports into v_new_balance;
  if not found then raise exception 'insufficient_balance'; end if;

  -- 4. Insert legs (server odds), bump pools for the pricing signal.
  v_combo_id := case when v_is_combo then gen_random_uuid() else null end;

  for v_leg in select * from jsonb_array_elements(p_legs) loop
    insert into tickets (
      battle_id, wallet_address, side, stake,
      odds, guaranteed_odds, guaranteed_payout,
      combo_id, combo_legs, combo_odds, chain, claimed
    ) values (
      (v_leg->>'battle_id')::uuid, p_wallet, (v_leg->>'side')::int, p_stake,
      round((v_leg->>'odds')::numeric, 2),
      -- guaranteed_* kept only so History still renders; settlement ignores them.
      round((v_leg->>'odds')::numeric, 2),
      round(p_stake * (v_leg->>'odds')::numeric, 2),
      v_combo_id, v_leg_count, round(v_combo_odds, 2), p_chain, false
    );

    update battles set
      side_a_pool = coalesce(side_a_pool,0) + case when (v_leg->>'side')::int=1 then p_stake else 0 end,
      side_b_pool = coalesce(side_b_pool,0) + case when (v_leg->>'side')::int=2 then p_stake else 0 end,
      draw_pool   = coalesce(draw_pool,0)   + case when (v_leg->>'side')::int=3 then p_stake else 0 end,
      total_pool  = coalesce(total_pool,0)  + p_stake
    where id = (v_leg->>'battle_id')::uuid;
  end loop;

  -- 5. SOLVENCY GATE (post-insert, pre-commit). Because a RAISE rolls back the
  --    whole transaction, we provisionally debit + insert above, then measure
  --    real exposure with those rows present and abort if the vault can't cover
  --    it. Exposure is netted PER BATTLE, PER OUTCOME: within one battle only
  --    one outcome occurs, so opposing bets hedge each other. Worst case for a
  --    battle is its highest-paying single outcome; total exposure sums those
  --    across all open battles. Combo legs are attributed to each of their
  --    battles' outcomes (a safe overcount, since a combo pays only if ALL legs
  --    win). This replaces the naive sum-of-all-payouts, which wrongly treated
  --    a balanced book as maximal liability.
  with open_t as (
    select t.battle_id, t.side,
           t.stake * case when t.combo_id is not null
                          then least(t.combo_odds, MAX_COMBO)
                          else least(t.odds, MAX_SINGLE) end as payout
      from tickets t join battles b on b.id = t.battle_id
     where t.claimed = false and b.status not in ('settled','void')
  ),
  per_side as (
    select battle_id, side, sum(payout) as side_payout
      from open_t group by battle_id, side
  ),
  per_battle as (
    select battle_id, max(side_payout) as worst from per_side group by battle_id
  )
  select coalesce(sum(worst), 0) into v_exposure_usd from per_battle;

  select coalesce(sum(balance_lamports), 0) / 1e9 * p_sol_price
    into v_balances_usd from user_balances;

  v_vault_usd := (p_vault_lamports / 1e9) * p_sol_price;

  -- Vault must cover every withdrawable balance PLUS the worst-case book.
  -- Note: this requires house capital in the vault beyond user deposits — with
  -- zero buffer, any winning fixed-odds bet is insolvent by (odds-1)*stake.
  if v_balances_usd + v_exposure_usd > v_vault_usd then
    raise exception 'insufficient_liquidity';
  end if;

  return jsonb_build_object(
    'ok', true,
    'balance_lamports', v_new_balance,
    'combo_id', v_combo_id,
    'combo_odds', round(v_combo_odds, 2),
    'legs', v_leg_count,
    'debited_lamports', v_lamports
  );
end $$;

revoke all on function place_bet(text,numeric,jsonb,numeric,bigint,text) from public, anon, authenticated;

-- ============================================================================
-- 5. credit_balance — atomic credit used by settlement. Replaces the JS
--    read-then-write (two statements) that could lose updates against a
--    concurrent place_bet debit. `balance = balance + x` is atomic per row.
-- ============================================================================
create or replace function credit_balance(p_wallet text, p_lamports bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_new bigint;
begin
  if p_lamports < 0 then raise exception 'negative_credit'; end if;
  update user_balances
     set balance_lamports = balance_lamports + p_lamports, updated_at = now()
   where wallet_address = p_wallet
  returning balance_lamports into v_new;
  if not found then
    insert into user_balances (wallet_address, balance_lamports, total_deposited, total_withdrawn, updated_at)
    values (p_wallet, p_lamports, 0, 0, now())
    returning balance_lamports into v_new;
  end if;
  return v_new;
end $$;
revoke all on function credit_balance(text,bigint) from public, anon, authenticated;

-- ============================================================================
-- 6. apply_treasury_delta — atomic house-PnL ledger update. balance_usd MAY go
--    negative (visible insolvency, per design). No Math.max(0,...) anywhere.
-- ============================================================================
create or replace function apply_treasury_delta(
  p_stakes_in numeric, p_payouts_out numeric
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_balance numeric;
begin
  update platform_treasury set
    balance_usd        = coalesce(balance_usd,0)        + (p_stakes_in - p_payouts_out),
    total_earned_usd   = coalesce(total_earned_usd,0)   + p_stakes_in,
    total_paid_out_usd = coalesce(total_paid_out_usd,0) + p_payouts_out,
    updated_at = now()
  returning balance_usd into v_balance;
  return v_balance;  -- caller alerts if this is negative
end $$;
revoke all on function apply_treasury_delta(numeric,numeric) from public, anon, authenticated;
