use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct PlaceTicket<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        init,
        payer = bettor,
        space = 8 + Ticket::MAX_SIZE
    )]
    pub ticket: Account<'info, Ticket>,

    pub system_program: Program<'info, System>,
}

pub fn place_ticket(
    ctx: Context<PlaceTicket>,
    picks: String,
    stake: u64,
    combined_odds: u64,
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;

    ticket.bettor = ctx.accounts.bettor.key();
    ticket.picks = picks;
    ticket.stake = stake;
    ticket.combined_odds = combined_odds;
    ticket.created_at = Clock::get()?.unix_timestamp;
    ticket.status = 0; // active

    Ok(())
}
