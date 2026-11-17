# Worked examples for the `dest` tag

Written by `tools/dest-vectors.mjs` against the patched test mint (`mint/`, Nutshell 0.21.0, fake money). They go with
[`dest-lock.md`](dest-lock.md): one spend the mint accepts, and the spends it refuses, each with the mint's own answer.

The keys are not secret. Each private key is the SHA-256 of the text `dest vector: ` followed by its label, so every
signature here can be made again. `C` comes from the test mint's own key and the nonces are random: another run writes other values.

## Keys

| label | public key |
|---|---|
| ordering key | `02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023` |
| payee A | `02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86` |
| payee B | `030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b` |
| stranger | `039250dc5f9ae973d9000b1896ac96fd463ef509a5c41c93ec08df0624c0a76598` |
| refund key | `03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8` |
| another refund key | `02faea268788212cd075f1c1d9a990472a034453cdcc08dae5d97669026bb78f29` |

## The lock

3 sat in two proofs, locked to the ordering key and two payees, with a refund key after the deadline.

```json
[
 "P2PK",
 {
  "nonce": "364f713b350817bdb00fb7affba2b15fae246ae4e78568be0f2cd2fe4423c24f",
  "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
  "tags": [
   [
    "sigflag",
    "SIG_ALL"
   ],
   [
    "n_sigs",
    "2"
   ],
   [
    "pubkeys",
    "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
    "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
   ],
   [
    "locktime",
    "1800000000"
   ],
   [
    "refund",
    "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
   ],
   [
    "dest",
    "pubkeys"
   ]
  ]
 }
]
```

The inputs, as the mint signed them:

```json
[
 {
  "amount": 2,
  "id": "01c2b6361e0b82ab694256ebc90a4686d13530d308d2b34477b2e61f9a0f6777a4",
  "secret": "[\"P2PK\",{\"nonce\":\"364f713b350817bdb00fb7affba2b15fae246ae4e78568be0f2cd2fe4423c24f\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
  "C": "032facb20829adbbd6ec241b96f3862dff295876106ea6f30054437b044b17124c"
 },
 {
  "amount": 1,
  "id": "01c2b6361e0b82ab694256ebc90a4686d13530d308d2b34477b2e61f9a0f6777a4",
  "secret": "[\"P2PK\",{\"nonce\":\"2d2ff5fef34cb44aeba2145b1e3edcedec66d67985a7ec5e52e21befdda78176\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
  "C": "0249a408ea568d03fd0e3d4ed43a3a9dc25cad690f3115dbaa10e5e6c8c38104a8"
 }
]
```

## A spend the mint accepts

1 sat to payee A, who signs with the ordering key, and 2 sat back under the same lock.

The message both sign (NUT-11 `SIG_ALL`: every input's `secret` and `C`, then every output's `amount` and `B_`):

```
["P2PK",{"nonce":"364f713b350817bdb00fb7affba2b15fae246ae4e78568be0f2cd2fe4423c24f","data":"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023","tags":[["sigflag","SIG_ALL"],["n_sigs","2"],["pubkeys","02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86","030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"],["locktime","1800000000"],["refund","03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"],["dest","pubkeys"]]}]032facb20829adbbd6ec241b96f3862dff295876106ea6f30054437b044b17124c["P2PK",{"nonce":"2d2ff5fef34cb44aeba2145b1e3edcedec66d67985a7ec5e52e21befdda78176","data":"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023","tags":[["sigflag","SIG_ALL"],["n_sigs","2"],["pubkeys","02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86","030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"],["locktime","1800000000"],["refund","03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"],["dest","pubkeys"]]}]0249a408ea568d03fd0e3d4ed43a3a9dc25cad690f3115dbaa10e5e6c8c38104a8103e07c339f0a31306e3dc13e9d54a29cb23d93a675ba99df5bb8ad3510e701e667202bc587118e7e99af31df5c698a26a66b8b032bcbe13c6f22ddd23ae853214fdc9
```

The outputs:

```json
[
 {
  "amount": 1,
  "id": "01c2b6361e0b82ab694256ebc90a4686d13530d308d2b34477b2e61f9a0f6777a4",
  "B_": "03e07c339f0a31306e3dc13e9d54a29cb23d93a675ba99df5bb8ad3510e701e667"
 },
 {
  "amount": 2,
  "id": "01c2b6361e0b82ab694256ebc90a4686d13530d308d2b34477b2e61f9a0f6777a4",
  "B_": "02bc587118e7e99af31df5c698a26a66b8b032bcbe13c6f22ddd23ae853214fdc9"
 }
]
```

The witness of the first input (signatures by: ordering key, payee A):

```json
{
 "signatures": [
  "31b355a327f7f97deaf1907cdb3d52fdc33d6f9270f9d29f25dc58cf8378c6cf4b62f5861955d556e1b077af85e87e3049cc31fc27137eaf377d5bdba3809705",
  "fe6915dc86254e89fd344d6d779fe6311330ac37087cc25328e9d5511cac68a383fc0ef0e0ed215cd6aa948d33e3fed97f844c27c2842c7c77aa99d6d31fd8d9"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"6e03c28c41b7e4d76fa3ee61f7f5c5bb0f3972afb745321d995f66e511e959cf\",\"data\":\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\"}]",
   "r": "760224effa327e8349667f589a90de641a38e4d9def6c8a1a77c3d13a48846d5"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"97a6ee5b41d69a07db3d7172099d49311c3da3e738abbee9a2664723376c34c0\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "9f8284a4df890197ca7764e5f858c929ebd81dcb9164ca96812aef359ee5d7c8"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

After it, NUT-07 answers for the inputs: `SPENT`, `SPENT`, and returns that witness for each of them.

## Spends the mint refuses

The same inputs each time; a refused spend spends nothing. Only what differs from the accepted spend is said.

### The outputs are not opened

Signed by: ordering key, payee A. The mint answers 400:

> dest: every output must be opened in the witness.

The witness sent:

```json
{
 "signatures": [
  "7352a3d036544af58d7713d57a4909781937694fe5e8d7b75834f01a38b1d6982403ca230c871f6d3033d2701127e2f25508788f9e581fbb8345ff5577d81e38",
  "96c344d7e09fee47460589e2469d99dbd8f2092f53f77d0565578f035e369f988d568515e5781f694f48c66efa07238ffba8d40c1d5b728915c73c40156596e5"
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "0313e5fad983e7e99b98fe1b7fae50608e4399e6db7c16b6c4832297be31bceb74",
  "secret": [
   "P2PK",
   {
    "nonce": "c1d34c2f6e300c05e6e36321f1adfce0c9e2bbe642cf69cf5b74b149022ec9db",
    "data": "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86"
   }
  ],
  "r": "75dbeb6b9267683b0faac248ff1fb0015dbc600df9f9d26e6c0537d5f42de0de"
 },
 {
  "amount": 2,
  "B_": "020966da306469c16c391d5791a0411e6047533b3cdfbd0a62ee601ac8a9f02afb",
  "secret": [
   "P2PK",
   {
    "nonce": "36b90e792cfe27099f5b35a627ba838f5ef74cd66b6849ea394ebf3421f32ab5",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "752af671cb0340269b6cb6baef79910fceb596946370c706dd286bc3620489a5"
 }
]
```

### An output is opened with another blinding factor

Signed by: ordering key, payee A. The mint answers 400:

> dest: an opening does not match its output.

The witness sent:

```json
{
 "signatures": [
  "384f13c2389ecae1c30933ec5336f93bd100b745bf1d619224c6acdf509e50d89009810415d2cbbc0fcba3dddbabbc07ce4c9e9a9b832026d31d942264e63ced",
  "85d9b34d76dc8f8f2b6c0691abd86d6371c97572617e8d5647a20854bd98f794fb201b0fa214c0818e0580f251ff89daa0b4f96f6f9931ee38347e939226effe"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"dcf2f045066cce2f44cbb985f84ce6f6b32fc34845925ca603534ab109f8ac5c\",\"data\":\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\"}]",
   "r": "0000000000000000000000000000000000000000000000000000000000000001"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"33f19fce6b6f5b9dd96eb26086831ba4a420db32dc2b96d8b2bf8d456883a550\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "a47713d4f7b0c3300a647b1e827837c654523e6b71ac8267313bbab537ff35bf"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "03bf213e8ef89d05bad14bc2f085225e6c23e967a07dab5df8316571b26561a7b3",
  "secret": [
   "P2PK",
   {
    "nonce": "dcf2f045066cce2f44cbb985f84ce6f6b32fc34845925ca603534ab109f8ac5c",
    "data": "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86"
   }
  ],
  "r": "d8e36721ac3db4d2904ea3f1a533d8f90f5d78ef5e51bb9439f9cc5e80c54b11"
 },
 {
  "amount": 2,
  "B_": "02276c7dab241f09af683f2d40e5c40016ded26721affa12b2bafa6bd48788a8b3",
  "secret": [
   "P2PK",
   {
    "nonce": "33f19fce6b6f5b9dd96eb26086831ba4a420db32dc2b96d8b2bf8d456883a550",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "a47713d4f7b0c3300a647b1e827837c654523e6b71ac8267313bbab537ff35bf"
 }
]
```

### The payment goes to a key the lock does not name

Signed by: ordering key, stranger. The mint answers 400:

> signature threshold not met. 1 < 2.

The witness sent:

```json
{
 "signatures": [
  "46625f74afabf760908290eb923905a59dc9bee26adc19187a64cd38e4d432d26feb91bfbcb42d6ff1fcab438c863040a54117ca67ccba7fc2d5a1e7926d2d88",
  "10cbe35af57e9dcbf82d05621011d0883e83311e434fad7973ffd2e3f95c2bcde802052c8371fa17b070774ab8d7c1e1c4d32ec4fd97b12be9b1b646ee20f518"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"e8539abb3c14da0ffe75210c1cde1c722608ecfe0f203fd5f121875b0231d09f\",\"data\":\"039250dc5f9ae973d9000b1896ac96fd463ef509a5c41c93ec08df0624c0a76598\"}]",
   "r": "36d2744955f949fed616551f2a1090f914a8dd7af34a8432d48cefd7c918cd50"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"5923a8ef523f8562191939d945f40635322da965e8833204670ac60e9dfcc90b\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "94191991c7dfd81c04f2165988c793f0450e522d75e7e85b448017e7f2c8f35e"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "0202380c8b540e4e24d1fb374a189d6f992c1fb5215d0349b3caf969d41ef4dbb7",
  "secret": [
   "P2PK",
   {
    "nonce": "e8539abb3c14da0ffe75210c1cde1c722608ecfe0f203fd5f121875b0231d09f",
    "data": "039250dc5f9ae973d9000b1896ac96fd463ef509a5c41c93ec08df0624c0a76598"
   }
  ],
  "r": "36d2744955f949fed616551f2a1090f914a8dd7af34a8432d48cefd7c918cd50"
 },
 {
  "amount": 2,
  "B_": "0237317a0d2efed98e53ca876aee4a37760ed245a7f1c432fbfff668cf6e506033",
  "secret": [
   "P2PK",
   {
    "nonce": "5923a8ef523f8562191939d945f40635322da965e8833204670ac60e9dfcc90b",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "94191991c7dfd81c04f2165988c793f0450e522d75e7e85b448017e7f2c8f35e"
 }
]
```

### The payment goes to a payee who did not sign

Signed by: ordering key, payee A. The mint answers 400:

> dest: a payee is paid without its signature.

The witness sent:

```json
{
 "signatures": [
  "2ae1ab4e17f94ce09a33f4622086f65a2bc37806f20a329a4aec100845790e49a45ff1dd33d9bcc45931d168ec2d6e2fcc7877d1a740ae351ebc63d1bf120af8",
  "18207a813b45bc7cb836e2c9a0069d8cba04a7d118dcd86319d3c2796ace455bc5eb85a545284d50eb88091ada91c36b7eb262797f468cc52326646e9c15136f"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"59ebf9c69c0a881b820c3e0d02cffd72c1fcccdc6d79245776aa3abbe2884be8\",\"data\":\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"}]",
   "r": "143abed4957a75b5d3aaf7ca51620b89e26acd91b146944782762106c18bd1dc"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"7d73cb85acfd9df7971d5972977f5fe4abc7397da2b88b197af300bdc6ecfdf6\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "19b7ec4e3b82d3e9cda37953dd06d7ee1e8686d85fd15133ad6724952d559e49"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "03a29dd0f686b088f476e400201f30d2f99ab732999fff29c058901e1b79bbf1ae",
  "secret": [
   "P2PK",
   {
    "nonce": "59ebf9c69c0a881b820c3e0d02cffd72c1fcccdc6d79245776aa3abbe2884be8",
    "data": "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
   }
  ],
  "r": "143abed4957a75b5d3aaf7ca51620b89e26acd91b146944782762106c18bd1dc"
 },
 {
  "amount": 2,
  "B_": "03ee5986b1b4bb575cbbef2bc54f8399910f7ae80147f9e7c6a2f2acb623300efc",
  "secret": [
   "P2PK",
   {
    "nonce": "7d73cb85acfd9df7971d5972977f5fe4abc7397da2b88b197af300bdc6ecfdf6",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "19b7ec4e3b82d3e9cda37953dd06d7ee1e8686d85fd15133ad6724952d559e49"
 }
]
```

### The ordering key did not sign

Signed by: payee A, payee B. The mint answers 400:

> dest: the key in data has not signed.

The witness sent:

```json
{
 "signatures": [
  "4cd90824dd25a907dbba5288d1126cbe54b37b6d5579315a61709c86844dbefa7842f6e94c25030be0bb906a22537a119d8298b07ad983b929f322e5ab182e41",
  "b63e839dfa7d3a9b782f03e0385a6f1360f80a535a875a511d58e28f57859288e280c9a1c43e7d09ba286d48044508c95ae3f8a6f5429eff1b65f62f35474f70"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"67fd191eab641c5f6c91640d542db373220a20e4847879a58e7af03e027d4532\",\"data\":\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\"}]",
   "r": "2ce4c6a7f9e98b65649e8a4df895fb045cf34051d7a3251b5dd1ae7f8ee31082"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"9e17005619e4a3fc1bb269221222d115452653226d3b533691a5106e52db6509\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "f34d81ae0c72f541a01778dba73c2e739aef5a8428202e9d63bc2c05233b8898"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "03b91d17ceda71d24ddc8bc87461a8e44f0157e26b150b5d0f83b5646bb927353a",
  "secret": [
   "P2PK",
   {
    "nonce": "67fd191eab641c5f6c91640d542db373220a20e4847879a58e7af03e027d4532",
    "data": "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86"
   }
  ],
  "r": "2ce4c6a7f9e98b65649e8a4df895fb045cf34051d7a3251b5dd1ae7f8ee31082"
 },
 {
  "amount": 2,
  "B_": "0354e97763a8c28f4aead1fc48e6d0157681586737bb076c558d33a2c994a7d928",
  "secret": [
   "P2PK",
   {
    "nonce": "9e17005619e4a3fc1bb269221222d115452653226d3b533691a5106e52db6509",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "f34d81ae0c72f541a01778dba73c2e739aef5a8428202e9d63bc2c05233b8898"
 }
]
```

### The payment carries tags

Signed by: ordering key, payee A. The mint answers 400:

> dest: an output goes where the lock does not allow.

The witness sent:

```json
{
 "signatures": [
  "75d45414282dddf1dc0e3d6b9ecd2f5f78890a92569d302c02fe2dab30aeda1674a8d4cf4e8146397b8cea572536d5e815d06781c5338f00089f74f29e68ceab",
  "a37ae3bfd7e272cd5716eec1f8b05a157aacb710341a7becc8a137aad43cad7cc3e820d3d2194fe009115ececba51f1314a23ffa467ba067f6904281b5bcb0e8"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"aa3d8189ba4636e85744310f3c8c217412c12516ffe13fa66bce619527feb644\",\"data\":\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"tags\":[[\"locktime\",\"1\"],[\"refund\",\"039250dc5f9ae973d9000b1896ac96fd463ef509a5c41c93ec08df0624c0a76598\"]]}]",
   "r": "f7924d6c436875c0825561bf41e5b54f160d44eea381642d7fb09700b7df8a01"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"2784fab7d85f66736aa617c99fa53c7598688ebd49224b6e02427a38cfbf1839\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "d6ea136b6b37965e0b1babc903890b3bdfe897d04b7aa1640401bdb54a2ffc3f"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "025e0839964aba4a344b8a35fa79bc89ccd679f19e51f03e3e1d0ec2209b98fd0a",
  "secret": [
   "P2PK",
   {
    "nonce": "aa3d8189ba4636e85744310f3c8c217412c12516ffe13fa66bce619527feb644",
    "data": "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
    "tags": [
     [
      "locktime",
      "1"
     ],
     [
      "refund",
      "039250dc5f9ae973d9000b1896ac96fd463ef509a5c41c93ec08df0624c0a76598"
     ]
    ]
   }
  ],
  "r": "f7924d6c436875c0825561bf41e5b54f160d44eea381642d7fb09700b7df8a01"
 },
 {
  "amount": 2,
  "B_": "02be1181e4b4d8340767eb25dd4ccc5ae9871bdf885e84d950a484ad7c997876d9",
  "secret": [
   "P2PK",
   {
    "nonce": "2784fab7d85f66736aa617c99fa53c7598688ebd49224b6e02427a38cfbf1839",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "d6ea136b6b37965e0b1babc903890b3bdfe897d04b7aa1640401bdb54a2ffc3f"
 }
]
```

### The rest goes back under another lock (another refund key)

Signed by: ordering key, payee A. The mint answers 400:

> dest: an output goes where the lock does not allow.

The witness sent:

```json
{
 "signatures": [
  "bda042e84cb7f1ca48f8b040c60af500a7d224ec52645201ca9ee3cb71e0030f3016d7a80a5cf0249f9a02926730fbb7c9e76faeed141be41b8c30a2598153de",
  "1767b3290ba03d7b57f6c6f1e8186695c422f4b3b8226dbbc650ba5c565d505310c2c06ea130a280356e7d5ab28a622b2827e258ed9d567bfefbba591d7b963c"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"f6d8d84bdd62efcfccaaec3c2d01c2433c4a33fdeb1369386649e16909dbf96b\",\"data\":\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\"}]",
   "r": "0047d4d202bab287f4c2f01b6479ddd9abadded4dac70daad0dc1b7dd27bddb7"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"b4c4fa457a38213069ead53347d3d12816ce070c6955a222298e4fff3c642c03\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"02faea268788212cd075f1c1d9a990472a034453cdcc08dae5d97669026bb78f29\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "67ba9f527036e6a85838df12c37393c802b408a326794168f608bc3abed3009a"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed",
  "0213c2631733ce28b9ecc22d1b753603478129d65cd4ad51243f8393c65a4c1e26"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "0254b26eac20800fe440861d28ea9e3046185a94d45429cbcd2a02ed6fb2235f6c",
  "secret": [
   "P2PK",
   {
    "nonce": "f6d8d84bdd62efcfccaaec3c2d01c2433c4a33fdeb1369386649e16909dbf96b",
    "data": "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86"
   }
  ],
  "r": "0047d4d202bab287f4c2f01b6479ddd9abadded4dac70daad0dc1b7dd27bddb7"
 },
 {
  "amount": 2,
  "B_": "035d39477f594b3aac438672b603b48aa9e7d8f6655c7c215be9882a5d95baffe7",
  "secret": [
   "P2PK",
   {
    "nonce": "b4c4fa457a38213069ead53347d3d12816ce070c6955a222298e4fff3c642c03",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "02faea268788212cd075f1c1d9a990472a034453cdcc08dae5d97669026bb78f29"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "67ba9f527036e6a85838df12c37393c802b408a326794168f608bc3abed3009a"
 }
]
```

### The witness does not list every input

Signed by: ordering key, payee A. The mint answers 400:

> dest: the witness must list the inputs of the transaction.

The witness sent:

```json
{
 "signatures": [
  "7a84c11954fe4ad7ece1a3ca4083e9796edda4fc4c64f0ba2e08264a3e469389e2d317d2555df45ba5c4fa949e74e2981f0f984a9209423de58114591761a96b",
  "ef143c4f848d745356e312fe8511a7414f9ec125bd4cf0ea48abacb3bdfc343243a20389dc0863b2e1a6d34a26a63f7a5b49e90652205fcd0669ff1b8676e015"
 ],
 "outputs": [
  {
   "secret": "[\"P2PK\",{\"nonce\":\"88c3f73645d1359457b4342075b0bbad0a6e5fca3ca5a43288ce56d95222243e\",\"data\":\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\"}]",
   "r": "8db16c5d494046cd0209f82d3000b9058cc8698f7d35c3c17627909fdac7add4"
  },
  {
   "secret": "[\"P2PK\",{\"nonce\":\"b18003a50ee95dc45ca71c5e6f0409289e5c1423aa1163ee8840c1614cec61c5\",\"data\":\"02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023\",\"tags\":[[\"sigflag\",\"SIG_ALL\"],[\"n_sigs\",\"2\"],[\"pubkeys\",\"02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86\",\"030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b\"],[\"locktime\",\"1800000000\"],[\"refund\",\"03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8\"],[\"dest\",\"pubkeys\"]]}]",
   "r": "752d5f33562c6ca86ab607dc60b320992591a025bb087b6c3bf2e94f70480cf0"
  }
 ],
 "inputs": [
  "024dfdd1d56b8308998b1a436a1dac6309a6c5e8ea237d20ab10e0f08503f2f5ed"
 ]
}
```

Its outputs opened:

```json
[
 {
  "amount": 1,
  "B_": "0383bff4ce4b8a1ac03b12158e08ec38260b888d1b16431bfc6aa0b6d1cdb69685",
  "secret": [
   "P2PK",
   {
    "nonce": "88c3f73645d1359457b4342075b0bbad0a6e5fca3ca5a43288ce56d95222243e",
    "data": "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86"
   }
  ],
  "r": "8db16c5d494046cd0209f82d3000b9058cc8698f7d35c3c17627909fdac7add4"
 },
 {
  "amount": 2,
  "B_": "03f2bfb3f2e6babd61e689f9156df2e67e1db70fe81f32b01122231fd4b9e3e666",
  "secret": [
   "P2PK",
   {
    "nonce": "b18003a50ee95dc45ca71c5e6f0409289e5c1423aa1163ee8840c1614cec61c5",
    "data": "02dc51cc96e2c00c62a97d507716c6c485e2784b5659bbbeeae1737bee48689023",
    "tags": [
     [
      "sigflag",
      "SIG_ALL"
     ],
     [
      "n_sigs",
      "2"
     ],
     [
      "pubkeys",
      "02db11facaa06129eac2987cd31966c2e4e15ade50b2c907d6a0f8f690e1229f86",
      "030dc3b49685fe46cb0378afa5b66a4c4d91abe3b9b635f8fb027c546d06397e6b"
     ],
     [
      "locktime",
      "1800000000"
     ],
     [
      "refund",
      "03c368e2acad936a8564b58a5320c1b0ad7a7c30e6ef330291fc884d45e3140fb8"
     ],
     [
      "dest",
      "pubkeys"
     ]
    ]
   }
  ],
  "r": "752d5f33562c6ca86ab607dc60b320992591a025bb087b6c3bf2e94f70480cf0"
 }
]
```
