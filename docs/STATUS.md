# Status — what is built and what is left

Last updated: **2026-08-03** — the ribbon pass: a command bar across all three
tasks, a restyled message list, Favorites, and two new preferences. Step 12's themes and contrast gate hold throughout. The
calendar half of step 11 stays deferred.

## The 14 steps (`ms-handoff/BUILD.md` §12)

| # | Step | State |
| --- | --- | --- |
| 1 | Skin scaffold — `meta.json`, `branding.json`, tokens, reset, Sass script | **Done** |
| 2 | Header + rail + folder pane | **Done** |
| 3 | Message list — comfortable density, states, date groups | **Done** |
| 4 | Reading pane + ribbon toolbar + overflow popover | **Done** (the toolbar later moved into the app-wide ribbon — D-75) |
| 5 | Compact density + density toggle + pane resize + persistence | **Done** |
| 6 | Threading, categories, hover quick actions, Focused/Other | **Done** |
| 7 | Compose (+ TinyMCE, attachments) | **Done** |
| 8 | Login and all error/empty states | **Done** |
| 9 | Settings, folder manager, identities, managesieve | **Done** |
| 10 | Contacts | **Done** |
| 11 | Calendar and remaining plugins | **Done except the calendar** |
| 12 | Dark + high contrast + forced-colors | **Done** |
| 13 | Responsive/mobile incl. swipe + FAB + bottom tabs | **Next** |
| 14 | Accessibility audit (§9), then icon subset finalisation | Not started |

Plus three unnumbered additions made at the user's request, each signed off:
**avatar photos and the identity photo**, **printing** — which §12 never owned
(DECISIONS.md D-19, now closed) — and the **ribbon pass** after step 12, which is
the largest of the three and has a section of its own below.

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

---

## Step 12 — what was built

The three themes existed before this step; what they did not do was *hold*. The
accent was written as `--bc-brand-primary` in an inline style on `<html>`, which
outranks every stylesheet, so it was the one token no theme could restate.
Measured on the real stylesheet:

| Theme | Accent | Header band vs. its text |
| --- | --- | --- |
| Dark | `#0F6CBD` | 3.90:1 |
| Dark | navy `#253082` | 1.82:1 |
| High contrast | either | 3.90:1 / 1.82:1 |

D-58 had recorded the dark half. The high-contrast half was new and worse: the
theme that exists for people who need contrast never got its black band at all.

| | |
| --- | --- |
| **The accent** | Now five inline properties — the raw hex plus four derivations computed server-side, because each is a contrast measurement and CSS cannot measure. Themes derive from those and can override any of it (D-66). |
| **`--bc-brand-primary` vs `--bc-brand-fg`** | Fills that carry on-brand text, versus anything that must be *seen*. 33 declarations moved. A pale accent is a fine fill and an unreadable link. |
| **Dark** | The header band is a neutral with the brand as a 2px rule under it, which is what Fluent 2 does and the only shape readable for *every* accent. The brand ramp is derived from the admin's accent instead of Microsoft's hard-coded `#479EF5`. Avatars inverted; tints re-derived. |
| **High contrast** | Now actually applies. Black band, white rule, cyan accent, and `--bc-fg-on-tint` so the yellow selected row stops being white-on-yellow at 1.07:1 (D-70). |
| **forced-colors** | Rewritten in `_contrast.scss`. The old block's one rule was `* { forced-color-adjust: auto }`, which is the default and did nothing (D-71). |
| **`color-scheme`** | Declared for the first time. Without it the browser paints scrollbars, `<select>` drop-downs and date pickers light-on-white inside a dark app, and no stylesheet can reach them. |
| **Logos in dark** | `logo.rail_dark` / `logo.login_dark` in `branding.json`, optional and falling back to the light asset. The JetHost lockups measured 1.50:1 and 1.13:1 on their dark surfaces — gone, not faint (D-67). |
| **The message body** | Follows the theme by default with a sun/moon toggle to paper, persisted. The record of what that default costs us is D-68. |
| **The compose editor** | Stays white in every theme, structurally rather than by convention (D-69). |

### The gate

`npm run verify:theme` — `tools/verify/themecheck.mjs`, now part of
`npm run verify`. It resolves the token graph in Node and computes WCAG ratios
for 60-odd pairs across three themes and **five accents**: 604 checks in about a
second, no browser.

Sweeping accents is the whole point — every bug in this step was invisible with
the shipped `#0F6CBD`. It also asserts what arithmetic cannot: that high contrast
never reads the accent, that `color-scheme` is declared, that the forced-colors
block uses real system colours, that `embed.css` cannot darken, and that the PHP
luminance pivot still matches the one the tool assumes (D-72).

Fixtures for the eye are written to `.verify-out/t-theme-<theme>-<accent>.html`.

---

## The ribbon pass — what was built (after step 12)

The client supplied screenshots of a commercial webmail client and asked the skin
to match its chrome and layout. **`BUILD.md` §1 rules that out** — *"an original
mail UI in the Fluent 2 language, not a clone of Microsoft's product UI"* — so the
conflict was put to them with the line quoted and they chose to override it, for
chrome and layout only. **§10 was not overridden and is not in question**: no
Microsoft logos, illustrations or icon webfont, and every glyph still comes from
the MIT Fluent set. The full record, including what was referenced and why, is
DECISIONS.md D-73 to D-77.

Anything in the reference design that Roundcube has no data behind is
**omitted, not drawn disabled** — a permanently disabled control offers a user a
feature their mail server does not have.

| | |
| --- | --- |
| **The ribbon** | Two rows spanning the window: a tab strip and one command row per tab. Mail gets Home / View / Help, Contacts the same, Settings **Home / Help only** — there is nothing on a Settings screen for a View tab to configure, and an empty band is worse than an absent one. |
| **Message list** | Subject in the accent, date beside the subject rather than the sender, selection as a 2px outline instead of a tint fill, collapsible date group headings. |
| **Favorites** | A real preference (`businessclass_favorites`), seeded Inbox/Drafts/Sent, pinned from a star on folder-row hover. The folder tree also gained a collapsible account heading. |
| **Preview lines** | `businessclass_preview` — off / 1 / 2 — in the View tab. |
| **What moved** | New Message left the folder pane; every message action left the reading pane; density and the reading-pane position left the list toolbar; Contacts' three toolbars became one. |

**The skin now checks Roundcube's command set at runtime.** Sync and Expand
conversation carry `data-bc-command`; `syncRibbonCommands()` hides either one
whenever core has not registered it, re-checked on every list update because
`expand-all` only appears once threading is on. Roundcube's command set is not
part of the skin API and differs by version and by loaded plugins, so this is the
only honest way to keep a dead control off the row.

**A gap in the verification harness was found and closed.** `render.mjs`'s
`roundcube:button` stand-in emitted only `data-bc-icon` and dropped every other
`data-*`. That is why the first version of the command check appeared to pass
while doing nothing — and it means **`data-bc-priority` had never been exercised
in a fixture, so the §5 overflow order has been untested since step 4**. The
stand-in now passes all `data-*` through.

**Still to do here:** Move to folder is not on the ribbon. Roundcube has the
command but no folder-picker popover exists in this skin yet,
and half-building one was worse than leaving it out. Drag-to-folder still works.

## What exists, by area

### Shell and chrome
- App header, icon rail, folder pane, quota bar, category ("Labels") list.
- Three-pane shell as a **flex column on `body.task-*`**, not a grid — see
  DECISIONS.md D-14, this one matters.
- Pane resize on both dividers, persisted per user, clamped server-side.
- `watermark.html` at the skin root. Without it every detail pane shows the web
  server's 404 page.

### Mail
- **The ribbon** — Home / View / Help spanning the whole window, carrying every
  message action. Home also holds the plugin `toolbar` container.
- Message list: both densities, row states, collapsible date groups, category
  chips, hover quick actions, threading, Focused/Other, and one to two lines of
  preview text (needs `businessclass_preview`; the line count is a preference).
- Reading pane: sender block with avatar, attachments, flag toggle, print and
  part views. **No toolbar of its own** — the actions are in the ribbon.
- Folder pane: collapsible Favorites and account groups, no compose button.
- Compose: recipient pills, TinyMCE, attachments with a determinate progress bar,
  drag-to-attach, draft-saved timestamp.
- Search: filter token chips, refine panel, cross-folder scopes, results summary.

### Settings
- Preferences, folder manager, identities, canned responses, managesieve filters
  (via the skin's own template override), About.
- The **Appearance** block — theme, density, reading pane, Focused/Other — is
  contributed by `businessclass_prefs` into Settings → Preferences → User
  Interface. Density and the reading-pane position are also in the ribbon's View
  tab, and both controls write the same preference.
- Every Settings screen carries the ribbon, with two tabs rather than three.
- **Identity photo** well on each identity (see below).

### Contacts
- Address books 200 / contact list 300 / detail, all on core's own objects.
- Contact detail, edit, print, import, advanced search — all in the ribbon now,
  which replaced three separate toolbars.
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
- **No "Move to folder" on the ribbon.** Roundcube has the command, but raising
  it needs a folder-picker popover this skin does not have,
  and half-building one was worse than leaving it out. Drag-to-folder still works.
- **No "download selected messages" trigger.** zipdownload's `.eml`/`.mbox`/
  `.maildir` menu is styled and works, but the `download` command that raises it
  is not one the design enumerates. Adding it would put a permanently disabled
  item in the More menu of every install that does not run zipdownload. The
  attachment "Download all" link is unaffected and works.
- **No raw-message-headers affordance.** Core's `show-headers` needs
  `all_headers_row` / `all_headers_box` gui objects, which this skin does not
  render, and `BUILD.md` §5 does not list it. The dialog host it would open is
  built and styled; only the trigger is absent.
- **markasjunk's `markmenu` container has no home**, because the design draws no
  Mark menu. `markasjunk_toolbar` defaults to true, so the toolbar path — which
  the ribbon renders through its `toolbar` container — is the one installs take.

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
