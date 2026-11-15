// ONE TAB AT A TIME (15 Nov). The app keeps what it does in this browser's storage (localStorage and IndexedDB), and two of its tabs open
// at once wrote over each other (six scans, 14–15 Nov: 2.3, 2.5, 2.15, 2.17, 3.8, 3.14, 3.34, 4.13, 4.14, 4.19, 4.23, 4.26). Tried here,
// two tabs of one browser keeping records at once with the app's own code: of 120, 8 to 23 lost, released ecash among them; and a PIN
// removed in one tab while the other was being opened with it left the keys sealed with no PIN to open them, ever.
// So the app runs in one tab of a browser at a time. The first takes it (a Web Lock, which the browser lets go of when that tab closes or
// fails). Another says so and runs nothing of the app: no record is read to be written, no key is opened, nothing is sent. It opens the
// app when asked to, once the other is closed, and never by itself: the first tab, opening again (a PIN given, a new version), finds it
// free. A tab the browser keeps aside to show again (back/forward cache) lets go of it and writes nothing more, and opens again from the
// start when it is back. The status page takes nothing: it only reads (vault.js). A browser without Web Locks (none we know of that runs
// the app) runs it as before. Here, in the page's head, so that the browser has answered before the app's code is read.
(() => {
  const NAME = 'vetlock.app';
  let held = false, release = null, started = false, start;
  const ready = new Promise(r => { start = r; });
  const again = () => { try { location.reload(); } catch (_) {} };
  // asked for without waiting in line: true, it is this tab's; false, another tab has it; null, this browser cannot say
  const take = () => new Promise(done => {
    if (!navigator.locks || typeof navigator.locks.request !== 'function') return done(null);
    try { navigator.locks.request(NAME, { ifAvailable: true }, lock => { if (!lock) { done(false); return null; } held = true; done(true); return new Promise(r => { release = r; }); })
      .catch(() => { if (held) { held = false; again(); } else done(null); }); }  /* taken from it after all: it stops, and opens again */
    catch (_) { done(null); } });
  const go = () => { if (started) return; started = true; const s = document.getElementById('one-tab'); if (s) s.remove(); start(); };
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const notice = () => { if (started || document.getElementById('one-tab')) return; if (!document.body) { document.addEventListener('DOMContentLoaded', notice, { once: true }); return; }
    const o = el('div', 'position:fixed;inset:0;z-index:1000;background:var(--bg,#111);color:var(--fg,#efede6);font-family:var(--mono,ui-monospace,Menlo,monospace);font-size:15px;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box'),
      b = el('div', 'width:100%;max-width:340px;display:flex;flex-direction:column;gap:14px'),
      text = el('div', 'color:var(--mute,#8d8a81);font-size:13px;line-height:1.5', 'The app is open in another tab or window of this browser already. Two tabs of it would write over each other\'s records, so it runs in one at a time: use it there, or close it there and open it here.'),
      btn = el('button', 'font:inherit;color:var(--fg,#efede6);background:none;border:1px solid var(--fg,#efede6);padding:12px 16px;min-height:44px;cursor:pointer;text-transform:uppercase;letter-spacing:.08em', 'Open it here'),
      out = el('div', 'min-height:20px;text-align:center');
    o.id = 'one-tab'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); btn.id = 'one-tab-go'; btn.type = 'button'; out.id = 'one-tab-out'; out.setAttribute('role', 'status');
    btn.onclick = async () => { btn.disabled = true; out.style.color = ''; out.textContent = 'checking…'; const ok = await take(); if (ok === true) return go();
      btn.disabled = false; out.style.color = 'var(--bad,#ff4d4d)'; out.textContent = ok === false ? '✗ It is still open in the other tab: close it there first.' : '✗ This browser did not say whether it is free: try again.'; };
    b.append(el('div', 'text-align:center', 'Open in another tab'), text, btn, out); o.appendChild(b); document.body.appendChild(o); };
  const slow = setTimeout(notice, 3000);  /* no answer yet: the screen, whose button asks again; an answer that comes later still counts */
  take().then(ok => { clearTimeout(slow); if (ok === false) return notice(); if (ok === null) held = true; go(); });
  addEventListener('pagehide', e => { if (!e.persisted) return; held = false; if (release) { release(); release = null; } });  /* kept aside: let go, and write nothing */
  addEventListener('pageshow', e => { if (e.persisted) again(); });  /* back from there: from the start, as any tab */
  window.scOneTab = { held: () => held, ready };
})();
