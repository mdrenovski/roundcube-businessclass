// The accessibility gate (BUILD.md §9, §12 step 14).
//
// §9 is the one section whose requirements are spread across every file in the
// skin — a live region in a template, a ring in a stylesheet, a key table in
// ui.js — so it is also the one most easily half-undone by a later step. The
// ribbon pass and the responsive pass both landed after §9 was last looked at,
// and neither was checked against it.
//
// Two halves:
//
//   Source    invariants that are true or false in the files themselves: the
//             shortcut table matches §9, every suppressed outline is replaced,
//             the live regions exist and are the right politeness, every new
//             string is registered and translated.
//   Reflow    WCAG 2.2 AA 1.4.10: at 320px, and at the widths 200% zoom
//             produces, the page must not scroll sideways. Measured in a real
//             browser, because "does this overflow" is a layout question.
//
//   node tools/verify/a11ycheck.mjs . .verify-out
//
// The source half always runs. The reflow half needs Chrome and skips cleanly
// without it, the same way geometrycheck does.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.argv[2] || '.';
const out = path.join(root, process.argv[3] || '.verify-out');
const skin = path.join(root, 'skins/businessclass');

let fails = 0;

function check(label, ok, detail) {
  if (!ok) fails++;
  console.log(`  ${label.padEnd(54)} ${ok ? 'ok' : `FAIL  ${detail || ''}`}`);
}

function read(rel) {
  const p = path.join(skin, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

// -- §9's keyboard table -------------------------------------------------------
//
// Written out here rather than imported, on purpose: this is the spec's copy,
// and a test that reads its expectations out of the thing it is testing cannot
// fail. If §9 and ui.js disagree, one of them changed and it should hurt.

const SPEC_KEYS = [
  ['j', 'move'], ['k', 'move'], ['Enter', 'open'], ['x', 'select'],
  ['e', 'archive'], ['#', 'delete'], ['u', 'mark unread'], ['f', 'flag'],
  ['r', 'reply'], ['a', 'reply-all'], ['c', 'compose'], ['/', 'search'],
  ['F6', 'cycle panes'], ['?', 'the shortcut dialog'],
];

console.log('\n=== §9 keyboard shortcuts ===');

const ui = read('ui.js');
const table = ui.slice(ui.indexOf('var SHORTCUTS = ['), ui.indexOf('/** Shift+F10'));

for (const [key, what] of SPEC_KEYS) {
  check(`${key.padEnd(6)} is bound — ${what}`, table.includes(`keys: ['${key}']`));
}

check('Shift+F10 opens the row menu', /'F10' && event\.shiftKey/.test(ui) || ui.includes("event.key === 'F10' && event.shiftKey"));
check('the ? dialog is built', ui.includes('businessclass.openShortcuts'));

// The three guards. Each of these has a failure mode that is invisible until
// somebody types a message and archives it by accident.
check('shortcuts decline Ctrl/Meta/Alt', ui.includes('event.ctrlKey || event.metaKey || event.altKey'));
check('shortcuts decline text fields', /tag === 'input' \|\| tag === 'textarea' \|\| tag === 'select'/.test(ui));
check('shortcuts decline contenteditable', ui.includes('el.isContentEditable'));
check('shortcuts decline an open menu', /if \(openPopover\) return false/.test(ui));
check('shortcuts obey the preference', ui.includes('rcmail.env.bc_shortcuts === false'));

// -- Focus ---------------------------------------------------------------------
//
// §9: ":focus-visible only; never outline: none without a replacement." The
// replacement may be a ring, an underline, or a ring on an ancestor — what is
// not allowed is nothing at all.

console.log('\n=== focus ===');

// Suppressions whose replacement is NOT a ring beside them, and what carries the
// indicator instead. Anything not listed here has to have its own ring within
// the same rule — checked per occurrence, because a file-wide search passes on
// somebody else's ring three hundred lines away. That is not a hypothetical:
// this check was written that way first and did not notice the ring being
// deleted from the login field.
const ELSEWHERE = [
  ['_reset.scss', 'the global :focus-visible rule immediately below'],
  ['_header.scss', '.bc-search__field carries :focus-within'],
  ['_list.scss', 'the row carries the ring; the subject would double it'],
  ['_compose.scss:recipients', '.bc-recipients carries :focus-within'],
];

const styleDir = path.join(skin, 'styles');
const scss = fs.readdirSync(styleDir).filter(f => f.endsWith('.scss'));

// A ring counts as this suppression's own if it appears within the next few
// lines — i.e. in the same rule or the one immediately following it.
const RING_WINDOW = 320;

for (const file of scss) {
  const src = fs.readFileSync(path.join(styleDir, file), 'utf8');
  const re = /outline:\s*(?:none|0)\s*;/g;
  let m;
  let n = 0;

  while ((m = re.exec(src))) {
    n++;
    const after = src.slice(m.index, m.index + RING_WINDOW);
    const before = src.slice(Math.max(0, m.index - RING_WINDOW), m.index);
    const hasRing = /focus-visible[\s\S]{0,120}bc-focus-ring/.test(after)
      || /focus-visible[\s\S]{0,120}bc-focus-ring/.test(before);

    if (hasRing) continue;

    // Otherwise it has to be one of the documented exceptions. The recipients
    // input is keyed on its surroundings rather than the filename, because
    // _compose.scss has a second suppression that does need its own ring.
    const known = ELSEWHERE.some(([key]) => {
      if (key === '_compose.scss:recipients') {
        return file === '_compose.scss' && before.includes('.bc-recipients__entry');
      }
      return key === file;
    });

    check(`${file}: suppression #${n} has an indicator`, known,
      'outline suppressed with no :focus-visible ring nearby and no entry in ELSEWHERE');
  }
}

check('the ring is :focus-visible, not :focus',
  /:focus-visible \{\s*@include bc-focus-ring/.test(read('styles/_reset.scss')));

// -- Live regions --------------------------------------------------------------

console.log('\n=== announcements ===');

const footer = read('templates/includes/footer.html');

check('a polite live region exists', /id="bc-live"[^>]*aria-live="polite"/.test(footer));
check('an assertive one exists', /id="bc-live-assertive"[^>]*aria-live="assertive"/.test(footer));
check('both are atomic', (footer.match(/aria-atomic="true"/g) || []).length >= 2);
check('new mail is announced', ui.includes("label('bc_newmail')"));
check('selection changes are announced', ui.includes('function announceSelection'));

// -- Overlays ------------------------------------------------------------------
//
// The step 13 panes float over content with position and z-index, which the
// accessibility tree knows nothing about.

console.log('\n=== overlays (step 13) ===');

check('covered content is made inert', ui.includes('function syncOverlayInert'));
check('inert, not aria-hidden', /\.inert = /.test(ui));
check('the drawer resyncs it', /setFolderPane[\s\S]{0,600}syncOverlayInert\(\)/.test(ui));
check('crossing 768px resyncs it', /cover\.addEventListener\('change', syncOverlayInert\)/.test(ui));

// -- Motion and forced colours -------------------------------------------------

console.log('\n=== media preferences ===');

const tokens = read('styles/_tokens.scss');
const contrast = read('styles/_contrast.scss');

check('prefers-reduced-motion is honoured', /@media \(prefers-reduced-motion: reduce\)/.test(tokens));
check('forced-colors is honoured', /forced-colors: active/.test(contrast));
check('forced-colors does more than the default', !/\*\s*\{\s*forced-color-adjust:\s*auto/.test(contrast));

// -- Strings -------------------------------------------------------------------
//
// A shortcut dialog that renders raw label keys is worse than none: it is the
// screen a confused user goes to for an answer.

console.log('\n=== strings ===');

const en = read('localization/en_US.inc');
const bg = read('localization/bg_BG.inc');

const NEW_KEYS = [
  'bc_keystitle', 'bc_keysnote', 'bc_keyslist', 'bc_keysmessage', 'bc_keysapp',
  'bc_keyenter', 'bc_keynext', 'bc_keyprev', 'bc_keyopen', 'bc_keyselect',
  'bc_keyrowmenu', 'bc_keyarchive', 'bc_keydelete', 'bc_keyunread', 'bc_keyflag',
  'bc_keyreply', 'bc_keyreplyall', 'bc_keycompose', 'bc_keysearch', 'bc_keypanes',
  'bc_keyhelp', 'bc_oneselected', 'bc_nselected', 'bc_newmail',
];

const missingEn = NEW_KEYS.filter(k => !en.includes(`$labels['${k}']`));
const missingBg = NEW_KEYS.filter(k => !bg.includes(`$labels['${k}']`));
const unregistered = NEW_KEYS.filter(k => !footer.includes(`name="${k}"`));

check('every shortcut string exists in en_US', !missingEn.length, missingEn.join(', '));
check('every shortcut string exists in bg_BG', !missingBg.length, missingBg.join(', '));
check('every shortcut string is registered', !unregistered.length, unregistered.join(', '));
check('the count placeholder survives translation',
  en.includes('$n') && bg.includes('$n'));

// -- Reflow (WCAG 1.4.10) ------------------------------------------------------
//
// 320px is the standard's own floor. The other two are what 200% zoom produces
// on the commonest laptop widths — zoom does not change the pixels, it changes
// how many CSS pixels fit, so a 1280px screen at 200% is a 640px viewport.

console.log('\n=== reflow: 320px, and 200% zoom ===');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(p => fs.existsSync(p)) || process.env.CHROME;

const css = path.join(root, 'skins/businessclass/styles/styles.css');

if (!CHROME || !fs.existsSync(CHROME)) {
  console.log('  no Chrome found — reflow half skipped (set CHROME= to force)');
}
else if (!fs.existsSync(css)) {
  console.error('a11ycheck: styles.css missing — run npm run build first');
  process.exit(1);
}
else {
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(css, path.join(out, 'styles.css'));

  // The header is the part that overflows: it holds a search field that wants
  // 520px, a product name, and a support link. The shell below it is measured by
  // geometrycheck; what is asserted here is the document, which nothing else
  // looks at.
  const fixture = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="styles.css">
<style>html,body{height:100%;margin:0}</style>
<body class="task-mail">
<header id="bc-header" class="bc-header">
  <div class="bc-header__brand"><span class="bc-header__product">Business Webmail</span></div>
  <div class="bc-search"><div class="bc-search__field"><span class="bc-search__icon"></span>
    <form><input class="bc-search__input" type="text" value=""></form>
    <button class="bc-search__clear" type="button">x</button></div>
    <button class="bc-header__filters" type="button">Filters</button></div>
  <div class="bc-header__actions"><a class="bc-header__support" href="#">Support</a></div>
</header>
<div id="layout" class="bc-shell">
  <nav id="layout-menu" class="bc-rail"></nav>
  <nav id="layout-sidebar" class="bc-folders"><ul class="bc-folderlist"><li><a href="#">Inbox</a></li></ul></nav>
  <div id="layout-list" class="bc-list"><table class="bc-messagelist"><tbody><tr class="message"><td class="subject"><span class="fromto">Ann Lee</span><span class="subject"><a href="#">A reasonably long subject line that has no business fitting</a></span></td></tr></tbody></table></div>
  <main id="layout-content" class="bc-reading is-empty"><div class="bc-empty"><p class="bc-empty__title">Nothing selected</p></div></main>
</div>
<pre id="out"></pre>
<script>
document.getElementById('out').textContent = JSON.stringify({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  bodyW: document.body.scrollWidth
});
</script>`;

  const file = path.join(out, 'a11y-reflow.html');
  fs.writeFileSync(file, fixture);

  // Same iframe trick geometrycheck documents: headless Chrome clamps its window
  // to 500px, so 320 has to be a frame width rather than a window width.
  function atWidth(width) {
    const wrapper = path.join(out, 'a11y-frame.html');
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
      throw new Error(`no measurement returned @ ${width}px`);
    }
    return JSON.parse(text);
  }

  // 320: the standard's floor. 640: a 1280px laptop at 200%. 512: a 1024px one.
  for (const width of [320, 512, 640]) {
    const r = atWidth(width);
    const zoom = width === 320 ? '' : ` (${width * 2}px at 200%)`;

    check(`${width}px${zoom}: the document does not scroll sideways`,
      r.scrollW <= r.clientW + 1, `scrollWidth ${r.scrollW} > clientWidth ${r.clientW}`);
  }
}

console.log(fails ? `\nACCESSIBILITY GATE — ${fails} failure(s)\n` : '\nACCESSIBILITY GATE OK — 0 failures\n');
process.exit(fails ? 1 : 0);
