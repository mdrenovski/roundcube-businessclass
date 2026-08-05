*Published retrospectively. This release was tagged on 31 July 2026 and is written
up here so the release history starts where the project did.*

The first public build of BusinessClass — a standalone Fluent 2 skin for
Roundcube 1.6.x, built from scratch rather than derived from Elastic.

## What was in it

The whole application, drawn: the app shell with resizable panes, the folder
tree, the message list in both densities, the reading pane, compose, search,
settings, contacts, and the screens that belong to bundled plugins rather than to
core.

- **Light theme**, both densities. Dark, high contrast and forced-colors came in
  0.2.0.
- **Printing** — a real `@media print` pass, not a hidden-chrome hack.
- **The branding layer** — accent colour, product name, vendor and logo assets
  driven from a `branding.json` profile, with the accent validated server-side
  and the readable-text variants derived in PHP, because CSS cannot measure
  contrast.
- **`businessclass_prefs`** — the skin's own plugin, carrying its preferences,
  the identity photo, and the avatar chain.

That is steps 1 to 11 of the build programme, with the calendar deliberately left
out: no calendar plugin had been chosen, and there was nothing to design against.

## What it did not have

Dark and high contrast themes, the command bar, Favorites, preview lines, and
sender pictures in the message list. Each arrived in a later release.

## Standing constraints, set here

Two rules the project has kept since:

- **No core patching.** Everything lives in `skins/businessclass/` and
  `plugins/businessclass_*`; nothing under `program/` is edited.
- **No literal colours outside `_tokens.scss`**, enforced by a lint step that
  fails the build — comments included.

---

*For anything current, see the latest release. This one is history.*
