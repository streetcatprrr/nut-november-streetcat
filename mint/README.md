# The `dest` patch for the test mint

`nutshell-0.21.0-dest.patch` teaches the mint of [Nutshell](https://github.com/cashubtc/nutshell) 0.21.0 the `dest` tag
described in [`docs/dest-lock.md`](../docs/dest-lock.md): locked ecash that can only be paid to listed keys, or stay under
its lock.

It is an experiment for Nut November 2026. Nutshell's authors have not seen it, nobody outside this project has reviewed
it, and it has only ever run with fake money. Do not run a mint that holds real funds with it.

## What it changes

- `cashu/mint/dest.py` (new): the rule. Everything in it fails closed. A spend it accepts on the main path is kept
  readable: its witness must list the transaction's inputs (since 11 Nov), and is stored with every input, so NUT-07
  returns it for any of them.
- `cashu/mint/conditions.py`: a lock that carries `dest` is verified there, main path and refund path; nothing else changes.
- `cashu/mint/verification.py`: an opened output may not repeat a secret that was already spent (a guard against a
  wallet's mistake, read outside the swap's own database transaction: it is not a guarantee).
- `cashu/mint/features.py`: the mint's info says `"11": {"supported": true, "dest": ["pubkeys"]}`.
- `cashu/core/nuts/nut10.py`: `dest` is a tag given once, with one value, like `n_sigs` or `locktime`.

Locks without `dest` are verified by the same code as before. One thing does change for them: a secret that already
carries a tag named `dest` (NUT-10 tags are an open list) is read by the new rule, so it can no longer be spent on its
main path unless it is a well-formed `dest` lock. A mint has to weigh that before it takes the patch.

The patch has been through one review inside this project (10 Nov, `docs/dest-lock.md` says what changed): attacked
over HTTP on a test mint, about 200 refused spends and no way found to take value out of a lock. It has no tests of its
own in Nutshell's suite and no wallet side there; the tests are this repository's (`tests/dest*_test.mjs`).

## Run it

The patch goes on a copy, so the installed package stays as it is:

```
pip install cashu==0.21.0        # stops now: breez-sdk-spark 0.17 is gone from PyPI; mint/install.sh lists what to install
cp -r "$(python3 -c 'import cashu, os; print(os.path.dirname(cashu.__file__))')" ./cashu
patch -p1 < mint/nutshell-0.21.0-dest.patch

PYTHONPATH=. MINT_BACKEND_BOLT11_SAT=FakeWallet MINT_PRIVATE_KEY=test MINT_DATABASE=./data/mint-dest FAKEWALLET_BRR=TRUE \
  MINT_INPUT_FEE_PPK=0 MINT_MAX_WITNESS_LENGTH=65536 python3 -m cashu.mint --port 3340 --host 127.0.0.1
```

`MINT_MAX_WITNESS_LENGTH` is needed: a spend opens its outputs in the witness, which is longer than Nutshell's default
of 1024 characters allows. The setting is one limit for every kind of lock, not only for this one.

```
node tests/dest_test.mjs                                  # the rule, tried every way
STOCK=http://127.0.0.1:3338 node tests/dest_test.mjs      # and the same lock at a mint without the patch
```

## On a server

`install.sh` sets the same test mint up on a fresh Debian 12 or Ubuntu 24.04 server, behind HTTPS, kept running by
systemd:

```
sudo bash mint/install.sh mint.example.org
```

The name must point at the server first, with ports 80 and 443 open. The mint's key is made on the server and written to
`/etc/nutshell-dest/env`, never printed; a second run installs the code afresh and keeps the key and the database. It
sets up the fake backend only and refuses any other: a settings file that names another (even in lower case, or under
Nutshell's old name `MINT_LIGHTNING_BACKEND`) or that it cannot read whole, a `.env` that Nutshell would read over it,
and a name, port or domain that is not one plain line (14 Nov). The copying, patching and load check have been tried here; the
script as a whole has not yet been run on a real server.

## Licence

Nutshell is MIT ("Copyright (c) 2022 calle", as its licence file says); the patch carries lines of it. The patch is MIT
too, with the rest of this repository.
