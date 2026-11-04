# Tests

All tests run against a local Nutshell mint with a fake Lightning backend (no real money):

```
pip install cashu
MINT_BACKEND_BOLT11_SAT=FakeWallet MINT_PRIVATE_KEY=test MINT_DATABASE=./data/mint FAKEWALLET_BRR=TRUE MINT_INPUT_FEE_PPK=0 \
  python3 -m cashu.mint --port 3338 --host 127.0.0.1
```

On Python 3.13, `pip install cashu` (0.21.0) needs a hand: install its dependencies with `breez-sdk-spark==0.18.0`, `limits<4` and `marshmallow<4`, a `coincurve` 21 wheel, then `bip32` and `cashu` with `--no-deps`.

- `library_test.mjs` — the flow with cashu-ts only (`npm i @cashu/cashu-ts && node tests/library_test.mjs`).
- `browser_test.mjs` — the real page in Chromium, three parties with separate storage (`python3 -m http.server 8080 --directory app`, then `node tests/browser_test.mjs`; needs `playwright` and a `tokens.json` with two plain tokens from the local mint, see the top of the file).
- `status_test.mjs` — the status page: four real donations through `index.html` (one released, one left locked, one refunded, one left past its deadline) and one forged ledger entry, then `status.html` must report each from the mint alone. Then, in the donor's own browser, the page must list those four donations by itself and turn them into ledgers that read back the same. Same server as above; it mints its own fake ecash.
- `lightning_test.mjs` — donating with Lightning: the mint check on a new campaign, an invoice paid and minted straight into the lock, a reload between payment and minting (the mint call is blocked, then the page reloads), the mint's answer lost after it minted (the page gets the ecash back with NUT-09 restore), a link with a bad deadline, release with its answer lost (restored at once; and once more with restore blocked too, finished when the page is reopened), a refund paid to a Lightning invoice, a too-large invoice refused before anything moves, and a closed campaign. The fake Lightning backend pays the mint's own invoices, so no wallet is needed.

- `keys_test.mjs` — keys are never lost: a clinic that makes a new key after donations were locked to the old one still certifies them (the old key is kept); a browser holding another clinic key says which keys the token is locked to and does not sign; importing an export keeps the keys that browser had; the Streetcat tab of a browser without the Streetcat key stops before asking the mint; a plain token is refused with a clear message; and a new key that cannot be saved changes nothing.

To use an installed Chrome instead of Playwright's own browser: `CHROME=/usr/bin/google-chrome node tests/…`.

Fees: `lightning_test.mjs` and `status_test.mjs` also run against a mint that charges input fees. Start a second mint with `MINT_INPUT_FEE_PPK=100` (its own `MINT_DATABASE`, `--port 3339`) and run them with `MINT=http://127.0.0.1:3339`. Passed on 4 Nov: amounts drop by the fee at each swap (21 locked → 20 released; 13 refunded as 12 → 10 to the invoice + 1 back) and every step still goes through.

Expected (4 Nov 2026), `browser_test.mjs`:

```
donate: LOCKED 21 sat for MOCHI.
clinic sees: ✓ this token names your clinic key
certify: CERTIFIED 21 sat. Send this token to Streetcat:
release uncertified: Mint refused: not enough pubkeys (2) or signatures (1) present for n_sigs (2).
release certified: RELEASED 21 sat. Import this plain token into Streetcat's wallet now:
refund early: Not yet: the deadline (…) has not passed. Until then only Streetcat + the clinic can move these sats.
refund late: REFUNDED 8 sat. Import this token into your wallet:
```

`status_test.mjs`:

```
fresh refund key per donation: yes (4 different keys) | kept in the browser: 4
release A: RELEASED 21 sat. Import this plain token into Streetcat's wallet now:
refund C before the deadline: Not yet: the deadline (…) has not passed. Until then only Streetcat + the clinic can move these sats.
refund C after the deadline (token only, key kept by this browser): REFUNDED 5 sat. Import this token into your wallet:
status MOCHI: 21 RELEASED | 8 LOCKED
lookup, receipt of B: LISTED ✓ · 8 sat · LOCKED
lookup, token of D: NOT LISTED ✗ · 3 sat · NOT COUNTED
status TEO: 5 REFUNDED | 3 REFUNDABLE
status forged: 8 NOT COUNTED (not counted: lock: its deadline is not the campaign deadline; not proven to be issued by the mint (no valid DLEQ proof); the mint says UNSPENT, which it also says of ecash it never issued)
this browser's donations: MOCHI: 21 RELEASED | 8 LOCKED / TEO: 5 REFUNDED | 3 REFUNDABLE
  as ledgers: MOCHI · 2 tokens · keys in their roles: true · deadline: true · no refund keys: true | TEO · 2 tokens · keys in their roles: true · deadline: true · no refund keys: true
  published and read back: 21 RELEASED | 8 LOCKED
```

`lightning_test.mjs`:

```
mint check:
  Mint: Cashu mint · Nutshell/0.21.0
  ✓ NUT-11: locks with 2 signatures and a refund key
  ✓ NUT-07: proof states and the signatures used (status page)
  ✓ NUT-12: DLEQ proofs (status page)
  ✓ NUT-04: Lightning invoices in sat (donate with Lightning)
  ✓ NUT-09: restore (gets ecash back if an answer is lost)
  Input fee: 0 (swaps are free)
lightning donation: LOCKED 21 sat for MOCHI. | tells where to send it: true
  lock in the minted token: 2 of [Streetcat, clinic] | refund key is the receipt's: true | pending invoices left: 0
paid but not collected: QR shown: true | invoice kept in the browser: 1
after the reload: LOCKED 8 sat for MOCHI. | pending invoices left: 0
mint answer lost: LOCKED 34 sat for MOCHI. | pending invoices left: 0
link with a bad deadline: Failed: this campaign has no valid deadline, so a donation could never be refunded: do not use …
release, answer lost: RELEASED 21 sat. Import this plain token into Streetcat's wallet now (this browser keeps a copy below): | kept in the browser: 1
release, answer lost, no restore yet: Interrupted: the mint took the ecash but its answer was lost, and it could not hand the result back yet. … | unfinished: 1
after reopening: Recovered: an operation was interrupted last time and the mint handed its result back … release: 8 sat … | unfinished: 0 | released kept: 2
donating to the closed campaign: Failed: this campaign closed on …: a donation now could be taken back at once, so…
refund tab lists this browser's donations: 5 TEO · 13 sat · refund after … | TEO · 5 sat · refund after …
refund to Lightning: REFUNDED 13 sat: 10 sat sent to your Lightning wallet. / The other 3 sat (what the invoice did not ask for, plus any unused fee) came back as ecash. Import it into any Cashu wallet:
  the invoice was paid: PAID
too large an invoice: Not possible: this invoice is for 50 sat, but the donation is 5 sat and the mint keeps up to 0 sat for fees. Make an inv…
same donation, as ecash: REFUNDED 5 sat. Import this token into your wallet:
```

`keys_test.mjs`:

```
new clinic key: a different one | asked first, saying the old one is kept: true | shown: + 1 older key kept
clinic sees: ✓ this token names an older clinic key kept in this browser (<clinic key 1>)
certify with the kept key: CERTIFIED 21 sat. Send this token to Streetcat:
Streetcat sees: ✓ this token names your Streetcat key
release: RELEASED 21 sat. Import this plain token into Streetcat's wallet now (this browser keeps a copy below):
other browser sees: ✗ no clinic key in this browser can sign this token. / It is locked to <Streetcat key> + <clinic key 1>. / This browser's clinic key is <other clinic key>. Sign it in the browser that holds the campaign's clinic key, or import that key in Keys.
other browser certifies: Failed: no clinic key in this browser can sign this token.
export carries the kept key: true
import: Imported. The keys this browser had before are kept too. | clinic keys held there: 3 | current: <clinic key 2> + 2 older keys kept
other browser certifies now: CERTIFIED 8 sat. Send this token to Streetcat:
release without the Streetcat key: Not possible: no Streetcat key in this browser can sign this token. | swaps sent: 0
release where the key is: RELEASED 8 sat. Import this plain token into Streetcat's wallet now (this browser keeps a copy below):
plain token in the clinic tab: cannot read token: this is not a locked donation token
storage refuses the kept list: This browser could not save a new key, so nothing changed. | clinic key unchanged: true
```
