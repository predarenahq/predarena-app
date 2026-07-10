import { PublicKey } from '@solana/web3.js'
const PROGRAM_ID = new PublicKey('3mA18tJXtbTcp7eK3W7xENmqEjxReqCcBsBmUnHTg8RB')
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('platform_vault')], PROGRAM_ID)
console.log('Vault PDA:', vault.toBase58())
