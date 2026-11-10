// Every phone shows these pages as an iPhone 14–16 does. On a phone held upright, the
// page is laid out 390 px wide and the browser scales it to the screen: larger on a Pro Max, smaller on a mini, the same picture
// on all of them. A screen too short for the first screen's height (data-need, in px at 390: Donate without scrolling) is laid
// out a little wider, so it is drawn a little smaller and still fits. Tablets, computers and a phone on its side keep the page's
// own viewport. The browser does the scaling (the viewport meta tag, read by Safari, Chrome, Firefox and the apps' built-in
// browsers); this only chooses the width. It runs in <head>, before anything is drawn, and again when the phone turns.
(() => {
  const meta = document.querySelector('meta[name="viewport"]'); if (!meta) return;
  const BASE = meta.getAttribute('content'), DESIGN = 390, WIDEST = 500, PHONE = 500;  // the page's own viewport; the width the screens are drawn for; the widest they are laid out at; narrower than this is a phone
  const need = Number((document.currentScript && document.currentScript.dataset.need) || 0);
  const upright = () => { const t = screen.orientation && screen.orientation.type; if (t) return t.indexOf('portrait') === 0;
    if (typeof window.orientation === 'number') return window.orientation % 180 === 0; return innerHeight >= innerWidth; };
  let last = null;
  const fit = () => { const up = upright(), w0 = Math.min(screen.width, screen.height); last = up;  // the phone's width upright, at its own scale
    if (!up || !w0 || w0 >= PHONE || !innerWidth) { if (meta.getAttribute('content') !== BASE) meta.setAttribute('content', BASE); return; }
    const h0 = innerHeight * w0 / innerWidth;  // what is visible of its height, at its own scale, with the browser's bars showing
    const w = Math.min(WIDEST, Math.max(DESIGN, need && h0 > 0 ? Math.ceil(need * w0 / h0) : DESIGN)), s = Math.floor(w0 / w * 10000) / 10000;
    const c = `width=${w},initial-scale=${s},minimum-scale=${s},maximum-scale=${s},viewport-fit=cover`;
    if (meta.getAttribute('content') !== c) meta.setAttribute('content', c); };
  fit();
  const turned = () => setTimeout(() => { if (upright() !== last) fit(); }, 250);  /* only when the phone turns: a keyboard opening must not rescale the page */
  addEventListener('orientationchange', turned); addEventListener('resize', turned);
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', turned);
})();
