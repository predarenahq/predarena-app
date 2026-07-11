-- ============================================================================
-- Withdraw support: atomic debit + lifetime counter.
-- Run in the Supabase SQL editor after 001_fixed_odds.sql.
-- ============================================================================

-- Atomic debit for withdrawals. The `>= p_lamports` guard is inside the UPDATE,
-- so two concurrent withdrawals cannot both pass — the fix for the drain race.
create or replace function debit_balance(p_wallet text, p_lamports bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_new bigint; v_exists boolean;
begin
  if p_lamports <= 0 then raise exception 'invalid_amount'; end if;
  update user_balances
     set balance_lamports = balance_lamports - p_lamports, updated_at = now()
   where wallet_address = p_wallet and balance_lamports >= p_lamports
  returning balance_lamports into v_new;
  if found then return v_new; end if;
  select exists(select 1 from user_balances where wallet_address = p_wallet) into v_exists;
  if v_exists then raise exception 'insufficient_balance';
  else raise exception 'no_balance_row'; end if;
end $$;
revoke all on function debit_balance(text,bigint) from public, anon, authenticated;

-- Lifetime withdrawn counter — INCREMENTS (the old code set it, wiping history).
create or replace function increment_withdrawn(p_wallet text, p_lamports bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update user_balances
     set total_withdrawn = coalesce(total_withdrawn,0) + p_lamports, updated_at = now()
   where wallet_address = p_wallet;
end $$;
revoke all on function increment_withdrawn(text,bigint) from public, anon, authenticated;
