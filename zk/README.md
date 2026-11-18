# A `dest` payment that stays blinded (experiment)

The `dest` rule ([`docs/dest-lock.md`](../docs/dest-lock.md)) makes a spend open every output to the mint, so the mint
can see where the value goes. This folder tries the other way for the payment itself: the output stays blinded, and the
spend carries a zero-knowledge proof that it pays the payee.

It is an experiment on a branch of its own. The app does not use it. Read "What it is not" before anything else.

## What is proved

For a payee key `P` and a blinded message `B_`, both public, the prover knows a nonce and a blinding factor `r` with

```
B_ = hash_to_curve(secret) + r·G      secret = ["P2PK",{"nonce":"<48 hex digits>","data":"<P>"}]
```

`hash_to_curve` is NUT-00's, at its first counter (a wallet picks a nonce for which that holds: one in two does). The
secret has no tags, so nothing can be hidden in it: it is a plain payment to `P`.

The circuit is `circuits/paydest.circom` (circom 2, Groth16 over BN254 with snarkjs): two SHA-256, secp256k1 arithmetic
on three limbs of 86 bits, and `r·G` as 32 lookups in tables of fixed points. About 258,000 constraints.

## What the mint does with it

`nutshell-0.21.0-dest-zk.patch` goes on top of [`mint/nutshell-0.21.0-dest.patch`](../mint/). In a spend's witness, an
output's entry may be `{"pay": "<payee>", "proof": {…}}` in place of `{"secret", "r"}`. The mint then asks for what it
asks of any payment (the payee is listed in the lock, written as the lock writes it, and has signed this transaction)
and checks the proof against the payee and the output, in Python (`cashu/mint/dest_zk.py`, with `py_ecc`). What stays
under the lock is still opened, as before.

It is off unless `MINT_DEST_ZK_VKEY` names the circuit's verification key. A mint that has it on says so in its info,
under NUT-11: `"dest_zk": "<SHA-256 of that key>"`.

## What it hides, and from whom

- **From whoever reads the mint's record of the spend.** That record is kept readable for anyone who knows one of the
  inputs (a donor). With an opened payment they get its secret, and can ask the mint from then on whether the payee has
  spent it. With a proof they see the payee and the amount, and nothing they can follow.
- **From the mint, little.** It never sees the payment's secret when it signs. But when the payee spends, the secret
  names the payee's key, and amounts are visible on both sides: the mint can tell that *a* payment of that amount to
  that payee is being spent, not which one. Unlinkable only among payments of the same amount to the same key.

## What is lost

- The payee can no longer rebuild its payment from the mint alone: whoever builds the spend has to hand it the secret
  and the blinding factor.
- The mint cannot refuse a blinded payment whose secret repeats another one's or was already spent. Such a payment is
  the payee's loss, and the payee signs the transaction without being able to check it from the transaction alone.

## What it is not

- **The setup is a local test one, not a ceremony.** Whoever ran it can forge proofs, that is, send a lock's value
  anywhere with the signatures of the ordering key and one payee. Real use needs a public ceremony, or a proof system
  without one.
- **Nobody has reviewed the circuit.** It was written in a day. A circuit that passes its tests can still accept what
  it should not.
- The proving key is 132 MB and a proof takes about 11 s and under 1 GB on a two-core server. Not tried on a phone.
- Fake money only, like the patch under it.

## Run it

```
cd zk && npm install
node gen.mjs                                                    # the tables and fixed strings, into circuits/
npx circom2 circuits/paydest.circom --r1cs --wasm --sym -o build
node try.mjs                                                    # the circuit alone: an honest witness, seven false ones

npx snarkjs powersoftau new bn128 18 build/pot0.ptau            # the test setup: slow (close to two hours on two cores)
npx snarkjs powersoftau contribute build/pot0.ptau build/pot1.ptau --name=test -e="$(head -c 32 /dev/urandom | xxd -p -c 64)"
npx snarkjs powersoftau prepare phase2 build/pot1.ptau build/pot.ptau
npx snarkjs groth16 setup build/paydest.r1cs build/pot.ptau build/paydest.zkey
npx snarkjs zkey export verificationkey build/paydest.zkey build/vkey.json
node prove.mjs                                                  # one proof made and verified; four shown falsely are refused
```

The mint, from a copy of Nutshell 0.21.0 that already has the `dest` patch (see [`mint/README.md`](../mint/README.md)):

```
patch -p1 < zk/nutshell-0.21.0-dest-zk.patch
pip install --no-deps py_ecc==8.0.0 eth_utils==6.0.0 eth_typing==6.0.0 eth_hash==0.8.0 toolz==1.2.0 cytoolz==1.2.0
MINT_DEST_ZK_VKEY=zk/build/vkey.json  …the same command as in mint/README.md, on port 3342
cd zk && MINT=http://127.0.0.1:3342 node mint_test.mjs          # PLAIN=<a mint with only the dest patch> tries it there too
```

`mint_test.mjs` locks 100, pays 8 blinded and leaves 92 under the lock. Refused: a blinded payment to a key the lock
does not list, a stranger's output shown as a payee's, one payee's proof shown for the other, a payee paid without its
signature, a proof moved to another output, a tampered proof, a malformed entry, what stays under the lock shown as a
payment, and the whole thing at a mint without the experiment. Accepted: the payment, which the payee then spends with
its own signature and nobody can spend without it. The mint took about a third of a second for the swap.
`tests/dest_test.mjs` passes unchanged against this mint.
