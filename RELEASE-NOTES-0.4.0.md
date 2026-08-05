Message list rows now show the sender's real picture where one can be found. On
most inboxes that means recognisable logos from banks, couriers, airlines and
large retailers, photos for the contacts your users have saved, and the same
coloured initials as before for everyone else.

**Your users will see this change the next time they log in, without being asked.**
If you support end users, that is the thing to tell them about, along with where
the off switch is.

---

## Upgrading

1. Upload `skins/businessclass/` and `plugins/businessclass_prefs/` over the
   existing ones.
2. **Empty `public_html/rcube/temp/`** — the files, not the folder. Roundcube
   caches compiled templates there. No template changed in this release, but the
   plugin did, and clearing it costs nothing.
3. Hard-reload the browser once (Ctrl/Cmd + Shift + R).

Recommended, once, in `config.inc.php`:

```php
$config['businessclass_bimi_cache'] = 'db';
```

This shares one lookup across every account on the server instead of caching it
per user. It works without this, just less efficiently.

No database changes. No new preferences to migrate. Nothing to uninstall.

---

## What your users will notice

**Pictures on message rows.** Previously only the header, the reading pane and
contact cards had them; the list showed initials. The picture is layered *over*
the initials, so the circle identifies the sender from the first moment and keeps
doing so if no picture is found.

**Company logos.** Where a sender's domain publishes a verified brand mark, that
is what appears. This is the same mechanism the major mail providers use, so the
logos will match what your users already see elsewhere.

**Nothing else moved.** No layout change, no relocated buttons, no new screens.

---

## Where pictures come from

In order, first hit wins:

1. **Your address book.** A photo saved on a contact — nothing else needs to be
   told about it.
2. **The sender's published brand mark.** A DNS lookup answered by your own
   server. Skipped for gmail, yahoo, icloud and the like, where one mark per
   domain would put the provider's logo on every person who uses it.
3. **Gravatar**, if neither found anything. Unchanged from previous releases.
4. **The initials**, which were there all along.

### What leaves your server

| Step | Who is contacted | What they learn |
| --- | --- | --- |
| Address book | nobody | — |
| Brand mark | your DNS resolver, then whichever host the sender's domain nominated for its logo | that someone fetched a public logo |
| Gravatar | `gravatar.com`, from the user's browser | a SHA-256 of the address, and the browser's IP |

Nothing is ever uploaded. The brand-mark step carries no identifier for the
recipient at all — it is the same logo URL every mail client in the world fetches
for that sender.

The Gravatar disclosure is unchanged from earlier releases, but it now applies to
more addresses, because list rows ask about senders that previously were never
looked up. If you made a privacy disclosure about it, it is worth re-reading.

---

## Turning it off

**Per user** — Settings → Preferences → User Interface → *Look up sender pictures
online*. Leaves address-book photos and initials working.

**Per install**, in `config.inc.php`:

```php
$config['businessclass_bimi']     = false;  // stop reading brand marks
$config['businessclass_gravatar'] = false;  // stop asking gravatar.com
$config['businessclass_avatars']  = false;  // change the default for everyone
```

All three default to on. `dont_override` freezes the user-facing one like any
other preference; with both sources switched off, the user control disappears
rather than sitting there governing nothing.

---

## Performance

The obvious worry with a picture per row is a page of fifty lookups. Four things
prevent it:

- images load lazily, so rows below the fold cost nothing until scrolled to;
- an address that comes back with no picture is remembered and not asked again;
- the redirect now carries a day of browser cache, which it previously did not;
- brand-mark DNS answers are cached server-side — the misses too, since most
  domains publish nothing, so re-asking would be the common case.

Expect a busy folder to issue a handful of requests on first view and almost none
afterwards.

---

## Known limits

- **Coverage is uneven by design.** Verified brand marks cost their owners real
  money, so expect them from large organisations and not from small ones. Most
  individual senders will still show initials, and that is the intended
  behaviour, not a failure.
- **A brand mark that fails to load falls back to the initials, not to Gravatar.**
  Roundcube's photo lookup can hand back one address, so the chain is decided on
  the server and cannot retry in the browser.
- **Move to folder** is still absent — it needs a folder picker that has not been
  designed.
- **Mobile and narrow windows** are still unfinished; the command bar has no
  layout below tablet width yet.
- **Calendar** remains undesigned.
