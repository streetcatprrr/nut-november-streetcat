// The PIN vault (app/vault.js) run as written, in Node: tabs that share one localStorage and each have their own sessionStorage, as
// a browser's tabs do; no page, no mint. What the review of 12 Nov found, each tried as it was found: a tab left open while another
// tab changes the PIN must write nothing with its old key (its refund keys were rewritten under a key nobody could make again, and
// lost), and opens again asking for the PIN; a tab running without a PIN writes no key in the clear once another tab has set one;
// a PIN set on a nearly full phone, which could not finish, no longer puts its old plan back over a key saved afterwards. Also: a
// change written down in the older form is still finished, and a key left in the clear beside a PIN is sealed once the PIN is given.
import fs from 'fs'; import vm from 'vm';
const APP = new URL('../app/', import.meta.url).pathname, NOSTR = fs.readFileSync(APP + 'nostr-bundle.js', 'utf8'), VAULT = fs.readFileSync(APP + 'vault.js', 'utf8');
let bad = 0; const say = (...a) => console.log(...a), check = (label, ok, more = '') => { if (!ok) bad++; say((ok ? '✓ ' : '✗ ') + label + (more ? ' · ' + more : '')); };
class Store { constructor(quota = Infinity){ this.m = new Map(); this.quota = quota; }
  getItem(k){ return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v){ v = String(v); const size = [...this.m].reduce((s, [a, b]) => s + (a === k ? 0 : a.length + b.length), 0) + k.length + v.length; if (size > this.quota) throw new Error('QuotaExceededError'); this.m.set(k, v); }
  removeItem(k){ this.m.delete(k); } get length(){ return this.m.size; } key(i){ return [...this.m.keys()][i]; }
  used(){ return [...this.m].reduce((s, [a, b]) => s + a.length + b.length, 0); } }
let LS = new Store();
const tab = () => { const ctx = { localStorage: LS, sessionStorage: new Store(), crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, console, setTimeout, reloads: 0 };
  ctx.location = { reload(){ ctx.reloads++; } }; ctx.window = ctx; ctx.self = ctx; vm.createContext(ctx); vm.runInContext(NOSTR, ctx); vm.runInContext(VAULT, ctx); return ctx; };
const V = t => t.window.scVault, tick = () => new Promise(r => setTimeout(r, 5));
// the app's own helpers over the vault (index.js: ls, donorKeys, addDonorKey)
const get = (t, k) => { try { return V(t).read(k); } catch (_) { return null; } }, put = (t, k, v) => { try { return V(t).write(k, v); } catch (_) { return false; } };
const donorKeys = t => { try { const a = JSON.parse(get(t, 'vetlock.donor.keys') || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } };
const addDonorKey = (t, k) => { const a = donorKeys(t), i = a.findIndex(x => x.pk === k.pk); if (i >= 0) a[i] = { ...a[i], ...k }; else a.push(k); return put(t, 'vetlock.donor.keys', JSON.stringify(a)); };

// 1. two tabs unlocked with one PIN; the first removes it and sets another; the second, still open, makes a donation
{ const A = tab(); for (let i = 1; i <= 3; i++) addDonorKey(A, { pk: 'pk' + i, sk: String(i).repeat(64) }); put(A, 'vetlock.clinic.sk', 'c'.repeat(64));
  await V(A).set('11111111'); const B = tab(); await V(B).unlock('11111111'); const before = donorKeys(B).length;
  await V(A).clear('11111111'); await V(A).set('22222222');
  const wrote = addDonorKey(B, { pk: 'pk4', sk: '4'.repeat(64) }), clinicB = get(B, 'vetlock.clinic.sk'), wrote2 = put(B, 'vetlock.clinic.sk', 'd'.repeat(64)); await tick();
  const C = tab(), opened = await V(C).unlock('22222222'), keysC = donorKeys(C);
  check('a tab left open while another changes the PIN writes nothing with its old key: its writes are refused, it reads nothing, and it opens again to ask for the PIN', before === 3 && wrote === false && wrote2 === false && clinicB === null && V(B).locked() && B.reloads === 1, `before ${before} · writes ${wrote}/${wrote2} · reloads ${B.reloads}`);
  check('…and every key is there under the new PIN', opened && keysC.length === 3 && keysC.map(k => k.pk).join() === 'pk1,pk2,pk3' && get(C, 'vetlock.clinic.sk') === 'c'.repeat(64), `${keysC.length} refund keys · clinic ${String(get(C, 'vetlock.clinic.sk')).slice(0, 8)}…`);
  check('…and the tab that changed it goes on with its new key', donorKeys(A).length === 3 && put(A, 'vetlock.donor.sk', 'e'.repeat(64)) && get(C, 'vetlock.donor.sk') === 'e'.repeat(64)); }

// 2. a tab running with no PIN, while another sets one: no key is written in the clear beside it
{ LS = new Store(); const A = tab(), B = tab(); put(B, 'vetlock.clinic.sk', 'a'.repeat(64)); await V(A).set('33333333');
  const wrote = put(B, 'vetlock.clinic.sk', 'b'.repeat(64)), raw = LS.getItem('vetlock.clinic.sk');
  check('a tab with no PIN writes no key in the clear once another tab has set one (refused, and the key kept sealed as it was)', wrote === false && V(B).locked() && /^pin1:/.test(raw) && get(A, 'vetlock.clinic.sk') === 'a'.repeat(64), `${wrote} · ${raw.slice(0, 10)}…`); }

// 3. a PIN set on a nearly full phone: it cannot finish; a key saved afterwards survives the next opening
{ LS = new Store(); const big = Array.from({ length: 120 }, (_, i) => ({ pk: 'pk' + i, sk: 'f'.repeat(64), lockedToken: 'cashuB' + 'x'.repeat(4000) }));
  LS.setItem('vetlock.donor.keys', JSON.stringify(big)); LS.setItem('other.data', 'y'.repeat(1_200_000)); LS.quota = LS.used() + 750_000;
  const T1 = tab(); let threw = ''; try { await V(T1).set('12345678'); } catch (e) { threw = e.message; }
  const left = !!LS.getItem('vetlock.pin.next'); LS.removeItem('other.data');
  const saved = addDonorKey(T1, { pk: 'NEW', sk: 'e'.repeat(64) }); const T2 = tab(); await V(T2).unlock('12345678'); const keys = donorKeys(T2);
  check('a PIN that could not finish (the phone full) puts its old plan back over nothing newer: a key saved afterwards is still there at the next opening', /no room to finish/.test(threw) && left && saved && keys.length === 121 && keys.some(k => k.pk === 'NEW') && !LS.getItem('vetlock.pin.next'), `${threw.slice(0, 30)}… · ${keys.length} keys · NEW ${keys.some(k => k.pk === 'NEW')}`); }

// 4. a change written down in the older form (each slot as a string) is still finished
{ LS = new Store(); const A = tab(); put(A, 'vetlock.streetcat.sk', '5'.repeat(64)); await V(A).set('44444444');
  const state = { meta: JSON.parse(LS.getItem('vetlock.pin')), slots: { 'vetlock.streetcat.sk': LS.getItem('vetlock.streetcat.sk') } };
  LS.setItem('vetlock.pin.next', JSON.stringify(state)); LS.removeItem('vetlock.pin'); LS.setItem('vetlock.streetcat.sk', '5'.repeat(64));
  const B = tab(), opened = await V(B).unlock('44444444');
  check('a change written down in the older form is finished as the page opens', opened && !LS.getItem('vetlock.pin.next') && /^pin1:/.test(LS.getItem('vetlock.streetcat.sk')) && get(B, 'vetlock.streetcat.sk') === '5'.repeat(64)); }

// 5. a key left in the clear beside a PIN is sealed once the PIN is given
{ LS = new Store(); const A = tab(); await V(A).set('55555555'); LS.setItem('vetlock.donor.sk', '7'.repeat(64));
  const B = tab(), opened = await V(B).unlock('55555555'), raw = LS.getItem('vetlock.donor.sk');
  check('a key found in the clear beside a PIN is sealed when the PIN is given, and still read', opened && /^pin1:/.test(raw) && get(B, 'vetlock.donor.sk') === '7'.repeat(64), raw.slice(0, 10) + '…'); }

// 6. the volunteer's key and the wallet requests' keys are sealed too (12 Nov: they were left in the clear beside a PIN); a PIN of 6 is too short
{ LS = new Store(); const A = tab(); put(A, 'vetlock.volunteer.sk', '9'.repeat(64)); put(A, 'vetlock.walletreqs', JSON.stringify([{ id: 'w1', sk: '8'.repeat(64), c: 'c' }]));
  let short = ''; try { await V(A).set('123456'); } catch (e) { short = e.message; } await V(A).set('66666666');
  const B = tab(), opened = await V(B).unlock('66666666'), raw = ['vetlock.volunteer.sk', 'vetlock.walletreqs'].map(k => LS.getItem(k));
  check('the volunteer\'s key and the wallet requests are sealed with the PIN, and read back; a PIN of 6 digits is refused', opened && raw.every(v => /^pin1:/.test(v)) && get(B, 'vetlock.volunteer.sk') === '9'.repeat(64) && JSON.parse(get(B, 'vetlock.walletreqs'))[0].sk === '8'.repeat(64) && /8 characters or more/.test(short) && V(B).MIN === 8, short); }

say(bad ? `vault: ${bad} check${bad > 1 ? 's' : ''} FAILED` : 'vault: every check passed'); process.exit(bad ? 1 : 0);
