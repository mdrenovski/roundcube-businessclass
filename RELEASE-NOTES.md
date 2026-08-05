The skin now works on a tablet and a phone. Until this release it was a desktop
layout that a narrow screen simply cut off — the folder pane, the message list
and the reading pane all competed for a width that was not there.

**Nothing changes on a desktop.** Not one control moves, resizes or relocates
above 1200px. If your users are all on desktops, this release is invisible to
them and you can upgrade without telling anyone.

---

## Upgrading

1. Upload `skins/businessclass/` over the existing one.
2. **Empty `public_html/rcube/temp/`** — the files, not the folder. Roundcube
   caches compiled templates there, and three templates changed in this release.
   Skipping this is the one thing that will make the upgrade look broken.
3. Hard-reload the browser once (Ctrl/Cmd + Shift + R).

The `businessclass_prefs` plugin is unchanged; you can leave it alone.

No configuration to add, no database changes, no new preferences to migrate,
nothing to uninstall.

---

## What your users will notice

Only on a narrow screen. There are two widths where something changes.

**Below 1200px — roughly a tablet — the folder pane becomes a drawer.** Instead
of holding a column it floats over the list when opened, and closes on a tap
outside it or on Escape. The same hamburger button opens it as before.

**Below 768px — a phone — opening a message fills the screen**, with a Back
button returning to the list.

**Everything is bigger under a thumb.** Below 768px every control is at least
44px and message rows at least 64px.

The header also gives up what it can at phone width: the product name yields its
space to search, `Filters` becomes an icon, and the support link steps aside
because the Help tab already carries it.

---

## What is deliberately *not* here

**There is no separate mobile app layout.** No bottom tab bar, no floating
compose button, no second shell to switch into. One shell that narrows. This
was a decision rather than an omission — the full reasoning, and the alternative
that was rejected, is [DECISIONS.md](docs/DECISIONS.md) D-79.

**Swipe-to-archive and swipe-to-flag are not built.** They are specified and
deferred (D-80). Nothing is unreachable without them: every per-message action
lives in the row's own menu, which is reachable and correctly sized. On any
touch device the hover-only quick actions are hidden for exactly that reason.

---

## Your users' settings are never rewritten

This is the part worth understanding, because it is where a narrow layout
usually goes wrong.

The reading pane and the folder pane are **stored preferences**, set per account
and shared across every device that account logs in from. So none of the above
touches them. The phone layout covers the reading pane rather than switching it
off, and the tablet drawer floats over the list rather than collapsing a column.

The consequence is the one you want: someone who reads mail on a phone at lunch
and a desktop in the afternoon finds the desktop exactly as they left it. Turning
a tablet from portrait to landscape puts the full layout back with the message
still open.

Someone who hid the folder pane on a desktop also gets it back hidden, rather
than having the narrow layout decide for them.

---

## Verifying it yourself

`npm run verify` gained a gate this release: `verify:geometry` measures the
rendered shell — where each pane actually sits, in pixels — across four screens
at desktop width, at the 1000px and 400px breakpoints, and the header at 440,
375 and 320px. It catches panes that overlap, a folder pane that leaves a gap
when hidden, and a search box that outgrows its band.

It runs with the rest: 14 gates, no browser needed, about a second each.

---

## Known limits

- **Swipe gestures**, as above.
- **Move to folder** is still absent — it needs a folder picker that has not
  been designed.
- **Calendar** remains undesigned.
- **The accessibility audit has not been done yet.** It is the next and last
  step of the build. The contrast half is already gated and passing; what is
  outstanding is the keyboard and screen-reader pass.
