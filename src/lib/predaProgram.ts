import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";
import idl from "./predarena-idl.json";

const PROGRAM_ID = new PublicKey(
  "ASduBgEErytSwohRDtmhYxZs38FHBqg4CVcDwpkFdSkz"
);

export function getPredaProgram(wallet: any) {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  const program = new anchor.Program(
    idl as anchor.Idl,
    provider
  );

  return { program, provider, connection };
}

export async function createBattle(
  wallet: any,
  tokenA: string,
  tokenB: string,
  startTime: number,
  endTime: number
) {
  const { program } = getPredaProgram(wallet);

  const battle = Keypair.generate();

  const tx = await program.methods
    .initialize(
      tokenA,
      tokenB,
      new anchor.BN(startTime),
      new anchor.BN(endTime)
    )
    .accounts({
      battle: battle.publicKey,
      user: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([battle])
    .rpc();

  return {
    tx,
    battlePublicKey: battle.publicKey.toBase58(),
  };
}

export async function fetchBattles(wallet: any) {
  const { program } = getPredaProgram(wallet);

  const battles = await (program.account as any).battle.all();

  return battles.map((item: any) => ({
    publicKey: item.publicKey.toBase58(),
    ...item.account,
    creator: item.account.creator.toBase58(),
    startTime: Number(item.account.startTime),
    endTime: Number(item.account.endTime),
  }));
}
export { SystemProgram, PublicKey, Keypair, anchor, PROGRAM_ID };
