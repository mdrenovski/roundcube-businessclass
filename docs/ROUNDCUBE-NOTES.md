# Roundcube 1.6 internals, and the bugs that taught us them

Everything here was established by reading `vendor/roundcube/` (1.6.17) or by
reproducing a failure. Line numbers are from that copy. **Read this before
guessing at core behaviour** — most of these cost hours to find and minutes to
re-break.

---

## Templates and the parser

### `parse_xml` is a single non-recursive pass
```php
// rcmail_output_html.php:1320
$regexp = '/<roundcube:([-_a-z]+)\s+((?:[^>]|\\>)+)(?<!\\)>/Ui';
```
- Ungreedy, so a tag ends at the first unescaped `>`.
- Attributes are parsed by `html::parse_attrib_string()`, which builds a tiny HTML
  document and reads it with `DOMDocument` (`html.php:359`) — so **single quotes
  work**, which is how a `roundcube:` tag can sit inside an HTML attribute.
- **A `roundcube:` tag nested inside another `roundcube:` tag's attribute is never
  resolved**, and worse, it breaks the outer tag's match. This is why
  `contactprint.html`'s logo has no `alt=` — `alt="<roundcube:var …>"` inside
  `<roundcube:object …>` silently dropped the whole object. Symptom in
  `verify:templates`: "tags present: 7 matched: 6".
- A `roundcube:` tag inside a *plain HTML* element's attribute is fine.

### A missing template is fatal
`parse()` raises a 404 and exits (`rcmail_output_html.php:806`). With
`"extends": null` there is no fallback, so **every** template must exist before
the skin can be installed at all. Hence `_scaffold.scss`.

### `blankpage_url` defaults to `/watermark.html`
A leading slash means "the current skin folder", resolved through
`abs_url($str, true)` → `get_skin_file()`. A skin without a `watermark.html` in
its root leaves **every** `contentframe` on the web server's 404 page. Confirmed
live with curl; the file now exists and `README.md` has a troubleshooting entry.

### `roundcube:form` emits only the opening tag
The template supplies `</form>`. Elastic does the same. The IDE will call it a
stray end tag; it is not.

### `roundcube:container` emits no element
It is an injection point. An `id` on it does not create one.

### `roundcube:add_label` does **not** split on commas
```php
// rcmail_output_html.php:1407
case 'add_label':
    $this->add_label($attrib['name']);
```
`add_label(...$args)` unwraps a single *array* argument but not a string, so
`name="a,b,c"` registers one label literally named `a,b,c`. Core's own skins write
one tag per label. This silently broke every client-side string in the skin from
step 3 to step 10 — the empty states, the date-group headings, the quick-action
tooltips, the reveal-button titles, the folder drag handle, the filter switches.
Guarded now by `npm run lint:labels`.

### Missing labels fail differently on each side — useful for diagnosis
- **PHP** `rcube::gettext()` returns `"[$name]"` — *with* brackets
  (`rcube.php:599`).
- **JS** `rcmail.get_label()` returns the bare `name`.

So `bc_noresults` on screen means a client-side lookup and a missing `add_label`;
`[bc_noresults]` means the catalogue itself does not have it.

### Conditions are resolved in an earlier pass than template objects
```php
// rcmail_output_html.php:824-825
$output = $this->parse_conditions($templ);
$output = $this->parse_xml($output);
```
So a `<roundcube:if condition="env:x">` has already been decided by the time any
template object's handler runs — and therefore by the time the hooks those handlers
fire (`identity_form`, `contact_photo` via `contactphoto`, …) can set anything. Env
a **condition** reads must be set before `write()`; env only a `<roundcube:var>`
reads has the same constraint for the same reason. `parse_conditions` does support
`elseif`, and nests properly (`:1145` tracks a level counter).

### `overwrite_action()` re-renders a *different* screen in the same request
`save-identity` ends with `overwrite_action('edit-identity')`
(`identity_save.php:210`), and the same pattern appears wherever core hands a form
back. `startup` has long since run, and it ran with the action set to `save-*` — so
a plugin that sets template env on `startup` keyed to a screen will find that env
missing on the screen core actually renders. The way out is the save path's own
hooks, which fire before the re-render: `identity_update` (`:124`),
`identity_create_after` (`:178`).

### `identity_update` is the only place both addresses exist
It fires *before* `update_identity()` writes, with the posted record in
`$args['record']` and the stored row still in the database — so an address change is
visible from both sides. There is no `identity_update_after`. Note core applies
`idn_to_ascii()` to the address **after** the hook (`:128`), so a hook comparing the
posted address against the stored one has to normalise it itself.

At `identities_level` 1 and 3 the address field is disabled and core merges the
stored identity back over the post (`:119`), so old and new come out equal —
correctly, since nothing changed.

### Hook ordering inside `write()`
`render_page` fires at `rcmail_output_html.php:828`; `js_labels` is serialised at
`:867`. So a plugin's `render_page` hook *can* still add labels — but it fires
**after** `parse_xml()`, so it is too late to set an env value that a
`<roundcube:var>` or `<roundcube:if condition="env:…">` reads. Anything a template
interpolates must be set on **`startup`** (which is `index.php:92`, with output
already alive from line 46). This is documented in the plugin's own comment and is
easy to get wrong.

---

## Layout traps

### Framed pages carry the task class but render no header
Every framed document — the reading pane, all the Settings forms, the folder and
identity editors, the contact detail and editor — gets the same `task-*` class on
`<body>` as the page framing it. Any layout keyed on `<body>` must tolerate a
document with no header in it. This caused the "Save buttons are not accessible"
report: a two-row grid on `body.task-*` handed the framed content the header's
48px row and clipped it. See DECISIONS.md D-14.

### A print view is not framed, so it renders the app header
`?_action=print` opens a standalone window — `messageprint` / `contactprint` — which
means `env:framed` is false and any header gated only on framing renders straight
onto the paper. `env:action` is the hook that distinguishes it; the body class the
skin writes (`action-print`) is the CSS equivalent.

### An iframe cannot grow to its content, so a pane cannot be printed whole
Printing the app window prints the reading pane as the box it occupies, however long
the message is. Core's answer is a separate document (`?_action=print`), which is
what the Print button opens and what the skin routes Ctrl+P to.

### Plugins can add children to `<body>`
A plugin's `add_header()` content is `<head>` material that the HTML parser moves
into the body, and scripts append there too. A grid on `<body>` gives each of them
a numbered row. A flex column does not care.

### `<legend>` inside a `display: grid` fieldset can never be a grid item
It is the *rendered legend*, laid out above the anonymous content box. This is the
whole reason for D-22 D-22: core puts the contact field's name on a
`<legend>`, so it cannot occupy the label column and `ui.js` has to move it.

### A bare text node inside a grid `<a>` becomes an anonymous grid item
And an anonymous grid item **cannot be styled** — no `text-overflow`, no
`white-space`. Roundcube writes a treelist row's name as exactly that, so
"Personal Addresses" wrapped to two lines at 200px and broke the 32px row rhythm.
`ui.js` `wrapRowLabel()` wraps it in a `<span class="bc-rowlabel">`. Applies to
both the folder pane and the contacts directory.

### CSS specificity is per-property, not per-rule
A higher-specificity rule that does not mention `text-transform` will not undo a
lower one that does. Bit us twice: the Settings form's uppercase `legend` treatment
leaking into contact field groups, and its `input { width: 100% }` stacking the
name-part inputs. Both needed *explicit* resets.

### `.bc-login__form button` matched more than the submit
Core renders the login submit as `<button>` inside `<p class="formbuttons">`
(`rcmail_output_html.php:2403`). A rule on `.bc-login__form button` therefore also
matched the password-reveal toggle `ui.js` injects — and beat `.bc-login__reveal`
on specificity (`0,1,1` vs `0,1,0`), making the toggle 312×32 and brand-filled,
covering the field. Scope button rules to the wrapper core actually uses.

---

## List widgets

### The contact list and the message list fire the *same* event with different payloads
```js
// app.js:485  — contacts
rcmail.triggerEvent('insertrow', { cid, row })
// messages send { uid, row }
```
`ui.js` branches on `event.cid !== undefined`. If you add a third list, check this.

### A contact row's email is not in the row
`add_contact_row(cid, cols, classes, data)` stores `data` in `list.data[cid]`
(`app.js:6605`) — that is where the address lives. The rendered `<td>` has only the
display name.

### The contact list publishes no `listupdate`
So the empty state cannot be driven by an event. `ui.js` uses a `MutationObserver`
on the tbody.

### `role="listbox"` cannot ride on the object attributes
`html_table` drops unknown attributes (`html_table::$allowed`, `html.php:737`). `ui.js` sets it on
`contacts-table` before the widget initialises.

### `compose` is enabled for every task
`app.js:239`. Core never dims it. In Contacts it composes to the *list selection*,
so with nothing selected it would open a blank message — `ui.js` mirrors the
selection onto the button's `aria-disabled` itself.

### `drag_menu` no-ops safely when `gui_objects.dragmenu` is absent
`app.js:1660`. The skin does not have to provide one.

---

## Photos and avatars

### `contacts/photo` is a complete avatar-by-address service already
`program/actions/contacts/photo.php`:
- `?_task=addressbook&_action=photo&_email=<addr>` searches **every** address
  source for a contact with that address that has a photo.
- Fires the **`contact_photo` hook**, where a plugin may return `url` (core
  redirects) or `data`.
- `future_expire_header(86400)` — cached for a day when queried by address. **So a
  changed photo needs a cache-busting query parameter**, or the browser reuses the
  old answer, including the 204 that stood in for a photo that did not exist yet.
- `&_error=1` makes it answer **204** instead of a blank GIF when there is nothing,
  which is what lets an `<img>` `onerror` hand back to the initials underneath.

### The `contact_photo` hook fires from two places
The HTTP action above (passes `email`), and the `contactphoto` **template object**
(`contacts/index.php:1327`, passes `record` and `attrib`). Both honour a returned
`url`. So one hook covers the avatars and the contact detail page — but the email
has to be dug out of `record` in the second case
(`rcube_addressbook::get_col_values('email', $record, true)`).

### `message_contactphoto` already points at that action
`mail/show.php:398`. So the reading-pane sender avatar inherited the whole
address-book → Gravatar chain for free. `_error=1` is only added when the template
passes a `placeholder=` attribute.

### `contact_photo()` with no `placeholder=` emits a transparent BLANK_GIF
Which is why laying an initials avatar *underneath* core's `<img>` works — a
contact with a picture covers the initials, one without lets them show through.

### A contact's `photo` column holds **raw bytes**
Not base64. `contacts/save.php:70` writes `$tempfile['data']` or
`file_get_contents()` straight in.

### `rcube_image` reads the real format
`props()['type']` comes from the file, not the name or the browser's content type.
This is how core validates an upload (`contacts/upload_photo.php`) and how the
identity photo does. `contact_photo_size` (default 160) is the max dimension.

### `rcmail.file_upload(files, post_args, props)` is the supported client path
`app.js:9625`. FormData, `X-Roundcube-Request` token header, `dataType: 'json'`,
and `success → http_response(data)`. Note two things:
- `props.filter` **silently drops** non-matching files (`app.js:9640` says as
  much), so check the type yourself if you want to tell the user.
- `http_response()` expects the **parsed object**, not `{responseText}`. A
  hand-rolled `fetch` that passes raw text does nothing at all.

### `rcmail.url('addressbook/photo', {...})` works cross-task
`app.js:8990` rewrites `_task=` when the action contains a slash.

### `rcube::get_user_email()` is free
Session-based (`rcube.php:1621`). `$rcmail->user->get_identity()` is a query — do
not put it on `startup` for every page load.

---

## Miscellaneous

### `quota` content is the whole sentence
`rcmail_action::quota_content()` builds
`title = gettext('quota') . ': ' . "4.4 GB / 200 GB (2%)"` (`rcmail_action.php:204`)
and sends `used`/`total` in **KB**. There is no pre-formatted "used / total"
field, and no `show_bytes` in `app.js`. The skin strips the prefix by matching the
label element's own text, so it holds in every language.

### `advanced_search()` and `import` load framed pages into `simple_dialog`s
The dialog supplies its own submit button, reading `gui_objects.editform`. So
`contactsearch.html` and `contactimport.html` must **not** add footers, or there
are two ways to submit the same form.

### `contact_record_groups()` renders live checkboxes
`group_member_change` posts on `change` and never reverts, so a `change` listener
is enough to keep the chips in sync. Do not replace the checkbox.

### `set_busy(true, 'labelname')` resolves the label client-side
`app.js:1502` calls `get_label(message)` and falls back to "Loading..." if it comes
back unchanged — so a busy label still needs registering with `add_label`.

### Skin localization
`meta.json` `"localization": true` makes `rcube::read_localization()` load
`skins/<skin>/localization/en_US.inc` and then the session language's file over
it. Keys are prefixed `bc_` so they can never collide with core or a plugin.

---

## Harness gaps already hit

`tools/verify/render.mjs` and friends fake Roundcube. Where they have lied so far:

- **Attribute quoting.** The original `attrs()` matched only double quotes, so
  `data-bc-avatar="<roundcube:object name='username' />"` came through unresolved
  and looked like a skin bug. Core takes either. Fixed.
- **`roundcube:var` substitution.** Everything blanks to `''` by default, which
  turns `style="--bc-brand-primary: <var>"` on `<html>` into an *empty* custom
  property — and that kills every `var(--bc-brand-*)` in the page, so any colour
  assertion silently passes on transparent. `probe-fixes.mjs` substitutes a real
  accent for this reason.
  *(Real-world corollary: without `businessclass_prefs`, that inline style is
  genuinely empty and the whole brand colour dies. The plugin is required anyway,
  but it is a latent fragility.)*
- **`file://` blocks subresources.** A page opened as `file://` cannot load a
  `file://` stylesheet or script from an http page and vice versa. Anything that
  needs an image to actually load must be served over HTTP — hence
  `probe-fixes.mjs` copying `styles.css` and `ui.js` beside its output.
- **`Object.defineProperty` without `configurable: true`** on a stubbed
  `input.files` throws on the second call and silently aborts the rest of the
  probe, so the page reports nothing and looks like it "passed".
- **`body` has no `task-*` class** in `render.mjs` output, so `body: display=block`
  there is expected and is not evidence about the real shell. `printcheck.mjs` sets
  the class itself for this reason.
- **Print media cannot be selected from Chrome's command line** without driving the
  DevTools protocol. `printcheck.mjs` copies `styles.css` and rewrites
  `@media print {` to `@media screen {` so the rules can be measured — which proves
  the selectors match and beat what they must beat, but says nothing about `@page`
  or pagination. `--print-to-pdf` covers those, and the PDF can be rasterised with
  `sips -s format png` and looked at.
- **A fixture's markup has to match core's or the measurement is fiction.** Two of
  these were found in one sitting: the attachment row is
  `a.filename > span.attachment-name + span.attachment-size` (`show.php:221`), and
  flattening it to one text node printed the name and the size on top of each other;
  and the message row is **one** composite `td.subject` carrying `span.fromto`,
  `span.date`, `span.size`, `span.subject` — emitting a `<td>` per column *as well*
  put two copies of every row into the same grid cells. The contract is documented at
  the top of `_list.scss`; follow it.
- **`class=` written twice is silently dropped.** Injecting a state class as a second
  attribute (`id="x" class="is-empty"` where the element already has one) leaves the
  fixture testing nothing. Add to the existing attribute.
- **`String.replace()` expands `$` in the replacement**, and `$'` means "everything
  after the match". Splicing generated markup into a fixture with a string
  replacement therefore *deletes what you meant to insert* whenever the text
  contains jQuery — `$('#acl-switch')` in a template comment was enough. It fails
  silently and looks like a skin bug. Every insertion in `plugincheck.mjs` goes
  through a function replacement for this reason.
- **Slicing a fragment at `/<body[^>]*>/` matches comments too.** `acl/table.html`
  is a fragment with no document wrapper, and its own comment mentions `<body>`; the
  trim landed there and threw away the table the fixture existed to measure. Two
  different bugs produced the same symptom in the same file — measure the DOM, not
  the source, when a fixture comes up empty.
- **`template:name` is a condition templates really switch on** (`pagenav.html`
  picks its counter object that way). `render.mjs` derives it from the template it
  was asked for rather than hard-coding it, so it cannot go stale; plugin templates
  carry the plugin prefix, as `parse()` receives them — `enigma.keys`.

---

## Plugins, from a standalone skin

Learned building step 11. All of it follows from `"extends": null`.

- **A plugin's own skin CSS is never loaded.** `rcube_plugin::local_skin_path()`
  (`rcube_plugin.php:391`) walks `$rcube->output->skins`, which for a standalone skin
  is just `['businessclass']`, and returns `skins/businessclass/plugins/<id>`.
  `plugins/<id>/skins/elastic/*.css` is never reached. Everything a plugin emits
  arrives unstyled.
- **A missing per-plugin stylesheet is not a 404.**
  `rcube_plugin_api::include_stylesheet()` checks `is_file()` and returns quietly
  (`rcube_plugin_api.php:728`). Shipping an empty `.css` file to "avoid the 404" is
  cargo cult.
- **Template overrides live at `skins/<skin>/plugins/<id>/templates/<name>.html`.**
  `parse()` prepends both that and `plugins/<id>/skins/<skin>/` to the search list
  (`rcmail_output_html.php:750`), and a plugin template is requested by its dotted
  name — `enigma.keys`, `acl.table`.
- **`<roundcube:container>` renders no element.** It returns the hook's content
  inline (`rcmail_output_html.php:1451`), so the `id=` on it never exists in the DOM.
  It is still registered client-side through `gui_container`, and `init()` resolves
  every container to `$('#'+id)` (`app.js:223`) — so `rcmail.add_element(el, 'toolbar')`
  appends to an **empty jQuery set** and silently drops the element unless a real
  element carries that id. Nothing shipped uses `add_element`, which is why this has
  never shown; `#compose-toolbar` in `_compose.scss` is dead CSS for the same reason.
- **`data-popup="…"` is Elastic's, not core's.** Core has no handler for it, so any
  plugin template using it (acl's Actions menu, enigma's export dropdown) has a
  control that can never open under this skin. Both were rebuilt rather than copied.
- **enigma branches on the skin name.** `compose_ui()` checks
  `array_key_exists('elastic', $rc->output->skins)` (`enigma_ui.php:860`); every
  other skin gets a toolbar button plus a `#enigmamenu` popup instead of the
  `composeoptions` container. Both paths need styling — this skin only ever takes
  the second.
- **`rcmail_sendmail::headers_output()` needs `part=`.** Without it the switch falls
  through and it returns nothing at all, and `form_tags()` only yields the opening
  `<form>` once — so a second call returns an empty string, not a second form tag.
- **`show_popup_dialog()` fires `dialog-open`** with the popup element
  (`app.js:8840`), which is the supported way to adjust a dialog core or a plugin
  sized for a different skin. It runs in whichever window opened the dialog.
- **`show_menu()` supplies no CSS.** It moves the element to `<body>`, sets
  `left`/`top` and calls `.show()`. `position: absolute` and `display: none` have to
  come from the skin, or the menu sits open in the page flow.
- **`html_table` ignores `noheader`.** Only `rcmail_action::table_output()` honours
  it (`rcmail_action.php:117`), so acl's rights table renders a real `<thead>` —
  which `acl_add_row()` depends on, cloning it to build each new row.
