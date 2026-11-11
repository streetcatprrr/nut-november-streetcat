# Destination-bound P2PK: the `dest` tag

`draft` · `experimental` · depends on NUT-10, NUT-11 (uses NUT-07, NUT-09)

Streetcat, Nut November 2026. Not reviewed by anyone outside this project. It runs on a patched test mint only
(`mint/`, Nutshell 0.21.0) and is exercised by `tests/dest_test.mjs`. Do not lock real funds with it.

## Why

A NUT-11 lock says **who must sign**. It cannot say **where the value may go**. With `SIG_ALL` the signers fix the outputs
of a spend, but the one who made the lock has no say in it: two signers who agree can send the ecash anywhere.

The case that asks for it: a donor locks ecash for a job. It should reach a provider the donor was shown, when that
provider certifies the job, or stay locked, or go back to the donor after the deadline, and nothing else. The organiser
who orders the job has to agree to each payment, and can send the money nowhere but to those providers.

## The tag

A P2PK secret MAY carry the tag `["dest", "pubkeys"]`. In such a lock:

- `data` is the **ordering key**. It must sign every spend on the main path and can never be paid: a lock whose `data`
  key is also one of its `pubkeys` is refused (Nutshell's NUT-10 reader already refuses a key given twice, by its x
  coordinate).
- `pubkeys` are the **payees**: the only keys the value may be paid to.
- `sigflag` MUST be `SIG_ALL`.
- `n_sigs` MUST be 2 or more. A payment always takes two signatures (the ordering key's and the payee's); a lock that
  asks for one would let the ordering key alone move the value from the lock to the same lock, to no end but fees.
- `locktime`, `refund` and `n_sigs_refund` mean what they mean in NUT-11, except that a lock with no `refund` key has no
  refund path at all (see below).

`pubkeys` is the only policy defined. `dest` appears at most once and has exactly one value.

```json
["P2PK", {
  "nonce": "5d11913ee0f92fefdc82a6764fd2457a",
  "data": "<ordering key>",
  "tags": [["sigflag", "SIG_ALL"], ["n_sigs", "2"], ["pubkeys", "<payee A>", "<payee B>"],
           ["locktime", "1795000000"], ["refund", "<donor key>"], ["dest", "pubkeys"]]
}]
```

## Spending on the main path

All inputs of the transaction carry the same lock (the NUT-11 rule for `SIG_ALL`). The witness of the first input holds the
signatures, for each output of the swap in the same order the output opened, and the transaction's inputs (the `Y` of each,
in the transaction's order):

```json
{"signatures": ["<sig>", "<sig>"],
 "outputs": [{"secret": "<the output's secret>", "r": "<its blinding factor: 64 lower-case hex digits>"}],
 "inputs": ["<Y of the first input>", "<Y of the second>"]}
```

The mint accepts the spend only if all of this holds:

1. It is a swap. A `dest` lock cannot be melted on the main path.
2. The lock is `SIG_ALL`, asks for at least two signatures, and its `dest` policy is one the mint knows.
3. At least `n_sigs` distinct keys of `data` and `pubkeys` have a valid signature on the NUT-11 `SIG_ALL` message, and
   the key in `data` is one of them. The witness holds no more signatures than the lock has keys.
4. There is one opening per output, and for each `B_ = hash_to_curve(secret) + r·G`, with `r` written as 64 lower-case
   hex digits and nothing else, and the secret with no white space before or after it.
5. Every opened secret is one of two things:
   - **the same lock**: a P2PK secret with the inputs' `data` and `tags`, value for value and in the same order, and a
     nonce no input has;
   - **a payment**: a P2PK secret whose `data` is one of the lock's `pubkeys`, written exactly as the lock writes it,
     with no tags, and that key is one of the valid signers of this transaction.
6. No two outputs have the same secret, and none has a secret the mint has already seen spent (a guard against a
   wallet's mistake; see Limits for what it does not stop).
7. The witness's `inputs` is the list of the transaction's inputs: the `Y` of each (lower-case hex), all of them, once,
   in the transaction's order.

When it accepts, the mint **stores the first input's witness with every input** of the transaction. NUT-07 then returns
it for any of them. With rule 7, every spend the mint accepts is one of two things: a payment on the main path whose
record says all that is needed to check it, or a spend by the refund keys.

So each spend splits the value between payees who signed for it and the same lock. Who certifies is who gets paid; what is
not paid stays under the conditions the locker chose, refund key and deadline included.

`inputs` is checked by the mint (rule 7), for whoever reads the mint afterwards (below).

## The refund path

NUT-11's, for the lock's `refund` keys: once `locktime` has passed they can spend with no rule about outputs, and can
melt. Only the signatures of the witness are read. The main path stays open after `locktime`, as in NUT-11.

One difference: NUT-11 lets anyone spend an expired lock that names no refund key. A `dest` lock that names none never
opens that way. What stays under such a lock can be rebuilt by anyone from the mint, so "anyone" would be whoever asks
first.

## What anyone can check, and what the payee can do alone

NUT-07 returns the witness of spent proofs, and with it the opened outputs. Because the mint keeps the witness with every
input, whoever knows **any** proof of a spend can read where the value went: how much to which payee, and how much back
under the lock. The signers cannot hide a spend from the locker by putting a proof of their own first.

The opened secret and `r`, with the blind signature the mint returns for that `B_` (NUT-09), are the whole proof. A payee
does not depend on anyone to hand over its payment, nor a donor to find what remains of a donation: both can rebuild the
proofs from what the mint holds. They are useless to anyone else, since every output is locked.

Who signed can be checked too. The witness lists the transaction's inputs, and the mint refuses a main-path spend whose
list is not exactly them. Whoever holds those proofs can then write the `SIG_ALL` message again (the inputs' secrets and `C`, the opened
outputs' amounts and `B_`) and verify the signatures: a spend signed by the ordering key and by every payee it pays is a
payment on the main path, proven by the mint's record. A reader SHOULD count nothing else as one. A spend by the refund
keys can open outputs too, even pay a payee, and must not be taken for the organiser's.

## Mint info

A mint that enforces this says so in its NUT-06 info, under NUT-11:

```json
"11": {"supported": true, "dest": ["pubkeys"]}
```

## Wallets

- A wallet MUST NOT lock with `dest` at a mint that does not announce it. Such a mint ignores the tag, and the lock is
  then a plain `n_sigs`-of-n `SIG_ALL` lock: any `n_sigs` of the keys could send the ecash anywhere.
- A wallet that receives or audits a `dest` lock SHOULD check the mint's announcement again, and read `pubkeys` as the
  list of everyone who can be paid. It MUST refuse a lock with a tag it does not know: `["Dest", "pubkeys"]` is not this
  tag, and a mint reads such a lock as a plain multisig.
- A `dest` lock with a `locktime` MUST name a `refund` key, and that key MUST NOT be the ordering key or a payee: after
  the deadline it takes everything, with no rule about outputs.
- Keys are compared as they are written. A payee written `03…` in the lock and `02…` in a payment is another key to the
  mint, though one signature fits both. A wallet MUST write a payment's `data` as the lock writes the payee, and SHOULD
  refuse a lock that writes a key otherwise than the campaign it belongs to.
- **The outputs of a spend MUST NOT be predictable to anyone but the signers.** A mint signs a blinded message once.
  If a wallet derives a spend's outputs from data others can see (the inputs' secrets, say), anyone can have the mint sign
  those blinded messages first, for a sat of their own, and the spend is refused for ever ("outputs already signed").
  Random nonces and blinding factors, or a secret seed shared by the signers alone, avoid it. Nothing has to be
  predictable for the outputs to be found again: the witness opens them.

## Limits

- **Privacy.** The outputs of a spend are opened to the mint and, through NUT-07, to anyone who knows a spent proof.
  They can be followed one step. A payee gets its privacy back by swapping. This suits flows that are public already (a
  donation ledger); it is wrong for anything else.
- **Size.** Openings make the witness long: a secret and 64 characters per output, and the mint keeps it once per input.
  A mint needs a witness limit well above Nutshell's default of 1024 (`MINT_MAX_WITNESS_LENGTH`; that setting is one
  limit for every kind of lock), and a lock with many payees comes close to the 1024 limit for secrets.
- **One lock per transaction**, as with any `SIG_ALL` spend. Donations with different refund keys are spent one by one.
- **The mint is still the custodian.** `dest` binds the signers, not the mint. Run by one of the signers, it protects
  nothing.
- **What it does not stop.** The ordering key and a payee agreeing to pay for work that was not done: it limits who
  can be paid to a list the locker saw, and leaves every payment readable. And the same two can still waste what stays
  under the lock without gaining it: by swapping it from the lock to the same lock again and again at a mint that charges
  input fees (each round costs the fee, which only the mint gains), or by giving what stays a secret that already exists
  unspent somewhere.
- **Ecash that already carries a tag named `dest`.** NUT-10 tags are an open list, and a mint that adopts this rule
  reads them anew: a P2PK secret with `["dest", "x"]` can no longer be spent on its main path, and one with a malformed
  `dest` tag not at all. A mint has to weigh that before it announces the rule.
- **Not covered.** HTLC secrets (a `dest` tag there is refused on the main path), melting to a fixed Lightning
  destination, and two transactions racing to create the same output secret.

## Related work

The Cashu drafts for version 3 keysets go the same way by another road: signatures that cover the whole transaction, and
a "template leaf" whose outputs must go to listed keys ([nuts#443](https://github.com/cashubtc/nuts/pull/443),
[nutshell#1198](https://github.com/cashubtc/nutshell/pull/1198), both open on 10 Nov 2026). This draft works on today's
keysets by opening the outputs, and adds one thing those descriptions do not mention: an output that stays under the
lock it came from.
