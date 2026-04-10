import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import idl from "./predarena-idl.json";

const PROGRAM_ID = new PublicKey("ASduBgEErytSwohRDtmhYxZs38FHBqg4CVcDwpkFdSkz");
const DEVNET_RPC = "https://api.devnet.solana.com";

declare global {
  interface Window {
    solana?: any;
  }
}

export function getProvider() {
  if (!window.solana) {
    throw new Error("Phantom wallet not found");
  }

  const connection = new Connection(DEVNET_RPC, "confirmed");
  return new AnchorProvider(connection, window.solana, {
    commitment: "confirmed",
  });
}

export function getProgram() {
  const provider = getProvider();
  return new Program(idl as Idl, PROGRAM_ID, provider);
}

export async function connectWallet() {
  if (!window.solana) {
    throw new Error("Phantom wallet not found");
  }

  const response = await window.solana.connect();
  return response.publicKey;
}

/**
 * Temporary placeholder for the real on-chain call.
 * We are structuring the frontend now so the button works with wallet flow.
 * Replace accounts/args with your exact Anchor instruction shape next.
 */
export async function placeTicketOnChain(params: {
  matchId: number;
  side: string;
  stake: number;
}) {
  const provider = getProvider();
  const program = getProgram();
  const user = provider.wallet.publicKey;

  if (!user) {
    throw new Error("Wallet not connected");
  }

  // TODO: replace this with your exact instruction once we confirm the Rust accounts + args
  console.log("Ready to send place_ticket tx", {
    matchId: params.matchId,
    side: params.side,
    stake: params.stake,
    user: user.toBase58(),
    programId: PROGRAM_ID.toBase58(),
  });

  return {
    ok: true,
    matchId: params.matchId,
    side: params.side,
    stake: params.stake,
    wallet: user.toBase58(),
  };
}

import { Keypair } from "@solana/web3.js";

export async function placeTicketOnChain({
  picks,
  stake,
  combinedOdds,
}: {
  picks: string;
  stake: number;
  combinedOdds: number;
}) {
  const program = getProgram();
  const provider = getProvider();

  const ticketKeypair = Keypair.generate();

  const tx = await program.methods
    .placeTicket(
      picks,
      new BN(stake),
      new BN(combinedOdds)
    )
    .accounts({
      bettor: provider.wallet.publicKey,
      ticket: ticketKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([ticketKeypair])
    .rpc();

  return tx;
}
