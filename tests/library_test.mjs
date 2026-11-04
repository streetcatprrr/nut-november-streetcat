// Same flow as vetlock_proto.py, but with cashu-ts (the library the browser pages will use), against the local Nutshell mint.
import { Wallet, LockBuilder, getEncodedToken, getDecodedToken, createRandomSecretKey, getPubKeyFromPrivKey } from '@cashu/cashu-ts';
const MINT = process.argv[2] || 'http://127.0.0.1:3338';
const say = (...a) => console.log(...a);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const keyOf = () => { const skb = createRandomSecretKey(); return { sk: hex(skb), pk: hex(getPubKeyFromPrivKey(skb)) }; };

const donor = new Wallet(MINT), streetcat = new Wallet(MINT), clinic = new Wallet(MINT);
await donor.loadMint(); await streetcat.loadMint(); await clinic.loadMint();
const kD = keyOf(), kS = keyOf(), kC = keyOf();
say('mint', MINT, 'keyset', donor.keysetId);

// donor gets 256 sat from the fake-lightning mint
const q = await donor.createMintQuoteBolt11(256);
let proofs; for (let i = 0; i < 30; i++) { try { proofs = await donor.mintProofsBolt11(256, q); break; } catch (e) { await new Promise(r => setTimeout(r, 500)); } }
say('donor funded', proofs.reduce((s, p) => s + p.amount, 0), 'sat');

// donor's wallet sends plain ecash (what any wallet can do)
const { keep, send } = await donor.send(21, proofs);
const plainToken = getEncodedToken({ mint: MINT, proofs: send });
say('plain donation token', plainToken.slice(0, 40) + '…');

// DONATION PAGE: receives the plain token and re-issues it LOCKED: Streetcat + clinic must sign; after the deadline the donor's key alone can refund
const page = new Wallet(MINT); await page.loadMint();
const deadline = Math.floor(Date.now() / 1000) + 3;              // 3 s for the test; months in real life
const lock = new LockBuilder().addMainPubkey([kS.pk, kC.pk]).requireMainSignatures(2).addRefundPubkey(kD.pk).lockUntil(deadline);
const locked = await page.ops.receive(plainToken).asLocked(lock).run();
const lockedToken = getEncodedToken({ mint: MINT, proofs: locked });
say('locked token', lockedToken.length, 'chars; secret:', locked[0].secret.slice(0, 150));

const tryReceive = async (who, label, token, keys) => {
  try { const got = await who.ops.receive(token).privkey(keys).run(); say('  ' + label + ': OK,', got.reduce((s, p) => s + p.amount, 0), 'sat'); return true; }
  catch (e) { say('  ' + label + ': REFUSED ->', String(e.message || e).slice(0, 120)); return false; }
};
say('== before the deadline');
await tryReceive(streetcat, 'Streetcat alone', lockedToken, [kS.sk]);
await tryReceive(donor, 'Donor refund', lockedToken, [kD.sk]);
await tryReceive(streetcat, 'Streetcat + clinic', lockedToken, [kS.sk, kC.sk]);

say('== a second locked donation, nobody certifies, deadline passes');
const { send: send2 } = await donor.send(8, keep);
const locked2 = await page.ops.receive(getEncodedToken({ mint: MINT, proofs: send2 })).asLocked(new LockBuilder().addMainPubkey([kS.pk, kC.pk]).requireMainSignatures(2).addRefundPubkey(kD.pk).lockUntil(Math.floor(Date.now() / 1000) + 3)).run();
const lockedToken2 = getEncodedToken({ mint: MINT, proofs: locked2 });
await tryReceive(donor, 'Donor refund before deadline', lockedToken2, [kD.sk]);
await new Promise(r => setTimeout(r, 4000));
await tryReceive(donor, 'Donor refund after deadline', lockedToken2, [kD.sk]);
say('DONE');
