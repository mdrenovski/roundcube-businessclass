# Status — what is built and what is left

Last updated: **2026-07-30** — step 11 built: the remaining plugin screens, and
`_scaffold.scss` deleted. The calendar half of step 11 stays deferred.

## The 14 steps (`ms-handoff/BUILD.md` §12)

| # | Step | State |
| --- | --- | --- |
| 1 | Skin scaffold — `meta.json`, `branding.json`, tokens, reset, Sass script | **Done** |
| 2 | Header + rail + folder pane | **Done** |
| 3 | Message list — comfortable density, states, date groups | **Done** |
| 4 | Reading pane + ribbon toolbar + overflow popover | **Done** |
| 5 | Compact density + density toggle + pane resize + persistence | **Done** |
| 6 | Threading, categories, hover quick actions, Focused/Other | **Done** |
| 7 | Compose (+ TinyMCE, attachments) | **Done** |
| 8 | Login and all error/empty states | **Done** |
| 9 | Settings, folder manager, identities, managesieve | **Done** |
| 10 | Contacts | **Done** |
| 11 | Calendar and remaining plugins | **Done except the calendar** |
| 12 | Dark + high contrast + forced-colors | **Next** |
| 13 | Responsive/mobile incl. swipe + FAB + bottom tabs | Not started |
| 14 | Accessibility audit (§9), then icon subset finalisation | Not started |

Plus two unnumbered additions made at the user's request after step 10, both signed
off: **avatar photos and the identity photo**, and **printing** — which §12 never
owned (DECISIONS.md D-19, now closed).

Everything a user touches day to day is real design work. **Nothing in the skin is
scaffolding any more** — `_scaffold.scss` was deleted at step 11, and no template
references it (guarded by `npm run verify:plugins`).

---

## Step 11 — what was built, and what is still out

The user chose which plugins to design for: **enigma, acl, password and help**, on
top of the four `BUILD.md` §1.6 already commits to. All of it is styled in
`styles/_plugins.scss` (DECISIONS.md D-47) — no per-plugin CSS files.

| | |
| --- | --- |
| **Bounce** | Real. It was **broken**: the form rendered no recipient fields at all (D-49). |
| **Generic dialog host** | Real. `dialog.html` now honours `env:dialog_class`, which is how core's raw-header viewer asks for its monospace treatment. |
| **`.popupmenu`** | Core positions these but styles nothing, and there is no parent skin to inherit from — so every plugin menu sat open and unstyled (D-48). |
| **acl** (folder sharing) | Rights table, add/edit form, advanced toggle. Not Elastic's Actions menu, which could never open here (D-51). |
| **enigma** | Keys list, key info, key generation, file import, keyserver search, plus the encryption state on a message and the compose options menu. |
| **help** | Section nav + content frame, and a rail icon for its task. |
| **password** | Its own page furniture undone so it stops duplicating the page title (D-53). |
| **zipdownload / archive / markasjunk / newmail_notifier** | Toolbar buttons, the download menu, the "Download all" attachment link, the notifier's Test links. |

**The calendar is still out.** `styles/_calendar.scss` is a 9-line TODO stub and
`BUILD.md` §4.6 is unbuilt. The user deferred the decision to the end of the build
and confirmed it again at step 11. Which calendar plugin (Kolab's `calendar`, or a
`libcalendaring`-based alternative) has never been settled and changes every
template name and CSS hook in that step. **Ask before starting it.**

Still stubs: `_calendar.scss` (the deferred step 11 half) and `_responsive.scss`
(step 13).

## What exists, by area

### Shell and chrome
- App header, icon rail, folder pane, quota bar, category ("Labels") list.
- Three-pane shell as a **flex column on `body.task-*`**, not a grid — see
  DECISIONS.md D-14, this one matters.
- Pane resize on both dividers, persisted per user, clamped server-side.
- `watermark.html` at the skin root. Without it every detail pane shows the web
  server's 404 page.

### Mail
- Message list: both densities, row states, date groups, category chips, hover
  quick actions, threading, Focused/Other, third line of preview text (needs
  `businessclass_preview`).
- Reading pane: sender block with avatar, ribbon toolbar with overflow popover,
  attachments, flag toggle, print and part views.
- Compose: recipient pills, TinyMCE, attachments with a determinate progress bar,
  drag-to-attach, draft-saved timestamp.
- Search: filter token chips, refine panel, cross-folder scopes, results summary.

### Settings
- Preferences, folder manager, identities, canned responses, managesieve filters
  (via the skin's own template override), About.
- The **Appearance** block — theme, density, reading pane, Focused/Other — is
  contributed by `businessclass_prefs` into Settings → Preferences → User
  Interface.
- **Identity photo** well on each identity (see below).

### Contacts
- Address books 200 / contact list 300 / detail, all on core's own objects.
- Contact detail, edit, print, import, advanced search.
- Group membership as toggling chips.

### Avatars and photos (added after step 10)
- Initials in a palette colour hashed from the address, everywhere a person
  appears; one person keeps one colour throughout.
- A real photo laid *over* the initials when one is found: address book →
  Gravatar → initials. Address-book lookup is core's own `contacts/photo` action;
  the Gravatar step is `businessclass_prefs::contact_photo`, switchable with
  `$config['businessclass_gravatar']`, on by default.
- Identity photo upload, stored on the contact whose address matches the
  identity, because Roundcube identities have no photo column. Changing that
  address moves the picture with it (DECISIONS.md D-39); deleting the identity
  deliberately leaves it (D-40).
- **Deliberately nothing outbound to recipients** — no signature image, no BIMI.
  See DECISIONS.md D-24.

### Plugin screens (step 11)
- **enigma**: PGP keys as a Settings section — list, key details, key generation,
  import from file, keyserver search — plus the signature/decryption box on a
  message and the encryption options menu in compose.
- **acl**: a Sharing tab on folder properties, with the rights grid, the add/edit
  dialog and the simple/advanced toggle.
- **help**: its own task in the rail, a section nav and a content frame.
- **password**: hosted by `templates/plugin.html`, with the plugin's duplicate page
  title and nested scroller undone.
- **Bounce** and the **generic dialog host**, the last two screens that were
  scaffolding.
- `.popupmenu`, which core positions but never styles — without it every
  plugin-raised menu sits open at the foot of the page.

### Printing (added after step 10)
- Monochrome, accent on links only, whatever theme the reader had on screen
  (DECISIONS.md D-42).
- Letterhead on both print views from `branding.json`'s `logo.print`, falling back
  to core's `$config['skin_logo']` (D-43).
- Ctrl+P routed to Roundcube's own print view when there is a single message or
  contact; otherwise the browser prints and the chrome comes off (D-44).
- Fixed on the way: a `/styles/print.css` link to a file that never existed, and
  the whole app header rendering onto printed pages (D-45).
- Measured by `npm run verify:print` plus `--print-to-pdf`; the PDFs were
  rasterised and looked at.

### Localization
- `skins/businessclass/localization/` — `en_US.inc`, `bg_BG.inc`.
- `plugins/businessclass_prefs/localization/` — `en_US.inc`, `bg_BG.inc`.
- Guarded by `npm run lint:labels`.

---

## By the numbers

| | |
| --- | --- |
| Templates | 25 + 8 includes + 14 plugin overrides (6 managesieve, 5 enigma, 2 help, 1 acl) |
| Sass partials | 21 (2 still TODO stubs: calendar, responsive) |
| `ui.js` | ~3970 lines, single IIFE, modules commented with their `BUILD.md` § |
| `businessclass_prefs.php` | ~1070 lines |
| Sprite | 96 symbols; 68 referenced |
| Skin labels | 91 `bc_*` keys, 79 registered client-side |
| Preferences added | 6 (see `README.md`) |

---

## Known gaps that are not bugs

Documented in `README.md` for installers; repeated here so nobody "fixes" them:

- **No message-count or size columns in the folder manager.** The folder tree
  carries names and subscription state only.
- **No rule summary under each filter name.** managesieve parses the Sieve script
  server-side and publishes only names, with no hook to add more.
- **No contact count per address book.** Would be one query per book on every
  page load, including LDAP. The user chose to omit it.
- **Select menus keep the browser's own drop-down arrow.** Replacing it needs
  `appearance: none` plus a wrapper, and managesieve shows/hides its selects with
  inline styles the wrapper would not follow.
- **The contact detail pane keeps Roundcube's section headings** (Properties,
  Personal information, Notes, Groups) where the design draws one flat list.
- **No "download selected messages" trigger.** zipdownload's `.eml`/`.mbox`/
  `.maildir` menu is styled and works, but it is raised from a `download` command
  in the *list* toolbar, and `BUILD.md` §5 enumerates that toolbar without one.
  Adding it would put a permanently disabled item in the More menu of every
  install that does not run zipdownload. The attachment "Download all" link is
  unaffected and works.
- **No raw-message-headers affordance.** Core's `show-headers` needs
  `all_headers_row` / `all_headers_box` gui objects, which this skin does not
  render, and `BUILD.md` §5 does not list it in the reading-pane toolbar. The
  dialog host it would open is built and styled; only the trigger is absent.
- **markasjunk's `markmenu` container has no home**, because the design draws no
  Mark menu. `markasjunk_toolbar` defaults to true, so the toolbar path — which
  this skin does render — is the one installs take.

---

## JetHost branding (outside the §12 step list)

Applied from the October 2025 brandbook (English and Bulgarian) and the RGB logo
kit, delivered as `jethost-branding/`. See DECISIONS.md D-55 to D-58.

**Done.** Both JetHost presets keep the design's `#0F6CBD` accent (D-63 — the
client chose to brand through the logos and leave the interface Fluent blue);
assets derived
from the kit by `tools/build-brand-assets.mjs` — header (reversed lockup, no
backdrop), login (positive lockup), print (the kit's paper variant) and a favicon
reconstructed from the symbol, since the kit ships no symbol-only file. Orange is
confined to the logo artwork. Inter was offered and declined: the Fluent 2 font
stack is unchanged.

**Header and rail layout (client-directed, D-59/D-60).** The header carries the
symbol beside the product name in live text; the full lockup sits at the foot of
the rail below logout, rotated 90deg to read bottom-to-top. `branding.json` grew
two slots for this: `logo.symbol` (a mark, accompanies the name) alongside
`logo.header` (a lockup, replaces it), and `logo.rail`.

The header symbol is white, not orange: the band is the accent, and orange on
`#0F6CBD` measures 1.83:1 against white's 5.38:1.

Measured in Chrome against the real stylesheet: header symbol `25.8x20` with an
8px gap to the name and their tops aligned; rail
logo `24x152` sitting at x `24.5-48.5` inside a rail spanning `13-61`; login
`200x31.6`; print letterhead `202.4x32`; favicon legible at 16/32/64. The
unrotated `logo-jethost-header.svg` is still generated and still valid for the
`header` slot, but no shipped profile points at it.

`verify:refs` now gates the branding assets — see D-61.

**Activation (D-62).** The profile is named in Roundcube's config, not by
renaming a file:

```php
$config['businessclass_branding'] = 'jethost';
```

Unset or `'default'` keeps the generic `branding.json`. `verify:branding` covers
the selection and the path guard on the profile name.

**Known gap, deliberate — dark mode.** The header band keeps the accent in dark
mode (the inline style on `<html>` outranks the theme rule) while `--bc-on-brand`
flips to black, giving **1.82:1** on Navy. Structural and pre-existing — any dark
accent does it — and fixed in step 12, where the dark brand ramp is built.

**Still needs the client.** `support_url`, `mail_domain`, `login_background`, and
whether the six placeholder categories should be JetHost's own.
