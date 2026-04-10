use anchor_lang::prelude::*;

#[account]
pub struct Battle {
    pub creator: Pubkey,
    pub token_a: String,
    pub token_b: String,
    pub start_time: i64,
    pub end_time: i64,
    pub resolved: bool,
    pub winner: u8,
}

impl Battle {
    pub const MAX_SIZE: usize =
        32 + // creator
        4 + 20 + // token_a
        4 + 20 + // token_b
        8 + // start_time
        8 + // end_time
        1 + // resolved
        1; // winner
}

#[account]
pub struct Ticket {
    pub bettor: Pubkey,
    pub picks: String,
    pub stake: u64,
    pub combined_odds: u64,
    pub created_at: i64,
    pub status: u8,
}

impl Ticket {
    pub const MAX_SIZE: usize =
        32 + // bettor
        4 + 200 + // picks string
        8 + // stake
        8 + // combined_odds
        8 + // created_at
        1; // status
}
