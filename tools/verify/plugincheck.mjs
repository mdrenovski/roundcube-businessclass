// Plugin screens, measured (_plugins.scss, BUILD.md §12 step 11).
//
//   node tools/verify/plugincheck.mjs . .verify-out
//   chrome --headless=new --disable-gpu --window-size=1400,900 \
//          --virtual-time-budget=2000 --dump-dom file://$PWD/.verify-out/g-bounce.html \
//     | grep -o '<title>[^<]*'
//
// Renders each screen from its real template through render.mjs, whose plugin
// object stubs reproduce the markup the plugins actually emit — the classes below
// are the ones _plugins.scss selects on, so a simplified fixture would measure
// rules that never fire in production.
//
// What this cannot reach: the plugins' own JS. acl.js moving #aclform into a
// dialog, enigma.js building its key list, and core's show_menu() positioning a
// .popupmenu all happen at runtime against a live rcmail. The static assertions
// below are about the states those scripts put the DOM into, applied by hand.
//
// Each page writes its assertions into document.title, as render.mjs and
// printcheck.mjs do.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const OUT = process.argv[3] || path.join(ROOT, '.verify-out');
const SKIN = path.join(ROOT, 'skins/businessclass');

fs.mkdirSync(OUT, { recursive: true });

const css = fs.readFileSync(path.join(SKIN, 'styles/styles.css'), 'utf8');
fs.writeFileSync(path.join(OUT, 'styles.css'), css);

// _scaffold.scss was deleted at step 11; nothing may reach for its classes again.
for (const cls of ['bc-scaffold', 'bc-scaffold__form', 'bc-scaffold__actions']) {
  if (css.includes('.' + cls) ) {
    console.error(`FAIL: styles.css still defines .${cls} — _scaffold.scss was deleted at step 11`);
    process.exit(1);
  }
}
const templates = walk(path.join(SKIN, 'templates')).concat(walk(path.join(SKIN, 'plugins')));
for (const f of templates) {
  if (fs.readFileSync(f, 'utf8').includes('bc-scaffold')) {
    console.error(`FAIL: ${path.relative(ROOT, f)} still uses .bc-scaffold, which no longer exists`);
    process.exit(1);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name))
      : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
}

function render(template, args = []) {
  const tmp = path.join(OUT, 'tmp.html');
  execFileSync(process.execPath, [path.join(ROOT, 'tools/verify/render.mjs'), template, tmp, ...args],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const html = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  return html;
}

// String.replace() treats $ in the *replacement* as a pattern — $&, $`, $' and
// $1 all mean something. The templates below are full of jQuery ("$('#acl-switch')"
// in a comment), so every insertion of generated markup goes through a function
// replacement, where no such expansion happens. Getting this wrong is silent: the
// $' case splices in the text after the match and drops what you meant to insert,
// which is how the acl fixture first came out missing its whole table.
const put = (text) => () => text;

function page(html, bodyClass, probe, extraHead = '') {
  return html
    .replace(/href="file:\/\/[^"]*styles\.css"/, 'href="./styles.css"')
    .replace(/<body class="[^"]*"/, put(`<body class="${bodyClass}"`))
    // render.mjs blanks every roundcube:var, and an *empty* custom property is
    // not an absent one: `--bc-brand-primary: ` on <html> makes every
    // var(--bc-brand-*) invalid at computed-value time, so everything accented
    // measures black and an assertion about the accent would pass on nothing.
    .replace('style="--bc-brand-primary: "', put('style="--bc-brand-primary: #0F6CBD"'))
    .replace('</head>', put(extraHead + '</head>'))
    .replace(/<\/body>/, put(`<script>
window.addEventListener('load', function () {
  var out = [];
  function el(sel) { return typeof sel === 'string' ? document.querySelector(sel) : sel; }
  function css(sel, prop) { var e = el(sel); return e ? getComputedStyle(e)[prop] : 'ABSENT'; }
  function shown(sel) {
    var e = el(sel);
    if (!e) return 'ABSENT';
    var s = getComputedStyle(e);
    return s.display === 'none' || s.visibility === 'hidden' ? 'hidden' : 'shown';
  }
  function before(sel, prop) {
    var e = el(sel);
    return e ? getComputedStyle(e, ':before')[prop] : 'ABSENT';
  }
  function overflows(sel) {
    var e = el(sel);
    return e ? (e.scrollWidth > e.clientWidth + 1) : 'ABSENT';
  }
  ${probe}
  document.title = 'PROBE ' + out.join(' | ');
});
</script></body>`));
}

// -- Bounce -------------------------------------------------------------------
// The three things that were actually broken before step 11: no recipient fields
// at all, no </form> around them, and a dead submit button of our own.
const BOUNCE_PROBE = `
  var form = document.querySelector('form[name="form"]');
  out.push('form=' + (form ? 'present' : 'ABSENT'));
  ['_from', '_to', '_cc', '_bcc'].forEach(function (n) {
    var f = document.getElementById(n);
    out.push(n + '=' + (f ? 'present' : 'ABSENT') + (f && form ? (form.contains(f) ? '/in-form' : '/OUTSIDE') : ''));
  });
  out.push('storetarget=' + (document.getElementById('compose-store-target') ? 'present' : 'ABSENT'));
  // The dialog supplies Bounce and Cancel; one of ours would be permanently
  // disabled, because the framed bounce page never enables the command.
  out.push('own-submit-buttons=' + document.querySelectorAll('.bc-bounce input[type=button], .bc-bounce button[type=submit]').length);
  out.push('cc-row-hidden=' + (document.getElementById('compose_cc').hidden));
  out.push('hint=' + shown('#bounce-hint') + ' bg=' + css('#bounce-hint', 'backgroundColor'));
  out.push('warning=' + shown('#bcc-warning'));
  out.push('header=' + (document.querySelector('#bc-header') ? 'PRESENT' : 'absent-from-markup'));
  // 560x460 is what ui.js resizes the dialog to; nothing may overflow it.
  out.push('h-overflow=' + overflows(document.body));
  out.push('doc-h=' + document.body.scrollHeight);
  // No label's text may spill out of its grid track and paint over the control
  // beside it. .bc-compose__row gives the label a fixed 70px column, and grid
  // overflows a too-wide item rather than clipping it.
  //
  // getBoundingClientRect() cannot see this: the label's *box* stays 70px while
  // its text paints outside. scrollWidth vs clientWidth is what catches it.
  var worst = 0, culprit = '';
  document.querySelectorAll('.bc-bounce__headers .bc-compose__row').forEach(function (row) {
    var lab = row.querySelector('label');
    if (!lab) return;
    var over = lab.scrollWidth - lab.clientWidth;
    if (over > worst) { worst = over; culprit = row.id || '?'; }
  });
  out.push('label-spill=' + Math.round(worst) + (worst > 0 ? 'px@' + culprit : ''));
`;

// -- The generic dialog host --------------------------------------------------
const DIALOG_PROBE = `
  var box = document.querySelector('.bc-dialogpage');
  out.push('class=' + box.className.trim());
  out.push('mono=' + /mono|Menlo|Consolas|monospace/i.test(css(box, 'fontFamily')));
  out.push('nowrap=' + css(box, 'whiteSpace'));
  out.push('scrolls-x=' + (css(box, 'overflowX') !== 'visible'));
  out.push('name-weight=' + css('.bc-dialogpage font.bold', 'fontWeight'));
  // The point of nowrap + overflow: the long header line must scroll inside the
  // box, never widen the page.
  out.push('page-h-overflow=' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
`;

// -- acl ----------------------------------------------------------------------
const ACL_PROBE = `
  out.push('table=' + shown('.bc-acl__table') + ' thead=' + shown('.bc-acl__table thead'));
  var granted = document.querySelector('.bc-acl__table td.enabled span');
  var partial = document.querySelector('.bc-acl__table td.partial span');
  var none = document.querySelector('.bc-acl__table td.disabled span');
  out.push('granted=' + JSON.stringify(before(granted, 'content')) + '/' + before(granted, 'color'));
  out.push('partial=' + JSON.stringify(before(partial, 'content')));
  out.push('none=' + JSON.stringify(before(none, 'content')));
  // Three distinct glyphs, so the state survives monochrome (§9).
  out.push('glyphs-distinct=' + new Set([before(granted, 'content'), before(partial, 'content'),
    before(none, 'content')]).size);
  out.push('actions=' + document.querySelectorAll('.bc-acl__actions > a').length);
  out.push('advanced-toggle=' + shown('#acl-switch') + ' input=' +
    (document.getElementById('acl-advanced') ? 'present' : 'ABSENT'));
  // acl.js hands #aclform to show_popup_dialog and expects it hidden until then.
  out.push('aclform=' + shown('#aclform'));
  var f = document.getElementById('aclform');
  f.style.display = 'block';
  out.push('when-shown: rights=' + shown('#simplerights') + '/' + shown('#advancedrights'));
  out.push('user-field=' + (document.getElementById('acluser') ? 'present' : 'ABSENT'));
  // Both rights lists must survive: acl.js picks one at runtime.
  out.push('both-rights-lists=' + document.querySelectorAll('#aclform ul[id$="rights"]').length);
`;

// -- enigma -------------------------------------------------------------------
const KEYS_PROBE = `
  out.push('shell=' + css('#layout', 'gridTemplateColumns'));
  out.push('search=' + shown('.bc-keys__search') + ' input-w=' + css('.bc-keys__search input', 'width'));
  out.push('list=' + shown('#keys-table') + ' rows=' + document.querySelectorAll('#keys-table tr').length);
  out.push('pagenav=' + shown('.bc-pagenav') + ' count=' + (document.querySelector('.bc-pagenav .bc-pagenav__text') ? 'present' : 'ABSENT'));
  out.push('export-menu=' + shown('#bc-keys-export-menu'));
  out.push('toolbar-buttons=' + document.querySelectorAll('#layout-content .bc-pane__head > a').length);
  out.push('empty=' + shown('.bc-reading__empty'));
  var pane = document.querySelector('#layout-content');
  pane.classList.add('is-empty');
  out.push('when-empty: frame=' + shown('.bc-reading__frame') + ' empty=' + shown('.bc-reading__empty'));
`;

const KEYINFO_PROBE = `
  out.push('fieldsets=' + document.querySelectorAll('.bc-keyinfo__data fieldset').length);
  out.push('records-tables=' + document.querySelectorAll('.bc-keyinfo__data table.records-table').length);
  var fp = document.querySelector('.bc-keyinfo__data > fieldset:first-of-type tr:last-child td:not(.title)');
  out.push('fingerprint-mono=' + /mono|Menlo|Consolas/i.test(css(fp, 'fontFamily')));
  out.push('fingerprint-text=' + (fp ? fp.textContent.slice(0, 9) : 'ABSENT'));
  var dead = document.querySelector('table.records-table tr.deleted td');
  out.push('revoked-deco=' + css(dead, 'textDecorationLine') + ' color=' + css(dead, 'color'));
  var live = document.querySelector('table.records-table tbody tr:not(.deleted) td');
  out.push('valid-deco=' + css(live, 'textDecorationLine'));
  out.push('subkey-id-mono=' + /mono|Menlo|Consolas/i.test(css('#enigmasubkeytable td.id', 'fontFamily')));
  out.push('h-overflow=' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
`;

const KEYCREATE_PROBE = `
  out.push('notice=' + shown('#key-notice') + ' bg=' + css('#key-notice', 'backgroundColor'));
  // The "your private key lives on the server" warning has to be the first thing
  // in the form, above the fields it is warning about.
  var notice = document.getElementById('key-notice');
  out.push('notice-first=' + (notice && notice.parentNode.firstElementChild === notice));
  out.push('notice-above-fields=' + (notice && (notice.compareDocumentPosition(document.getElementById('key-pass'))
    & Node.DOCUMENT_POSITION_FOLLOWING) > 0));
  out.push('pass-w=' + css('#key-pass', 'width') + ' confirm-w=' + css('#key-pass-confirm', 'width'));
  out.push('identities=' + css('.bc-keycreate__form ul.proplist li', 'display'));
  out.push('save=' + shown('.bc-formpage__foot'));
`;

// The compose encryption menu, in the state core's show_menu() puts it in.
const MENU_PROBE = `
  var menu = document.getElementById('enigmamenu');
  out.push('closed=' + css(menu, 'display'));
  out.push('positioned=' + css(menu, 'position'));
  menu.style.display = 'block';
  out.push('open-shadow=' + (css(menu, 'boxShadow') !== 'none'));
  out.push('open-radius=' + css(menu, 'borderRadius'));
  out.push('open-w=' + css(menu, 'minWidth'));
  var zip = document.getElementById('zipdownload-menu');
  out.push('zip-closed=' + css(zip, 'display') + ' pos=' + css(zip, 'position'));
  zip.style.display = 'block';
  out.push('zip-item-color=' + css('#zipdownload-menu li > a', 'color'));
  out.push('zip-disabled-color=' + css('#zipdownload-menu li > a.disabled', 'color'));
  out.push('zip-disabled-events=' + css('#zipdownload-menu li > a.disabled', 'pointerEvents'));
`;

const HELP_PROBE = `
  out.push('shell=' + css('#layout', 'gridTemplateColumns'));
  out.push('nav-rows=' + document.querySelectorAll('#help-menu li').length);
  out.push('selected=' + (document.querySelector('#help-menu li.selected') || {}).className);
  out.push('frame=' + shown('.bc-reading__frame'));
`;

const HELPCONTENT_PROBE = `
  out.push('measure=' + css('.bc-helpcontent', 'maxWidth'));
  out.push('scrolls=' + css('.bc-helpcontent', 'overflowY'));
  out.push('h1-size=' + css('.bc-helpcontent h1', 'fontSize'));
  out.push('h2-size=' + css('.bc-helpcontent h2', 'fontSize'));
  out.push('first-margin=' + css('.bc-helpcontent h1', 'marginTop'));
  out.push('link=' + css('.bc-helpcontent a', 'color'));
  out.push('code=' + /mono|Menlo|Consolas/i.test(css('.bc-helpcontent code', 'fontFamily')));
  out.push('table-border=' + css('.bc-helpcontent th', 'borderBottomWidth'));
  out.push('h-overflow=' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
`;

// Menus and the message encryption box have no template of their own — they are
// appended to <body> by a plugin at runtime. Injected here so the CSS that has to
// receive them is measured against the markup they really arrive as.
const MENU_MARKUP = `
<div id="enigmamenu" class="popupmenu" aria-hidden="true">
  <div class="form-group form-check row"><label for="enigmasignopt" class="col-form-label col-6">Sign this message</label>
    <div class="form-check col-6"><input type="checkbox" name="_enigma_sign" id="enigmasignopt" class="form-check-input"></div></div>
  <div class="form-group form-check row"><label for="enigmaencryptopt" class="col-form-label col-6">Encrypt this message</label>
    <div class="form-check col-6"><input type="checkbox" name="_enigma_encrypt" id="enigmaencryptopt" class="form-check-input"></div></div>
  <div class="form-group form-check row"><label for="enigmaattachpubkeyopt" class="col-form-label col-6">Attach my public key</label>
    <div class="form-check col-6"><input type="checkbox" name="_enigma_attachpubkey" id="enigmaattachpubkeyopt" class="form-check-input"></div></div>
</div>
<div id="zipdownload-menu" class="popupmenu" aria-hidden="true">
  <h2 class="voice" id="aria-label-zipdownloadmenu">Message Download Options Menu</h2>
  <ul role="menu" aria-labelledby="aria-label-zipdownloadmenu" class="toolbarmenu menu">
    <li><a href="#" class="download eml">Download (.eml)</a></li>
    <li><a href="#" class="download mbox disabled" aria-disabled="true">Download (.mbox)</a></li>
    <li><a href="#" class="download maildir disabled" aria-disabled="true">Download (.maildir)</a></li>
  </ul>
</div>`;

const pages = [];

const bounce = render('bounce', ['--framed']);
pages.push(['g-bounce.html', page(bounce, 'task-mail action-bounce', BOUNCE_PROBE)]);

pages.push(['g-dialog.html', page(render('dialog', ['--framed']), 'task-mail action-headers', DIALOG_PROBE)
  // env:dialog_class, which render.mjs blanks along with every other var.
  .replace('class="bc-dialogpage "', put('class="bc-dialogpage text-nowrap"'))]);

// acl renders inside the folder form, so it is measured there rather than alone.
const folderedit = render('folderedit', ['--framed']);
// No trimming: acl/table.html includes no header or footer, so what render.mjs
// returns is already the fragment. (Slicing at /<body[^>]*>/ looks obvious and is
// wrong — the template's own comment mentions <body>, and the match landed there,
// throwing away the table this fixture exists to measure.)
const aclFragment = render('plugins/acl/templates/table.html', ['--framed']);
pages.push(['g-acl.html', page(
  folderedit.replace('<div class="bc-formpage__body bc-scroll">',
    put('<div class="bc-formpage__body bc-scroll"><fieldset><legend>Sharing</legend>' + aclFragment + '</fieldset>')),
  'task-settings action-edit-folder', ACL_PROBE)]);

pages.push(['g-keys.html', page(render('plugins/enigma/templates/keys.html'),
  'task-settings action-plugin-enigmakeys', KEYS_PROBE)]);
pages.push(['g-keyinfo.html', page(render('plugins/enigma/templates/keyinfo.html', ['--framed']),
  'task-settings action-plugin-enigmakeys', KEYINFO_PROBE)]);
pages.push(['g-keycreate.html', page(render('plugins/enigma/templates/keycreate.html', ['--framed']),
  'task-settings action-plugin-enigmakeys', KEYCREATE_PROBE)]);
// enigma opens this in a 500x180 dialog and supplies the Import button itself,
// so what matters is that nothing here duplicates that button and nothing
// overflows the frame.
const IMPORT_PROBE = `
  out.push('own-buttons=' + document.querySelectorAll('.bc-keyimport button, .bc-keyimport input[type=button], .bc-keyimport input[type=submit]').length);
  out.push('file-input=' + (document.getElementById('rcmimportfile') ? 'present' : 'ABSENT'));
  out.push('file-max-w=' + css('#rcmimportfile', 'maxWidth'));
  out.push('notice=' + shown('#key-notice'));
  out.push('hint-size=' + css('.bc-keyimport .hint', 'fontSize') + ' color=' + css('.bc-keyimport .hint', 'color'));
  out.push('header=' + (document.querySelector('#bc-header') ? 'PRESENT' : 'absent-from-markup'));
  out.push('h-overflow=' + (document.documentElement.scrollWidth > document.documentElement.clientWidth));
  out.push('doc-h=' + document.body.scrollHeight);
`;
pages.push(['g-keyimport.html', page(render('plugins/enigma/templates/keyimport.html', ['--framed']),
  'task-settings action-plugin-enigmakeys', IMPORT_PROBE)]);

// The menus, on a page that is otherwise the compose screen they belong to.
pages.push(['g-menus.html', page(render('compose', ['--framed']).replace('</body>', put(MENU_MARKUP + '</body>')),
  'task-mail action-compose', MENU_PROBE)]);

pages.push(['g-help.html', page(render('plugins/help/templates/help.html'), 'task-help action-index', HELP_PROBE)]);
pages.push(['g-helpcontent.html', page(render('plugins/help/templates/content.html', ['--framed']),
  'task-help action-index', HELPCONTENT_PROBE)]);

for (const [name, html] of pages) fs.writeFileSync(path.join(OUT, name), html);

console.log('wrote ' + pages.map(p => p[0]).join(', ') + ' to ' + OUT);
console.log('_scaffold.scss is gone and nothing references it');
