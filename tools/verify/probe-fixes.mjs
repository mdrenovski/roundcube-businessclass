// Live checks for the login password reveal, the account avatar and the identity
// photo well, the sign-out icon and the quota row. Builds four pages against the
// skin's real styles.css and real ui.js, driven by a minimal rcmail stub whose
// url() is copied from app.js.
//
//   node tools/verify/probe-fixes.mjs . .verify-out
//   (cd .verify-out && python3 -m http.server 8799)
//   chrome --headless=new --dump-dom http://127.0.0.1:8799/x-login.html | grep -o '<title>[^<]*'
//
// Each page sets document.title to its assertions, so the whole result comes back
// in one line of --dump-dom output. See docs/HANDOFF.md.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const OUT = process.argv[3] || path.join(ROOT, '.verify-out');
const SKIN = path.join(ROOT, 'skins/businessclass');

fs.mkdirSync(OUT, { recursive: true });

// The generated pages have to be served over HTTP, not opened as file://, because
// the photo <img> must be able to actually load for the avatar assertions to mean
// anything — and a file:// subresource is blocked from an http:// page. So the two
// real assets are copied in beside them and referenced relatively.
fs.copyFileSync(path.join(SKIN, 'styles/styles.css'), path.join(OUT, 'styles.css'));
fs.copyFileSync(path.join(SKIN, 'ui.js'), path.join(OUT, 'ui-copy.js'));

// A 1x1 PNG standing in for "this address has a photo"; missing.png is the
// "it does not" case, and the two are the same code path with different answers.
fs.writeFileSync(path.join(OUT, 'photo.png'), Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'));

function expand(file, depth = 0) {
  if (depth > 10) throw new Error('include loop');
  return fs.readFileSync(file, 'utf8').replace(
    /<roundcube:include\s+file="([^"]+)"\s*\/>/g,
    (_, f) => expand(path.join(SKIN, f.replace(/^\//, '')), depth + 1));
}

// Core's own login_form() output, element for element (rcmail_output_html.php:2308):
// a two-column html_table, then the submit inside <p class="formbuttons">.
const LOGIN_FORM = `
<input type="hidden" name="_token" value="x">
<table class="propform" cellspacing="0"><tbody>
<tr><td class="title"><label for="rcmloginuser">Username</label></td>
    <td class="input"><input name="_user" id="rcmloginuser" size="40" autocapitalize="off" type="text"></td></tr>
<tr><td class="title"><label for="rcmloginpwd">Password</label></td>
    <td class="input"><input name="_pass" id="rcmloginpwd" size="40" autocomplete="off" type="password"></td></tr>
</tbody></table>
<p class="formbuttons"><button type="submit" id="rcmloginsubmit" class="button mainaction submit">Login</button></p>`;

const STUB = (task, env = {}) => `
<script>
window.__errors = [];
window.__uploads = [];
window.__posts = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });
window.rcmail = {
  env: Object.assign({ task: ${JSON.stringify(task)}, action: '', framed: false, layout: 'widescreen',
         bc_languages: null, quota: true, comm_path: '/?_task=' + ${JSON.stringify(task)},
         request_token: 'tok' }, ${JSON.stringify(env)}),
  gui_objects: {}, buttons: {}, commands: {}, _handlers: {},
  addEventListener: function (n, f) { (this._handlers[n] = this._handlers[n] || []).push(f); return this; },
  triggerEvent: function (n, e) { (this._handlers[n] || []).forEach(function (f) { f(e); }); return this; },
  get_label: function (k) { return ({ bc_showpassword: 'Show password', bc_hidepassword: 'Hide password',
    bc_photoconfirmremove: 'Remove the photo?', bc_photoinvalid: 'Not an image.' })[k] || k; },
  save_pref: function () {}, enable_command: function () {}, command: function () {},
  show_contentframe: function () {}, set_busy: function () { return 'lock'; },
  display_message: function (m, t) { window.__posts.push('message:' + t + ':' + m); },
  file_upload: function (files, args, props) {
    window.__uploads.push({ name: props.name, action: props.action, single: props.single,
      filter: props.filter, iid: args._iid, file: files[0].name, lock: props.lock });
    return true;
  },
  http_post: function (action, args, lock) { window.__posts.push(action + ':' + JSON.stringify(args)); },
  confirm_dialog: function (text, button, fn) { window.__posts.push('confirm:' + text); fn(); },
  // Real url(), copied from app.js so the photo src is built the same way.
  url: function (action, query) {
    query = query || {};
    query._action = action;
    var url = this.env.comm_path, param = {};
    var m = action.match(/([a-z0-9_-]+)\\/([a-z0-9-_.]+)/);
    if (m) { query._action = m[2]; url = url.replace(/_task=[a-z0-9_-]+/, '_task=' + m[1]); }
    for (var k in query) if (query[k] !== undefined && query[k] !== null) param[k] = query[k];
    var qs = Object.keys(param).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(param[k]); }).join('&');
    return qs ? url + (url.indexOf('?') > -1 ? '&' : '?') + qs : url;
  }
};
</script>`;

/** Every condition a fixture claims to know must still exist in a template. */
function assertConditionsExist(conditions) {
  const all = [
    ...fs.readdirSync(path.join(SKIN, 'templates')).map(f => path.join(SKIN, 'templates', f)),
    ...fs.readdirSync(path.join(SKIN, 'templates/includes')).map(f => path.join(SKIN, 'templates/includes', f)),
  ].filter(f => f.endsWith('.html')).map(f => fs.readFileSync(f, 'utf8')).join('\n');

  const missing = conditions.filter(c => !all.includes('condition="' + c + '"'));

  if (missing.length) {
    console.error('FAIL: condition(s) no longer in any template — this fixture is stale:');
    missing.forEach(c => console.error('  ' + c));
    process.exit(1);
  }
}

function page(file, task, probe, env = {}) {
  let html = expand(path.join(SKIN, 'templates', file));

  // Take the branch each condition has on a real page of this task. Each string is
  // verbatim from a template and checked against them below — an unknown condition
  // takes the else branch, so a reworded condition would silently drop whatever it
  // guards and the probe would report the missing markup as a skin bug. That is
  // exactly what happened when the app header's condition grew an action != 'print'
  // clause: this file still held the old string and the header vanished.
  const TRUE = task === 'login'
    ? []
    : ["env:task != 'login' &amp;&amp; template:name != 'error'",
       '!env:framed || env:extwin',
       "!env:framed &amp;&amp; env:task != 'login' &amp;&amp; env:action != 'print' &amp;&amp; !(env:action == 'compose' &amp;&amp; env:extwin)",
       'env:quota',
       'env:bc_idphoto &amp;&amp; !env:readonly'];

  assertConditionsExist(TRUE);
  html = pickBranches(html, TRUE);

  html = html.replace(/<roundcube:object([^>]*?)\/?>/g, (_, s) => {
    const a = attrs(s);
    const id = a.id ? ` id="${a.id}"` : '';
    const cls = a.class ? ` class="${a.class}"` : '';
    switch (a.name) {
      case 'doctype': return '<!DOCTYPE html>';
      case 'meta': return '<meta charset="utf-8">';
      case 'links': return '';
      case 'loginform': return LOGIN_FORM;
      case 'username': return 'metodi.drenovski@example.com';
      case 'quotaDisplay': return `<span${id}${cls}>Disk usage: 4.4 GB / 200 GB (2%)</span>`;
      case 'contentframe': return `<iframe${id}${cls} src="about:blank" title="x"></iframe>`;
      case 'steptitle': return 'Edit identity';
      case 'identityform':
        return '<form name="form" method="post">'
          + '<fieldset><legend>Settings</legend><table class="propform"><tbody>'
          + '<tr><td class="title"><label for="ff_name">Display name</label></td>'
          + '<td><input id="ff_name" type="text" size="40" value="Metodi Drenovski"></td></tr>'
          + '<tr><td class="title"><label for="ff_email">E-mail</label></td>'
          + '<td><input id="ff_email" type="text" size="40" value="metodi@example.com"></td></tr>'
          + '</tbody></table></fieldset></form>';
      default: return `<div${id}${cls}></div>`;
    }
  });
  html = html.replace(/<roundcube:button([^>]*?)\/?>/g, (_, s) => {
    const a = attrs(s);
    const inner = a.content
      ? a.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      : `<span class="${a.innerclass || ''}">${a.label || ''}</span>`;
    return `<a href="#" class="${a.class || ''}">${inner}</a>`;
  });
  html = html.replace(/<roundcube:form([^>]*?)\/?>/g, (_, t) => `<form${t}>`);
  html = html.replace(/<roundcube:label\s+name=['"]([^'"]*)['"]\s*\/>/g, (_, n) =>
    ({ quota: 'Disk usage', logout: 'Logout' })[n] || n);
  // The accent has to be real: header.html writes it as an inline custom
  // property on <html>, and an empty one there kills every var(--bc-brand-*)
  // in the page, which would make a colour assertion meaningless.
  html = html.replace(/<roundcube:var\s+name=['"]([^'"]*)['"]\s*\/>/g,
    (_, n) => ({ 'env:bc_accent': '#0F6CBD',
                 'env:bc_account_email': 'metodi.drenovski@example.com' })[n] || '');
  html = html.replace(/<roundcube:[^>]*>/g, '');
  html = html.replace('href="/styles/styles.css"', 'href="styles.css"');
  html = html.replace(/<script src="\/ui\.js"><\/script>/, '');

  html = html.replace('</body>', STUB(task, env)
    + '<script src="ui-copy.js"></script>'
    + `<script>window.addEventListener('load', async function () {
         try { rcmail.triggerEvent('init'); ${task === 'mail'
           ? "rcmail.triggerEvent('setquota', {total: 209715200, used: 4613734, percent: 2, title: 'Disk usage: 4.4 GB / 200 GB (2%)'});"
           : ''} }
         catch (e) { window.__errors.push('init: ' + e.message); }
         var out = []; ${probe}
         out.push('errors=' + (window.__errors.length ? window.__errors.join(' // ') : 'none'));
         document.title = 'PROBE ' + out.join(' | ');
       });</script></body>`);

  return html;
}

function attrs(s) {
  const o = {};
  for (const m of s.matchAll(/([a-zA-Z_:-]+)=(?:"([^"]*)"|'([^']*)')/g)) o[m[1]] = m[2] ?? m[3];
  return o;
}

function pickBranches(src, TRUE) {
  const re = /<roundcube:(if|elseif|else|endif)\b([^>]*?)\/?>/g;
  let out = '', last = 0, m;
  const state = [];
  while ((m = re.exec(src))) {
    if (state.every(s => s.active)) out += src.slice(last, m.index);
    const kind = m[1];
    const cond = (m[2].match(/condition="([^"]*)"/) || [])[1] || '';
    if (kind === 'if') { const v = TRUE.includes(cond); state.push({ taken: v, active: v }); }
    else if (kind === 'elseif') { const s = state[state.length - 1]; const v = !s.taken && TRUE.includes(cond); s.active = v; s.taken = s.taken || v; }
    else if (kind === 'else') { const s = state[state.length - 1]; s.active = !s.taken; s.taken = true; }
    else state.pop();
    last = re.lastIndex;
  }
  return out + src.slice(last);
}

const LOGIN_PROBE = `
  var pwd = document.getElementById('rcmloginpwd');
  var rev = document.querySelector('.bc-login__reveal');
  var sub = document.getElementById('rcmloginsubmit');
  if (!rev) { out.push('reveal=ABSENT'); }
  else {
    var pr = pwd.getBoundingClientRect(), rr = rev.getBoundingClientRect(), cs = getComputedStyle(rev);
    out.push('field=' + Math.round(pr.width) + 'x' + Math.round(pr.height));
    out.push('reveal=' + Math.round(rr.width) + 'x' + Math.round(rr.height));
    out.push('reveal-bg=' + cs.backgroundColor);
    out.push('reveal-inside=' + (rr.left >= pr.left && rr.right <= pr.right + 1));
    out.push('field-clear=' + (document.elementFromPoint(pr.left + 20, pr.top + pr.height / 2) === pwd));
    out.push('reveal-hittable=' + (document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2) === rev
      || rev.contains(document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2))));
    out.push('reveal-title=' + rev.title);
    rev.click();
    out.push('after-click-type=' + pwd.type + ' title=' + rev.title);
  }
  if (sub) { var sr = sub.getBoundingClientRect();
    out.push('submit=' + Math.round(sr.width) + 'x' + Math.round(sr.height) + ' bg=' + getComputedStyle(sub).backgroundColor); }
`;

const MAIL_PROBE = `
  var av = document.querySelector('.bc-header__avatar');
  out.push('avatar-photo-attr=' + (av ? av.getAttribute('data-bc-photo') : '-'));
  var avimg = av ? av.querySelector('img') : null;
  out.push('avatar-img=' + (avimg ? avimg.getAttribute('src') : 'ABSENT'));
  if (avimg) {
    await new Promise(function (d) { avimg.addEventListener('load', d); avimg.addEventListener('error', d); setTimeout(d, 1200); });
    out.push('avatar-after=' + (av.querySelector('img') ? 'img kept' : 'img dropped')
      + ' text=' + JSON.stringify(av.textContent));
  }
  out.push('avatar-text=' + (av ? JSON.stringify(av.textContent) : 'ABSENT'));
  out.push('avatar-palette=' + (av ? /bc-avatar--\\d/.test(av.className) : '-'));
  out.push('avatar-bg=' + (av ? getComputedStyle(av).backgroundColor : '-'));
  var logout = document.querySelector('.bc-rail__btn--logout use');
  out.push('logout-icon=' + (logout ? logout.getAttribute('href') : 'ABSENT'));
  var q = document.getElementById('bc-quota');
  if (!q) out.push('quota=ABSENT');
  else {
    var lab = q.querySelector('.bc-quota__label'), val = q.querySelector('.bc-quota__value');
    var row = q.querySelector('.bc-quota__row'), fill = q.querySelector('.bc-quota__fill');
    out.push('quota-label=' + JSON.stringify(lab.textContent) + ' h=' + Math.round(lab.getBoundingClientRect().height));
    out.push('quota-value=' + JSON.stringify(val.textContent));
    out.push('quota-row-h=' + Math.round(row.getBoundingClientRect().height));
    out.push('quota-track-hidden=' + q.querySelector('.bc-quota__track').hidden);
    out.push('quota-fill=' + fill.style.width);
  }
`;

const IDPHOTO_PROBE = `
  var well = document.getElementById('bc-idphoto');
  var file = document.getElementById('bc-idphoto-file');
  var rem = document.getElementById('bc-idphoto-remove');
  if (!well) { out.push('well=ABSENT'); }
  else {
    var wr = well.getBoundingClientRect(), cs = getComputedStyle(well);
    out.push('well=' + Math.round(wr.width) + 'x' + Math.round(wr.height));
    out.push('well-initials=' + JSON.stringify(well.textContent));
    out.push('well-palette=' + /bc-avatar--\\d/.test(well.className));
    out.push('well-outline=' + cs.outlineStyle);
    var img = well.querySelector('img');
    out.push('img-src=' + (img ? img.getAttribute('src') : 'ABSENT'));
    out.push('remove-hidden=' + rem.hidden + ' ring=' + getComputedStyle(well).outlineStyle);
    if (img) {
      await new Promise(function (done) {
        img.addEventListener('load', done); img.addEventListener('error', done);
        setTimeout(done, 1200);
      });
      out.push('after-load: remove-hidden=' + rem.hidden + ' ring=' + getComputedStyle(well).outlineStyle
        + ' is-photo=' + well.classList.contains('is-photo'));
    }
    // Picking a non-image must say so rather than fail silently.
    Object.defineProperty(file, 'files', {value: [{name: 'notes.txt', type: 'text/plain', size: 10}], configurable: true});
    file.dispatchEvent(new Event('change'));
    out.push('after-bad=' + JSON.stringify(window.__posts) + ' uploads=' + window.__uploads.length);
    window.__posts.length = 0;
    Object.defineProperty(file, 'files', {value: [{name: 'me.png', type: 'image/png', size: 4096}], configurable: true});
    file.dispatchEvent(new Event('change'));
    out.push('upload=' + JSON.stringify(window.__uploads));
    window.__posts.length = 0;
    rem.click();
    out.push('remove=' + JSON.stringify(window.__posts));
    // The plugin's reply must re-point the <img> at a fresh URL.
    var before = well.querySelector('img') ? well.querySelector('img').src : '';
    rcmail.triggerEvent('plugin.businessclass_identityphoto', {success: true, email: 'metodi@example.com'});
    var after = well.querySelector('img');
    out.push('rebust=' + (after && after.src !== before && /_bc=/.test(after.src)));
  }
`;

const IDENV = { action: 'edit-identity', iid: '7', bc_idphoto: 'metodi@example.com',
  bc_idphoto_name: 'Metodi Drenovski', framed: true };

// Two runs: one where the photo request resolves to a real image, one where it
// does not, because the ring and the Remove button must be right in both.
fs.writeFileSync(path.join(OUT, 'x-identity.html'),
  page('identityedit.html', 'settings', IDPHOTO_PROBE,
    Object.assign({}, IDENV, { comm_path: 'photo.png?_task=settings' })));
fs.writeFileSync(path.join(OUT, 'x-identity-nophoto.html'),
  page('identityedit.html', 'settings', IDPHOTO_PROBE,
    Object.assign({}, IDENV, { comm_path: 'missing.png?_task=settings' })));
fs.writeFileSync(path.join(OUT, 'x-login.html'), page('login.html', 'login', LOGIN_PROBE));
fs.writeFileSync(path.join(OUT, 'x-mail.html'), page('mail.html', 'mail', MAIL_PROBE));
console.log('wrote x-login.html, x-mail.html, x-identity.html');
