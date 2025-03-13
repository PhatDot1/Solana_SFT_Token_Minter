import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { keypairIdentity, token, Metaplex } from "@metaplex-foundation/js";
import type { TokenVault } from "../target/types/token_vault";

// Configure the client to use the local cluster
anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.TokenVault as anchor.Program<TokenVault>;


const mintAuthority = program.provider.wallet.payer;
const decimals = 9;

let [tokenAccountOwnerPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_account_owner_pda")],
  program.programId
);

const metaplex = new Metaplex(program.provider.connection).use(
  keypairIdentity(program.provider.wallet.payer)
);

const createdSFT = await metaplex.nfts().createSft({
  uri: "https://gateway.pinata.cloud/ipfs/bafkreiecdgt2lucrfubxuzpgyfdqcpytxdh7h2vfmmktofejsoajfr56au",
  name: "Encode SFT",
  symbol: "ENC",
  sellerFeeBasisPoints: 100,
  updateAuthority: mintAuthority,
  mintAuthority: mintAuthority,
  decimals: decimals,
  tokenStandard: "Fungible",
  isMutable: true,
});

console.log(
  "Creating semi fungible spl token with address: " + createdSFT.sft.address
);

// Added log to output a link to view the minted SFT on Solscan (Devnet)
console.log(
  "View minted token on Solscan: https://solscan.io/token/" +
    createdSFT.sft.address +
    "?cluster=devnet"
);

const mintDecimals = Math.pow(10, decimals);

let mintResult = await metaplex.nfts().mint({
  nftOrSft: createdSFT.sft,
  authority: program.provider.wallet.payer,
  toOwner: program.provider.wallet.payer.publicKey,
  amount: token(100 * mintDecimals),
});

console.log("Mint to result: " + mintResult.response.signature);

const tokenAccount = await getOrCreateAssociatedTokenAccount(
  program.provider.connection,
  program.provider.wallet.payer,
  createdSFT.mintAddress,
  program.provider.wallet.payer.publicKey
);

console.log("tokenAccount: " + tokenAccount.address);
console.log("TokenAccountOwnerPda: " + tokenAccountOwnerPda);

let tokenAccountInfo = await getAccount(program.provider.connection, tokenAccount.address);
console.log(
  "Owned token amount: " + tokenAccountInfo.amount / BigInt(mintDecimals)
);

let [tokenVault] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_vault"), createdSFT.mintAddress.toBuffer()],
  program.programId
);
console.log("VaultAccount: " + tokenVault);

let confirmOptions = {
  skipPreflight: true,
};

let txHash = await program.methods
  .initialize()
  .accounts({
    tokenAccountOwnerPda: tokenAccountOwnerPda,
    vaultTokenAccount: tokenVault,
    senderTokenAccount: tokenAccount.address,
    mintOfTokenBeingSent: createdSFT.mintAddress,
    signer: program.provider.publicKey,
  })
  .rpc(confirmOptions);

console.log(`Initialize`);
await logTransaction(txHash);

console.log(`Vault initialized.`);
tokenAccountInfo = await getAccount(program.provider.connection, tokenAccount.address);
console.log(
  "Owned token amount: " + tokenAccountInfo.amount / BigInt(mintDecimals)
);
tokenAccountInfo = await getAccount(program.provider.connection, tokenVault);
console.log(
  "Vault token amount: " + tokenAccountInfo.amount / BigInt(mintDecimals)
);

async function logTransaction(txHash) {
  const { blockhash, lastValidBlockHeight } =
    await program.provider.connection.getLatestBlockhash();

  await program.provider.connection.confirmTransaction({
    blockhash,
    lastValidBlockHeight,
    signature: txHash,
  });

  console.log(
    `Solana Explorer: https://explorer.solana.com/tx/${txHash}?cluster=devnet - Solana Explorer: https://explorer.solana.com/address/${txHash}?cluster=devnet`
  );
}
