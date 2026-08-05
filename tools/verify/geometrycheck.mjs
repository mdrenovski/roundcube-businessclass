// Measures the app shell instead of reading it (BUILD.md §3.1, §6).
//
// This exists because the folder-pane toggle shipped broken in 0.3.0 and every
// other check stayed green through it. Contrast, parsing, references and labels
// are all blind to geometry: the panes were in the wrong columns and the message
// list was 1px wide, and nothing said so. So this one renders the real compiled
// styles.css against the real shell markup in a real browser and asserts where
// the panes actually land.
//
//   node tools/verify/geometrycheck.mjs . .verify-out
//
// Needs Chrome. Skips cleanly when there is none, rather than failing a build on
// a machine that was never going to have one.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.argv[2] || '.';
const out = path.join(root, process.argv[3] || '.verify-out');
const css = path.join(root, 'skins/businessclass/styles/styles.css');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p)) || process.env.CHROME;

if (!CHROME || !fs.existsSync(CHROME)) {
  console.log('geometrycheck: no Chrome found — skipping (set CHROME= to force)');
  process.exit(0);
}

if (!fs.existsSync(css)) {
  console.error('geometrycheck: styles.css missing — run npm run build first');
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(css, path.join(out, 'styles.css'));

// -- The shells, as the templates actually emit them ---------------------------
//
// The inline style on #layout matters and is not decoration: businessclass_prefs
// publishes the stored pane widths and mail.html writes them as inline custom
// properties. An inline custom property outranks every stylesheet rule, so a
// breakpoint that re-declares one has to win on !important or not at all. That
// is exactly the trap the accent fell into at step 12, and leaving it out of the
// fixture would hide it here too.
const PANES = ['layout-menu', 'layout-sidebar', 'layout-list', 'layout-content'];

const SHELLS = {
  mail: {
    cls: 'bc-shell',
    style: '--bc-folders-w: 236px; --bc-list-w: 400px; --bc-list-h: 280px',
    body: 'task-mail',
    splitters: true,
  },
  'mail-desktop': {
    cls: 'bc-shell',
    attr: ' data-bc-layout="desktop"',
    style: '--bc-folders-w: 236px; --bc-list-w: 400px; --bc-list-h: 280px',
    body: 'task-mail',
    splitters: true,
  },
  contacts: { cls: 'bc-shell bc-shell--contacts', body: 'task-addressbook' },
  settings: { cls: 'bc-shell bc-shell--settings', body: 'task-settings' },
};

function fixture(shell) {
  const s = SHELLS[shell];
  const splitters = s.splitters
    ? { folders: '<div class="bc-splitter" id="bc-splitter-folders"></div>',
        list: '<div class="bc-splitter" id="bc-splitter-list"></div>' }
    : { folders: '', list: '' };

  return `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="styles.css">
<style>html,body{height:100%;margin:0}</style>
<body class="${s.body}">
<header id="bc-header" class="bc-header"></header>
<div id="layout" class="${s.cls}"${s.attr || ''}${s.style ? ` style="${s.style}"` : ''}>
  <nav id="layout-menu" class="bc-rail"></nav>
  <nav id="layout-sidebar" class="bc-folders"><ul class="bc-folderlist"><li><a href="#">Inbox</a></li></ul></nav>
  ${splitters.folders}
  <div id="layout-list" class="bc-list"><table class="bc-messagelist"><tbody><tr class="message"><td class="subject"><span class="fromto">Ann Lee</span><span class="subject"><a href="#">A reasonably long subject line</a></span></td></tr></tbody></table></div>
  ${splitters.list}
  <main id="layout-content" class="bc-reading is-empty"><div class="bc-empty"><p class="bc-empty__title">Nothing selected</p></div></main>
</div>
<pre id="out"></pre>
<script>
var shell = document.getElementById('layout');
var result = {};

function measure() {
  var m = {};
  ${JSON.stringify(PANES)}.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) { m[id] = null; return; }
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    m[id] = {
      w: Math.round(r.width), x: Math.round(r.left),
      h: Math.round(r.height), y: Math.round(r.top),
      pos: cs.position, vis: cs.visibility, disp: cs.display
    };
  });
  m.viewport = window.innerWidth;
  return m;
}

result.shown = measure();
shell.classList.add('bc-folders-hidden');
result.hidden = measure();
shell.classList.remove('bc-folders-hidden');

// With a message open the reading pane loses .is-empty, which is the signal the
// narrow overlay keys off.
document.getElementById('layout-content').classList.remove('is-empty');
result.open = measure();

document.getElementById('out').textContent = JSON.stringify(result);
</script>`;
}

/**
 * Load a page at an exact viewport width and hand back what it measured.
 *
 * Through an iframe, because headless Chrome clamps --window-size to a 500px
 * minimum: asking for 375 silently gives 500, and every phone assertion would
 * then be made at a width no phone has. A frame's own width is what its media
 * queries resolve against, so sizing the frame is the only way to reach 320.
 *
 * --allow-file-access-from-files is what lets the wrapper read into the frame;
 * without it a file:// parent and a file:// child count as different origins.
 * It is scoped to this one short-lived process and nothing it loads is remote.
 */
function atWidth(file, width) {
  const wrapper = path.join(out, 'geom-frame.html');
  fs.writeFileSync(wrapper, `<!doctype html><meta charset="utf-8"><style>body{margin:0}</style>
<pre id="out"></pre>
<script>
var f = document.createElement('iframe');
f.style.cssText = 'border:0;height:900px;width:${width}px';
f.src = ${JSON.stringify(path.basename(file))};
document.body.appendChild(f);
var tries = 0;
(function poll() {
  var inner = f.contentDocument && f.contentDocument.getElementById('out');
  if (inner && inner.textContent.trim()) document.getElementById('out').textContent = inner.textContent;
  else if (tries++ < 200) setTimeout(poll, 20);
  else document.getElementById('out').textContent = 'TIMED OUT';
})();
</script>`);

  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox',
    '--allow-file-access-from-files',
    '--window-size=1400,1000',
    '--virtual-time-budget=5000',
    '--dump-dom', `file://${path.resolve(wrapper)}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  const text = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';

  if (!m || !text.trim() || text.trim() === 'TIMED OUT') {
    throw new Error(`no measurement returned from ${path.basename(file)} @ ${width}px`);
  }
  return JSON.parse(text);
}

function measure(shell, width) {
  const file = path.join(out, `geom-${shell}.html`);
  fs.writeFileSync(file, fixture(shell));
  return atWidth(file, width);
}

// -- Assertions ----------------------------------------------------------------
let fails = 0;

function check(label, ok, detail) {
  if (!ok) fails++;
  console.log(`  ${label.padEnd(52)} ${ok ? 'ok' : `FAIL  ${detail || ''}`}`);
}

function checkEq(label, got, want) {
  check(label, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const RAIL = 48;

// Reports the width the page actually saw, not the one that was asked for — the
// two used to differ, and a phone assertion made at 500px is not a phone
// assertion.
function run(shell, width) {
  const r = measure(shell, width);
  console.log(`\n=== ${shell} @ ${r.shown.viewport}px ===`);
  return r;
}

for (const shell of ['mail', 'mail-desktop', 'contacts', 'settings']) {
  const wide = run(shell, 1400);

  // The bug that started this: hiding the pane must not move the list.
  check('pane shown: list starts after the folder pane',
    wide.shown['layout-list'].x > RAIL, JSON.stringify(wide.shown['layout-list']));
  check('pane hidden: list keeps its width',
    wide.hidden['layout-list'].w >= 300,
    `list ${wide.hidden['layout-list'].w}px @x=${wide.hidden['layout-list'].x}`);
  check('pane hidden: list sits against the rail',
    wide.hidden['layout-list'].x === RAIL, `x=${wide.hidden['layout-list'].x}`);
  // The 'desktop' layout puts the reading pane BELOW the list in the same
  // column, so "to the right of" is the wrong question there — it has to be
  // asked as "below", or the check fails a layout that is behaving correctly.
  const stacked = shell === 'mail-desktop';
  const list = wide.hidden['layout-list'];
  const content = wide.hidden['layout-content'];

  check('pane hidden: reading pane does not take the list slot',
    stacked ? content.y > list.y : content.x > list.x,
    `content ${stacked ? 'y=' + content.y : 'x=' + content.x}, list ${stacked ? 'y=' + list.y : 'x=' + list.x}`);
  check('pane hidden: the folder pane is a true zero',
    wide.hidden['layout-sidebar'].w === 0, `${wide.hidden['layout-sidebar'].w}px`);
  check('pane hidden: nothing overlaps',
    stacked ? list.y + list.h <= content.y : list.x + list.w <= content.x);
}

// -- §6 / D-79: the two narrowing steps ---------------------------------------
{
  const med = run('mail', 1000);
  check('768-1199: folder pane holds no column',
    med.shown['layout-sidebar'].pos === 'absolute'
      || med.shown['layout-sidebar'].w === 0,
    JSON.stringify(med.shown['layout-sidebar']));
  check('768-1199: the list starts at the rail',
    med.shown['layout-list'].x === RAIL, `x=${med.shown['layout-list'].x}`);
  check('768-1199: the reading pane is still beside the list',
    med.shown['layout-content'].x > med.shown['layout-list'].x
      && med.shown['layout-content'].pos !== 'absolute',
    JSON.stringify(med.shown['layout-content']));
}

{
  const narrow = run('mail', 400);
  const vw = narrow.shown.viewport;

  check('<768: the list fills everything but the rail',
    narrow.shown['layout-list'].x === RAIL
      && narrow.shown['layout-list'].w === vw - RAIL,
    `list ${narrow.shown['layout-list'].w}px @x=${narrow.shown['layout-list'].x}, viewport ${vw}`);
  check('<768: nothing open means no overlay over the list',
    narrow.shown['layout-content'].disp === 'none',
    JSON.stringify(narrow.shown['layout-content']));
  check('<768: an open message covers the shell',
    narrow.open['layout-content'].pos === 'absolute'
      && narrow.open['layout-content'].w === vw,
    JSON.stringify(narrow.open['layout-content']));
  check('<768: the drawer floats over the list',
    narrow.shown['layout-sidebar'].pos === 'absolute',
    JSON.stringify(narrow.shown['layout-sidebar']));
  check('<768: the drawer leaves the rail reachable',
    narrow.shown['layout-sidebar'].x === RAIL,
    `x=${narrow.shown['layout-sidebar'].x}`);
}

// -- The header band at phone widths ------------------------------------------
//
// The band is a three-column grid, auto | 1fr | auto. `auto` serves its content
// in full, so anything that grows in the first column is taken out of the
// search box in the second — and search is the only one of the three that can
// be squeezed to nothing without disappearing. It was reported from a real
// iPhone with the product name pushing the search field out of its own border.
//
// 320px is here on purpose: it is the narrowest screen still in use, and every
// hard minimum in the band shows up there first.
{
  const header = path.join(out, 'geom-header.html');
  fs.writeFileSync(header, `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="styles.css">
<style>html,body{height:100%;margin:0}</style>
<body class="task-mail">
<header id="bc-header" class="bc-header">
  <div class="bc-header__lead">
    <button type="button" id="bc-appmenu" class="bc-header__btn"><svg class="bc-icon"><use href="#x"/></svg></button>
    <a href="#" class="bc-header__brand">
      <img class="bc-header__symbol" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
      <span class="bc-header__product">BusinessClass</span>
    </a>
  </div>
  <div class="bc-header__search">
    <div class="bc-search" role="search">
      <div class="bc-search__box">
        <svg class="bc-icon bc-search__icon"><use href="#x"/></svg>
        <ul id="bc-search-tokens" class="bc-search__tokens"></ul>
        <input class="bc-search__input" placeholder="Search">
      </div>
      <button type="button" id="bc-refine-toggle" class="bc-btn bc-btn--secondary bc-search__filters">
        <svg class="bc-icon bc-icon--16"><use href="#x"/></svg>
        <span class="bc-btn__label">Filters</span>
      </button>
    </div>
  </div>
  <div class="bc-header__trail">
    <a class="bc-header__btn" href="#" target="_blank"><svg class="bc-icon"><use href="#x"/></svg></a>
    <a class="bc-header__btn" href="#"><svg class="bc-icon"><use href="#x"/></svg></a>
    <span class="bc-avatar bc-header__avatar">MD</span>
  </div>
</header>
<pre id="out"></pre>
<script>
function m(sel) {
  var e = document.querySelector(sel);
  if (!e) return null;
  var r = e.getBoundingClientRect();
  return { w: Math.round(r.width), x: Math.round(r.left), right: Math.round(r.right),
           disp: getComputedStyle(e).display };
}
document.getElementById('out').textContent = JSON.stringify({
  viewport: window.innerWidth,
  band: m('#bc-header'), product: m('.bc-header__product'),
  box: m('.bc-search__box'), input: m('.bc-search__input'),
  filters: m('.bc-search__filters'), support: m('.bc-header__trail .bc-header__btn[target="_blank"]')
});
</script>`);

  for (const width of [440, 375, 320]) {
    const h = atWidth(header, width);
    console.log(`\n=== header @ ${h.viewport}px ===`);

    checkEq('the product name gives up its space', h.product.disp, 'none');
    check('the search field stays inside the band',
      h.box.right <= h.band.right, `box right ${h.box.right}, band right ${h.band.right}`);
    // The one that was actually broken: an 8ch floor on the input is wider than
    // the field can be at this width, so it spilled out of its own border.
    check('the input stays inside the search field',
      h.input.w <= h.box.w, `input ${h.input.w}px in a ${h.box.w}px field`);
    check('there is still a usable amount of search',
      h.box.w >= 80, `${h.box.w}px`);
    check('Filters keeps a 44px target', h.filters.w >= 44, `${h.filters.w}px`);
    checkEq('the duplicated support link steps aside', h.support.disp, 'none');
  }
}

console.log('');
console.log(fails ? `${fails} GEOMETRY FAILURES` : 'SHELL GEOMETRY OK — 0 failures');
process.exit(fails ? 1 : 0);
