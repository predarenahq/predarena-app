pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("ASduBgEErytSwohRDtmhYxZs38FHBqg4CVcDWpkFdSkz");

#[program]
pub mod preda_program {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        token_a: String,
        token_b: String,
        start_time: i64,
        end_time: i64,
    ) -> Result<()> {
        initialize::handler(ctx, token_a, token_b, start_time, end_time)
    }

    pub fn place_ticket(
        ctx: Context<PlaceTicket>,
        picks: String,
        stake: u64,
        combined_odds: u64,
    ) -> Result<()> {
        instructions::place_ticket(ctx, picks, stake, combined_odds)
    }
}
