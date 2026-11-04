"""Prototype: donations in Cashu ecash that unlock only with the clinic's code (or signature) and Streetcat's
signature, and refund the donor automatically after a deadline. Runs a local Nutshell mint with a fake Lightning
backend (no real money).  Usage (macOS Terminal):  pip3 install cashu && python3 vetlock_proto.py"""
import asyncio, hashlib, os, secrets, shutil, subprocess, sys, time, urllib.request

PORT = 3338; URL = f"http://127.0.0.1:{PORT}"; HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "data")
LOG = []
def say(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); LOG.append(s)

def start_mint():
    shutil.rmtree(DATA, ignore_errors=True); os.makedirs(os.path.join(DATA, "mint"), exist_ok=True)
    env = dict(os.environ, MINT_BACKEND_BOLT11_SAT="FakeWallet", MINT_PRIVATE_KEY="vetlock-proto-private-key", MINT_DATABASE=os.path.join(DATA, "mint"),
               MINT_LISTEN_HOST="127.0.0.1", MINT_LISTEN_PORT=str(PORT), MINT_URL=URL, FAKEWALLET_BRR="TRUE", MINT_INPUT_FEE_PPK="0", MINT_WATCHDOG_ENABLED="FALSE", DEBUG="FALSE", LOG_LEVEL="WARNING")
    p = subprocess.Popen([sys.executable, "-m", "cashu.mint", "--port", str(PORT), "--host", "127.0.0.1"], env=env, stdout=open(os.path.join(DATA, "mint.log"), "w"), stderr=subprocess.STDOUT)
    for _ in range(120):
        try: urllib.request.urlopen(URL + "/v1/info", timeout=1).read(); return p
        except Exception: time.sleep(0.5)
    p.kill(); raise SystemExit("mint did not start; see data/mint.log")

async def wallet(name):
    from cashu.wallet.wallet import Wallet
    w = await Wallet.with_db(URL, os.path.join(DATA, name), name=name); await w.load_mint(); return w

async def fund(w, amount):
    q = await w.request_mint(amount)
    for _ in range(30):
        try: await w.mint(amount, quote_id=q.quote); return
        except Exception as e: last = e; await asyncio.sleep(0.5)
    raise last

async def try_redeem(w, proofs, label):
    try:
        await w.redeem(proofs); say(f"   {label}: OK, balance now {w.available_balance} sat"); return True
    except Exception as e:
        say(f"   {label}: REFUSED -> {str(e)[:140]}"); return False

async def main():
    from cashu.core.secret import Tags
    say("== mint info:", urllib.request.urlopen(URL + "/v1/info").read()[:200].decode())
    donor, streetcat, vet = await wallet("donor"), await wallet("streetcat"), await wallet("vet")
    await fund(donor, 256); say("donor funded:", donor.available_balance, "sat (fake lightning)")
    pk_s, pk_v, pk_d = await streetcat.create_p2pk_pubkey(), await vet.create_p2pk_pubkey(), await donor.create_p2pk_pubkey()

    say("\n== A. HTLC: clinic code + Streetcat signature, refund to donor after deadline")
    code = secrets.token_hex(32); h = hashlib.sha256(bytes.fromhex(code)).hexdigest()
    say("   clinic keeps code", code[:12] + "...", "publishes hash", h[:12] + "...")
    lock = await donor.create_htlc_lock(preimage_hash=h, hashlock_pubkeys=[pk_s], locktime_seconds=3600, locktime_pubkeys=[pk_d])
    _, locked = await donor.swap_to_send(donor.proofs, 21, secret_lock=lock)
    token = await donor.serialize_proofs(locked); say("   donation token (21 sat, locked):", token[:60] + "...", len(token), "chars")
    say("   secret of first proof:", locked[0].secret[:160])
    await try_redeem(streetcat, [p.copy() for p in locked], "Streetcat without code")
    bad = await streetcat.add_htlc_preimage_to_proofs([p.copy() for p in locked], secrets.token_hex(32)); bad = streetcat.sign_p2pk_sig_inputs(bad)
    await try_redeem(streetcat, bad, "Streetcat with a WRONG code + signature")
    good = await streetcat.add_htlc_preimage_to_proofs([p.copy() for p in locked], code); good = streetcat.sign_p2pk_sig_inputs(good)
    await try_redeem(streetcat, good, "Streetcat with clinic code + signature")
    await try_redeem(donor, donor.sign_p2pk_sig_inputs([p.copy() for p in locked]), "Donor refund attempt before deadline (already spent anyway)")

    say("\n== A2. same lock with a 3-second deadline: nobody certifies -> donor takes it back")
    lock2 = await donor.create_htlc_lock(preimage_hash=h, hashlock_pubkeys=[pk_s], locktime_seconds=3, locktime_pubkeys=[pk_d])
    _, locked2 = await donor.swap_to_send(donor.proofs, 8, secret_lock=lock2)
    await try_redeem(donor, donor.sign_p2pk_sig_inputs([p.copy() for p in locked2]), "Donor refund BEFORE deadline")
    await asyncio.sleep(4)
    await try_redeem(donor, donor.sign_p2pk_sig_inputs([p.copy() for p in locked2]), "Donor refund AFTER deadline")

    say("\n== B. P2PK 2-of-2: Streetcat + clinic must both sign, refund to donor after deadline")
    tags = Tags([["pubkeys", pk_v], ["refund", pk_d]])
    lock3 = await donor.create_p2pk_lock(pk_s, tags=tags, locktime_seconds=3600, n_sigs=2)
    _, locked3 = await donor.swap_to_send(donor.proofs, 16, secret_lock=lock3)
    say("   secret:", locked3[0].secret[:200])
    one = streetcat.sign_p2pk_sig_inputs([p.copy() for p in locked3])
    await try_redeem(streetcat, one, "Streetcat alone")
    two = vet.sign_p2pk_sig_inputs(streetcat.sign_p2pk_sig_inputs([p.copy() for p in locked3]))
    await try_redeem(streetcat, two, "Streetcat + clinic signatures")

    say("\n== balances: donor", donor.available_balance, "streetcat", streetcat.available_balance, "vet", vet.available_balance)
    say("== DONE")

if __name__ == "__main__":
    p = start_mint()
    try: asyncio.run(main())
    finally:
        p.terminate(); open(os.path.join(HERE, "run.log"), "w").write("\n".join(LOG))
