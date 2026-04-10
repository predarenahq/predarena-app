use anchor_lang::prelude::*;
use crate::state::Battle;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + Battle::MAX_SIZE
    )]
    pub battle: Account<'info, Battle>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    token_a: String,
    token_b: String,
    start_time: i64,
    end_time: i64,
) -> Result<()> {
    let battle = &mut ctx.accounts.battle;

    battle.creator = ctx.accounts.user.key();
    battle.token_a = token_a;
    battle.token_b = token_b;
    battle.start_time = start_time;
    battle.end_time = end_time;
    battle.resolved = false;
    battle.winner = 0;

    Ok(())
}
