# BusinessClass — a Roundcube skin

A standalone Roundcube skin in the Microsoft Fluent 2 design language, built for
JetHost shared hosting and free to redistribute. Rebrandable per install through a single JSON file.

- **Target:** Roundcube **1.6.x**, PHP 7.4+/8.x, no root access required.
- **No core patching.** Everything lives in `skins/businessclass/` and `plugins/businessclass_*`.

> **Working on the skin rather than installing it?** Start at
> [docs/HANDOFF.md](docs/HANDOFF.md) — build status, the decision log, and the
> Roundcube internals this skin depends on.

---

## Install

### 1. Check the Roundcube version

Sign in to your current webmail and open **Settings → About**. It must read
**1.6.x**. The skin uses template objects and list-widget behaviour that differ
in 1.5 and earlier.

### 2. Upload three folders

Over FTP, into your Roundcube directory. The paths below assume
`public_html/rcube`, which is where the skin was developed and tested against a
Roundcube installed by hand on a typical cPanel host — adjust them if yours
lives elsewhere:

| Upload this                      | To here                                        |
| -------------------------------- | ---------------------------------------------- |
| `skins/businessclass/`           | `public_html/rcube/skins/businessclass/`           |
| `plugins/businessclass_prefs/`   | `public_html/rcube/plugins/businessclass_prefs/`   |
| `plugins/businessclass_preview/` | `public_html/rcube/plugins/businessclass_preview/` |

Nothing else from this repository belongs on the server — not `vendor/`,
`ms-handoff/`, `tools/`, `node_modules/` or `package.json`. Total upload is about
520 KB.

Upload in **binary** mode. The `.scss` sources inside `skins/businessclass/styles/`
are harmless to copy but unused at runtime; the file that matters is the
committed `styles.css` beside them.

`skins/businessclass/plugins/managesieve/` is part of the skin, not a copy of
the plugin. Roundcube looks there for a skin's replacement of a plugin's
templates, and the Filters screen fails to load without it.

### 3. Enable the plugins

Edit `public_html/rcube/config/config.inc.php`. **Back it up first.**

Find the existing `$config['plugins']` line and add both entries to it, keeping
everything already there:

```php
$config['plugins'] = ['archive', 'zipdownload', 'businessclass_prefs', 'businessclass_preview'];
```

If there is no `$config['plugins']` line at all, add one — but list the plugins
you already rely on as well, because the setting replaces the default rather
than extending it.

> `businessclass_prefs` is **required**, not optional. It publishes the branding and
> the saved pane widths into the templates, and it whitelists the skin's
> preferences — `save_pref.php` rejects any preference not on its hardcoded list
> or contributed by a plugin. `businessclass_preview` is optional; without it the
> message rows simply lose their third line of preview text.

Roundcube's own plugins are all optional and all styled — add whichever you want:
`managesieve`, `password`, `acl`, `enigma`, `help`, `markasjunk`,
`newmail_notifier`. Each needs its own configuration; see its `README` under
`plugins/`. `enigma` additionally needs the GnuPG binary on the server, and `acl`
needs an IMAP server that exposes ACLs.

### 4. Switch the skin

In the same file:

```php
$config['skin'] = 'businessclass';
```

To try it on your account only, leave the config alone and pick **BusinessClass**
under **Settings → Preferences → User Interface** instead.

### 5. Load it

Log out and back in, then hard-refresh (`Ctrl`/`Cmd` + `Shift` + `R`).

---

## What is finished, and what is not

Twelve of the fourteen build steps are done, bar the calendar. **Every screen in
the skin is now designed** — nothing is scaffolding any more. What is left is
mobile, the accessibility audit, and the calendar.

| Area | State |
| --- | --- |
| App header, icon rail, folder pane, Favorites, quota | Designed |
| The ribbon — Home / View / Help, on all three tasks | Designed |
| Message list — rows, states, collapsible date groups, preview text | Designed |
| Both densities, pane resize, reading-pane position | Designed |
| Threading, category chips, hover quick actions, Focused/Other | Designed |
| Reading pane, overflow menu, attachments | Designed |
| Compose — recipient pills, TinyMCE, attachments, drag-to-attach | Designed |
| Search — filter tokens, refine panel, cross-folder results | Designed |
| Sign-in, error page, empty states, toasts | Designed |
| Dialogs | Designed |
| Settings, folder manager, identities, responses, filters | Designed |
| Contacts — address books, list, detail, edit, import | Designed |
| Bounce, generic plugin dialogs | Designed |
| Plugin screens — PGP keys, folder sharing, password, help | Designed |
| Calendar | Not built — see below |
| Dark, high-contrast and forced-colors themes | Designed |
| Mobile and responsive | Step 13 |

So: judge everything except the calendar.

### Plugins

Because this skin is standalone (`"extends": null`), Roundcube never loads a
plugin's own stylesheet for it — so a plugin is either styled here or not styled
at all. These are:

| Plugin | What it gets |
| --- | --- |
| `managesieve` | Filters, vacation, forward — its own template overrides |
| `archive`, `markasjunk` | Buttons in the ribbon's Home tab, with icons |
| `zipdownload` | The "Download all" link under attachments, and the download-format menu |
| `newmail_notifier` | Its preference rows and Test links |
| `password` | The whole Change Password page |
| `acl` | The Sharing tab on folder properties |
| `enigma` | PGP keys in Settings, and the encryption state on a message |
| `help` | Its own entry in the app rail, with section nav and content frame |

**The calendar is not built.** `styles/_calendar.scss` is a placeholder. Which
calendar plugin to support has not been decided, and the choice changes the whole
implementation — do not enable one and expect it to look right.

Any other plugin still works: it will get the skin's form, button, table and menu
styling through the shapes Roundcube's own markup uses, and any dialog it raises
lands on a designed page. It just will not have been drawn to the design.

Three things in the design could not be built, because Roundcube does not carry
the data:

- **Message-count and size columns in the folder manager.** The folder tree
  knows names and subscription state and nothing else. Counts and size stay in
  the detail pane on the right, where Roundcube fetches them for the one
  folder you have selected.
- **A rule summary under each filter name.** managesieve parses the Sieve
  script server-side and sends the browser only the filter names, with no hook
  to publish more. Filter rows are single-line; the rule is one click away.
- **A contact count on each address book.** The directory list carries names and
  read-only state and nothing else; a count would mean one extra query per book
  on every page load, including LDAP directories where it can be slow or
  unsupported. The count for the book you are in shows under the contact list,
  from Roundcube's own counter.

Four smaller things are absent:

- **No "Move to folder"** on the ribbon. Roundcube has the command, but raising
  it needs a folder-picker popover this skin does not have, and half-building one
  was worse than leaving it out. Dragging a message onto a folder still works.
- **No "download selected messages"**. zipdownload's `.eml` / `.mbox` /
  `.maildir` menu is styled and works, but the command that raises it is not one
  of the actions the design specifies, and adding it would leave a permanently
  disabled item for every install without the plugin. The "Download all" link
  under a message's attachments is unaffected.
- **No "show source / raw headers"** button, for the same reason. The dialog it
  would open is built and styled.
- **markasjunk's alternative "Mark menu" placement has no home**, because the
  design draws no Mark menu. Leave `markasjunk_toolbar` at its default (`true`)
  and its buttons appear in the ribbon as intended.

The contact detail pane keeps Roundcube's section headings — Properties,
Personal information, Notes, Groups — where the design draws one continuous
definition list. Roundcube owns that grouping, and flattening it would leave the
notes and the group chips with no label at all, since the design labels those
from a structure Roundcube does not have.

Select menus keep the browser's own drop-down arrow rather than a Fluent
chevron. Replacing it means `appearance: none` and a wrapper element, and
managesieve shows and hides its selects with inline styles that the wrapper
would not follow — a cosmetic gain for a functional break.

---

## The ribbon

Commands live in a **ribbon** across the top of the window rather than in a
toolbar per pane — a tab strip, then one command row for the selected tab. It is
It is the Fluent 2 command-bar pattern, built to the client's brief, and it
replaced three separate toolbars on Mail and three more on Contacts.

| Tab | What is on it |
| --- | --- |
| **Home** | New Email, Delete, the plugin buttons (archive, junk, download), Reply / Reply all / Forward, mark read and unread, flag, print |
| **View** | View settings, Messages (conversation grouping and preview lines), Expand conversation, Sync, Layout, Folder pane, Density |
| **Help** | Your `support_url`, if `branding.json` sets one, and About |

Contacts has the same three; **Settings has Home and Help only**, because there
is nothing there for a View tab to configure and an empty band would be worse
than an absent one.

**Nothing on the ribbon is decoration.** Commands the reference design has that
Roundcube has no equivalent for are simply not drawn, rather than shown greyed
out — a permanently disabled control offers a user a feature their mail server
does not have. Two of them, **Sync** and **Expand conversation**, are bound to
commands whose
presence depends on your Roundcube version and which plugins you load: the skin
checks at runtime and hides either one if your install does not have it. So if a
button is missing from your ribbon that appears in these docs, that is why, and
it is deliberate.

The hamburger at the left of the tab strip collapses the folder pane. On a narrow
window the row overflows into a `⋯` menu, most-important-last.

---

## Branding

`skins/businessclass/branding.json` restyles the whole UI with no other edit:

```json
{
  "product_name": "BusinessClass",
  "vendor": "JetHost.com",
  "accent": "#0F6CBD",
  "logo": {
    "header": "images/logo.svg",
    "symbol": null,
    "rail": null,
    "rail_dark": null,
    "login": "images/logo.svg",
    "login_dark": null,
    "favicon": null,
    "print": null
  },
  "support_url": null,
  "mail_domain": null
}
```

### The logo slots

| Slot | Where | Replaces the product name? |
| --- | --- | --- |
| `header` | app header, on the accent band | **yes** — a full lockup with the name drawn in |
| `symbol` | app header, on the accent band | no — a mark, with the name beside it as live text |
| `rail` | foot of the app rail, below logout, rotated 90° | n/a |
| `rail_dark` | the same, in the dark and high-contrast themes | n/a |
| `login` | login card | n/a |
| `login_dark` | the same, in dark | n/a |
| `print` | letterhead on both print views | n/a |
| `favicon` | browser tab | n/a |

`header` and `symbol` fill the same slot and are not interchangeable: whether an
asset already carries the product name is a property of the asset, so they are
separate entries rather than one plus a flag. Set both and `symbol` wins. Set
neither and the name stands alone as text.

The `rail` logo is rotated in CSS, so supply the ordinary horizontal lockup.

**Supply `rail_dark` and `login_dark` if your logo is drawn in dark ink.** A logo
is chosen against the surface it was designed for, and in the dark theme the rail
is near-black and the login card is `#292929`. The JetHost lockup, which is navy,
measures 1.50:1 and 1.13:1 against them — not faint, gone. Give the reversed
version of your artwork here and the skin swaps to it whenever the theme resolves
dark, including when the user's theme is "System" and their OS flips overnight.

Both are optional. Leave them null and the light asset is used in every theme,
which is exactly the behaviour of an install that has never heard of them. The
skin will not invert your logo for you: `filter: invert()` on a two-colour lockup
produces a colour nobody chose, and your brand is not ours to recolour.

Set `brand_url` and it becomes a link to that address, opened in a new tab with
`rel="noopener noreferrer"` and announced as "*vendor* website". Leave it null and
the logo is a plain decorative image, not focusable. Only `http://` and `https://`
are accepted.

### Choosing a profile

Three profiles ship side by side. The active one is named in Roundcube's config,
**not** by renaming a file:

```php
// config/config.inc.php
$config['businessclass_branding'] = 'jethost';     // -> branding.jethost.json
$config['businessclass_branding'] = 'jethost-bg';  // -> branding.jethost-bg.json
```

Unset, empty, or `'default'` loads `branding.json`, the generic profile the theme
is distributed with. A profile that is named but missing falls back to
`branding.json` and says so in the Roundcube log — silently serving the wrong
brand is worse than a log line.

The setting lives outside the skin directory on purpose. Copying a preset over
`branding.json` also works, but the next deploy that ships the skin undoes it,
silently, and the install reverts to generic branding with nothing in any log.

`product_name` is the short name in the app header and the login card.
`vendor` is the attribution on **Settings → About**, which reads
"BusinessClass by *vendor*" — so the header stays short while the About page
carries the full credit. Three presets ship side by side; rename one over
`branding.json` to activate it:

| File | About reads | Logos |
| --- | --- | --- |
| `branding.json` | BusinessClass by JetHost.com | generic (free distribution default) |
| `branding.jethost.json` | BusinessClass by JetHost.com | JetHost |
| `branding.jethost-bg.json` | BusinessClass by JetHost.BG | JetHost |

`mail_domain` is the domain named under "Sign in" on the login card; leave it
null and the subtitle is omitted rather than guessed. `support_url` doubles as
the "Forgot password?" link, because Roundcube has no reset flow of its own.

The accent is validated server-side against `/^#[0-9a-f]{6}$/i` before it is
echoed into the page. Logo paths are skin-relative; anything containing `..`,
a colon or a leading slash is rejected.

**Pick any accent you like — the skin will not let it become unreadable.** From
your one hex it derives, server-side, the colour text must be on the accent band,
a readable version of the accent for links and indicators on the light surface,
and another for the dark one. A pale brand keeps its hue and is darkened until
links reach 4.5:1 rather than shipping at 1.37:1; a mid grey, where neither black
nor white would reach AA on it, is nudged off the middle so its buttons stay
legible. Your hex is used exactly as given wherever it already works, which is
almost always.

Two places deliberately do **not** take your accent. The header band in dark is a
neutral surface with your accent as a 2px rule beneath it — a band painted with
an arbitrary hex has no text colour guaranteed to be readable on it, and this is
what Fluent 2 does. And the high-contrast theme ignores the accent
entirely: it exists for people who need contrast, and an arbitrary brand colour
is the one thing that cannot promise it.

**The two JetHost presets are filled in** from the October 2025 brandbook and the
RGB logo kit: symbol, rail, login, print and favicon assets derived by
`npm run brand:assets`. They keep the design's `#0F6CBD` accent — the interface
stays Fluent 2 blue and JetHost appears in the logos (D-63). Still outstanding on both, because they
need JetHost rather than code: `support_url`, `mail_domain`, `login_background`,
and whether the six placeholder categories should be JetHost's own.

Orange `#FE6400` is confined to the logo artwork, and not all of it: the header
symbol is white, because the accent band is `#0F6CBD` and orange on that measures
1.83:1. Orange survives only on light grounds and on the navy inside the logo
itself. As an accent it was never possible — 2.98:1 on white and 2.98:1 under
white, failing AA for text both ways and missing the 3:1 bar for non-text UI,
while the accent is the header band, the link colour, the focus ring and the
unread bar at once. See [DECISIONS.md](docs/DECISIONS.md) D-55 and D-63.

---

## Avatars and the identity photo

Everywhere a person appears — every row of the message list, the account circle in
the app header, the sender in the reading pane, a contact card — the skin draws
their initials in a colour hashed from their address, so one person keeps one
colour throughout. A real picture is then laid over the top when one can be
found:

1. **The address book.** Roundcube already stores a photo per contact and already
   has an action that searches every book for the one matching an address. That
   action is what the skin points each avatar at, so a photo saved on a contact
   shows up everywhere without anything else being told about it.
2. **The sender's BIMI mark**, for a domain that stands for an organisation.
   BIMI is how a domain publishes its verified logo for mail clients to show, and
   it is a DNS lookup answered on your server — so this is the step that puts a
   real bank, airline or courier logo on the row. Skipped for freemail domains
   (gmail, yahoo, icloud, proton…), where one mark per domain would put the same
   picture on every person who happens to have an address there.
3. **Gravatar**, if neither of the above found anything.
4. **The initials**, which were there the whole time and are simply left
   showing.

The picture is layered *over* the initials rather than replacing them, so the
circle identifies the sender from the first frame and keeps doing so if the
lookup finds nothing, times out, or never comes back.

### What each step discloses

|   | Who is contacted | What they learn |
|---|---|---|
| Address book | nobody | — |
| BIMI | your server's DNS resolver, then whichever host the sender's domain nominated for its logo | that someone fetched a public logo |
| Gravatar | `gravatar.com`, from the user's browser | a SHA-256 of the address, and the browser's IP |

Nothing is ever uploaded to either. BIMI carries no identifier for the recipient
at all — the logo URL is the same one every mail client in the world fetches for
that sender.

### The switches

```php
// Admin, in config.inc.php. Both default to true.
$config['businessclass_bimi']     = false;   // stop reading BIMI records
$config['businessclass_gravatar'] = false;   // stop asking gravatar.com

// Optional: share BIMI answers across every account on the server instead of
// caching them per user. A BIMI record is a public fact about a domain, so this
// is the better setting wherever you have a cache backend configured.
$config['businessclass_bimi_cache'] = 'db';
```

Users get one switch of their own, at **Settings → Preferences → User Interface →
Look up sender pictures online**. It turns off steps 2 and 3 together and leaves
address-book photos and initials working exactly as before. It disappears if you
have already turned both sources off in config, and `dont_override` freezes it
like any other preference.

On shared hosting the Gravatar step is a disclosure you may need to make; that is
why it has always had its own switch.

### Why the message list does not flood your server

Fifty rows once meant fifty lookups, which is why list rows were initials-only
to begin with. Three things changed:

- each `<img>` is `loading="lazy"`, so rows below the fold cost nothing until
  they are scrolled to;
- an address that comes back with no photo is remembered and never asked about
  again in that session;
- the redirect now carries a day of browser cache, and BIMI's DNS answers — hits
  *and* misses — are cached server-side, so a folder page is not fifty
  serialised DNS queries.

### The identity photo

**Settings → Identities → *identity* → Photo** uploads a picture for that
identity. Roundcube's identities have no photo column and this skin does not touch
its database schema, so the picture is stored where Roundcube already keeps
pictures: on the contact whose address matches the identity, created if it does
not exist yet. That is also what makes it appear as the account circle and on the
contact card without a second copy anywhere.

Two things it deliberately is not:

- **It is not sent with your messages.** No mail standard carries a sender
  avatar that the recipient's client will display. Gravatar is looked up by the
  recipient's software and only the account holder can register a picture there;
  BIMI is one logo per domain, needs DMARC at enforcement and a paid Verified
  Mark Certificate. The photo here stays inside webmail.
- **It is not part of saving the identity.** The upload is its own request, so
  changing the picture and editing the name, address and signature cannot lose
  each other's work.

The well shows a dashed ring and initials while there is no picture, and Remove
appears only once one has actually loaded.

Because the picture is keyed on the identity's address, a few behaviours follow
from that and are worth knowing:

- **Changing an identity's address takes its photo along.** The picture is moved
  to the contact for the new address, and cleared from the old one — unless the new
  address already has a picture of its own, which is left as the more recent
  choice, or unless one contact card carries both addresses, in which case there is
  nothing to move.
- **On a new identity the field is not there yet**, because there is no address to
  attach a picture to. The form says so, and the well appears as soon as you save.
- **Deleting an identity does not delete the photo.** It belongs to an
  address-book contact, which is a record in its own right; remove it from
  Contacts, or with Remove photo before deleting the identity.
- With `identities_level = 4`, where Roundcube makes identities read-only, no photo
  control is offered.

---

## Printing

Printed pages are **monochrome**: black text on white, hairline rules, and the
brand accent kept only on links so a printed URL still reads as one. That holds
whichever theme the reader has on screen — printing from the dark theme does not
produce a dark page.

What comes off the printer:

- **A message or a contact** — subject or name, the headers, the body, the
  attachment list; none of the app around it. This is the Print button, and
  Roundcube opens it as a page of its own.
- **Ctrl+P** does the same thing whenever a single message or contact is open or
  selected, because printing the app window can only ever catch as much of a
  message as the reading pane happens to show. With nothing selected, Ctrl+P prints
  the message list as a plain table with the header, rail, folder pane and toolbars
  removed.
- **The one rough edge:** printing from the *browser menu* rather than with Ctrl+P,
  with a message open, prints one page of the reading pane. There is no way to fix
  that in a stylesheet — an iframe cannot grow to its content. Use the Print button
  or Ctrl+P.

**Letterhead.** Set `logo.print` in `branding.json` and both printed views carry it
at the top. Left null, the skin falls back to Roundcube's own
`$config['skin_logo']` — an entry like `'[print]' => '/images/letterhead.png'` — and
if neither is set, nothing is printed there and the layout closes up. It is a
separate entry from the header logo on purpose: a letterhead is usually a different
asset, and printing is the one place you may want no logo at all.

**Paper size is not forced.** `@page` sets a 14 mm margin and nothing else, so the
printer's own default is used — A4 or Letter, whichever the machine is set to.

---

## Languages

The skin has strings of its own — empty states, the pane dividers, the date
groups, the password reveal — that have no equivalent in Roundcube, so it
carries its own catalogues in `skins/businessclass/localization/`, one `.inc`
file per language. English and Bulgarian ship; the plugin's own strings are in
`plugins/businessclass_prefs/localization/` alongside.

Roundcube loads `en_US.inc` first and then the file for the account's language
over it, so a language with no file, or a key missing from one that exists,
falls back to English rather than breaking. To add a language, copy `en_US.inc`
to the Roundcube language code (`de_DE.inc`, `tr_TR.inc`, …) and translate the
right-hand side; `npm run lint:labels` will tell you what you missed. Everything
else on screen is core's or a plugin's and is already translated by them.

---

## Preferences the skin adds

| Preference | Values |
| --- | --- |
| `businessclass_theme` | `light`, `dark`, `system`, `hc` |
| `businessclass_density` | `comfortable`, `compact` |
| `businessclass_sheet` | `theme`, `light` — the surface a message body is drawn on |
| `businessclass_focused` | on / off |
| `businessclass_avatars` | on / off — whether sender pictures are looked up online at all |
| `businessclass_preview` | `off`, `1`, `2` — lines of preview text under a message row |
| `businessclass_favorites` | pinned folders, newline-separated; every name is checked against your subscribed folders server-side before it is used |
| `businessclass_folders_w` | 200–360 px, clamped server-side |
| `businessclass_list_w` | 320–520 px, clamped server-side |
| `businessclass_list_h` | 200–640 px, clamped server-side — used only where the reading pane sits below the list |

The first two, `businessclass_focused` and `businessclass_avatars`, plus
Roundcube's own reading-pane setting, are editable under **Settings ->
Preferences -> User interface -> Appearance**. Saving a change there reloads the
page, because every one of them is rendered into the document server-side. The
reading-pane position also stays where Roundcube puts it, under **Mailbox view ->
Layout**; both controls write the same setting and always agree on load.

`businessclass_sheet` has no control in Settings: it is the sun/moon button in
the reading pane, and it appears only in the dark and high-contrast themes,
where there is something to choose. See "Reading mail in dark mode" below.

`businessclass_preview` is the ribbon's **View -> Messages -> Message preview**.
`businessclass_favorites` has no control either — it is the star that appears on
a folder row when you hover it.

These were called `fluent2_*` before the skin was named. An install that ran the
earlier build keeps those rows in the database, unread; theme, density and pane
widths fall back to their defaults once and are saved under the new names as
soon as they are changed.

### Reading mail in dark mode

In the dark theme a message body is drawn on the dark surface, like the rest of
the app. That is what the major desktop clients do, and it is right for plain
text and for the ordinary mail people send each other.

It is **not** right for every message, and the reason is worth knowing. The
clients that darken a message body safely do it by rewriting the sender's CSS on
the server, inverting their colours before the mail is ever painted. This skin
cannot: a message body is untrusted and stays inside Roundcube's own sanitiser,
so all a skin can set is the surface behind it. Mail that names a text colour but no background — common
in newsletters and templated corporate mail — therefore arrives dark on dark.

The sun button beside the flag in the reading pane puts that message on paper.
The choice sticks for the messages after it, and the moon button puts it back.
The button is hidden in the light theme, where the two are the same paper, and in
the operating system's own high-contrast mode, where the OS has already taken the
decision away.

**Composing is always on white**, in every theme. What you type is what the
recipient reads, and they will almost certainly read it on white; a dark editor
invites setting a light text colour that makes the delivered mail unreadable.

---

## Development

```bash
npm install
npm run build        # styles.scss + embed.scss -> committed .css
npm run watch        # rebuild on save
npm run sprite       # regenerate the Fluent icon subset
npm run lint         # both linters
npm run lint:tokens  # fails if a hex colour appears outside _tokens.scss
npm run lint:labels  # fails on an unregistered or untranslated label
npm run verify       # the gate: build, both linters, every validator
npm run verify:theme # contrast in all three themes, across five accents
```

`npm run verify` is what has to pass before anything is called finished.

`lint:labels` exists because a broken label is invisible in testing: Roundcube
renders a missing one as its own key, which reads like content rather than like a
bug. It rejects `<roundcube:add_label name="a,b,c" />` (Roundcube registers that
as one label of that literal name and nothing splits the comma — write one tag
per label), a key `ui.js` looks up that no template registers, and any string in
`en_US.inc` that a translation is missing.

`verify:theme` is worth knowing about if you touch colour. It reads the compiled
`styles.css`, resolves `var()` and `color-mix()` in Node, and checks WCAG ratios
for around sixty token pairs in light, dark and high contrast — against **five
different admin accents**, not just the shipped one. That last part is the point:
the bugs it was written to catch were all invisible with `#0F6CBD` and severe
with something else, including a 1.82:1 header band on a navy accent. 604 checks,
about a second, no browser required.

It also writes `.verify-out/t-theme-<theme>-<accent>.html` for looking at.

Sass is the only build dependency. Icons come from
[Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons)
(MIT), subset into a single inlined SVG sprite by `tools/build-sprite.mjs`.

### Three scripts need inputs that are not in this repository

Everything they produce **is** committed, so you only need these to regenerate:

| Script                  | Needs                                                        |
| ----------------------- | ------------------------------------------------------------ |
| `npm run sprite`        | `vendor/fluent-icons/` — clone [fluentui-system-icons](https://github.com/microsoft/fluentui-system-icons) there |
| `npm run brand:assets`  | `jethost-branding/` — JetHost's brand kit, internal           |
| pixel reference         | the Fluent 2 design capture the skin was drawn from, internal |

The design capture and the brand kit are excluded deliberately, not by accident —
see [LICENSE](LICENSE). Neither is needed to build, run, test or rebrand the
skin; `npm run verify` passes without them.

---

## Contributing

Bug reports, fixes and translations are all welcome. New to Git? The short
version:

1. **Fork** this repository on GitHub — that gives you your own copy to change.
2. **Clone** your fork to your machine: `git clone <your fork's URL>`.
3. Make a branch: `git checkout -b what-im-fixing`.
4. Edit, then `git add -A` and `git commit -m "a sentence about what changed"`.
   (Unlike CVS, a commit is local — nothing has left your machine yet.)
5. `git push origin what-im-fixing`, then open a **pull request** on GitHub.
   That is the request for us to merge your branch. Review happens in the PR.

Two things to check before you open it:

- **`npm run verify` must pass.** It builds, lints and runs the whole harness in
  `tools/verify/`. It is strict on purpose — a broken label or a stray hex colour
  is invisible in a browser but obvious to the linter.
- **Commit `styles.css`.** Shared hosts have no build step, so the compiled CSS
  is part of the source tree. Edit the `.scss`, run `npm run build`, commit both.

If you are adding a colour, size, radius or shadow, it goes in
`styles/_tokens.scss` and nowhere else — `npm run lint:tokens` enforces that.
`docs/DECISIONS.md` records why the skin is built the way it is, and is usually
the fastest answer to "why is this not simply X".

---

## License

[MIT with an attribution requirement](LICENSE). Use it, change it, sell it,
install it on as many servers as you like. One condition: credit where the skin
came from —

> BusinessClass by JetHost — https://jethost.com

The skin ships that credit on its **Settings → About** screen, so a normal
install already satisfies the condition with no work from you. Rebranding the
interface is expressly allowed and is the entire point of the branding profile
mechanism; it does not remove the credit requirement.

### Trademarks

The license grants copyright, not trademark. The JetHost name and logos are
JetHost's.

The JetHost logo files under `skins/businessclass/images/` and the
`branding.jethost*.json` profiles are published as a **worked example** of a
filled-in profile — so you can see exactly what a complete branding looks like
rather than inferring it from documentation. Read them, copy their structure,
point them at your own artwork. Do not ship them as the branding of a service
that is not JetHost's.

### Not covered

Roundcube Webmail itself is [GPL v3](https://github.com/roundcube/roundcubemail)
and is a separate work. The Fluent icons are Microsoft's, MIT licensed. "Fluent
2" is a Microsoft design language — this skin follows it, contains no Microsoft
product branding, and is not a Microsoft product or affiliated with Microsoft.

---

## Troubleshooting

**"Error loading template for …"** — a template did not upload. Compare
`skins/businessclass/templates/` against the repository; there should be 25 `.html`
files plus an `includes/` folder. If the message names a managesieve template,
the missing folder is `skins/businessclass/plugins/managesieve/templates/`.

**"Not Found … /skins/businessclass/watermark.html" inside a pane** —
`watermark.html` did not upload. It sits in the skin's root folder, beside
`meta.json`. Roundcube points every detail pane at it before anything is
selected (`blankpage_url` in `config/defaults.inc.php`), so without it each of
the Settings screens opens on the web server's 404 page.

**The three panes are stacked or the page has no layout** — `businessclass_prefs` is
not enabled, or the plugin folder did not upload. Check
`public_html/rcube/plugins/businessclass_prefs/businessclass_prefs.php` exists and that the
plugin is named in `$config['plugins']`.

**Something on screen reads `bc_noresults` or `bc_resultsin`** — the skin's
`localization/` folder did not upload, or the file for that language is missing a
key. Roundcube prints a label it cannot find as its own name. Run
`npm run lint:labels` against the repository to tell the two apart: if it passes,
the problem is the upload.

**Icons are missing but text is fine** — `templates/includes/sprite.html` did not
upload. It is generated, so regenerate with `npm run sprite` if it is absent
locally too.

**No styling at all** — `skins/businessclass/styles/styles.css` did not upload, or the
web server denies it. It must be world-readable (644).

**Preview text does not appear** — expected unless `businessclass_preview` is enabled.
It is also normal for the first page load of a folder: snippets are fetched once
per message and cached for 30 days, capped at 60 new fetches per request.
