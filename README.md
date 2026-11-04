# Vet-certified donations in ecash

**Streetcat's project for Nut November 2026.** Donations in Cashu ecash that nobody can spend — not even the charity — until the veterinary clinic certifies that the operation happened. If it never happens, the donor gets the sats back automatically.

> *Status (4 Nov 2026): the whole flow and the public status page work in a real browser against a local Nutshell mint — see [`app/`](app/) and [`tests/`](tests/). With real sats on the Minibits mint, a donation over Lightning has been locked, certified by the clinic key and released with Streetcat's. Next: a real refund, and the first cat.*

## Why

[Streetcat](https://streetcat.org) is a registered non-profit in Spain that feeds feral colonies, pays vet bills and runs trap-neuter-return. A sterilisation costs 40–80 €; a street cat eats 70–100 g of food a day. We publish receipts for everything, but a receipt is published *after* the money moved. Cashu lets us turn that around: **the money cannot move until the receipt exists.**

Streetcat also makes [STREETCATS](https://www.streetcats.xyz/nonfungible-cats), a bearer-art collection on Nonfungible.cash (itself built on Cashu). That is where the ecash comes from; this project is where it goes.

## How it works

Everything uses spending conditions that already exist in the protocol ([NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md) P2PK, [NUT-14](https://github.com/cashubtc/nuts/blob/main/14.md) HTLC). No mint has to change anything.

1. **Donate.** The donor pays a **Lightning invoice from any wallet** — no Cashu wallet needed — and the page (client-side, using cashu-ts) mints the ecash straight into locked proofs ([NUT-04](https://github.com/cashubtc/nuts/blob/main/04.md) + NUT-11): there is never a moment when the donation is spendable by anyone. Donors who already hold ecash on the campaign's mint can paste it instead, and the page swaps it into the same lock:
   - spendable only with **two signatures: Streetcat + the clinic** (`n_sigs = 2`), and
   - after a deadline (`locktime`), **also** spendable by the **donor's refund key** alone (a new key for every donation).
   The donor keeps the locked token. Nobody can spend it yet. If the phone switches to the wallet app and the page reloads, the paid invoice is picked up again on return.
2. **Operate.** The cat is sterilised. Streetcat pays the clinic **in euros**, as always. The clinic's role is to attest, not to receive sats.
3. **Certify.** The clinic signs the release with a key it published once (on its own website or printed on its invoices). One click on the clinic page.
4. **Release.** Streetcat adds its signature and the mint accepts the swap. The sats go to Streetcat's reserve. Anyone can check that the released token carried the clinic's signature.
5. **Or refund.** No certification before the deadline → the donor takes the sats back with the refund key, as ecash or paid straight to a Lightning invoice. Under NUT-11 the two-signature path stays open after the deadline too (we checked Nutshell 0.22.1 and CDK 0.17.7, and a local test confirms it), so a late certification could still win the race; the clinic page refuses to sign once the deadline has passed.
6. **Follow it.** The campaign's [status page](app/status.html) lists every locked donation and asks the mint what happened to each one: still locked, released with the clinic's signature, or refunded. It trusts nobody, Streetcat included: the lock is read from the token, the mint's DLEQ proof (NUT-12) shows the ecash is real, and the signatures the mint returns for spent ecash (NUT-07) show who signed.

Variant for clinics that do not want a key: the clinic generates a secret code before the operation and hands over only its hash; donations are locked to that hash (HTLC) plus Streetcat's signature; the code is printed on the invoice when the operation is done.

### What it guarantees, and what it does not

- Guaranteed by the mint: the sats can only move with the clinic's signature (plus Streetcat's), or back to the donor once the deadline has passed.
- Not guaranteed: that the clinic signs honestly. That is the same trust as today's invoice — but now the clinic, not the charity, is the one who vouches.
- Trust in the mint: it holds the bitcoin and enforces the lock. It cannot forge the clinic's signature, but it could lose or keep the sats, and nothing here proves its reserves. Fine for small donations held for a few weeks; not for large sums.
- Honest wording for donors: *your sats do not pay the vet bill; we pay it in euros. Your sats are released to Streetcat only when the clinic certifies the operation, and you get them back if it never happens.*

## Prototype

`prototype/vetlock_proto.py` starts a local [Nutshell](https://github.com/cashubtc/nutshell) mint with a fake Lightning backend (no real money), creates three wallets (donor, Streetcat, clinic) and runs the whole flow. Verified output in `prototype/run-2026-11-04.log`:

| Scenario | Mint says |
|---|---|
| Streetcat tries to spend without the clinic's code | `no HTLC preimage provided` |
| Streetcat with a wrong code + signature | `HTLC preimage does not match` |
| Streetcat with the clinic's code + signature | **accepted** |
| Donor refund before the deadline | refused |
| Donor refund after the deadline (3 s lock) | **accepted** |
| Two-signature lock, Streetcat alone | `signatures (1) present for n_sigs (2)` |
| Two-signature lock, Streetcat + clinic | **accepted** |

Run it: `pip install cashu && python3 prototype/vetlock_proto.py` (Python ≥ 3.10).

### Wallet and mint support (from the [NUTs compatibility table](https://cashubtc.github.io/nuts/))

| | P2PK (NUT-11) | HTLC (NUT-14) |
|---|---|---|
| Nutshell, cdk, cashu-ts | yes | yes |
| Minibits, Cashu.me, Sovran | yes | no |
| Macadamia | no | no |
| Mints: Nutshell, cdk-mintd, nutmix | yes | yes |

Donors never need special wallet support: any Lightning wallet pays the invoice (or they send plain ecash), and the donation page does the locking; releases and refunds also go through the project's pages.

## Progress

- **3 Nov** — design: who holds the key (the clinic, never the charity), euros for the clinic, sats for the reserve.
- **4 Nov** — prototype passes all scenarios on a local Nutshell mint; wallet/mint support checked.
- **4 Nov** — `app/index.html`: donate / certify / release / refund / campaign / keys, all client-side with cashu-ts; browser end-to-end test passes (three parties, separate storage, local mint).
- **4 Nov** — `app/status.html`: public status page per campaign, verified against the mint alone (lock, DLEQ, state and the signatures the mint accepted); a forged entry is flagged and not counted. A fresh refund key for every donation, so a shared receipt never exposes other donations. Checked that a late certification is still accepted after the deadline (NUT-11) and said so above. `tests/status_test.mjs` passes.
- **4 Nov** — donate with Lightning: the page asks the campaign's mint for an invoice (QR, wallet link, copy) and mints the paid sats directly into the two-signature lock; a paid invoice survives a reload. Refunds can go straight to a Lightning invoice, checked with the mint before anything moves. New campaigns check the mint first (NUT-04/07/11/12, input fee); closed campaigns and links with a bad deadline or keys refuse donations. After an independent review: every call that creates ecash saves its outputs first, so a lost answer from the mint is recovered with NUT-09 restore — at once, or the next time the page opens. `tests/lightning_test.mjs` passes, as do the three older tests.
- **4 Nov** — the app is deployed for the first real test (private, behind Vercel authentication). Its mint check, run against the real Minibits mint (`https://mint.minibits.cash/Bitcoin`): cdk-mintd 0.17.7, NUT-04, 07, 09, 11 and 12 supported, input fee 0.
- **4 Nov** — the first real donation: 21 sat paid from Wallet of Satoshi, minted by Minibits straight into the lock. Certifying it failed: the browser used for it held a different clinic key from the one written in the campaign, and the page only said "not your clinic key". Now a new or imported clinic or Streetcat key never deletes the one before (it is kept and still signs), and the clinic and Streetcat tabs say which keys a token is locked to when this browser cannot sign it. `tests/keys_test.mjs` passes, as do the older tests.
- **4 Nov** — the whole path with real sats: a second test campaign, its keys all in one phone browser; 21 sat paid from Wallet of Satoshi, locked by Minibits, certified with the clinic key, released with Streetcat's — the mint accepted it. On the way, "open donation page" now lands on the Donate tab, and the public keys have copy buttons. The first donation turned up in the phone's other browser — an app's built-in browser, which keeps its own storage — together with its refund key; it stays locked until its deadline, to test a real refund there. The second campaign's ledger is published in [`app/campaigns/tnr2.json`](app/campaigns/tnr2.json), and the status page can now also list the donations made from the browser it is opened in.
- next — the real refund of the first donation (after its deadline, 6 Nov), first cat with a real pending sterilisation.

## Licence

MIT.
