// Wrap a rendered template in a minimal rcmail stub and load the skin's real
// ui.js against it, so the decoration code runs on the real markup instead of a
// hand-written copy of what it is expected to produce.
//
//   node withjs.mjs <rendered.html> <out.html> <task> <action> [framed]
import fs from 'node:fs';
import path from 'node:path';

const [, , src, out, task, action, framed] = process.argv;
const SKIN = path.join(process.cwd(), 'skins/businessclass');

let html = fs.readFileSync(src, 'utf8');

const stub = `
<script>
window.__errors = [];
window.addEventListener('error', function (e) { window.__errors.push(String(e.message)); });

var LABELS = {
  group: 'Group', nocontactsfound: 'No contacts found.',
  bc_nocontacts: 'No contacts yet', bc_noresults: 'No results',
  bc_changesdiscarded: 'Changes discarded'
};

window.rcmail = {
  env: {
    task: ${JSON.stringify(task)},
    action: ${JSON.stringify(action || '')},
    framed: ${framed ? 'true' : 'false'},
    layout: 'widescreen',
    group: null,
    pagecount: 1,
    cid: '1'
  },
  gui_objects: {},
  buttons: {},
  commands: {},
  _handlers: {},
  addEventListener: function (name, fn) {
    (this._handlers[name] = this._handlers[name] || []).push(fn);
    return this;
  },
  triggerEvent: function (name, event) {
    (this._handlers[name] || []).forEach(function (fn) { fn(event); });
    return this;
  },
  get_label: function (key) { return LABELS[key] || key; },
  show_contentframe: function () {},
  save_pref: function () {},
  enable_command: function () {},
  command: function () {},
  set_busy: function () {},
  contact_list: {
    data: {
      0: { ID: '0', _type: 'person', email: 'rita@nordhost.example', name: 'Rita Sørensen' },
      1: { ID: '1', _type: 'person', email: 'anders.holm@example.org' },
      2: { ID: '2', _type: 'person', email: 'bea@lindqvist.example' },
      3: { ID: '3', _type: 'group', email: '' },
      4: { ID: '4', _type: 'person', email: 'c.rao@example.net' },
      5: { ID: '5', _type: 'person', email: '' },
      6: { ID: '6', _type: 'person', email: 'emil.berg@example.com' }
    },
    rowcount: 7,
    get_selection: function () { return ['0']; },
    addEventListener: function () { return this; }
  }
};
</script>
`;

// The stub has to exist before ui.js runs, and ui.js is loaded at the end of
// <body> in the real page, so it goes just before it.
html = html.replace('</body>', stub + `<script src="file://${SKIN}/ui.js"></script>` + `
<script>
window.addEventListener('load', function () {
  try {
    rcmail.triggerEvent('init');

    // add_contact_row() publishes one of these per row (app.js:485).
    var rows = document.querySelectorAll('#contacts-table tbody tr');
    Array.prototype.forEach.call(rows, function (tr, i) {
      rcmail.triggerEvent('insertrow', { cid: String(i), row: { obj: tr, uid: String(i) } });
    });
  } catch (e) {
    window.__errors.push('init: ' + e.message);
  }

  var out = [];
  ['#layout', '#layout-sidebar', '#layout-list', '#layout-content',
   '.bc-contact', '.bc-contact__role', '.bc-contactlist tr', '.bc-directory .bc-icon'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (!el) { out.push(sel + ': ABSENT'); return; }
    var r = el.getBoundingClientRect();
    out.push(sel + ' ' + Math.round(r.left) + ',' + Math.round(r.top) +
      ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  });

  out.push('icons=' + document.querySelectorAll('.bc-directory .bc-icon').length);
  out.push('avatars=' + document.querySelectorAll('.bc-contactlist .bc-avatar').length);
  out.push('mails=' + document.querySelectorAll('.bc-contactlist__mail').length);
  out.push('composed=' + !!document.querySelector('.bc-contact__details.is-composed'));
  out.push('members=' + document.querySelectorAll('.contactgroups label.is-member').length);
  out.push('subtypes=' + document.querySelectorAll('.bc-contact__subtype').length);
  var firstLabel = document.querySelector('.contactfieldgroup .contactfieldlabel');
  out.push('firstlabel=' + (firstLabel ? firstLabel.textContent : '-'));
  out.push('errors=' + (window.__errors.length ? window.__errors.join(' // ') : 'none'));

  document.title = 'PROBE ' + out.join(' | ');
});
</script>
</body>`);

fs.writeFileSync(out, html);
console.log('wrote', out);
