# Decisions

Every decision that is not obvious from the code, with **who** made it and **what
it would take to change**. That last column is the point of this file: a decision
recorded without its cost is just an opinion.

**Who**: `USER` — Metodi decided it, do not quietly reverse it. `BUILD` — the
contract says so. `BUILT` — an engineering call made while building; the most
freely revisable.

---

## Architecture

### D-1 · Standalone skin, `"extends": null`
**BUILD** (§1.1). No parent skin to inherit from.
**Consequence:** every template Roundcube might ask for must exist, because a
missing one is *fatal* — `parse()` raises a 404 and exits. This is why
`_scaffold.scss` and plain-but-working `bounce.html` / `dialog.html` /
`plugin.html` exist at all.
**To change:** setting `"extends": "elastic"` would let undesigned screens fall
back, but you would inherit Elastic's CSS and JS and its layout assumptions.
Not worth it now that only two screens are unstyled.

### D-2 · Two plugins, one required
**BUILT.** `businessclass_prefs` is **required** — it publishes branding and pane
widths into the templates and whitelists the skin's preferences (`save_pref.php`
rejects anything not on its hardcoded list or contributed by a plugin).
`businessclass_preview` is optional; without it message rows lose the third line.
**To change:** folding `prefs` into the skin is impossible — a skin cannot run
PHP. Splitting it further is possible but every split adds a thing an installer
can forget.

### D-3 · Everything renders on core's own template objects
**BUILT**, consistently. The contact list is `addresslist`, the directory is
`directorylist`, the login form is `loginform`, the identity form is
`identityform`. The skin styles what core emits and decorates it from `ui.js`
rather than rebuilding it.
**Why:** command enabling/disabling, treelist drag-and-drop, group membership
posting, paging, `dont_override`, and every plugin container keep working
untouched.
**To change:** don't. Each screen that was hand-rebuilt would silently lose one of
those, and the loss shows up as a bug report months later.

### D-4 · `styles.css` is committed
**BUILD** (§2). Shared hosts have no build step.
**Consequence:** `npm run build` is mandatory before any hand-off.

### D-5 · Sass and the Fluent icon SVGs are the only dependencies
**BUILD** (§14) — ask before adding any other.
Icons are subset into one inlined SVG sprite by `tools/build-sprite.mjs`. **No
icon webfont** (§10).

### D-6 · One `ui.js`, one IIFE, ES5-flavoured
**BUILT.** `var`, no arrow functions, no optional chaining, feature-detected
`rcmail`. Every module no-ops where its markup is absent, because `init()` runs
in framed pages too.
**To change:** safe to modernise — Roundcube 1.6 targets modern browsers — but
it would be a large diff for no user-visible gain.

---

## Layout

### D-14 · The three-pane shell is a **flex column**, not a grid
**BUILT**, after a bug. Was `display: grid` with two rows on `body.task-*`.
**Why it had to change:** the `task-*` class is on `<body>` for *every* document
of that task, including framed ones that render no header — so a framed page's
content landed in the header's 48px row and was clipped, which is why Save/Cancel
footers were unreachable. And any third in-flow child of `<body>` (a plugin's
`add_header()` content, which the parser moves into the body) took a numbered row
and pushed the shell down.
**To change:** don't go back to a grid keyed on `<body>`. If you need grid
semantics, put them on `#layout`, never on `body`.

### D-15 · `.floating-action-buttons` is positioned absolute now, designed at step 13
**BUILT.** `mail.html` carries the container so plugins that inject into it work
(§1.2). Unstyled it was a seventh child in a six-column grid and stole a row's
height. It is empty, so it draws nothing.
**To change:** step 13 gives it its real mobile design.

### D-16 · Search stays in the app header on the Contacts screen
**USER.** §4.5 could be read as putting a search box in the contacts pane.
**To change:** trivial — but ask, this was an explicit choice.

### D-17 · No contact count per address book
**USER.** No data without one query per book, including LDAP where it can be slow
or unsupported. The count for the book you are in shows under the list, from
Roundcube's own counter.
**To change:** needs a plugin hook doing per-book counts, cached. Expensive on
LDAP. Do not do it without measuring.

### D-18 · Contact rows keep their height when there is no email address
**USER.** The second line is simply empty rather than the row collapsing.
**To change:** one CSS rule, but rhythm suffers.

### D-19 · `_print.scss` had no owner in `BUILD.md` §12 — **closed**
**USER**, 2026-07-30: raised as unowned, and the answer was "do it now, before
step 11" (the third of four options offered). So printing is an unnumbered
addition between steps 10 and 11, like the avatar work before it. What it decided
is D-42 to D-45.

---

## Contacts

### D-20 · Group membership is chips that toggle
**USER**, chosen from alternatives. The `<input type="checkbox">` core renders
stays the control — it is what Roundcube binds `group_member_change` to, and what
a keyboard and a screen reader use. Only the *appearance* moves to the `<label>`.
Member chips get a brand tint **and** a brand border, so membership is never
carried by colour alone (§9).
**To change:** the appearance is free to change. Do not replace the checkbox with
a `<button>` — the membership POST goes with it.

### D-21 · Roundcube's section headings are kept in the contact detail pane
**BUILT**, a deviation from §4.5, which draws one flat definition list. Core owns
the grouping (Properties / Personal information / Notes / Groups) and flattening
it would leave Notes and the group chips with **no label at all**, because the
design labels those from a left column that a flat structure does not have.
**To change:** you would have to synthesise labels for the unlabelled groups.
Possible; it was judged worse than keeping core's headings.

### D-22 · The label column reads the field name; the subtype moves next to the value
**BUILT.** Core labels each row with its *subtype* ("Home") and puts the field
name on a `<legend>` — which a fieldset renders above its content box and so can
never sit in the label column. `ui.js` folds the field name into the group's first
row and moves the subtype beside the value, giving
`Email │ rita@… Home`.
**To change:** the alternative is `Home │ rita@…` with a heading above, which is
what core does and is not what the design draws.

### D-23 · Group and saved-search actions live behind one overflow button
**BUILT.** §4.5 gives group-create/rename/delete and search-save/delete no home.
Same reasoning for the More popover in the contact detail toolbar: §4.5 names four
buttons, and everything else core registers would otherwise be unreachable.
**To change:** free, if the design grows a home for them.

---

## Avatars, photos, and what recipients see

### D-24 · Nothing goes outbound to recipients
**USER**, chosen over a signature image and over BIMI.
The reasoning that led to the question, worth keeping because it will come up
again: **no mail standard carries a sender avatar that the recipient's client will
display.** Gravatar is looked up *by the recipient's software* and only the account
holder can register a picture there. BIMI is one logo per *domain*, needs DMARC at
`p=quarantine`/`p=reject` and a paid Verified Mark Certificate (~$1,000/yr). The
only thing that works in every client today is a picture embedded in the
signature — and the user chose not to have it.
**To change:** the signature-image option is the cheap one and is fully specified
in the conversation: embed the photo as an inline `cid:` attachment at the top of
that identity's signature. BIMI is mail-infrastructure work, not skin work.

### D-25 · Avatar source is address book → Gravatar → initials
**USER**, chosen over address-book-only and over Gravatar-only.
Address-book lookup is free: core's `contacts/photo?_email=` action already
searches every book and caches for a day. Gravatar is
`businessclass_prefs::contact_photo` returning a `url`, which core then redirects
to — so **the browser** contacts Automattic, disclosing a SHA-256 of the address
and the user's IP.
**To change:** `$config['businessclass_gravatar'] = false` turns just the Gravatar
step off and leaves the rest working. Documented in `README.md` because on shared
hosting this may need disclosing.
**Rejected alternative:** fetching Gravatar server-side would hide the user's IP
but needs an outbound HTTP client, a cache and timeouts in PHP — a new dependency
(D-5) for a privacy gain the switch already offers.

### D-26 · Message-list rows stay initials-only
**REVERSED on 2026-08-04 by D-78.** Kept here because the reasoning still holds
and is what D-78 had to answer.
Fifty rows would be fifty outbound lookups per folder page. The header circle, the
reading-pane sender and the contact card get photos; list rows do not.
**To change:** if you ever want them, do it lazily on scroll and only for
addresses already known to have a local contact photo.

### D-27 · The identity photo is stored on the matching contact
**USER**, chosen over a base64 blob in the user's preferences.
Roundcube's `identities` table has no photo column and this project does not touch
the schema. The address book already has photo storage, an uploader, and a
resizer — and storing it there is what makes the picture appear as the account
circle, as that person's sender avatar, and in an exported vCard, with nothing
else told about it.
**Rejected alternative:** the preferences blob is loaded on *every* request, so a
4–8 KB photo would tax every page for the life of the account.
**Consequence:** the photo is keyed on the address the identity is saved with, so
the address changing has to move it — see D-39, which is what closed the wart this
entry used to record.

### D-28 · The upload is its own request, not part of saving the identity
**BUILT.** Goes to `plugin.businessclass.identityphoto` via core's
`rcmail.file_upload()`. Core's identity save is untouched and the identity form
needs no `enctype`.
**Why `file_upload()` and not `fetch()`:** it sends the request token in the header
Roundcube checks and hands the reply to `http_response()`, so the plugin's
commands dispatch like any other action's. A hand-rolled `fetch` needs
`http_response(parsedObject)`, not raw text — an easy thing to get wrong.

### D-29 · The dashed ring is keyed on `.is-photo`, set on `load`
**BUILT**, after getting it wrong once. `:has(img)` looked right but the `<img>` is
in the DOM from the moment the request starts, so the ring vanished before
anything was known and reappeared if the request 404'd.

---

## Localization

### D-30 · One `<roundcube:add_label>` tag per label — never a comma list
**BUILT**, after a bug that silently broke every client-side string in the skin.
`xml_command()` hands `$attrib['name']` to `add_label()` whole and **nothing splits
on the comma**, so `name="a,b,c"` registers one label literally called `a,b,c` and
every key in it renders as itself. Core's own skins write them one at a time.
**Guarded by** `npm run lint:labels`, which rejects a comma outright.
**To change:** if the verbosity ever becomes intolerable, the alternative is a
single array passed from `businessclass_prefs` on the `render_page` hook —
`add_label()` *does* accept an array, and the hook fires before `js_labels` is
serialised. It was rejected because it moves skin knowledge into the plugin and
would also have to cover the skin's plugin-template overrides.

### D-31 · Bulgarian ships; other languages are copy-and-translate
**USER** asked for English and Bulgarian. Roundcube loads `en_US.inc` first and the
session language over it, so a missing key falls back to English rather than
breaking. `lint:labels` still demands the full set — a half-translated pane is
worse than a consistently English one.

### D-32 · Skin strings are `bc_*`, plugin strings live with the plugin
**BUILT.** `$this->gettext()` inside a plugin resolves against the plugin's own
texts, so anything the plugin words (`bc_photosaved`, the Appearance labels, the
pin messages) belongs in `plugins/businessclass_prefs/localization/`.
`add_texts('localization', true)` pushes them to the browser automatically, which
is why `pluginLabel()` needs no `add_label` tag.

---

## Branding

### D-33 · Three presets side by side, activated by renaming
**BUILT.** `branding.json` (generic, the free-distribution default),
`branding.jethost.json`, `branding.jethost-bg.json`. `vendor` is separate from
`product_name` so the header stays short while About carries the full credit
("BusinessClass by JetHost.com").
**Open:** both JetHost presets are **placeholders** — accent hex, logos, favicon
and support URL are all outstanding and need the user.

### D-34 · `support_url` doubles as "Forgot password?"
**BUILT.** Roundcube has no password-reset flow of its own. With no `support_url`
set, the link is absent rather than dead.

### D-35 · `mail_domain` is never guessed
**BUILT.** With several domains served from one install, guessing before the user
has identified themselves would be exactly that. Unset means the subtitle is
omitted.

---

## Preferences

### D-36 · Six preferences, all clamped or whitelisted server-side
`businessclass_theme`, `_density`, `_focused`, `_folders_w`, `_list_w`,
`_list_h`. The reading-pane position is core's own `layout` pref — the Appearance
block and core's Mailbox View both write it, so they always agree on load.

### D-37 · Saving Appearance reloads the page
**BUILT.** All of these are rendered into the document server-side, so there is
nothing to update in place.

### D-38 · The old `fluent2_*` preference names are abandoned, not migrated
**BUILT.** An install that ran the pre-rename build keeps those rows unread;
theme, density and pane widths fall back to defaults once and are saved under the
new names as soon as they change.
**To change:** a migration is possible but was judged not worth it for a skin that
had not shipped.

---

## The identity photo follows its address

### D-39 · The photo moves with the identity, conservatively
**USER**, asked for directly ("first fix the identity-photo wart"), 2026-07-30.
Because D-27 keys the picture on the identity's address, changing that address used
to leave the face behind on the old contact. `businessclass_prefs::identity_update`
now carries it across. Four rules, each one a decision in its own right:

- **Nothing moves unless the old address has a photo.** No photo, no work, and in
  particular no contact created at the new address for nothing.
- **A photo already on the new address wins.** It is the more recent choice *for
  that address*, and it is not this feature's business to overwrite it.
- **One card carrying both addresses is left alone.** It already answers a lookup
  by either, so there is nothing to move — and clearing it would destroy the only
  copy.
- **The old photo is cleared only after the new one is written.** A failed write
  leaves everything where it was.

Failures are silent: this rides along with saving an identity, that save succeeded,
and there is no sensible way to interrupt it to report that a picture did not
follow.
**Why `identity_update` and not something after the save:** it is the only moment
both addresses exist — the new one is in the posted record, the old one is still in
the database (`identity_save.php:124`). There is no `identity_update_after`.
**To change:** the four rules are independent; each is a couple of lines in
`move_photo()`. Making it aggressive (always overwrite the target) is the one to
avoid — it silently discards a picture the user chose.

### D-40 · Deleting an identity leaves its photo alone
**BUILT.** The picture belongs to a *contact*, which is a real address-book record
that may be in use for other reasons. An identity going away is not a reason to
edit it.
**To change:** an `identity_delete` hook would be the place, but it would have to
distinguish a contact this feature created from one the user already had, and
nothing records that.

### D-41 · The photo well is server-gated per screen, and says so when it cannot work
**BUILT.** Three states, all decided in `startup` (or in the save-path hooks) and
tested by `npm run verify:idphoto`:

- an identity that exists → the well, upload and remove;
- **add-identity** → the fieldset with one line of explanation, because there is no
  address yet to attach a picture to. Core hands the editor straight back after the
  insert, so this state lasts exactly one save;
- **identities_level 4**, where core disables every field → nothing, so the photo
  is not the one writeable control on a read-only form.

**Why not the `identity_form` hook**, which would be the natural place to know
which identity is on screen: the template branches in a `<roundcube:if>`, and
conditions are resolved in an earlier pass than template objects
(`parse_conditions()` then `parse_xml()`, `rcmail_output_html.php:824-825`), so by
the time `identity_form` fires the branch has been taken. The env has to be set
before `write()` — `startup` for a normal render, and `identity_update` /
`identity_create_after` for the form core re-renders after a save, which happens
long after `startup` has run.
**To change:** all three states are one `<roundcube:if>` chain in
`identityedit.html` plus one block in `startup()`.

---

## Print

Everything here was decided on 2026-07-30, when D-19 was answered. Print is the one
part of the skin with no mockup in the design file, so these are the answers to
questions the design never asked.

### D-42 · Print is monochrome, with the accent on links only
**USER**, chosen over full brand colour and over pure black-and-white.
Black text on white, hairline grey rules, and the accent surviving *only* as the
link colour so a printed URL still reads as a link. Implemented as `@mixin bc-print`
in `_tokens.scss` — the same shape as `bc-dark` and `bc-hc` — applied from
`@media print`.
**Two things it has to do, not one:** take the ink out of every fill, *and* undo the
theme. A reader in dark mode would otherwise print white text on a dark page.
**The specificity trap:** the undo must be `html[data-bc-theme]` (0,1,1), matching
`html[data-bc-theme="dark"]`, and win the tie by being later in the cascade. Written
as plain `html` it loses, and the subject prints white on white — invisible, and
measured that way before the selector was corrected.
**`--bc-brand-primary` is never overridden**, because `header.html` writes it as an
inline style on `<html>` and no stylesheet can beat that. Anything that must lose
the accent and takes it from that variable directly has to be neutralised where it
is used — which is why the unread bar needs its own rule, with `!important`, since
the rules that set it carry a state class too.
**To change:** one mixin. Full colour means deleting most of it; pure monochrome
means also overriding `a { color }` inside the print block.

### D-43 · Both print views carry a letterhead, from two possible sources
**USER**, chosen over contacts-only and over no logo anywhere.
Order: `branding.json`'s `logo.print`, then core's own `logo` object, which reads
`$config['skin_logo']`. Neither set means no letterhead, and the block removes
itself.
**Why two sources:** `logo.print` is where the rest of this skin's logos live, so
that is where an admin will look; `skin_logo` is Roundcube's documented mechanism
and works with the plugin absent. It is also its own entry rather than the header
logo reused — a letterhead is usually a different asset, and printing is the one
place an install may deliberately want none.
**Why `:not(:has(img))` and not `:empty`:** the block holds a comment and
whitespace, and whether those count as empty changed between selector spec levels.
Whether there is an image in it did not.
**To change:** one `<roundcube:if>` in each print template.

### D-44 · Ctrl+P is routed to Roundcube's own print view
**USER**, chosen over leaving Ctrl+P to the browser.
`ui.js initPrint()` intercepts Ctrl/Cmd+P and calls `rcmail.command('print')`
whenever `get_single_uid()`/`get_single_cid()` — the very functions core's own print
command branches on — return something. With nothing selected the event is left
alone, so the browser prints and `@media print` cleans the page up.
**Why route at all:** the reading pane is an iframe, and an iframe cannot grow to
its content. Printing the app window can only ever produce the page the frame
happens to fill, however long the message is. Core already opens a proper
standalone document for this.
**The residual limitation, stated plainly:** print from the *browser menu* with a
message open still prints one page of the frame. `.bc-reading__frame` is given
`height: 100vh` in print so it is a full page rather than the 150px an auto-height
iframe collapses to. There is no CSS fix; only the routed path is complete.
**To change:** deleting `initPrint()` restores the browser's behaviour and loses
nothing else.

### D-45 · One stylesheet, and no app header in print markup
**BUILT.** Two bugs found while implementing, both live before this:

- `includes/header.html` linked `/styles/print.css`, **which has never existed** —
  every print view fetched a 404 for it. Print lives in `styles.css` behind
  `@media print` and a `body.action-print` hook, which is what `styles.scss` already
  assumed by importing `_print.scss` last.
- The print views rendered the **whole app header** — brand, search box, settings,
  avatar — because they are not framed and the header's condition only excluded
  framed pages. Now excluded by `env:action != 'print'` in the template rather than
  hidden in CSS, so neither the markup nor the logo request behind it is made.

`body.bc-scrollable` in `_reset.scss` is still declared and still applied to
nothing; `body.action-print` in `_print.scss` is what actually lets a print window
scroll. Left alone rather than wired up, because which pages should carry it is a
step-13 question.
**Deliberately not set: paper size.** `@page` carries a margin and nothing else, so
the printer's own default (A4 here, Letter in the US) is what is used. Forcing
`size: A4` would override the user's printer and can trigger scaling.

### D-46 · No repeating table header in print
**BUILT**, against the usual print idiom. `thead { display: table-header-group }`
would have printed a column header the skin never shows: this list's head is hidden
by design in comfortable density, its sort links living in the toolbar
(`_list.scss:174`), and in compact density that head is a grid, which
`table-header-group` would undo. Whatever the density shows is what prints.

---

## Plugin screens (step 11)

Decided on 2026-07-30, building `BUILD.md` §12 step 11. The user chose which plugins
to design for: **enigma, acl, password and help**, on top of the four `BUILD.md` §1.6
already commits to (`zipdownload`, `archive`, `markasjunk`, `newmail_notifier`).
Step 11's other half — the calendar — stays deferred (see D-19's note); it was
confirmed out of scope for this step, so §12 step 11 is complete *except* the
calendar, which becomes an item of its own at the end of the build.

### D-47 · Every plugin arrives unstyled, and all of it is styled in one file
**FORCED, then chosen.** `meta.json` has `"extends": null`, so
`rcube_plugin::local_skin_path()` resolves to `skins/businessclass/plugins/<id>` and
a plugin's own `skins/elastic/*.css` is **never loaded**. Nothing a plugin emits
arrives with any styling at all.
**Not a 404 risk:** `rcube_plugin_api::include_stylesheet()` checks `is_file()` and
returns quietly when the path does not exist (`rcube_plugin_api.php:728`), so a
plugin asking for a stylesheet this skin does not ship is silently skipped. *The
comment in `skins/businessclass/plugins/managesieve/managesieve.css` claiming the
file "has to exist or the browser reports a 404" is wrong;* it was corrected rather
than the files removed, since they are harmless and the directory has to exist for
the template overrides anyway.
**Chosen:** all of it lives in `styles/_plugins.scss` rather than in per-plugin
`.css` files, so it compiles from tokens, is covered by `lint:tokens`, and follows
the theme switch. `BUILD.md` §2 asks for exactly that.
**To change:** moving a plugin's rules into `skins/businessclass/plugins/<id>/<id>.css`
would work at runtime but leaves the token linter and the theme switch behind.

### D-48 · `.popupmenu` is styled by the skin, because core positions it and nothing else styles it
**FOUND, live.** `rcmail.show_menu()` (`app.js:8752`) moves the menu element to
`<body>`, sets `left`/`top` in pixels and calls `.show()` on it. It supplies no CSS.
With no parent skin to inherit Elastic's `.popupmenu` from, every such menu would
have sat **permanently expanded and unstyled at the foot of the page** — measured
that way: `display=block, position=static` with the rules removed.
Two shipped plugins raise one: zipdownload's download-format menu
(`zipdownload.php:119`) and enigma's compose encryption options
(`enigma_ui.php:892`). The surface deliberately matches `.bc-popover`.
**To change:** nothing, unless the skin grows its own menu machinery for plugin
menus, which would mean intercepting `menu-open`.

### D-49 · Bounce is a dialog, and its form is built one header at a time
**FOUND, live — the feature did not work.** `rcmail.bounce()` always opens
`?_action=bounce&_framed=1` in an iframe inside a 400x300 `simple_dialog`
(`app.js:4527`). The scaffold called `<roundcube:object name="composeHeaders" />`
with **no `part=`**, and `rcmail_sendmail::headers_output()` switches on the part
name and falls through returning nothing — so the bounce form rendered **no From, To,
Cc or Bcc field at all**, and `post_func` refuses to post without a recipient.
Measured: `_from=ABSENT _to=ABSENT _cc=ABSENT _bcc=ABSENT` with the `part=`
attributes removed again.
**Also removed:** the scaffold's own Send button. The dialog supplies Bounce and
Cancel; the framed bounce page never enables the `bounce` command
(`app.js:384`), so ours could only ever have been a permanently disabled button.
**The `</form>`:** `composeFormHead` opens the form and never closes it, so the
template must. Measured too — and leaving it out does *not* lose the fields: HTML5
keeps an unclosed form open to the end of the body. It swallows `footer.html` into
the form instead. Well-formedness, not function.
**To change:** the fields are `.bc-compose__row`s reusing compose's ids, so ui.js's
recipient pills and Cc/Bcc disclosure work here unchanged.

### D-50 · Dialogs core sizes too small are resized on the event core already fires
**BUILT.** `show_popup_dialog()` fires `dialog-open` with the popup element
(`app.js:8840`). ui.js listens and widens three dialogs whose fixed sizes cannot
hold this skin's type: bounce (400x300 → 560x460) and enigma's two import frames
(500x180 / 500x150 → 520x340 / 520x260, the first measured at 288px of content).
Matched on the URL the iframe was pointed at, because at that moment the frame is
same-origin but not necessarily loaded.
**Why not reimplement the commands:** `rcmail.bounce()` and
`enigma_key_import()` each read a form out of the frame and post it from the parent.
A copy in the skin would have to be kept in step with theirs for no gain.
**To change:** `DIALOG_SIZES` in `ui.js` is a list of `[url-fragment, w, h]`.

### D-51 · acl gets three buttons and a checkbox, not Elastic's Actions menu
**CHOSEN**, over copying `acl/skins/elastic/templates/table.html`. That template
hides Edit, Delete and the advanced-mode toggle behind a menu opened with
`data-popup="acl-menu"` — an attribute **only Elastic's own ui.js understands**, so
in this skin that menu could never open and those three controls would be
unreachable. Three buttons and a checkbox in one row need no menu.
**The toggle keeps acl.js's contract exactly:** `#acl-switch` as the wrapper, with a
real `<input type="checkbox">` inside it, because acl.js marks the current mode with
`$('#acl-switch').addClass('selected')` and ticks the box with `.find('input')`
(`acl.js:46`, `:160`). Rendering it as a checkbox rather than Elastic's menu item is
what makes that tick visible.
**`#aclform` is not a `.popupmenu`** here. acl.js hands it to `show_popup_dialog()`,
which moves it into a jQuery UI dialog and back to `<body>` on close (`acl.js:359`);
with our `.popupmenu` rules it would be absolutely positioned with a shadow *inside*
the dialog. `.bc-aclform` is `display: none` and nothing else.
**To change:** the rights cells are the constraint — `acl_add_row()` clones
`thead > tr` (`acl.js:242`), so the header row must stay in the markup even though
the design never shows the abbreviations.

### D-52 · An ACL right is a glyph, not a colour
**BUILT** (§9). `list_rights()` emits each right cell as an empty `<span>` plus a
class — `enabled`, `partial`, `disabled`. Rendered as `✓`, `–` and `·` through
`::before`, so the three states survive monochrome and reach the accessibility tree.
Measured both ways: with the `content` rules removed all three cells come back
identical (`glyphs-distinct=1`).
**Open:** whether generated content is *enough* for a screen reader here is a §9
question, deliberately left to the step 14 audit rather than guessed at now.

### D-53 · The password plugin's own page furniture is undone, not restyled
**FOUND.** `password` renders a whole settings page hosted by `templates/plugin.html`
and brings furniture written for a skin that has none of ours: `#prefs-title.boxtitle`
(its own heading) and `.box.formcontainer.scroller` (its own scroll container). The
heading would print "Change Password" a **second time** directly under
`.bc-formpage__title`, which renders the same `pagetitle`; the scroller would give
two nested scrollbars inside `.bc-formpage__body`, which is already the scroller.
Both are undone. `.formbuttons` is kept and styled, because the plugin owns its
submit and our form footer is not rendered on this page.

### D-54 · `.boxinformation` is forced monochrome in print
**FOUND, after the boxes existed.** `bc-print` whitens every status *tint* but
deliberately leaves `--bc-brand-fg` / `--bc-brand-fg-strong` alone — those are what
carries the accent onto links, the one exception D-42 allows. `.boxinformation` takes
its **body text** from `brand-fg-strong`, so a whole sentence would print in accent
ink on a box that had just been turned white. Reachable on paper through enigma's
"this message contains a public key" offer, which sits in the message body.
Measured before and after: `color(srgb 0.045 0.322 0.563)` → `rgb(0, 0, 0)`. The
Import button in that box is hidden too; it does nothing on paper.

### D-55 · JetHost branding: Navy is the accent, and orange cannot be
**From the October 2025 brandbook (English and Bulgarian, 37pp each) and the RGB
logo kit.** The palette is Orange `#FE6400`, Apricot `#F1901A`, Honey `#F1B51C`,
North Sea `#92ADCE`, Navy `#253082`.

The accent is not a free choice. `_header.scss:17` paints the whole 48px app
header with `--bc-brand-primary` and puts every header icon and the search box on
it in `--bc-on-brand` white, so the accent has to carry white — and it is also
the link colour, the focus ring and the unread bar. Measured:

| | on white | white on it |
|---|---|---|
| Navy `#253082` | 11.51:1 | 11.51:1 |
| Orange `#FE6400` | 2.98:1 | 2.98:1 |

Orange fails AA for text both ways and misses even the 3:1 bar for non-text UI.
As the accent it would break the header, links, focus rings and the unread bar at
once. **Navy is the accent**; the derived `--bc-brand-fg-strong` lands on
`#1C2463` at 14.17:1. *(Superseded by D-63: the client chose to keep the design's
`#0F6CBD` and brand through the logos instead. The reasoning below stands — it is
why orange could never have been the accent either way.)* Per the client's answer, orange stays inside the logo
artwork and is used nowhere else in the UI.

The two brandbooks carry the same palette, the same kit and the same typography;
they differ only in language and in photography guidance a mail client never
reaches. So `branding.jethost.json` and `branding.jethost-bg.json` are identical
but for `vendor`.

**Inter is not adopted.** It is the corporate primary font, but the client chose
to keep the Fluent 2 stack rather than take on the only real dependency the theme
would have (BUILD.md §14). `--bc-font-body` is unchanged.

### D-56 · The kit's logo files cannot be shipped as they are
**FOUND, three separate defects, each measured in Chrome.** `tools/build-brand-assets.mjs`
derives the four shipped assets from the kit; no path data is redrawn.

1. **Two files carry a full-canvas backdrop rect.** `JH_logo_HORIZONTAL_WHITE.svg`
   opens with a black `<rect width="2500" height="1500">` and the `on_BLUE`
   variant with a navy one — there so the artwork is visible in a file browser.
   Shipped unmodified, the header logo paints a 2500×1500 navy block across the
   header and the print logo a black block across the paper.

2. **No intrinsic size.** Every kit file has a `viewBox` and no `width`/`height`,
   which gives an aspect ratio but no intrinsic size. `.bc-header__brand` is a
   flex item inside a grid `auto` track, so the width it would resolve against
   depends on its own content — and that circularity resolves to **zero**.
   Measured: the header logo laid out at `0.0px x 0.0px` and the navy band came
   up empty. The skin's own `logo-default.svg` has carried `width`/`height` since
   step 3 for exactly this reason. The generator now writes the ink box as the
   intrinsic size.

3. **The canvas is 6× the ink.** `viewBox="0 0 2500 1500"` (1.667:1) holds a mark
   at `x=450 y=623.5 w=1600 h=253` (6.325:1). `object-fit: contain` fits the
   canvas, not the ink. Measured with defect 2 corrected but no trim: the header
   box holds `40x24` of which `25.6x4.0` is wordmark. Trimmed: `120x19`, solid.

Clear space is deliberately *not* baked in. The brandbook's rule (p.4) is one bar
height — 41.25 user units, or 3.9px at a 24px logo — and `.bc-header__brand`
already sets `gap: var(--bc-s-8)` with `padding-left: var(--bc-s-4)`, over twice
that.

The header takes the kit's `WHITE_ORANGE on_BLUE` variant rather than plain
white: it is the pairing the kit itself supplies for a navy ground, and orange on
navy measures 3.86:1 — past the 3:1 bar for a non-text graphic.

### D-57 · The favicon is reconstructed, because the kit has no symbol-only file
All 72 kit assets are lockups. Elements 9–11 of every horizontal lockup are the
three speed bars — widths 258/172/86 at 41.25 tall on a 79.56 pitch, which is the
6-across-by-5-down grid the brandbook describes on p.2 — and they are the only
part of the logo that reads at 16px. The favicon is those three rects at their
original coordinates in a square viewBox padded to 320 units.

One colour, not two: at 16px the orange-on-white pairing (2.98:1) is the weakest
thing the brand owns, and a favicon is the smallest place it could appear. Navy
for light browser chrome, white for dark, switched by a `prefers-color-scheme`
rule inside the SVG — which a raster favicon could not carry. Precedent for a
one-colour symbol is the kit's own `JH_logo_HORIZONTAL_WHITE`, where the bars are
drawn white along with the wordmark.

**Caveat:** SVG favicons are not honoured by every browser; where they are not,
the tab falls back to a generic icon. Cosmetic, and the alternative — a raster
file — cannot follow the browser's colour scheme.

### D-58 · Navy exposes a dark-theme bug in the header (deferred to step 12)
**CLOSED by D-66**, which found the high-contrast half of the same bug and
removed the cause: the accent is no longer the token the themes must override.
**FOUND.** `header.html:3` writes `--bc-brand-primary` as an *inline style* on
`<html>`, which outranks the `bc-dark` mixin's `--bc-brand-primary: #479EF5`. So
in dark mode the header band stays the admin's accent — but `bc-dark` also sets
`--bc-on-brand: #000000`, because Fluent's dark brand ramp assumes a *light* blue
accent that black reads on.

With Navy the two no longer agree. Measured on the real stylesheet: band
`rgb(37, 48, 130)`, icon colour `rgb(0, 0, 0)`, **1.82:1** — unreadable.

Pre-existing and structural rather than caused by the branding: any dark accent
does this, and the old `#0F6CBD` default was already poor. Left for step 12,
which is where the dark ramp is built, and recorded here so it is fixed with the
measurement rather than rediscovered.

### D-59 · `symbol` and `header` are separate branding slots, and `rail` is a third
**Client-directed layout.** The header carries the JetHost *symbol* beside the
product name in live text; the full lockup moves to the foot of the app rail,
below logout.

The header brand slot therefore has to distinguish two kinds of asset, and it is
a property of the asset rather than a preference: `header` is a full lockup with
the product name drawn into it and **replaces** the text; `symbol` is a mark and
**accompanies** it. Rendering a lockup *and* the text would print the name twice.
Hence two entries and a three-branch template, with `symbol` winning where both
are set — not one entry plus a flag.

The symbol is `alt=""` and `aria-hidden`, because the name beside it is already
live text; the rail logo likewise, and it is deliberately **not a link** — the
rail is task navigation, and a logo that went somewhere would be the only thing
in it that left the app.

The rail logo is the *positive* lockup, not the reversed one: `.bc-rail` is
`--bc-bg-3`, a light neutral, not the accent band.

### D-60 · The rail logo is rotated by an out-of-flow element, not a centred one
**FOUND while building D-59.** The rail is 48px and the lockup is 6.325:1, so
upright it would be 40×27 with the wordmark on two ~12px lines. Rotated 90° it is
24×152 and reads properly, which is what the client picked.

A transform does not change the layout box, so the image is laid out 152px wide
inside a 48px rail — and `.bc-rail` sets `overflow: hidden`. The first attempt
centred it as a grid item with `place-items: center`. **Chrome falls back to
start alignment for a grid item larger than its cell**, so the image was placed
at the wrapper's left edge instead of overhanging both sides. Measured: the
rotated logo landed at x `77–101` while the rail spanned `13–61` — entirely
outside it, and clipped away to nothing with no error anywhere.

Replaced with an absolutely positioned image pinned by its own centre
(`top/left: 50%`, `translate(-50%, -50%) rotate(-90deg)` — translate written
first so it applies last, or it would run along the rotated axes). Measured
after: `24.5–48.5` inside `13.0–61.0`, 24px clear.

### D-61 · `refcheck` now validates branding assets and the SVGs they point at
**Added after two silent failures in one sitting.** Both a branding path that
resolves to nothing and a malformed SVG present identically — an empty brand
slot, no console error, nothing in any log. So `verify:refs` now checks, for
every `branding*.json`: that it parses, that every non-null `logo.*` path exists,
and that `accent` passes the same `/^#[0-9a-f]{6}$/i` the plugin applies
server-side. And for every SVG at the top level of `images/`: no `--` inside a
comment (illegal in XML — this cost the rail logo, `naturalWidth = 0`), no XML
declaration anywhere but the first byte (this cost all three logos at once), and
a `width`/`height` on the **root** `<svg>`.

`images/icons/` is excluded from the intrinsic-size rule: the sprite there is
inlined by `sprite.html`, not loaded through `<img>`.

Each of the four was tested by reintroducing the bug and confirming it fails. That
caught a fifth: the intrinsic-size check originally searched the whole file, so a
child `<rect width=…>` satisfied it and an SVG whose *root* had no size passed.
It is scoped to the opening tag now.

### D-62 · The branding profile is named in config, not by renaming a file
**FOUND in the field.** A live install was showing generic branding — Fluent blue
`#0F6CBD` and the default "Webmail" logo — with the JetHost presets sitting
unused beside it. Working as built, and badly designed: `load_branding()` read
`branding.json` and nothing else, so a preset was inert until someone copied it
over that file. The README said so in one line, which is not enough.

The rename is also the wrong mechanism. It lives *inside* the skin directory, so
the next deploy that ships the skin reverts it — silently, with the install
falling back to generic branding and nothing in any log.

So the profile is named in Roundcube's config instead:

```php
$config['businessclass_branding'] = 'jethost';   // -> branding.jethost.json
```

Unset, empty or `'default'` keeps `branding.json`. A profile that is *named* but
unreadable logs and falls back — a typo should not quietly serve someone else's
brand.

**The name reaches a filesystem path**, so it is whitelisted rather than escaped:
`/^[A-Za-z0-9_-]+$/`, which admits no separator and no dot, hence no `..`.

The guard is real, and proving it took some care. `../evil` and friends pass with
the guard *removed*, because the profile is interpolated between `branding.` and
`.json` — `../evil` builds `branding.../evil.json`, which resolves to nothing. An
escape needs a real directory named `branding.<x>`; given one, `x/../../evil`
builds `skins/businessclass/branding.x/../../evil.json`, which is
`skins/evil.json` — outside the skin. Measured both ways: guard removed, that
returns accent `#FF0000` / vendor `PWNED`; guard in place, it falls back.
`tools/verify/brandingcheck.php` creates that fixture, asserts the refusal and
removes it, so the one case that can actually bite is the one that is tested.

The harness runs one process per case: `load_branding()` memoises into a
function-level `static`, shared across instances and not resettable from outside,
so a single process would answer every case with whichever profile it loaded
first and the suite would pass while testing nothing.

**Not asserted, deliberately:** whether `JETHOST` resolves. That is a property of
the filesystem, not this code — it falls back on the Linux servers this ships to
and loads `branding.jethost.json` on the case-insensitive macOS volume it is
developed on. Measured both ways; asserting either would make the suite lie on
the other platform.

### D-63 · The JetHost profiles keep the design's accent; branding is in the logos
**Client decision, superseding the accent half of D-55.** Seeing navy on a live
install, the client asked why the interface changed colour at all. It was
specified behaviour — `BUILD.md` §3.2 paints the 48px header with
`--f2-brand-primary`, and §13 lists "changing `branding.json` accent + logo
restyles the whole UI" as an acceptance criterion, with `#0F6CBD` being the
*default accent value* rather than a fixed header colour — but specified is not
the same as wanted. Both JetHost profiles now carry `#0F6CBD`.

So the interface stays Fluent 2 blue and JetHost appears in the header symbol,
the rail logo, the login card, the letterhead and the favicon. Everything D-55
established about the palette still holds; only the accent value changed.

**This broke the header symbol, which was orange.** The band is whatever the
active accent is, so the symbol has to survive all of them:

| | on `#253082` navy | on `#0F6CBD` blue |
|---|---|---|
| orange `#FF6600` | 3.92:1 | **1.83:1** |
| white | 11.51:1 | 5.38:1 |

Orange only ever worked against the darkest accent the brand owns; on the default
blue it effectively disappears. The symbol is white now — the same treatment the
kit gives its own single-colour lockup (`JH_logo_HORIZONTAL_WHITE` draws the bars
white along with the wordmark), and the same colour as the product name and every
icon on that band.

The rail logo is untouched and stays full-colour navy-and-orange: it sits on
`--bc-bg-3`, a light neutral, not on the accent.

**`brandingcheck.php` had to be rekeyed.** It told profiles apart by accent, and
all three now share one — so every assertion would have passed for every profile.
It keys on `logo.symbol` instead, which only the JetHost presets carry. The suite
caught this itself on the first run after the change.

~~**Still open for step 12:** D-58's dark-mode contrast.~~ Closed by D-66 and
D-67: the dark band is a neutral, so `--bc-on-brand` no longer has to work on the
accent at all. The symbol stays white and reads on all three bands. The one case
left is a *pale* accent in light, where the band goes pale and the white symbol
with it — recorded as a known limit under D-67.

### D-64 · The rail logo links to the vendor's site when `brand_url` is set
**Client-directed, reversing half of D-59.** `branding.json` gains `brand_url`;
the JetHost presets point at `https://jethost.com` and `https://jethost.bg`.

D-59 argued the logo should not be a link, because the rail is task navigation
and a logo that went somewhere would be the only thing in it that left the app.
That reasoning was about *surprise*, and it is answered by making the departure
explicit rather than by refusing the link: `target="_blank"` with
`rel="noopener noreferrer"`, so a webmail session is never the opener of a
marketing page.

Through `sanitize_url`, the same gate as `support_url` — `^https?://` only, which
is what keeps `javascript:` out of an href assembled from a hand-edited file.

**Accessibility.** As a decorative image the logo was `alt=""` and `aria-hidden`;
as a link it needs a name, and the name is not the logo. The image stays
decorative and the anchor carries `.voice` text reading "<vendor> website" — a
link announced as bare "JetHost.com" gives no clue that it leaves the app. Without
`brand_url` it stays a plain image and is not focusable at all, which is right: an
unlabelled logo in the tab order is a stop that does nothing.

**Layout.** The anchor is `position: absolute; inset: 0` rather than sized to its
content. Its only in-flow child is the visually hidden `.voice` text — the image
is out of flow — so left to itself the link collapses to a few pixels and cannot
be clicked. `inset: 0` also makes the anchor the positioned ancestor the image
centres against, which is the same box `.bc-rail__brand` was, so the rotation
geometry is unchanged. Measured: link `47x152`, logo `24x152` at x `12.5-36.5`
inside a rail spanning `1-49`, below logout, name "JetHost.com website".

### D-65 · Public repository: MIT with attribution, brand kit and design capture excluded
**Client-directed.** The skin is published on GitHub for anyone to clone, use
commercially and contribute to, on one condition: the credit "BusinessClass by
JetHost — https://jethost.com" stays reachable.

**The license is MIT with an attribution clause**, not plain MIT and not CC BY.
Plain MIT requires the notice to survive in the *source*, which a deployed
webmail never shows anyone — so it would not deliver what was asked for. CC BY
delivers exactly the asked-for condition but Creative Commons themselves advise
against CC licenses for software, and it carries no warranty or patent language
tuned for code. Apache-2.0's NOTICE file was the third option and has the same
gap as MIT: it travels with the source, not with the running product. So the
clause is written explicitly, and the file is labelled "MIT with attribution"
rather than claiming to be MIT, because it is no longer OSI-approved MIT and
saying otherwise would be false.

**The skin satisfies its own license by default.** `about.html` carries a fixed
credit line, deliberately *not* built from `product_name`/`vendor`: a rebranded
install replaces both with its own, and the origin would vanish with them. That
is the one line in the skin that a branding profile cannot reach, and it is the
reason clause 1 is satisfiable without a rebrander doing anything.

**The JetHost logos and both presets ship.** Client's call, against the safer
option of shipping only the generic profile. The case for it is real — a filled-in
profile is a better specification of the mechanism than any prose — and the
exposure is trademark, not copyright, so the license cannot cover it. Handled by
LICENSE clause 2 and a README section: copyright is granted, marks are not.

**Two inputs are gitignored.** The Fluent 2 design capture, because publishing it
under a license granting unlimited commercial use redistributes Microsoft's
material, which is not ours to grant — the skin it produced is original and stays.
And `jethost-branding/`, 114MB of brandbook PDFs and the full RGB kit, which is
internal. Consequence: `npm run brand:assets` and `npm run sprite` only run on a
machine with their inputs. Everything they generate is committed, `npm run verify`
passes on a bare clone, and nothing in the build, test or rebrand path needs
either input. `ms-handoff/BUILD.md` is published with a preamble noting the skin's
rename from `fluent2` and that the design file it points at is not in the repo.

---

## Step 12 — dark, high contrast, forced-colors

### D-66 · The accent stops being the token the themes have to override
**Closes D-58, and it was worse than D-58 recorded.** `header.html` wrote the
admin's accent as `--bc-brand-primary`, an *inline style on `<html>`*. An inline
style outranks every stylesheet rule, so `--bc-brand-primary` was the one token
in the skin that no theme could restate. Measured on the real stylesheet, with
the band's own text colour:

| Theme | Accent | Band vs. its text |
| --- | --- | --- |
| Light | `#0F6CBD` | 5.38:1 |
| Light | navy `#253082` | 11.51:1 |
| Dark | `#0F6CBD` | **3.90:1** |
| Dark | navy | **1.82:1** |
| High contrast | `#0F6CBD` | **3.90:1** |
| High contrast | navy | **1.82:1** |

D-58 recorded the dark half. The high-contrast half is the one that mattered
most: `bc-hc` sets `--bc-brand-primary: #1AEBFF` and it never applied, so the one
theme that exists for people who need contrast kept the admin's band and put
black on it. The mode was not merely imperfect, it was the worst of the three.

**The fix is one level of indirection.** The inline properties are now raw input
that nothing paints with directly:

```
--bc-accent            the brand hex, untouched
--bc-accent-fill       nudged only if neither black nor white reaches AA on it
--bc-on-accent         black or white, whichever reads on that fill
--bc-accent-text       the accent made readable as text on #FFFFFF
--bc-accent-text-dark  ... and on #292929
```

`:root` derives `--bc-brand-*` from those, and a theme can now restate any of it.
All four derivations are computed **server-side** in `businessclass_prefs`,
because every one is a contrast measurement and CSS cannot measure. Rejected:
`color-contrast()` (not shipped in any browser this must run in) and a fixed
per-theme `--bc-on-brand` (which is exactly the bug).

Two brand tokens now, and the split is load-bearing:

- `--bc-brand-primary` — a **fill** that `--bc-on-brand` text sits on: the header
  band in light, the primary button, a checked checkbox.
- `--bc-brand-fg` — anything that must be **seen** rather than sat on: links, the
  unread bar, tab underlines, `accent-color`, drop outlines.

A pale accent is a perfectly good fill with black on it and an unreadable link.
33 declarations moved from the first to the second.

### D-67 · The dark header is a neutral, and the brand moves to a 2px rule
**Client-directed, offered against two alternatives.** In dark the band is
`--bc-bg-2` with normal white text, and the accent becomes a 2px rule under it —
what Fluent 2 and Outlook both do.

The argument that decided it is not taste. A band painted with an *arbitrary*
admin hex has **no** text colour guaranteed to reach 4.5:1 on it: a
mid-luminance accent like `#767676` is 4.54:1 against white and 4.62:1 against
black, and anything nearer the middle fails both. Keeping the coloured band in
dark would have meant either rejecting accents or shipping a band that is
sometimes unreadable. The neutral band is readable for every accent that exists,
and the brand still shows — in the rule, and in every accented control below it.

Also decided here, and cheaper: a **dark-ink logo disappears in dark.** Measured,
`logo-jethost-rail.svg` is 1.50:1 on the dark rail and `logo-jethost-login.svg`
is 1.13:1 on the dark login card. Not faint — absent. `branding.json` gains
optional `logo.rail_dark` and `logo.login_dark`; absent, the light asset is used
unchanged, so no existing install changes behaviour. `ui.js` does the swap
because "system" is a media query and the server cannot know how it resolved.
Rejected: a CSS `filter: invert()`, which produces a colour nobody chose, and a
light plate behind the logo, which is a bright patch in a dark rail.

The JetHost reversed pair is derived from the kit's own "on BLACK" lockup by
`npm run brand:assets` — the brandbook's reversed artwork, not a recolour.

**Known limit, not fixed:** the header *symbol* slot is a single asset and is
white, chosen for the accent band. An admin who sets a *pale* accent gets a black
`--bc-on-accent` and a white symbol on a pale band. The remedy is to supply a
dark symbol; no code can pick one. Not worth a `symbol_dark` slot until an
install actually hits it.

### D-68 · A message body follows the theme, with a one-click sheet
**Client-directed, and against my recommendation — recorded because the
trade-off is real and someone will ask.** In dark, a sender's HTML sits on the
dark surface by default, with a sun/moon toggle in the reading pane that flips
that message — and every message after it — to paper. Persisted as
`businessclass_sheet`.

The client asked which way the popular clients go. The honest answer is that they
are split, and Outlook — the client this skin is modelled on — darkens:

| Client | HTML body in dark |
| --- | --- |
| Outlook (web / new) | **Darkened**, with a per-message toggle back to light |
| Gmail (web) | Chrome darkens; bodies stay effectively light |
| Apple Mail | Plain text follows; HTML with its own background is left alone |
| Thunderbird | Bodies light; dark-message mode is opt-in |

So the toggle is Outlook's design and was adopted. **The default direction is the
part worth understanding.** Outlook can darken safely because it runs a
colour-inversion engine over the sender's CSS server-side before painting.
Nothing here can: the body is untrusted and stays inside Roundcube's sanitiser
(§3.6), so all a skin can set is the surface behind it. Mail that names a text
colour but no background — common in newsletters — therefore opens dark on dark.
I recommended defaulting to paper for that reason; the client chose Outlook
parity, which is a defensible reading of "make it feel like Outlook", and the
toggle makes it one click to recover. This paragraph is the record of what that
default costs.

The tokens are `--bc-sheet-bg` / `--bc-sheet-fg` / `--bc-sheet-stroke`, and
`html[data-bc-sheet="light"]` is the only thing that changes them. Print
overrides them to paper regardless of how the reader had it set.

### D-69 · The compose editor never goes dark
The editing surface is white in every theme; only the chrome around it follows.

Composing is WYSIWYG: what the sender types is what the recipient reads, and the
recipient will almost certainly read it on white. A dark editor invites a sender
to set a light text colour to suit what they see, which produces mail that is
unreadable for everyone who receives it — the skin would be helping a user damage
their own outbound mail.

It holds structurally rather than by convention: `embed.css` styles that surface,
every theme block in `_tokens.scss` is keyed on an attribute of `<html>`, and
`rcmail_html_page::write()` emits a bare `<html>`. Nothing can match.
`themecheck.mjs` asserts it, so a theme block written against a bare `:root`
fails the build rather than quietly darkening every compose window.

### D-70 · Text on a tint is its own token
`--bc-fg-on-tint`. §9 already treated this as a distinct case ("never use brand
for body text on tinted rows; use fg-strong there") but it had no token, so a
theme could restate the tint and not the text on it.

High contrast is where that bit: it paints the selected row `#FFFF00` and left
the text at `--bc-fg-1`, which is white there — **1.07:1, on the row a keyboard
user is standing on.** In light and dark the token resolves to
`--bc-brand-fg-strong` and nothing changes; in high contrast it is black.

`_contrast.scss` carries the structural half: in that theme a tint is a *solid
fill* rather than a 10–18% wash, so every span inside a selected row has to come
with it, including spans a plugin renders that this skin has never seen.

### D-71 · forced-colors gets a real pass; the old block asserted nothing
What was there was `* { forced-color-adjust: auto }` — which is the default, so
it did nothing at all — plus borders on three classes. Replaced with
`_contrast.scss`, loaded after every component so it can override them.

What the mode actually does: the browser replaces every background, border and
text colour *after* the cascade, from the user's palette. So none of the token
work above reaches the screen, and the only colours that mean anything are the
system keywords. The new block draws surface borders in `CanvasText`, control
borders in `ButtonText`, selection in `Highlight`/`HighlightText`, links in
`LinkText`, disabled state in `GrayText`, and redraws the four signals that were
pure fills and therefore vanished — the unread bar, the selected-task indicator,
the category dot and the avatar disc.

`color-scheme` is also declared for the first time (`light` / `dark` /
`light dark` / `dark`). Without it the browser paints its own scrollbars,
`<select>` drop-downs and date pickers light-on-white inside a dark app, and no
stylesheet can reach any of them.

### D-72 · The contrast gate is arithmetic, not a browser
`tools/verify/themecheck.mjs`, in `npm run verify`. It reads the compiled
`styles.css`, resolves `var()` and `color-mix()` itself, and computes WCAG ratios
for 60-odd token pairs across three themes and **five accents** — 604 checks,
about a second, no Chrome.

Sweeping accents is the point. Every bug above was invisible with the shipping
`#0F6CBD` and severe with something else: the header at 1.82:1 on navy, a 1.37:1
link on a pale accent, a 3.95:1 primary button on a mid grey. A gate that only
checked the shipped accent would have passed all of them.

It also asserts the things arithmetic cannot reach: that the high-contrast theme
never reads `--bc-accent`, that `color-scheme` is declared in all four places,
that the forced-colors block uses real system colours and contains no
`forced-color-adjust: auto`, that `embed.css` cannot darken, and that the PHP
luminance pivot still matches the one this file assumes — the two sit on opposite
sides of a contract and would otherwise drift silently.

Two assertions were wrong when first written and were corrected rather than
worked around: `--bc-stroke-1` is the *decorative* stroke (a secondary button's
outline, identified by its label) and is Fluent's own `#D1D1D1`, so 3:1 does not
apply to it — `--bc-stroke-accessible` is the token that carries that
requirement, and it is what every input is actually bordered with. And a category
*dot* is not required to clear 3:1 on its own, because the chip beside it is
always labelled; the dot now carries a 1px ring in its own `-fg` step instead, so
the hue survives and the shape is visible. Amber was 2.16:1 on white and every
dot was under 3:1 on the dark surface, the worst at 1.56:1.

---

## Outlook parity (unnumbered, after step 12)

The user supplied screenshots of a real outlook.com account and asked for the
skin to match it "as much as identical as possible". `ms-handoff/BUILD.md` §1
says the opposite — *"an original mail UI in the Fluent 2 language, not a clone
of Microsoft's product UI. Do not copy Outlook's proprietary iconography,
illustrations, marks or exact chrome."* That was put to the user with the
conflict stated, and they chose to override it for chrome and layout. §10 still
holds and is not in question: no Microsoft logos, illustrations or icon webfont,
and every glyph still comes from the MIT Fluent set.

Commands Outlook has and Roundcube has no data behind — Quick Steps, Sweep,
Snooze, Viva Insights, Copilot, Zoom, Immersive Reader, conversation grouping by
branch, Tips, Feedback — are **omitted, not drawn disabled**. A permanently
disabled control offers a user a feature their mail server does not have, and
§9's audit would have to defend a button with no path to enabled.

### D-73 · The message row is Outlook's, not the design file's
Subject in the accent, date beside the *subject* rather than the sender, and the
flag/attachment cell moved up to the sender's line.

The accent is `--bc-brand-fg`, never `--bc-accent`. That is the whole reason
step 12's server-side derivation exists: `accent_text()` walks the admin's colour
away from the surface 2% at a time until it clears 4.5:1, so a subject in it
holds for any accent, light or dark, and high contrast restates it as `#1AEBFF`
without ever reading the raw value. Colour therefore stops distinguishing read
from unread — weight and the brand bar carry that, which is what §9 asks for
anyway, and the date keeps the accent only while unread.

Selection changed from a tint fill to a 2px accent outline on the row's own
background, which is what Outlook draws. Written as an inset `box-shadow`: a
border would add 2px to a content-sized grid row and shift every row beneath it,
and `outline` is already the focus ring — a row that is both selected and focused
has to show both.

That change broke a high-contrast rule that had been correct. `_contrast.scss`
forced `--bc-fg-on-tint` onto every selected row *and all its descendants*,
because in hc the tint is solid yellow rather than a wash. With selection now on
`--bc-bg-1` — also black in hc — it would have painted the focused row black on
black. It is scoped to `.bc-multiselect` now, where a fill genuinely still
exists; the contact list is unchanged and keeps the tint. Multi-select also gives
the subject back to `--bc-fg-on-tint`, for the reason §9 gives: brand text on a
tint fails.

Date group headings became real `<button aria-expanded>` toggles. Collapsed rows
are hidden with `display: none`, which `rcube_list_widget` already treats as an
absent row (list.js:959) — so they leave `j`/`k` and select-all with no further
help. Only rows the skin hid are ever shown again (`data-bc-collapsed`): core
hides rows too, and clearing that blindly would restore messages a search had
filtered away. Collapse state is per-sitting, not persisted.

### D-74 · Favorites is a real preference, not a static list
Outlook's Favorites is user-curated. Roundcube has no pinned-folder concept, so
this is `businessclass_favorites` — one `"\n"`-separated string, because that is
the only shape `rcmail.save_pref()` carries and `"\n"` is the one separator an
IMAP mailbox name cannot contain. Seeded with Inbox / Drafts / Sent the way
Outlook seeds it, and only when the pref has never been set: `''` means the user
emptied it, and re-seeding would put back what they just removed.

**The value is untrusted.** `save_pref.php` checks only that the name is
whitelisted and then writes whatever the browser sent into the user's
preferences — there is no hook in between. So the check is on the way out, in
`sanitize_favorites()`, and it is the strongest available: a name survives only
if the user is subscribed to a folder by that name. Nothing downstream has to
escape anything, because every string that reaches the browser is one the IMAP
server just named. `FAVORITES_MAX` caps the list so a crafted pref cannot make
every page render ten thousand rows.

The Favorites rows are **clones** of the tree rows, not links built here. Core
wires each anchor to its own list command and writes the row's classes itself; an
anchor assembled in `ui.js` would be one this skin had to keep in step with
`render_folder_tree_html` for ever. What is maintained instead is what gets
stripped — ids, which must not exist twice, and child lists, which belong to the
tree. A `MutationObserver` on `#mailboxlist` copies class and unread-count
changes onto the clones, so every path core uses to touch a folder row is covered
without naming any of them, including a plugin's. The count element is *created*
on the clone when needed: core adds it when a folder becomes unread and removes
it when it is read, so a clone taken while the folder was read has nothing to
write into. That was a real bug, caught by driving the code in a browser.

The star is shown on hover and focus only, never persistently. A pinned folder is
already visible in the Favorites group, and a star that stayed would sit on top
of the unread count — which for the Inbox is the number the pane exists to show.

### D-75 · The ribbon replaces both toolbars
Two rows under the app header, spanning the whole window including the folder
pane: a tab strip (**Home / View / Help**) and one command row per tab. It is a
third flex child of `<body>` beside `#bc-header` and `#layout`, so it costs its
own height and nothing is re-laid out — and `#layout` keeps Elastic's four
children exactly as §1.2 requires.

**No File tab.** The user chose three. Outlook's File is the tab with least
behind it in Roundcube, and the alternative was a tab of entries that go nowhere.

Every message action moved into it, which means the reading pane no longer has a
toolbar and the message list toolbar no longer has any actions. That split is the
point: Outlook puts what you do *to a message* in the ribbon and leaves what
changes *how the list is drawn* on the list. The commands are bound exactly as
before — the ribbon is in the same document, so `set_button()` reaches it and the
buttons are correctly disabled before a message is picked.

`includes/ribbon.html` survives unchanged for the one case with no ribbon above
it: a message in its own window. The `toolbar` container — archive, markasjunk,
zipdownload — moved with the actions, and mail.html's hand-rendered Archive is
gone. That button only ever existed because a container cannot be rendered twice
in one document and the reading pane owned the one copy; there is now one
toolbar, so there is nothing to work around.

New Message moved out of the folder pane. Two buttons on the same command would
have been enabled and disabled together by core and read as two different things
by a user. `.bc-folders__compose` stays in the stylesheet because Contacts still
uses it — that pane gets its ribbon at the next checkpoint but one.

**Three existing selectors had to be qualified**, and each would have been a real
bug. `initTabs()`, `restoreScope()` and `syncTabs()` all queried `.bc-tabs__tab`
unqualified, and the ribbon deliberately reuses that component rather than
shipping a second tab control. Unqualified, the ribbon's tabs would have been
wired to `applyScope(null)`, pulled into Focused/Other's arrow navigation, made
`restoreScope()` report Focused/Other as present on every install — filtering the
mailbox for a control that is not there — and had `syncTabs()` clear
`aria-selected` on Home. All three now read `.bc-tabs__tab[data-bc-scope]`.

The hamburger beside the tabs collapses the folder pane by zeroing its grid
track, not by hiding the nav: `display: none` on `#layout-sidebar` would leave its
column at `--bc-folders-w` and the panes would keep a 236px gap where the pane
used to be. The splitter goes with it, because a drag handle for an absent pane
sets a width nothing reads.

One ordering trap is load-bearing and marked in both files: `_ribbon.scss` must
load **after** `_list.scss` and `_reading.scss`. `.bc-tabs--ribbon` and `.bc-tabs`
are both a single class, so they tie on specificity and source order is the only
thing deciding whose height and border win.

### D-76 · View and Help carry what Roundcube can actually do
**View**: View settings · Messages ▾ · Expand conversation · Sync │ Layout ▾ ·
Folder pane ▾ · Density ▾. Outlook's **Zoom** and **Immersive reader** have no
Roundcube equivalent and are left out rather than drawn permanently disabled.
**Help**: the `support_url` link and About. Outlook's **Tips** and **Feedback**
have nothing behind them; **Get Diagnostics** becomes About, which is the page
that actually names the versions and plugins a support request needs.

Density and the reading-pane position moved here out of the message-list toolbar.
Sort stayed: it changes the *order* of what is listed rather than how it is
drawn, and Outlook leaves its sort on the list header too. Density stopped being
§3.5's two-state toggle and became a menu, because a menu names both states
instead of asking the user to press the button to find out what the other one is.
`setDensity()` still writes `aria-pressed` where it finds it, so both shapes stay
correct without the caller knowing which is installed.

**Outlook's three-level cascade is one menu with named groups.** `Messages →
Conversations → Message list → three radios` collapses to a `Conversations`
group with two, because Roundcube's threading is one boolean and its "group by
branches within conversations" has no equivalent. The whole `Reading pane`
submenu is gone: every entry in it is about showing a conversation at once, which
Roundcube's reading pane does not do. A `role="group"` with a name gives a screen
reader the same structure without three levels to walk back out of.

Conversation grouping goes through `set_list_options()` — the same call the
reading-pane position uses, whose fourth argument is the threading flag. Neither
is a `save_pref` preference; core persists both as a side effect of reloading the
list.

**`businessclass_preview`** is new: `off | 1 | 2` snippet lines, Outlook's own
default being 1. "Off" hides the line rather than stopping the plugin — the
snippet arrives with the list either way, and a preference about how a row is
*drawn* should not change what is asked of the server.

**Sync and Expand conversation are marked `data-bc-command`.** Roundcube's
command set is not part of the skin API and differs by version and by loaded
plugins, so the skin cannot know from a template whether `checkmail` or
`expand-all` exist here. `syncRibbonCommands()` hides either one whenever core
has not registered it. Three things about it were got wrong first and fixed:

- It removed the controls. A command can be registered *late* — `expand-all` only
  appears once threading is on — so a control deleted at startup would stay gone
  until the page was reloaded. It sets `[hidden]` instead, which leaves the tab
  order and the accessibility tree in the same state removal would, and re-runs
  on every list update.
- It read the command out of the `onclick` core generates. It now reads an
  explicit `data-bc-command`, which says which buttons this is *meant* to govern
  — so a command merely absent from `rcmail.commands` at that instant cannot
  silently hide a button nobody was unsure about — and does not depend on the
  shape of core's markup.
- `tools/verify/render.mjs` emitted only `data-bc-icon` from a `roundcube:button`
  and dropped every other `data-*`. That is why the first version of this check
  appeared to pass while doing nothing, and it means **`data-bc-priority` was
  never exercised in a fixture either** — the §5 overflow order has been
  untestable since step 4. The stand-in now passes all `data-*` through, as
  `rcmail_output_html::button()` does.

`refcheck` also caught a `label()` call whose first quoted string was a ternary
operand rather than a label key. The key is resolved into a variable before the
call now; the check is right and the code was written in a shape it cannot read.

### D-77 · Contacts gets a real ribbon; Settings gets an honest one
**Contacts** consolidates three separate toolbars into one Home row: New contact
(which headed the address-book pane), Import and Advanced search (which sat on
the list head), and Edit / Email / Export / Delete plus the More popover (which
were a toolbar above the detail frame). Order follows the mail ribbon's, which
follows Outlook's — primary button, then the actions that operate on the
selection. It also gets a View tab, because it has two real things to put in one:
collapsing the address-book pane, and View settings.

None of those buttons ever belonged to the contact frame: they act on the
parent's list selection, which is why §4.5 put them outside it. The ribbon is in
that same document, so core still enables and disables them from
`contactlist_select()` with nothing rewired. The `contactmenu` container moved
whole; `groupoptions` stayed in the directory pane, so each still renders exactly
once per document.

**Settings gets two tabs, not three, and that is the honest answer.** Outlook has
no Settings ribbon at all — settings there are a dialog — so there is no
arrangement to copy, and what Roundcube actually has is one or two actions per
screen and nothing to configure about the view. A View tab would be an empty
band, which is the thing D-75 exists to avoid. It was flagged to the user when
they chose all three tasks and again when the screens turned out to hold two
buttons between them; they kept the choice, so it is built.

Its Home row changes with the screen, because the Settings task is several
top-level templates rather than one: `env:action` picks the branch, and
conditions resolve before template objects, so only one is ever rendered and no
button is emitted twice. Preferences, About and a plugin's own page have no
actions and get an empty row — deliberately, because the tab strip and the Help
tab are identical across sibling screens and chrome that appears and disappears
between them reads as a fault.

**The tab strip is written out in each of the three ribbon files rather than
shared.** A Roundcube include takes no parameters, so a shared strip would have
to carry every task's tabs and hide the wrong ones — and the `aria-controls` ids
differ per task, which is the part that cannot be made conditional cheaply.
`ui.js` needs none of this: `initRibbon()` finds `#bc-ribbonbar` and its
`.bc-tabs__tab` children and knows nothing about which task it is on.

The pane-collapse rule now zeroes all three second-column widths —
`--bc-folders-w`, `--bc-books-w`, `--bc-settings-nav-w`. Each shell names its own
track and one button collapses the pane on all of them; setting a variable a
given shell does not read costs nothing.

`tools/verify/render.mjs` takes `env:action == 'identities'` as true, so the
Settings ribbon's richest branch — primary button, divider, destructive action —
is the one that actually gets laid out in a fixture.

### D-78 · Message rows get real sender pictures; BIMI joins the chain
**USER**, 2026-08-04, reversing D-26 and answering it rather than ignoring it.
The full chain that was surveyed before choosing: local contacts → cache → BIMI →
Gravatar → Libravatar → a favicon service → scraping the sender's website for a
`<link rel=icon>`, with the first two steps ordered differently and BIMI skipped
when the domain is freemail.

**What was taken: contacts → BIMI → Gravatar → initials.** The favicon services
and the website scrape were offered and declined. They are the two steps that buy
coverage with someone else's privacy — a favicon service learns the domain of
every correspondent, and scraping means the *server* issuing HTTP to hosts an
attacker partly chooses, which needs SSRF guards to be safe at all.

**BIMI is the interesting addition, because it is the one remote source with no
privacy cost.** It is answered on the server from a DNS TXT lookup at
`default._bimi.<domain>`, and the only thing that then leaves the browser is a
request for a logo from a host the sender's own domain nominated. Note the
asymmetry with D-24, which found BIMI too expensive to *publish* — a VMC is
around $1,000/yr. *Reading* one is free, and the senders who have paid for it are
exactly the ones a user most wants to recognise on sight: banks, airlines,
couriers, retailers.

**BIMI is skipped for freemail domains.** One mark per domain means asking
gmail.com for its logo would put the same picture on every person with a Gmail
address — worse than the initials it replaced. `is_freemail()` classifies first.
The classifier deliberately does *not* pull in a public suffix list (§14): it
matches the first label against provider brands, which is what catches
`yahoo.co.uk` and `gmx.at` without listing every country, and matches whole
domains for the ordinary words — `live`, `free`, `me`, `msn` are all real first
labels of real companies. The reference implementation gets `yahoo.co.uk` wrong
for exactly this reason; its registrable domain is `co.uk`.

**Fetching stays in the browser** (chosen over a server-side proxy). Core's
`contacts/photo` action redirects and the browser follows, as it already did for
Gravatar. A proxy would hide the user's IP and cache the bytes, but needs an
outbound HTTP client, a cache directory, timeouts and image validation in PHP —
D-25 rejected exactly that trade and it has not changed.

**D-26's three objections are answered, not overruled:**
- *fifty rows, fifty lookups* — the `<img>` is `loading="lazy"`, so a row below
  the fold costs nothing until it is scrolled to.
- *repeated on every list* — `ui.js` remembers which addresses came back with no
  photo (`photoMisses`) and never asks a second time in that session.
- *no caching on the redirect* — core only sets an expiry on the answers it sends
  itself, so the hook now calls `future_expire_header(86400)` before handing back
  a URL. The 204 that stands in for "no photo" already had a day from core.

**The DNS lookup is cached, and that is not optional.** `dns_get_record()` blocks
the PHP process; a folder page could otherwise be fifty serialised queries.
Misses are cached too — most domains have no BIMI record, so that is the common
case rather than the rare one. It goes in the shared cache when the admin names a
backend (`$config['businessclass_bimi_cache'] = 'db'`), because a BIMI record is a
public fact about a domain and nothing to do with the account that received the
mail; without that it falls back to the per-user cache, which always exists.

**Three switches, split by who the decision belongs to.** `businessclass_bimi`
and `businessclass_gravatar` are admin-only, because which third parties an
installation will talk to is an operator's policy. `businessclass_avatars` is the
user's, in Settings → Preferences → User Interface, worded "Look up sender
pictures online" — not "show avatars", because the initials are avatars too and
stay either way. It is hidden when both sources are already off, so it is never a
control over nothing.

**The `l=` URL is chosen by whoever controls the sender's domain**, and core puts
it straight into a redirect. It is held to https and nothing else — which is the
BIMI spec, not a tightening of it — plus no whitespace, quotes or angle brackets,
and a 2048-character cap. What makes the rest survivable is that the result is
only ever rendered inside `<img>`, where an SVG cannot run script. The domain fed
to the resolver came off a message header and is validated as a hostname with an
alphabetic TLD before it is concatenated into a name to look up; that also rules
out a bare IPv4 address.

**To change:** `$config['businessclass_bimi'] = false` drops back to D-25's
chain. `$config['businessclass_avatars'] = false` turns the whole remote half off
and leaves address-book photos and initials working. Adding the favicon step
later means a new provider in the same place in `contact_photo()` and a fourth
switch; the website scrape should not be added without SSRF guards.
**Rejected alternative:** Libravatar, as a step after Gravatar. It is a second
outbound service for a small increment of coverage over the same address hash,
and the hook can only return one URL, so a chain where one falls through to the
other cannot be expressed here anyway.
