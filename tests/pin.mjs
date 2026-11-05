// Streetcat's published key is pinned in app/core.js, in one line: const STREETCAT_KEYS = ['0294…'];. A donation link naming any
// other key is refused, and a ledger naming one is flagged. The tests make Streetcat keys of their own, so the pages they open get that one line with the test's keys
// added after the published one. The file on disk is never changed, nothing else in it is, and the published key stays pinned.
// pinBrowser(b) does it for every context the test opens, in every browser it launches: each Streetcat key a page of the test makes
// or imports (seen when the app stores it) is pinned at once in every open page and in every page opened later; pin(pk) (or
// b.pin(pk)) pins a key made in Node. pinBrowser(b, { auto: false }) pins only what pin() names (signed_test, to try links from
// keys that are not pinned). A test with its own static server (csp_test) serves core.js through rewrite() too, so that the
// service worker gets the same file.
import fs from 'fs';
import { watchColors } from './colors.mjs';
export const LINE = /const STREETCAT_KEYS = \[[^\]\n]*\];/;
const APP = new URL('../app/', import.meta.url).pathname, DONE = 'const STREETCAT_KEYS = (self.__pins = self.__pins || []);';
export const PUBLISHED = JSON.parse(fs.readFileSync(APP + 'core.js', 'utf8').match(LINE)[0].replace(/^const STREETCAT_KEYS = /, '').replace(/;$/, '').replace(/'/g, '"'));
export const rewrite = text => { if (text.includes(DONE)) return text; if (!LINE.test(text)) throw new Error('STREETCAT_KEYS is not where the tests pin their keys');
  return text.replace(LINE, `${DONE} STREETCAT_KEYS.unshift(...${JSON.stringify(PUBLISHED)}.filter(k => !STREETCAT_KEYS.includes(k)));`); };
const add = k => { const a = self.__pins = self.__pins || []; if (!a.includes(k)) a.push(k); };
const keys = new Set(), ctxs = new Set();
export const pin = async (...ks) => { for (let k of ks) { k = String(k || '').toLowerCase(); if (!k || keys.has(k)) continue; keys.add(k);
    for (const ctx of ctxs) { await ctx.addInitScript(add, k).catch(() => {}); for (const p of ctx.pages()) await p.evaluate(add, k).catch(() => {}); } } };
export function pinBrowser(b, { auto = true } = {}) { const open = b.newContext.bind(b);
  b.newContext = async (o = {}) => { const ctx = await open(o); ctxs.add(ctx); ctx.on('close', () => ctxs.delete(ctx));
    await ctx.route('**/core.js', async r => { let res; try { res = await r.fetch(); } catch (_) { return r.abort('connectionrefused').catch(() => {}); }  /* a server the test has stopped (offline_test): no connection, as without the route */
      await r.fulfill({ response: res, body: rewrite(await res.text()) }); });
    for (const k of keys) await ctx.addInitScript(add, k);
    await watchColors(ctx);  // every error and warning its pages show must be red (colors.mjs)
    if (auto) { await ctx.exposeBinding('__pinStreetcat', (_, pk) => pin(pk));
      await ctx.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { set.call(this, k, v);
        if (k === 'vetlock.streetcat.sk' && v && window.__vetlock && window.__pinStreetcat) { try { window.__pinStreetcat(window.__vetlock.pubOf(String(v))); } catch (_) {} } }; }); }
    return ctx; };
  const close = b.close.bind(b); b.close = async (...a) => { for (const ctx of ctxs) for (const p of ctx.pages()) await p.evaluate(() => window.__colorScan && window.__colorScan()).catch(() => {}); return close(...a); };  /* what the pages show last is seen too */
  b.pin = pin; return b; }
