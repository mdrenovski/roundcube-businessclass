// Print styles, measured (_print.scss).
//
//   node tools/verify/printcheck.mjs . .verify-out
//   chrome --headless=new --disable-gpu --window-size=794,1123 \
//          --virtual-time-budget=2000 --dump-dom file://$PWD/.verify-out/p-message.html \
//     | grep -o '<title>[^<]*'
//
// Chrome cannot be put into print media from the command line without driving the
// DevTools protocol, so this takes the **real** compiled styles.css and rewrites
// `@media print {` to `@media screen {` in a copy. What that proves: the selectors
// match real elements, they beat the screen rules they have to beat, and the
// resulting layout is what was intended. What it does not prove: Chrome's own
// print-media switch, @page, or pagination. See docs/ROUNDCUBE-NOTES.md, "Harness
// gaps already hit".
//
// Each page writes its assertions into document.title, the same convention as
// render.mjs and probe-fixes.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const OUT = process.argv[3] || path.join(ROOT, '.verify-out');
const SKIN = path.join(ROOT, 'skins/businessclass');

fs.mkdirSync(OUT, { recursive: true });

// -- The stylesheet, with print media made observable -------------------------
const css = fs.readFileSync(path.join(SKIN, 'styles/styles.css'), 'utf8');
const marker = '@media print {';
const at = css.indexOf(marker);

if (at < 0) {
  console.error('FAIL: styles.css has no @media print block at all');
  process.exit(1);
}

if (!/@page\s*\{/.test(css)) {
  console.error('FAIL: styles.css has no @page rule');
  process.exit(1);
}

// @page cannot survive being nested in @media screen, and Chrome drops the whole
// rule if it does not parse — so it is cut out for the emulation and asserted
// above instead.
const printBlock = css.slice(at + marker.length, matchingBrace(css, at + marker.length - 1));
fs.writeFileSync(path.join(OUT, 'styles-print.css'),
  css + '\n@media screen {\n' + printBlock.replace(/@page\s*\{[^}]*\}/g, '') + '\n}\n');

/** Index of the `}` closing the `{` at `open`. */
function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced braces in styles.css');
}

// -- Pages ---------------------------------------------------------------------
function render(template, args = []) {
  const tmp = path.join(OUT, 'tmp-' + template + '.html');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/verify/render.mjs'), template, tmp, ...args],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const html = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  return html;
}

/**
 * Finish a rendered template into a measurable page.
 *
 * Two substitutions render.mjs cannot make: the body class, which comes from
 * `task-<var>` / `action-<var>` and so renders empty, and the theme attribute —
 * set to dark on purpose, because "print is monochrome whatever the reader had on
 * screen" is the one thing about this that cannot be checked by reading the code.
 */
function page(html, bodyClass, probe) {
  return html
    .replace(/href="file:\/\/[^"]*styles\.css"/, 'href="./styles-print.css"')
    .replace(/<body class="[^"]*"/, `<body class="${bodyClass}"`)
    // A real accent, because render.mjs blanks every roundcube:var and an *empty*
    // custom property is not the same as an absent one: `--bc-brand-primary: ` on
    // <html> makes every var(--bc-brand-*) invalid at computed-value time, so
    // every link comes back black and "the accent survived" would pass on nothing.
    .replace('style="--bc-brand-primary: "', 'style="--bc-brand-primary: #0F6CBD"')
    .replace(/<html([^>]*)data-bc-theme="[^"]*"/, '<html$1data-bc-theme="dark"')
    .replace(/<\/body>/, `<script>
window.addEventListener('load', function () {
  var out = [];
  function css(sel, prop) {
    var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    return el ? getComputedStyle(el)[prop] : 'ABSENT';
  }
  function shown(sel) {
    var el = document.querySelector(sel);
    if (!el) return 'ABSENT';
    return getComputedStyle(el).display === 'none' ? 'hidden' : 'shown';
  }
  ${probe}
  document.title = 'PROBE ' + out.join(' | ');
});
</script></body>`);
}

// A printed message: the letterhead in both of its states, monochrome text, an
// accented link, and nothing of the app around it.
const MESSAGE_PROBE = `
  out.push('header=' + (document.querySelector('#bc-header') ? 'PRESENT' : 'absent-from-markup'));
  out.push('letterhead=' + shown('.bc-print__brand'));
  out.push('subject-color=' + css('.bc-message__subject', 'color'));
  out.push('meta-color=' + css('.bc-message__headers .header-title', 'color'));
  out.push('body-bg=' + css(document.body, 'backgroundColor'));
  out.push('print-pad=' + css('.bc-print', 'padding') + ' max-w=' + css('.bc-print', 'maxWidth'));
  var link = document.querySelector('.bc-message__body a[href^="http"]');
  out.push('link-color=' + css(link, 'color') + ' deco=' + css(link, 'textDecorationLine'));
  out.push('link-url-printed=' + (link ? /intranet\\.example\\.org/.test(
    getComputedStyle(link, ':after').content) : 'ABSENT'));
  out.push('attachments=' + shown('.bc-attachments'));
  // Plugin notice boxes reach paper through the message body (§12 step 11).
  // bc-print whitens every status tint but leaves the brand foregrounds alone —
  // they are what puts the accent on links — so .boxinformation, whose body text
  // is brand-fg-strong, is the one that can still print in accent ink.
  out.push('sig-box=' + css('#enigma-message', 'color') + '/' + css('#enigma-message', 'backgroundColor'));
  out.push('key-box=' + css('.enigmaattachment', 'color') + '/' + css('.enigmaattachment', 'backgroundColor'));
  out.push('key-button=' + shown('.enigmaattachment button'));
  out.push('h-overflow=' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
`;

// The app window, printed: chrome off, panes in flow, and the right one of the two
// panes chosen for the page.
const APP_PROBE = `
  ['#bc-header', '#layout-menu', '#layout-sidebar', '.bc-toolbar', '.bc-toasts',
   '.bc-search', '.bc-splitter', '.bc-pagenav'].forEach(function (sel) {
    out.push(sel.replace(/[.#]/g, '') + '=' + shown(sel));
  });
  out.push('body-display=' + css(document.body, 'display') + ' overflow=' + css(document.body, 'overflowY'));
  out.push('shell-display=' + css('#layout', 'display'));
  var content = document.getElementById('layout-content');
  content.classList.add('is-empty');
  out.push('nothing-open: list=' + shown('#layout-list') + ' pane=' + shown('#layout-content'));
  content.classList.remove('is-empty');
  out.push('message-open: list=' + shown('#layout-list') + ' pane=' + shown('#layout-content'));
  out.push('frame-h=' + css('.bc-reading__frame', 'height'));
  // The unread bar's fill comes from --bc-brand-primary, which is an inline style
  // on <html> that no token override can reach — so this is the one thing in the
  // list that can still print in accent ink by accident.
  var unread = document.querySelector('.bc-messagelist tr.message.unread');
  out.push('unread-bar=' + (unread ? getComputedStyle(unread, ':before').backgroundColor : 'ABSENT'));
  out.push('row-weight=' + (unread ? getComputedStyle(unread.querySelector('span.subject')).fontWeight : 'ABSENT'));
`;

const CONTACT_PROBE = `
  out.push('header=' + (document.querySelector('#bc-header') ? 'PRESENT' : 'absent-from-markup'));
  out.push('letterhead=' + shown('.bc-print__brand'));
  // .names, not the first .namefield — the first one is the address-book source
  // line, which is legitimately grey and would prove nothing about the name.
  out.push('name-color=' + css('.bc-contact__ident .names .namefield', 'color'));
  out.push('source-color=' + css('.bc-contact__ident .source .namefield', 'color'));
  out.push('photo=' + shown('.bc-contact__photo'));
  out.push('sections=' + document.querySelectorAll('.bc-contact__section').length);
  out.push('h-overflow=' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
`;

const messageHtml = render('messageprint', ['--print', '--logo']);
const contactHtml = render('contactprint', ['--print', '--logo']);
const appHtml = render('mail');

const pages = [
  ['p-message.html', page(messageHtml, 'task-mail action-print', MESSAGE_PROBE)],
  ['p-message-nologo.html', page(render('messageprint', ['--print']), 'task-mail action-print', MESSAGE_PROBE)],
  ['p-contact.html', page(contactHtml, 'task-addressbook action-print', CONTACT_PROBE)],
  ['p-app.html', page(appHtml, 'task-mail action-', APP_PROBE)],
];

// The same three pages against the *unmodified* stylesheet, for --print-to-pdf.
// That path goes through Chrome's own print media, @page and pagination — the
// three things the @media-screen emulation above cannot reach:
//
//   chrome --headless=new --print-to-pdf=out.pdf --no-pdf-header-footer \
//          file://$PWD/.verify-out/r-message.html
//   mdls -name kMDItemNumberOfPages out.pdf
fs.copyFileSync(path.join(SKIN, 'styles/styles.css'), path.join(OUT, 'styles.css'));

const real = (html, bodyClass) => html
  .replace(/href="file:\/\/[^"]*styles\.css"/, 'href="./styles.css"')
  .replace(/<body class="[^"]*"/, `<body class="${bodyClass}"`)
  .replace('style="--bc-brand-primary: "', 'style="--bc-brand-primary: #0F6CBD"')
  .replace(/<html([^>]*)data-bc-theme="[^"]*"/, '<html$1data-bc-theme="dark"');

pages.push(
  ['r-message.html', real(messageHtml, 'task-mail action-print')],
  ['r-contact.html', real(contactHtml, 'task-addressbook action-print')],
  // With something open the reading pane is an about:blank iframe here, so this one
  // prints a page of nothing — that is the fixture's limit, not a finding.
  ['r-app.html', real(appHtml, 'task-mail action-')],
  // Nothing open, which is the case a PDF can actually judge: the list is real
  // markup, so it either paginates as a table or it does not.
  // Added into the existing class attribute, not as a second one — a duplicate
  // class= is dropped by the parser and the page would quietly test nothing.
  ['r-app-empty.html', real(appHtml, 'task-mail action-')
    .replace('id="layout-content" class="', 'id="layout-content" class="is-empty ')]);

for (const [name, html] of pages) {
  fs.writeFileSync(path.join(OUT, name), html);
}

console.log('wrote ' + pages.map(p => p[0]).join(', ') + ' + styles-print.css, styles.css to ' + OUT);
console.log('@media print block: ' + printBlock.split('\n').length + ' lines, @page present');
