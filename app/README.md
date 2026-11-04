# The app

Two static pages, no server: `index.html` (the tool) and `status.html` (the public status page), both on `cashu-bundle.js` (cashu-ts 4.13 bundled with esbuild from `lib-entry.mjs`:
`npx esbuild lib-entry.mjs --bundle --format=iife --global-name=cashu --minify --outfile=cashu-bundle.js`). `index.html` also loads `qrcode.min.js` for the invoice QR (qrcode-generator 2.0.4 by Kazuhiko Arase, MIT; minified with esbuild, licence header kept).

`index.html` first asks who you are — donor, clinic or Streetcat — and shows only that role's tabs (the choice is kept in the browser; a campaign link opens straight on Donate). Each role also has its own address that never asks: `/donate`, `/clinic`, `/streetcat` (rewrites in `vercel.json`; locally `index.html?role=clinic`), and `/status` for the status page. Both pages can be added to a phone's home screen as an app (`manifest.webmanifest`, `icons/`): the clinic gets a link to `/clinic` and installs it. Tabs:

- **Donate** — open the campaign link, choose an amount and pay the **Lightning invoice** from any wallet (QR, "open in wallet", copy). The page asks the campaign's mint for the invoice (NUT-04) and, once it is paid, mints the sats directly as proofs locked to *Streetcat + clinic* (2 signatures), with a refund path, after the deadline, to a key generated in your browser — a new key for every donation. The invoice and its key are kept in the browser, so a reload (a phone switching to the wallet app) picks the payment up again. Or paste a plain ecash token from the campaign's mint and the page swaps it into the same lock. Either way you get a receipt (keep it private: it holds that key; the browser keeps a copy) and the locked token to send to Streetcat (copy or share). Closed campaigns refuse donations.
- **Clinic: certify** — the clinic's key lives in its browser; it checks the token names that key (or an older one kept there), signs offline, and hands back a *certified* token. If the token names no key held in this browser, it says which keys the token is locked to. It refuses to sign after the deadline.
- **Streetcat: release** — adds Streetcat's signature and swaps at the mint; the mint refuses unless the clinic's signature is there. Without the Streetcat key the token names, the page stops before asking the mint.
- **Donor: refund** — after the deadline, the receipt alone takes the sats back (or just the locked token, from the browser that made the donation: it lists them). Optionally paste a Lightning invoice and the refund is paid straight to it (NUT-05); the page checks the invoice with the mint first, and whatever the invoice did not ask for comes back as ecash.
- **Streetcat: new campaign** — first reads the mint (NUT-06 info, NUT-02 keysets): it needs NUT-11, NUT-07 and NUT-12, says whether NUT-04 Lightning invoices work and what the input fee is. Then builds the donation link for one operation (name, mint, both public keys, deadline, optionally where donors send the token) and the empty ledger for its status page.
- **Keys** — generate, export and import the browser keys. Everywhere a key is shown it is painted in the colour of its role — orange (Bitcoin's) for donors' refund keys, blue for the clinic, green for Streetcat — with each group of 4 characters in its own shade taken from the key itself, so the same key always looks the same and two keys of one role can be told apart at a glance. A new or imported clinic or Streetcat key never deletes the one before: it is kept in the browser and still signs the tokens locked to it, and exports carry it. Keys are per browser and per address: another browser, a private tab or an app's built-in browser keeps its own.

Every call that creates ecash (minting a paid invoice, and the swaps that lock pasted ecash, release and refund) builds its outputs in the page and saves them in the browser *before* asking the mint. If the answer is lost, the page asks the mint for it again (NUT-09 restore): at once, or the next time it opens. Released tokens are kept in the browser too, until Streetcat moves them to its wallet. A campaign link is checked before any money moves: a whole-number deadline in the next two years, valid and distinct keys, an https mint; after minting or swapping, the page checks the lock written in the new proofs. `STREETCAT_KEYS` (empty for now) pins Streetcat's published key once it exists.

## Status page

`status.html?l=<ledger URL>` (or paste the ledger). A ledger is one JSON file per campaign, published by Streetcat in `app/campaigns/` — for example `app/campaigns/mochi.json`, opened as `status.html?l=campaigns/mochi.json`. Only `app/` is published, so the ledgers live inside it:

```json
{
  "campaign": { "name": "MOCHI", "op": "sterilisation", "mint": "https://mint.example", "streetcat": "02…", "clinic": "03…", "deadline": 1796083199 },
  "clinicKeySource": "https://clinic.example/where-it-published-its-key",
  "donations": ["cashuB…", "cashuB…"]
}
```

`donations` holds every locked token exactly as donors sent it. Publishing them is safe: they need the clinic's signature, or after the deadline the donor's own refund key, and each donation has its own refund key.

For every donation the page checks, in the browser and against the mint only:

1. **The lock** written in each proof: Streetcat + clinic, 2 signatures, the campaign deadline, a refund key.
2. **That the mint issued it**: the DLEQ proof (NUT-12) against the mint's published keys. `UNSPENT` alone proves nothing — a mint says that about anything it has never seen.
3. **What happened**: the proof state (NUT-07) and, for spent proofs, the witness the mint accepted. *Locked* / *refundable* (deadline passed, unspent) / *released* (clinic and Streetcat signed) / *refunded* (the donor's refund key signed).

Opened in the browser that made donations (same address as the donation app), the page also lists **the donations made from this browser**, from the app's own copies of the locked tokens, with the same checks against the mint; the campaign is read from the lock in each token (Streetcat's key first, as the app writes it). "Copy them as ledgers" gives one ledger per campaign, ready for `app/campaigns/`; refund keys are never in it.

Tokens that fail 1 or 2 are listed as *not counted*, with the reason. A box lets any donor check that their own token is listed. What the page cannot prove: that the list is complete (an omitted donation stays locked and refundable), or that the mint still holds the bitcoin behind its ecash.

Open both pages locally with any static server (`python3 -m http.server 8080 --directory app`) — a `file://` URL also works for `index.html`, since the bundle is a classic script; `status.html` needs a server to fetch a ledger by URL, but a pasted ledger works anywhere.
