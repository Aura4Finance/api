import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
const PRIVATE_KEY = "suiprivkey1qqjg32h8ke4elvym3qzx0arwh4xe3xqlu048u6k3s8ks3cmrke9dzx7uwmp"; 
const keyPair = Ed25519Keypair.fromSecretKey(PRIVATE_KEY);
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { fromBase64 } from "@mysten/sui/utils";

async function sign(){
    const pair = await keyPair.signPersonalMessage(new TextEncoder().encode("Add crypto account as a settlement account"));
    const isVerified = await verifyPersonalMessageSignature(fromBase64(pair.bytes), pair.signature)
    console.log(isVerified.verifyAddress(keyPair.getPublicKey().toSuiAddress()));
    console.log(keyPair.getPublicKey().toSuiAddress());
    console.log("Bytes :" + pair.bytes);
    console.log("Signatire :" + pair.signature)
}
sign()