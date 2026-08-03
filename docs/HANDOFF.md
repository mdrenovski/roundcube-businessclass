# Handoff — read this first

This is the working brief for anyone (person or agent) picking up the
**BusinessClass** Roundcube skin. It says how the project is run, what the rules
are, and where everything lives. The other three documents beside it:

| File | What it answers |
| --- | --- |
| [STATUS.md](STATUS.md) | What is built, what is left, step by step |
| [DECISIONS.md](DECISIONS.md) | Every decision made and what it would cost to change |
| [ROUNDCUBE-NOTES.md](ROUNDCUBE-NOTES.md) | Core internals learned the hard way, and the bugs they caused |

The **design contract** is `ms-handoff/BUILD.md` and the visual reference is
`Roundcube Fluent 2 Theme.dc.html` at the repo root. Neither is generated — they
are the input. `README.md` is the document for whoever *installs* the skin; these
four are for whoever *builds* it.

> **This repository is public** (MIT with attribution — see [LICENSE](../LICENSE)).
> The design capture and `jethost-branding/` are in `.gitignore` and exist only on
> the build machine, so a fresh clone has neither. Both are still described below,
> because this document is for whoever builds the skin and they are part of how it
> was built. Nothing in the build, test or rebrand path needs them.

---

## The project in one paragraph

Metodi (JetHost) wants a custom Roundcube skin to install across their
hosting fleet for their clients to use. **That skin is BusinessClass** — a
standalone Roundcube 1.6.x skin in the Microsoft Fluent 2 design language, built
from `ms-handoff/BUILD.md` plus the design HTML, rebrandable per install through
one JSON file, and free to redistribute. It ships on JetHost's own servers, so
"works on shared hosting with no root and no build step" is a hard requirement,
not a nicety.

---

## Rules of engagement

These come from the user directly and have held for the whole project.

1. **Do not assume anything — ask about what is unknown.** Verbatim instruction,
   still in force. When the design file and `BUILD.md` disagree, ask; do not
   guess (`BUILD.md` line 16 says the same).
2. **Checkpoint at every step.** `BUILD.md` §12 lists 14 build steps. Build one,
   report what was built and what was decided, wait for sign-off, then continue.
   "Execute next step" is the usual go-ahead.
3. **No core patching.** Everything lives in `skins/businessclass/` and
   `plugins/businessclass_*`. Never edit `program/` or a plugin's own source —
   override its templates and CSS from the skin instead (`BUILD.md` §1.1).
4. **No literal colours outside `_tokens.scss`.** Enforced by
   `npm run lint:tokens` (`BUILD.md` §1.7, §13) — including inside comments,
   which is how it should be read: a hex in a comment goes stale silently.
5. **Ask before adding any dependency** beyond Sass and the Fluent icon SVGs
   (`BUILD.md` §14).
6. **No Microsoft product logos or illustrations, and no icon webfont**
   (`BUILD.md` §10).
7. **Verify before reporting.** Claims about layout and behaviour are measured,
   not eyeballed — see the harness below. Four real defects in step 10 alone were
   found this way and would not have been found by reading the code.

### Security invariants — do not regress these

| Invariant | Where |
| --- | --- |
| The admin accent hex is validated `/^#[0-9a-f]{6}$/i` server-side before it is echoed | `businessclass_prefs::sanitize_accent` |
| The accent is **raw input**: `--bc-accent` is never painted with directly, so a theme can always restate it. High contrast in particular must never read it | `_tokens.scss`, asserted by `verify:theme` |
| Asset paths from `branding.json` reject `..`, any `:`, and a leading `/` | `businessclass_prefs::sanitize_asset` |
| HTML message bodies stay inside Roundcube's sanitiser; only minimal typographic CSS is injected | `BUILD.md` §3.6, `styles/embed.scss` |
| Search tokens are IMAP-quoted and CR/LF-stripped client-side before entering `_filter`, which goes raw into IMAP SEARCH | `ui.js` `imapQuote` |
| Theme, density and layout posted from the Appearance block are re-validated server-side; `dont_override` is honoured on render *and* save | `businessclass_prefs::preferences_save` |
| **The Favorites list is untrusted.** `save_pref.php` checks only that a pref name is whitelisted and then writes whatever the browser sent — there is no hook in between. So every folder name is checked on the way *out*, and only survives if the user is subscribed to a folder by that name; the list is capped so a crafted pref cannot render ten thousand rows | `businessclass_prefs::sanitize_favorites` |
| The preview-lines pref reaches the page as a class name and is whitelisted `off \| 1 \| 2`, like theme, density and sheet | `businessclass_prefs::sanitize_preview` |
| An uploaded identity photo is type-checked with `rcube_image` (the real format, not the filename or the browser's content type) and scaled to `contact_photo_size` | `businessclass_prefs::photo_upload` |

---

## Repository map

```
ms-handoff/BUILD.md              the contract — 14 steps, all the §refs in the code comments
Roundcube Fluent 2 Theme.dc.html the design. NOT committed (gitignored)
LICENSE                          MIT + attribution; also what is excluded and why
README.md                        install + admin documentation
docs/                            this handoff set
vendor/roundcube/                Roundcube 1.6.17 source, for reading. NOT deployed.
vendor/fluent-icons/             Fluent UI System Icons (MIT), source for the sprite
tools/build-sprite.mjs           subsets the icons into one inline SVG sprite
tools/build-brand-assets.mjs     trims the JetHost logo kit into the four shipped assets
jethost-branding/                the kit as delivered — brandbooks (EN/BG) + RGB logos.
                                 NOT committed (gitignored). The six derived SVGs under
                                 skins/businessclass/images/ ARE, as a worked example.
tools/lint-labels.mjs            localization guard
tools/verify/                    the offline verification harness
skins/businessclass/
  meta.json                      "extends": null — standalone. "localization": true.
  branding.json                  + branding.jethost.json, branding.jethost-bg.json
  watermark.html                 blankpage_url target — every detail pane 404s without it
  ui.js                          ~3750 lines, one IIFE, module comments keyed to BUILD.md §
  styles/                        23 .scss + the committed styles.css and embed.css
                                 _contrast.scss is high contrast + forced-colors,
                                 loaded after every component because that is what
                                 it overrides
  templates/                     25 templates + 8 includes
  templates/includes/sprite.html generated; inlined into every page
  plugins/<id>/templates/        template overrides: managesieve, acl, enigma, help
                                 (a plugin's own skins/elastic/* is never loaded —
                                  see ROUNDCUBE-NOTES.md, "Plugins, from a
                                  standalone skin")
  localization/                  en_US.inc, bg_BG.inc
plugins/businessclass_prefs/     REQUIRED. env, prefs, pin, avatars, identity photo
plugins/businessclass_preview/   optional. third line of preview text in the message list
```

**`styles.css` is committed on purpose.** Hosts have no build step (`BUILD.md`
§2). Always `npm run build` before reporting anything finished, or the change
exists only in the `.scss`.

---

## Commands

```bash
npm install
npm run build          # .scss -> the committed .css. Never skip this.
npm run watch
npm run sprite         # regenerate the icon subset (96 symbols currently)
npm run brand:assets   # re-derive the JetHost logos + favicon from jethost-branding/
npm run verify:branding # profile selection + the path guard on the profile name
npm run verify:theme   # contrast in every theme, swept across five accents
npm run verify         # build + both linters + all five validators + syntax checks
```

`npm run verify` is the gate. It runs:

| | What it proves |
| --- | --- |
| `lint:tokens` | no hex colour outside `_tokens.scss` |
| `lint:labels` | no comma-list `add_label`, no unregistered key, no untranslated string |
| `verify:templates` | every template parses under Roundcube's *own* `parse_xml` regex and `html::parse_attrib_string` |
| `verify:refs` | every icon, label, object and include a template names actually exists |
| `verify:prefs` | the Appearance block renders, saves, sanitises and honours `dont_override` |
| `verify:idphoto` | the photo well's three states, decided by core's *own* `parse_conditions`; and that the photo follows an identity's address without ever being lost, duplicated or overwritten |
| `verify:theme` | every token pair meets §9 in light, dark and high contrast, for five different admin accents; plus the structural claims arithmetic cannot make — see below |
| `verify:print` | `styles.css` really has a `@media print` block and an `@page`, and builds the print fixtures below |
| `verify:plugins` | `_scaffold.scss` is gone and nothing reaches for its classes, and builds the ten plugin-screen fixtures below |
| `node --check`, `php -l` | syntax |

`verify:idphoto` is worth reading if you touch anything in this area: it stubs
address books that record every write, so its assertions are about what was written
rather than about what the code looks like.

`verify:theme` is the other one worth reading. It does not use a browser: it
resolves the token graph out of the compiled `styles.css` — following `var()` and
computing `color-mix()` itself — and does WCAG arithmetic on it. That is what
makes it cheap enough to sweep **five accents**, which is the point. Every bug
step 12 fixed was invisible with the shipped `#0F6CBD` and severe with a navy or
a pale one: a 1.82:1 header band, a 1.37:1 link, a 3.95:1 primary button. A gate
that only checked the shipped accent would have passed all three.

---

## The verification harness

`npm run verify` catches structural mistakes. It cannot catch "the button is
312px wide and covering the field". For that, `tools/verify/` renders a real
template, wraps it in a stubbed `rcmail`, loads **the skin's real `ui.js`**, and
measures the result in headless Chrome.

```bash
# 1. render one template to plain HTML with stand-in object output
node tools/verify/render.mjs mail  /tmp/t-mail.html          # [--framed]
node tools/verify/render.mjs addressbook /tmp/t-ab.html

# 2. optionally drive the real ui.js against it
node tools/verify/withjs.mjs /tmp/t-ab.html /tmp/t-ab-js.html addressbook list

# 3. measure
chrome --headless=new --disable-gpu --window-size=1400,821 \
       --virtual-time-budget=3000 --dump-dom file:///tmp/t-ab-js.html \
  | grep -o 'PROBE[^<]*'
```

Each page writes its assertions into `document.title`, so one line of
`--dump-dom` output carries the whole result. `--screenshot=` works too and is
how the panes were compared against the mockup.

`tools/verify/probe-fixes.mjs` is the same idea, self-contained, covering login /
mail / identity-photo. It needs **HTTP, not `file://`**, because the avatar
`<img>` has to genuinely load for its assertions to mean anything:

```bash
node tools/verify/probe-fixes.mjs . .verify-out
(cd .verify-out && python3 -m http.server 8799 &)
chrome --headless=new --dump-dom http://127.0.0.1:8799/x-identity.html \
  | grep -o '<title>[^<]*'
```

### Print

Chrome cannot be put into print media from the command line without driving the
DevTools protocol, so this comes in two halves — an emulation that can be measured,
and a real print that can be looked at:

```bash
npm run verify:print          # writes p-*.html (print media rewritten to screen)
                              #    and r-*.html (the untouched stylesheet)

# measured: selectors match, specificity wins, the right pane is chosen
chrome --headless=new --window-size=794,1123 --dump-dom \
       file://$PWD/.verify-out/p-app.html | grep -o '<title>[^<]*'

# real: Chrome's own print media, @page, pagination — then look at it
chrome --headless=new --no-pdf-header-footer \
       --print-to-pdf=$PWD/.verify-out/out.pdf \
       file://$PWD/.verify-out/r-message.html
sips -s format png -Z 1000 .verify-out/out.pdf --out .verify-out/out.png
```

`p-*` pages set `data-bc-theme="dark"` deliberately: "print is monochrome whatever
the reader had on screen" is the one claim here that cannot be checked by reading.

### Plugin screens

```bash
npm run verify:plugins        # writes g-bounce, g-dialog, g-acl, g-keys, g-keyinfo,
                              #   g-keycreate, g-keyimport, g-menus, g-help,
                              #   g-helpcontent

# bounce and the import dialogs are measured at the size ui.js resizes them to
chrome --headless=new --window-size=560,460 --dump-dom \
       file://$PWD/.verify-out/g-bounce.html | grep -o '<title>[^<]*'
```

`g-menus.html` is the one worth understanding: `.popupmenu` elements are appended to
`<body>` by a plugin at runtime and positioned by core, so there is no template to
render. The fixture injects the markup the plugins really emit and asserts the two
things that are only ever the skin's job — `display: none` and `position: absolute`.
Remove those rules and the page reports `closed=block positioned=static`, which is
what every plugin menu looked like before step 11.

**Reproduce the bug in the harness before fixing it.** Every fix in this project
was confirmed by first showing the harness reporting the broken numbers — that is
what tells you the probe is actually looking at the thing you think it is.

### What the harness is not

`render.mjs` fakes Roundcube's template objects; its fidelity target is the
element tree and its classes, not the text inside. It is not a substitute for
loading the skin on a real install. Its known gaps are noted in
[ROUNDCUBE-NOTES.md](ROUNDCUBE-NOTES.md#harness-gaps-already-hit).

---

## IDE diagnostics on templates are mostly noise

The HTML linter does not resolve `roundcube:` tags, so it reliably and wrongly
reports: empty `<h1>`/`<h2>`, duplicate `id`, "stray end tag `</form>`",
"`<button>` must have accessible text", `<html>` not closed. All false. Trust
`npm run verify:templates` — it uses Roundcube's actual parser.

---

## Outstanding, not blocked on anything

- Steps 13–14 (see [STATUS.md](STATUS.md)).
- **The calendar** — the deferred half of step 11. Which plugin has never been
  settled, and it decides every template name and CSS hook in that work.
  Ask before starting it.
- `CHANGELOG.md`, required by `BUILD.md` §14.
- **JetHost branding — the remainder.** Colours and logos are done (D-55 to D-58);
  `support_url`, `mail_domain`, `login_background` and whether the six categories
  should be JetHost's own still need the client, not code.
- ~~**The 114MB brandbook PDFs in `jethost-branding/`.**~~ Settled: the whole
  folder is gitignored, along with the design capture. See D-65.
