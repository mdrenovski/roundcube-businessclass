// Render a skin template to plain HTML with stand-in object output, so the
// result can be laid out by a real browser and measured. Fidelity target is the
// element tree and its classes — the text inside is irrelevant to layout.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIN = path.join(ROOT, 'skins/businessclass');

function expand(file, depth = 0) {
  if (depth > 10) throw new Error('include loop');
  let src = fs.readFileSync(file, 'utf8');
  return src.replace(/<roundcube:include\s+file="([^"]+)"\s*\/>/g, (_, f) =>
    expand(path.join(SKIN, f.replace(/^\//, '')), depth + 1));
}

// Conditions we want true in this render; everything else takes the else branch.
const FRAMED = process.argv.includes('--framed');
// --print renders as `?_action=print` does: not framed, but with no app header,
// which is the one condition that distinguishes a print view's markup.
const PRINT = process.argv.includes('--print');
// --logo makes the branding logo objects return an image, so the letterhead can be
// measured in both states: an install that set a print logo and one that did not.
const LOGO = process.argv.includes('--logo')
  ? 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  : '';
const TRUE_CONDITIONS = [
  "env:task != 'login' &amp;&amp; template:name != 'error'",
  '!env:readonly',
].concat(FRAMED ? [] : ['!env:framed || env:extwin'])
 .concat(FRAMED || PRINT ? [] : [
  // The app header. Kept verbatim from includes/header.html — an unknown condition
  // takes the else branch here, so a change to that string silently drops the
  // header from every render rather than failing.
  "!env:framed &amp;&amp; env:task != 'login' &amp;&amp; env:action != 'print' &amp;&amp; !(env:action == 'compose' &amp;&amp; env:extwin)",
]).concat([
  // Plugin screens (§12 step 11). Each of these guards a control that only
  // exists in one configuration, and every one of them is the interesting case:
  // bounce's "Save sent message in" row, acl's advanced-mode toggle, and the
  // selected row of the Help nav.
  '!config:no_save_sent_messages',
  "!in_array('acl_advanced_mode', (array)config:dont_override)",
  "env:action == 'index'",
]);

function templateName() {
  const arg = process.argv[2] || '';
  if (!arg.includes('/')) return arg;
  const m = /^plugins\/([^/]+)\/templates\/(.+)\.html$/.exec(arg);
  return m ? `${m[1]}.${m[2]}` : path.basename(arg, '.html');
}

// An unknown condition takes the else branch, so a condition reworded in a template
// would silently drop whatever it guards and the render would look like a skin bug.
// Fail instead. (This is not hypothetical: the app header's condition grew an
// `action != 'print'` clause and every fixture holding the old string lost its
// header.)
function allTemplateDirs() {
  const dirs = [SKIN + '/templates', SKIN + '/templates/includes'];
  const plugins = path.join(SKIN, 'plugins');
  if (fs.existsSync(plugins)) {
    for (const e of fs.readdirSync(plugins, { withFileTypes: true })) {
      const d = path.join(plugins, e.name, 'templates');
      if (e.isDirectory() && fs.existsSync(d)) dirs.push(d);
    }
  }
  return dirs;
}

const ALL_TEMPLATES = allTemplateDirs()
  .flatMap(dir => fs.readdirSync(dir).filter(f => f.endsWith('.html')).map(f => path.join(dir, f)))
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');

// Every hand-copied condition above must still exist verbatim in some template.
// An unknown condition takes the else branch, so a reworded one would silently
// drop whatever it guards and the render would look like a skin bug instead.
for (const cond of TRUE_CONDITIONS) {
  if (!ALL_TEMPLATES.includes('condition="' + cond + '"')) {
    console.error('FAIL: no template has condition="' + cond + '" — render.mjs is stale');
    process.exit(1);
  }
}

// Derived, not copied, so it cannot go stale and is added after the check: this
// is the name the render was asked for, so includes that switch on it —
// pagenav.html picks its counter object that way — take the branch a real
// request would.
TRUE_CONDITIONS.push("template:name == '" + templateName() + "'");

function pickBranches(src) {
  const re = /<roundcube:(if|elseif|else|endif)\b([^>]*?)\/?>/g;
  let out = '', last = 0, m;
  const state = [];   // {taken:bool, active:bool}
  while ((m = re.exec(src))) {
    const emit = state.every(s => s.active);
    if (emit) out += src.slice(last, m.index);
    const kind = m[1];
    const cond = (m[2].match(/condition="([^"]*)"/) || [])[1] || '';
    if (kind === 'if') {
      const v = TRUE_CONDITIONS.includes(cond);
      state.push({ taken: v, active: v });
    } else if (kind === 'elseif') {
      const s = state[state.length - 1];
      const v = !s.taken && TRUE_CONDITIONS.includes(cond);
      s.active = v; s.taken = s.taken || v;
    } else if (kind === 'else') {
      const s = state[state.length - 1];
      s.active = !s.taken; s.taken = true;
    } else {
      state.pop();
    }
    last = re.lastIndex;
  }
  out += src.slice(last);
  return out;
}

// Single as well as double quotes: core parses the attribute string with
// DOMDocument, which takes either, and the templates use single quotes wherever
// a roundcube: tag sits inside an HTML attribute.
function attrs(s) {
  const o = {};
  for (const m of s.matchAll(/([a-zA-Z_:-]+)=(?:"([^"]*)"|'([^']*)')/g)) o[m[1]] = m[2] ?? m[3];
  return o;
}


// [from, subject, date, unread]
const MESSAGES = [
  ['Rita Sørensen', 'Q3 infrastructure review — agenda and costs', '09:14', true],
  ['Anders Holm', 'Re: DNS cutover window', '08:02', false],
  ['billing@nordhost.example', 'Invoice 2026-114', 'Tue 17:41', true],
  ['Bea Lindqvist', 'Vendor contract, signed copy attached', 'Tue 11:20', false],
  ['Chandra Rao', 'Re: Re: mailbox quota on the new cluster', 'Mon 15:08', false],
];

const CONTACTS = [
  ['Rita Sørensen', 'rita@nordhost.example'],
  ['Anders Holm', 'anders.holm@example.org'],
  ['Bea Lindqvist', 'bea@lindqvist.example'],
  ['Vendors', ''],
  ['Chandra Rao', 'c.rao@example.net'],
  ['Dagmar Nielsen', ''],
  ['Emil Berg', 'emil.berg@example.com'],
];

function contactHead() {
  return '<fieldset class="bc-contact__ident" id="contacthead"><legend>Name and organization</legend>'
    + '<div class="source row"><span class="namefield source">Address book: Personal Addresses</span> </div>'
    + '<div class="names"><span class="namefield firstname">Rita</span> <span class="namefield surname">Sørensen</span> </div>'
    + '<div class="organization row"><span class="namefield organization">Nordhost</span> </div>'
    + '<div class="jobtitle row"><span class="namefield jobtitle">Infrastructure lead</span> </div>'
    + '</fieldset>';
}


function editRow(label, id, control) {
  return '<div class="row"><label for="' + id + '">' + label + '</label><div>' + control + '</div></div>';
}

function contactEditHead() {
  return '<fieldset class="bc-contact__identedit" id="contacthead"><legend>Name and organization</legend>'
    + '<div class="source row"><label for="_source">Address book</label><div><select id="_source"><option>Personal Addresses</option></select></div></div>'
    + '<div class="names"><input type="text" size="24" value="Rita"><input type="text" size="24" value="Sørensen"></div>'
    + editRow('Display name', 'ff_name', '<input type="text" size="48" value="Rita Sørensen">')
    + editRow('Organization', 'ff_organization', '<input type="text" size="48" value="Nordhost">')
    + editRow('Job title', 'ff_jobtitle', '<input type="text" size="48" value="Infrastructure lead">')
    + '<p class="addfield"><select class="addfieldmenu custom-select"><option>Add field...</option></select></p>'
    + '</fieldset>';
}

function delButton() {
  return '<a href="#del" class="contactfieldbutton deletebutton" title="Delete"><span class="inner">Delete</span></a>';
}

function subtypeSelect() {
  return '<select class="contactselectsubtype custom-select"><option>Home</option><option>Work</option></select>';
}

function compactRow(control) {
  return '<div class="row">' + subtypeSelect() + control + delButton() + '</div>';
}

function contactEditForm(fsClass) {
  return '<fieldset class="' + fsClass + '"><legend>Properties</legend>'
      + '<fieldset class="contactfieldgroup contactfieldgroupmulti contactcontrolleremail"><legend>Email</legend>'
      + compactRow('<input type="text" size="36" value="rita@nordhost.example">') + '</fieldset>'
      + '<fieldset class="contactfieldgroup contactfieldgroupmulti contactcontrollerphone"><legend>Phone</legend>'
      + compactRow('<input type="text" size="36" value="+45 30 22 41 08">')
      + compactRow('<input type="text" size="36" value="+45 70 11 22 33">') + '</fieldset>'
      + '<p class="addfield"><select class="addfieldmenu custom-select"><option>Add field...</option></select></p>'
    + '</fieldset>'
    + '<fieldset class="' + fsClass + '"><legend>Personal information</legend>'
      + '<fieldset class="contactfieldgroup contactcontrollerbirthday">'
      + '<div class="row"><label class="contactfieldlabel label" for="ff_birthday0">Birthday</label>'
      + '<input type="text" class="datepicker" value="1981-04-02">' + delButton() + '</div></fieldset>'
    + '</fieldset>';
}

function group(cls, legend, rows) {
  return '<fieldset class="contactfieldgroup ' + cls + '">'
    + (legend ? '<legend>' + legend + '</legend>' : ' ') + rows + '</fieldset>';
}

function labelledRow(id, subtype, value) {
  return '<div class="row"><label class="contactfieldlabel label" for="' + id + '">' + subtype + '</label>'
    + '<div class="contactfieldcontent text">' + value + '</div></div>';
}

function contactDetails(fsClass) {
  return '<fieldset class="' + fsClass + '"><legend>Properties</legend>'
      + group('contactfieldgroupmulti contactcontrolleremail', 'Email',
          labelledRow('ff_email0', 'Home', '<a href="#" class="email">rita@nordhost.example</a>'))
      + group('contactfieldgroupmulti contactcontrollerphone', 'Phone',
          labelledRow('ff_phone0', 'Mobile', '<a href="#" class="phone">+45 30 22 41 08</a>')
          + labelledRow('ff_phone1', 'Work', '<a href="#" class="phone">+45 70 11 22 33</a>'))
      + group('contactcontrolleraddress', 'Address',
          labelledRow('ff_address0', 'Home', 'Havnegade 12<br>2100 København'))
    + '</fieldset>'
    + '<fieldset class="' + fsClass + '"><legend>Personal information</legend>'
      + group('contactcontrollerbirthday', '', labelledRow('ff_birthday0', 'Birthday', '1981-04-02'))
    + '</fieldset>'
    + '<fieldset class="' + fsClass + '"><legend>Notes</legend>'
      + group('contactcontrollernotes', '',
          '<div class="row"><div class="contactfield">Primary contact for the mail cluster migration.</div></div>')
    + '</fieldset>'
    + '<fieldset class="' + fsClass + '"><legend>Groups</legend>'
      + '<form name="form" method="post"><fieldset class="contactfieldgroup contactgroups">'
      + '<ul class="proplist simplelist">'
      + '<li><label><input type="checkbox" class="groupmember" value="1" checked>Vendors</label></li>'
      + '<li><label><input type="checkbox" class="groupmember" value="2">Team</label></li>'
      + '<li><label><input type="checkbox" class="groupmember" value="3">Denmark</label></li>'
      + '</ul></fieldset></form>'
    + '</fieldset>';
}

const SECTIONS = ['User Interface', 'Mailbox View', 'Displaying Messages', 'Composing Messages',
  'Contacts', 'Special Folders', 'Server Settings', 'Encryption'];
const TABS = ['preferences', 'folders', 'identities', 'responses'];

function object(a) {
  const id = a.id ? ` id="${a.id}"` : '';
  const cls = a.class ? ` class="${a.class}"` : '';
  // Core lowercases the object name before dispatching, and the templates write
  // several of them camel-cased (messageHeaders, messageBody).
  switch (String(a.name || '').toLowerCase()) {
    case 'doctype': return '<!DOCTYPE html>';
    case 'meta': return '<meta charset="utf-8">';
    case 'links': return '';
    case 'settingstabs':
      return TABS.map((t, i) =>
        `<li id="settingstab${t}" class="${t}${i === 0 ? ' selected' : ''}"><a href="#" class="tablink">${t}</a></li>`).join('');
    case 'sectionslist':
      return `<table${id}${cls} summary="" cellspacing="0"><tbody>` +
        SECTIONS.map((s, i) => `<tr id="rcmrow${i}"${i === 0 ? ' class="selected"' : ''}><td class="section">${s}</td></tr>`).join('') +
        '</tbody></table>';
    case 'contentframe':
      return `<iframe${id}${cls} name="${a.id}" src="about:blank" title="x"></iframe>`;
    case 'message':
      return `<div${id}${cls}></div>`;
    case 'username': return 'user@example.com';
    case 'sectionname': return 'User Interface';
    case 'userprefs':
      return '<form name="form" method="post">' +
        Array.from({ length: 6 }, (_, b) =>
          `<fieldset class="advanced"><legend>Block ${b}</legend><table class="propform"><tbody>` +
          Array.from({ length: 5 }, (_, r) =>
            `<tr><td class="title"><label for="f${b}${r}">Setting ${r}</label></td>` +
            `<td><select id="f${b}${r}"><option>one</option></select></td></tr>`).join('') +
          '</tbody></table></fieldset>').join('') +
        '</form>';
    case 'directorylist':
      return `<ul${id}${cls}>`
        + '<li id="rcmli1" class="addressbook selected"><a href="#" rel="0">Personal Addresses</a>'
        + '<div class="treetoggle expanded">&nbsp;</div>'
        + '<ul class="groups"><li id="rcmliG01" class="contactgroup"><a href="#">Vendors</a></li>'
        + '<li id="rcmliG02" class="contactgroup"><a href="#">Team</a></li></ul></li>'
        + '<li id="rcmli2" class="addressbook readonly"><a href="#" rel="2">Collected recipients</a><ul class="groups" style="display:none;"></ul></li>'
        + '</ul>';
    case 'savedsearchlist':
      return `<ul${id}${cls}><li id="rcmliS1" class="contactsearch"><a href="#">Copenhagen</a></li></ul>`;
    case 'addresslisttitle':
      return `<${a.tag || 'span'}${id}${cls}>Contacts</${a.tag || 'span'}>`;
    case 'addresslist':
      return `<table${id}${cls} cellspacing="0"><tbody>`
        + CONTACTS.map((c, i) => `<tr id="rcmrow${i}" class="contact${i === 0 ? ' selected' : ''}">`
            + `<td class="name">${c[0]}</td><td class="action">${c[1] ? '' : '&raquo;'}</td></tr>`).join('')
        + '</tbody></table>';
    case 'contactphoto':
      return `<div${id}${cls}><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Contact photo"></div>`;
    case 'contacthead':
      return contactHead();
    case 'contactdetails':
      return contactDetails(a['fieldset-class'] || '');
    case 'contactedithead':
      return contactEditHead();
    case 'contacteditform':
      return contactEditForm(a['fieldset-class'] || '');
    case 'photouploadform':
      return '<form id="upload-form"><a href="#" class="addphoto">Add photo</a></form>';
    case 'importstep':
      return '<form><p>Upload a vCard or CSV file.</p><input type="file" id="rcmimportfile"></form>';
    case 'searchform':
      return `<form><input type="text"${cls}></form>`;
    // messageHeaders is two objects in one: valueof="subject" returns bare text,
    // otherwise it is the two-column table show.php:551 builds.
    case 'messageheaders':
      if (a.valueof === 'subject') return 'Q3 infrastructure review — agenda and costs';
      return `<table${id}${cls}><tbody>`
        + [['From', 'Rita Sørensen <rita@nordhost.example>'],
           ['To', 'metodi@example.com'],
           ['Date', 'Wed, 29 Jul 2026 09:14:22 +0200']].map(h =>
            `<tr><td class="header-title">${h[0]}</td><td class="header">${h[1]}</td></tr>`).join('')
        + '</tbody></table>';
    // The message list. Row markup follows the contract documented at the top of
    // _list.scss: one composite td.subject carrying span.fromto, span.date,
    // span.size and span.subject, plus td.threads and td.flags — not a <td> per
    // column. Emitting both shapes puts two copies of every row's text into the
    // same grid cells, which lays out as overlapping words.
    case 'messages':
      return `<table${id}${cls} aria-labelledby="${a['aria-labelledby'] || ''}">`
        + '<thead><tr><th class="selection"></th><th class="flag"></th>'
        + '<th class="fromto"><a href="#" class="sortcol">From</a></th>'
        + '<th class="subject"><a href="#" class="sortcol">Subject</a></th>'
        + '<th class="date"><a href="#" class="sortcol">Date</a></th>'
        + '<th class="size"><a href="#" class="sortcol">Size</a></th></tr></thead><tbody>'
        + MESSAGES.map((m, i) =>
            `<tr id="rcmrow${i + 1}" class="message${m[3] ? ' unread' : ''}">`
            + '<td class="threads"></td>'
            + '<td class="subject">'
            + `<span class="fromto skip-on-drag">${m[0]}</span>`
            + `<span class="date skip-on-drag">${m[2]}</span>`
            + '<span class="size skip-on-drag">12 KB</span>'
            + `<span class="subject"><a href="#"><span>${m[1]}</span></a></span>`
            + '</td>'
            + '<td class="flags"><span class="unflagged"></span></td>'
            + '</tr>').join('')
        + '</tbody></table>';
    // message-htmlpart, not message-part: the skin's typographic rules for
    // untrusted sender HTML — links, images, blockquotes — are scoped to that
    // class, and a fixture using the other one measures none of them.
    // The two boxes plugins prepend to the body through message_body_prefix and
    // template_object_messagebody (enigma_ui.php:956, :1128). They are part of
    // the message document, not the sanitised body iframe, so they are styled by
    // the skin and they reach paper.
    case 'messagebody':
      return `<div${id}${cls}>`
        + '<div id="enigma-message" class="boxconfirmation enigmanotice signed">'
        + 'Signed message. Signature verified.</div>'
        + '<p class="enigmaattachment boxinformation aligned-buttons"><span>'
        + 'This message contains a public key.</span>'
        + '<button class="import btn-sm" title="Import">Import</button></p>'
        + `<div class="message-htmlpart"><p>Agenda attached. The costs are on `
        + '<a href="https://intranet.example.org/finance/q3/infrastructure-review?tab=costs">the finance page</a>'
        + ' and unchanged since June.</p>'
        + '<blockquote><p>Quoted text from the previous message in the thread.</p></blockquote></div></div>';
    // As show.php:221 builds it: the name and the size are two spans inside
    // a.filename, which the skin lays out with display:contents into grid columns
    // 2 and 3. Flattened to one text node they land in the same cell and print on
    // top of each other.
    case 'messageattachments':
      return `<ul${id}${cls}><li class="attachment">`
        + '<a href="#" class="filename"><span class="attachment-name">agenda.pdf</span>'
        + '<span class="attachment-size">(84 KB)</span></a></li></ul>';
    // Core returns an empty string when the skin's config names no logo of this
    // type, which is what the letterhead's :has(img) test is there for.
    case 'logo':
      return LOGO ? `<img${id} src="${LOGO}" alt="">` : '';

    // -- Plugin objects (§12 step 11) -----------------------------------------
    // Shapes taken from the generators, not invented: the classes below are what
    // _plugins.scss selects on, so a fixture that simplified them would measure
    // rules that never fire in the real thing.

    // bounce.php:112 — always the hint, plus the Bcc warning when there was one.
    case 'bounceobjects':
      return `<div${id}><div id="bounce-hint" class="boxinformation">`
        + '<span>The message will be resent unchanged to the recipients below.</span></div>'
        + '<div id="bcc-warning" class="boxwarning"><span>The original had Bcc recipients.</span></div></div>';
    // rcmail_sendmail::form_tags — opens the form, never closes it.
    case 'composeformhead':
      return `<form name="form" method="post" action="#"${cls}><input type="hidden" name="_task" value="mail">`;
    // headers_output switches on part=; without one it returns nothing at all,
    // which is exactly the bug this fixture exists to keep out.
    case 'composeheaders':
      if (a.part === 'from') {
        return `<select${id}${cls} name="_from"><option>Metodi &lt;metodi@example.com&gt;</option></select>`;
      }
      if (['to', 'cc', 'bcc'].includes(a.part)) {
        return `<textarea${id} name="_${a.part}" spellcheck="false"`
          + `${a['data-bc-recipients'] ? ` data-bc-recipients="${a['data-bc-recipients']}"` : ''}></textarea>`;
      }
      return '';
    case 'storetarget':
      return `<select${id}${cls} name="_store_target"><option>Sent</option></select>`;
    // mail/headers.php:51 — header names wrapped in <font class="bold">, folded
    // lines indented with &nbsp;, breaks as <br>.
    case 'dialogcontent':
      return ['Return-Path', 'Received', 'Message-ID', 'Content-Type'].map(h =>
        `<font class="bold">${h}</font>: a fairly long unwrappable header value that runs `
        + 'well past any sensible dialog width<br />').join('')
        + '&nbsp;&nbsp;&nbsp;&nbsp;folded continuation line<br />';

    // acl.php:427 — html_table with a <thead> (acl_add_row clones it), one row
    // per identifier, one cell per right carrying an empty <span>.
    case 'acltable': {
      const rights = ['read', 'write', 'delete', 'other'];
      const rows = [['anyone', ['enabled', 'disabled', 'disabled', 'disabled']],
                    ['rita@nordhost.example', ['enabled', 'enabled', 'partial', 'disabled']]];
      return `<table${id}${cls}><thead><tr><th class="user">Identifier</th>`
        + rights.map(r => `<th class="acl${r}" title="${r}">${r}</th>`).join('')
        + '</tr></thead><tbody>'
        + rows.map((row, i) =>
            `<tr id="rcmrow${i}" data-userid="${row[0]}">`
            + `<td class="user text-nowrap"><a href="#">${row[0]}</a></td>`
            + row[1].map((state, j) => `<td class="acl${rights[j]} ${state}"><span></span></td>`).join('')
            + '</tr>').join('')
        + '</tbody></table>';
    }
    // acl.php:320 — a radio list when the server exposes special identifiers,
    // whose first item wraps the free-text field in an .input-group.
    case 'acluser':
      return `<ul id="usertype"${cls}>`
        + '<li><input type="radio" name="usertype" value="user" id="iduser" checked>'
        + '<div class="input-group"><span class="input-group-prepend">'
        + `<label for="${a.id || 'acluser'}" class="input-group-text">Username</label></span> `
        + `<input type="text" name="acluser" id="${a.id || 'acluser'}" class="form-control"></div></li>`
        + '<li><input type="radio" name="usertype" value="anyone" id="idanyone">'
        + '<label for="idanyone">All users</label></li></ul>';
    // acl.php:265 — both lists are always emitted; acl.js shows one.
    case 'aclrights': {
      const list = (listId, items) => `<ul id="${listId}"${cls}>`
        + items.map(v => `<li><input type="checkbox" name="acl[${v}]" value="${v}" id="acl${v}">`
            + `<label for="acl${v}" title="long ${v}">${v}</label></li>`).join('')
        + '</ul>';
      return list('advancedrights', ['l', 'r', 's', 'w', 'i', 'p', 'k', 'x', 't', 'e', 'a'])
        + '\n' + list('simplerights', ['read', 'write', 'delete', 'other']);
    }

    // enigma_ui.php:203 — table_output with noheader.
    case 'keyslist':
      return `<table${id}${cls}><tbody>`
        + [['Metodi Drenovski <metodi@example.com>', 'p'], ['Rita Sørensen <rita@nordhost.example>', '']]
          .map((k, i) => `<tr id="rcmrow${i}" data-flags="${k[1]}"><td class="name">${k[0]}</td></tr>`).join('')
        + '</tbody></table>';
    case 'countdisplay':
      return `<span${cls}>1 to 2 of 2</span>`;
    case 'keyname':
      return 'Metodi Drenovski &lt;metodi@example.com&gt;';
    // enigma_ui.php:368 — three fieldsets: a two-column basics table ending with
    // the fingerprint, then two records-tables.
    case 'keydata':
      return `<div${cls}><fieldset><legend>Basic information</legend><table><tbody>`
        + [['Key user ID', 'Metodi Drenovski &lt;metodi@example.com&gt;'],
           ['Key ID', '9A5C4B21'], ['Key type', 'Key pair'],
           ['Fingerprint', 'D4E9 1C77 3B0A 5F62 8E11 4A0D 9A5C 4B21 77FE 3C02']]
          .map(r => `<tr><td class="title"><label>${r[0]}</label></td><td>${r[1]}</td></tr>`).join('')
        + '</tbody></table></fieldset>'
        + '<fieldset><legend>Subkeys</legend><table id="enigmasubkeytable" class="records-table">'
        + '<thead><tr><th class="id">ID</th><th class="algo">Algorithm</th><th class="created">Created</th>'
        + '<th class="expires">Expires</th><th class="usage">Usage</th></tr></thead><tbody>'
        + '<tr><td class="id">9A5C4B21</td><td class="algo">RSA (4096)</td><td class="created">2024-02-11</td>'
        + '<td class="expires">Never</td><td class="usage">sign,cert</td></tr>'
        + '<tr class="deleted"><td class="id">1188FE30</td><td class="algo">RSA (2048)</td>'
        + '<td class="created">2019-05-02</td><td class="expires">2023-05-02</td><td class="usage">encrypt</td></tr>'
        + '</tbody></table></fieldset>'
        + '<fieldset><legend>User IDs</legend><table id="enigmausertable" class="records-table">'
        + '<thead><tr><th class="id">User ID</th><th class="valid">Valid</th></tr></thead><tbody>'
        + '<tr><td class="id">Metodi Drenovski &lt;metodi@example.com&gt;</td><td class="valid">Valid</td></tr>'
        + '<tr class="deleted"><td class="id">metodi@old.example</td><td class="valid">Unknown</td></tr>'
        + '</tbody></table></fieldset></div>';
    // enigma_ui.php:764 — note both password fields are type="text" until typed in.
    case 'keyform':
      return `<form${cls}><div id="key-notice" class="boxinformation mb-3">`
        + 'The private key is stored on the server.</div><table><tbody>'
        + '<tr><td class="title"><label for="key-name">Identity</label></td><td>'
        + '<ul class="proplist"><li><label><input type="checkbox" name="identity[]" value="0"> '
        + 'Metodi &lt;metodi@example.com&gt;</label></li></ul></td></tr>'
        + '<tr><td class="title"><label for="key-type">Key type</label></td><td>'
        + '<select id="key-type" class="custom-select"><option>RSA 4096</option></select></td></tr>'
        + '<tr><td class="title"><label for="key-pass">Password</label></td>'
        + '<td><input type="text" id="key-pass" name="_password" required></td></tr>'
        + '<tr><td class="title"><label for="key-pass-confirm">Confirm</label></td>'
        + '<td><input type="text" id="key-pass-confirm" name="_password-confirm" required></td></tr>'
        + '</tbody></table></form>';
    // enigma_ui.php:614 — part= suppresses the plugin's own button, leaving the
    // dialog's.
    case 'importform':
      if (a.part === 'search') {
        return `<form${cls}>Search a keyserver for a public key.<br><br>`
          + '<input type="text" name="_search" id="rcmimportsearch" class="form-control"></form>';
      }
      return `<form${cls}><div id="key-notice" class="boxinformation mb-3">`
        + 'Keys are stored on the server.</div><div><p>Select a key file to import.</p>'
        + '<input type="file" name="_file" id="rcmimportfile" class="form-control">'
        + '<div class="hint">Maximum file size 10 MB.</div></div></form>';

    // help.php:100 — output->button() with the plugin's own onclick.
    case 'tablink':
      return `<a href="#" class="${a.class || ''}" data-bc-icon="${a['data-bc-icon'] || ''}"`
        + ` onclick="return show_help_content('${a.action}', event)">${a.label || ''}</a>`;
    // Arbitrary third-party HTML — that is the point of the .bc-helpcontent rules.
    case 'helpcontent':
      return '<h1>Getting started</h1><p>Some introductory prose about this webmail, '
        + 'long enough to show where the measure falls.</p><h2>Keyboard</h2>'
        + '<ul><li>Press <code>c</code> to compose.</li><li>Press <code>/</code> to search.</li></ul>'
        + '<table><tr><th>Key</th><th>Action</th></tr><tr><td>j</td><td>Next message</td></tr></table>'
        + '<hr><p><a href="https://example.org/docs">Full documentation</a></p>';
    default:
      return `<span${id}${cls}></span>`;
  }
}

function button(a) {
  const cls = a.class ? ` class="${a.class}"` : '';
  const inner = a.content ? a.content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    : `<span class="${a.innerclass || ''}">${a.label || ''}</span>`;
  return `<a href="#"${cls} data-bc-icon="${a['data-bc-icon'] || ''}">${inner}</a>`;
}

let html = expand(process.argv[2].includes('/') ? path.join(SKIN, process.argv[2]) : path.join(SKIN, 'templates', process.argv[2] + '.html'));
html = pickBranches(html);
html = html.replace(/<roundcube:object([^>]*?)\/?>/g, (_, s) => object(attrs(s)));
html = html.replace(/<roundcube:button([^>]*?)\/?>/g, (_, s) => button(attrs(s)));
html = html.replace(/<roundcube:form([^>]*?)\/?>/g, (_, t) => `<form${t.replace(/\bname=/, 'name=')}>`);
html = html.replace(/<roundcube:label\s+name=['"]([^'"]*)['"]\s*\/>/g, (_, n) => n);
html = html.replace(/<roundcube:var\s+name=['"]([^'"]*)['"]\s*\/>/g, '');
html = html.replace(/<roundcube:[^>]*>/g, '');
// point the stylesheet at the real compiled file; drop ui.js (needs rcmail)
html = html.replace('href="/styles/styles.css"', `href="file://${SKIN}/styles/styles.css"`);
html = html.replace(/<script src="\/ui\.js"><\/script>/, '');

const probe = `
<script>
window.addEventListener('load', function () {
  var out = [];
  ['#bc-header', '#layout', '#layout-menu', '#layout-list',
   '.bc-formpage', '.bc-formpage__foot', '#bc-message'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    var r = el.getBoundingClientRect();
    out.push(sel + ': top=' + Math.round(r.top) + ' left=' + Math.round(r.left) +
      ' w=' + Math.round(r.width) + ' h=' + Math.round(r.height));
  });
  var b = document.body, cs = getComputedStyle(b);
  out.push('body: display=' + cs.display + ' rows=' + cs.gridTemplateRows + ' h=' + b.clientHeight);
  out.push('body children in flow: ' + Array.prototype.filter.call(b.children, function (c) {
    var s = getComputedStyle(c);
    return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
  }).map(function (c) { return c.tagName.toLowerCase() + '#' + c.id; }).join(', '));
  document.title = 'PROBE ' + out.join(' | ');
});
</script>
`;
html = html.replace('</body>', probe + '</body>');
fs.writeFileSync(process.argv[3], html);
console.log('wrote', process.argv[3]);
