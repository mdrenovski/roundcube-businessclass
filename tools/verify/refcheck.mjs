// Cross-checks the references that fail silently at runtime:
//   * every #ic_fluent_… the templates and ui.js reach for exists in the sprite
//   * every roundcube:label / add_label / get_label key exists in core or the
//     skin's own localization file
//   * every roundcube:object name is a registered template object
//
//   node refcheck.mjs <project-root>

import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2];
const P = (...p) => path.join(ROOT, ...p);
const read = (f) => fs.readFileSync(f, "utf8");
const fail = [];

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(dir, e.name), ext)
      : e.name.endsWith(ext)
        ? [path.join(dir, e.name)]
        : []
  );
}

// -- 1. sprite symbols --------------------------------------------------------
const sprite = read(P("skins/businessclass/images/icons/fluent-sprite.svg"));
const have = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));

// Skin templates plus the plugin template overrides (managesieve, …).
const templates = [
  ...walk(P("skins/businessclass/templates"), ".html").filter(
    (f) => path.basename(f) !== "sprite.html"
  ),
  ...walk(P("skins/businessclass/plugins"), ".html"),
];

const sources = [...templates, P("skins/businessclass/ui.js")];

const wanted = new Set();
for (const file of sources) {
  const src = read(file);
  // Literal <use href="#id"> and the entity-escaped form inside content=".
  // Ids ending in _ are string concatenations completed at runtime
  // ('…_20_' + variant); both variants are checked via the icon maps instead.
  for (const m of src.matchAll(/#(ic_fluent_[a-z0-9_]+)/g)) {
    if (!m[1].endsWith("_")) wanted.add(m[1]);
  }
  // ui.js builds ids as '#ic_fluent_' + symbol + '_20_' + variant.
  for (const m of src.matchAll(/data-bc-icon="([a-z0-9_]+)"/g)) {
    wanted.add(`ic_fluent_${m[1]}_20_regular`);
  }
}
// The maps in ui.js name symbols, not ids.
for (const block of ["FOLDER_ICONS", "PLUGIN_ICONS", "SETTINGS_ICONS", "SIEVE_ROW_ICONS"]) {
  const m = new RegExp(`var ${block} = \\{([^}]*)\\}`, "s").exec(read(P("skins/businessclass/ui.js")));
  if (m) {
    for (const s of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
      wanted.add(`ic_fluent_${s[1]}_20_regular`);
    }
  }
}
wanted.add("ic_fluent_folder_20_regular");
wanted.add("ic_fluent_folder_20_filled");
// Settings nav rows swap to the filled variant when selected.
for (const block of ["SETTINGS_ICONS"]) {
  const m = new RegExp(`var ${block} = \\{([^}]*)\\}`, "s").exec(read(P("skins/businessclass/ui.js")));
  if (m) for (const sym of m[1].matchAll(/'([a-z0-9_]+)'/g)) wanted.add(`ic_fluent_${sym[1]}_20_filled`);
}
wanted.add("ic_fluent_settings_20_filled");

for (const id of [...wanted].sort()) {
  if (!have.has(id)) fail.push(`sprite: missing symbol ${id}`);
}

// -- 2. label keys ------------------------------------------------------------
const coreLoc = P("vendor/roundcube/program/localization/en_US");
const keys = new Set();
for (const f of ["labels.inc", "messages.inc"]) {
  for (const m of read(path.join(coreLoc, f)).matchAll(/^\$(?:labels|messages)\['([^']+)'\]/gm)) {
    keys.add(m[1]);
  }
}
for (const m of read(P("skins/businessclass/localization/en_US.inc")).matchAll(/^\$labels\['([^']+)'\]/gm)) {
  keys.add(m[1]);
}

const used = new Set();
for (const file of templates) {
  const src = read(file);
  for (const m of src.matchAll(/<roundcube:label\s+name=['"]([^'"]+)['"]/g)) used.add(m[1]);
  for (const m of src.matchAll(/<roundcube:add_label\s+name=['"]([^'"]+)['"]/g)) {
    m[1].split(",").forEach((k) => used.add(k.trim()));
  }
  // title=/label= on roundcube:button are localized through gettext too —
  // except where domain= points at a plugin's own localization directory.
  for (const m of src.matchAll(/<roundcube:button[^>]*>/g)) {
    if (/\sdomain="/.test(m[0])) continue;
    for (const a of m[0].matchAll(/\s(?:title|label)="([a-z0-9_]+)"/g)) used.add(a[1]);
  }
}
for (const m of read(P("skins/businessclass/ui.js")).matchAll(/label\('([a-z0-9_]+)'\)/g)) {
  used.add(m[1]);
}

for (const k of [...used].sort()) {
  // A dotted name (managesieve.filters) resolves against that plugin's own
  // localization directory, so it cannot be checked against the core set.
  if (!k.includes(".") && !keys.has(k)) fail.push(`label: unknown key '${k}'`);
}

// A key existing server-side is not enough for ui.js: rcmail.get_label() reads
// the client-side text set, which only gets what add_label put there. Without
// that, get_label() silently returns the key itself.
const shipped = new Set();
for (const file of templates) {
  for (const m of read(file).matchAll(/<roundcube:add_label\s+name=['"]([^'"]+)['"]/g)) {
    m[1].split(",").forEach((k) => shipped.add(k.trim()));
  }
}
// Core pushes these itself in rcmail_action_mail_index::init().
for (const k of ["flagged", "unflagged", "unread", "deleted", "replied", "forwarded",
                 "withattachment", "priority", "mark", "markallread", "delete",
                 "movemessagetotrash", "copy", "move", "cancel", "quota"]) {
  shipped.add(k);
}

// Every quoted string inside a label(...) call, so ternaries like
// label(on ? 'markunflagged' : 'markflagged') are caught too.
const js = read(P("skins/businessclass/ui.js"));
const usedInJs = new Set();
for (const call of js.matchAll(/\blabel\(([^)]*)\)/g)) {
  for (const s of call[1].matchAll(/'([a-z0-9_]+)'/g)) usedInJs.add(s[1]);
}
// Keys reached indirectly, e.g. {label: 'bc_quickpin'} passed to label() later.
for (const m of js.matchAll(/\blabel:\s*'([a-z0-9_]+)'/g)) usedInJs.add(m[1]);
// ... and lookup tables of label keys, e.g. SCOPE_LABELS = {base: 'currentfolder'},
// whose values only ever reach label() through a variable.
for (const block of js.matchAll(/var\s+[A-Z0-9_]*LABELS\s*=\s*\{([^}]*)\}/g)) {
  for (const s of block[1].matchAll(/'([a-z0-9_]+)'/g)) usedInJs.add(s[1]);
}

// pluginLabel() prefixes the plugin domain; those come from the plugin's own
// localization directory, pushed to the client by add_texts(dir, true).
const pluginKeys = new Set(
  [...read(P("plugins/businessclass_prefs/localization/en_US.inc"))
    .matchAll(/^\$labels\['([^']+)'\]/gm)].map((m) => m[1])
);
for (const m of js.matchAll(/\bpluginLabel\(([^)]*)\)/g)) {
  for (const s of m[1].matchAll(/'([a-z0-9_]+)'/g)) {
    if (!pluginKeys.has(s[1])) {
      fail.push(`label: pluginLabel('${s[1]}') has no key in plugins/businessclass_prefs/localization`);
    }
  }
}
for (const k of [...usedInJs].sort()) {
  if (!shipped.has(k)) {
    fail.push(`label: ui.js asks for '${k}' but no template add_label ships it to the client`);
  }
}

// -- 3. template objects ------------------------------------------------------
const objects = new Set();
for (const f of walk(P("vendor/roundcube/program"), ".php")) {
  // Handler maps take the form 'name' => [$rcmail, 'fn'] / [$this, 'fn'] /
  // [$rcmail->output, 'fn'] / [self::class, 'fn'], plus add_handler('name', …).
  // …=> [$obj, 'fn'] and also …=> function() {…} (about.php registers closures).
  for (const m of read(f).matchAll(/'([a-z][a-zA-Z_]*)'\s*=>\s*(?:\[\s*[$A-Za-z']|function\s*\()/g)) {
    objects.add(m[1].toLowerCase());
  }
  for (const m of read(f).matchAll(/add_handler\(\s*'([a-zA-Z_]+)'/g)) {
    objects.add(m[1].toLowerCase());
  }
}
// Objects rcmail_output_html handles inline rather than through a map.
for (const o of ["message", "steptitle", "pagetitle", "contentframe", "meta", "links",
                 "logo", "productname", "version", "doctype", "frame"]) {
  objects.add(o);
}
// Handlers registered by the plugins whose templates this skin overrides. The
// list is the override directories themselves, so adding skins/businessclass/
// plugins/<id>/templates/ brings that plugin's objects into the check without
// touching this file.
const overridden = fs.existsSync(P("skins/businessclass/plugins"))
  ? fs
      .readdirSync(P("skins/businessclass/plugins"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

for (const id of overridden) {
  const home = P("vendor/roundcube/plugins", id);
  if (!fs.existsSync(home)) {
    fail.push(`plugin: skins/businessclass/plugins/${id} overrides a plugin that is not vendored`);
    continue;
  }
  for (const f of walk(home, ".php")) {
    for (const m of read(f).matchAll(/'([a-z][a-zA-Z_]*)'\s*=>\s*\[\s*\$/g)) {
      objects.add(m[1].toLowerCase());
    }
  }
}

const usedObjects = new Set();
for (const file of templates) {
  for (const m of read(file).matchAll(/<roundcube:object\s+name=['"]([^'"]+)['"]/g)) {
    // A dotted name (plugin.body) is resolved against the plugin that owns the
    // page, so it cannot be checked against the core handler list.
    if (!m[1].includes(".")) usedObjects.add(m[1].toLowerCase());
  }
}
for (const o of [...usedObjects].sort()) {
  if (!objects.has(o)) fail.push(`object: '${o}' is not a registered template object`);
}

// -- Branding assets ----------------------------------------------------------
// Every logo path in every branding profile has to resolve, and every SVG the
// skin ships has to be well-formed. Both failures look identical from the app —
// an empty brand slot, no console error, nothing in the log — and both have
// happened here: a path pointing at a file that was never generated, and a
// provenance comment containing `--`, which XML forbids inside a comment and
// which made Chrome report naturalWidth = 0.
const SKIN = P("skins/businessclass");
const brandFiles = fs.readdirSync(SKIN).filter(f => /^branding.*\.json$/.test(f));
for (const bf of brandFiles) {
  let profile;
  try {
    profile = JSON.parse(read(path.join(SKIN, bf)));
  } catch (e) {
    fail.push(`branding: ${bf} is not valid JSON — ${e.message}`);
    continue;
  }
  for (const [slot, rel] of Object.entries(profile.logo || {})) {
    if (!rel) continue;
    if (!fs.existsSync(path.join(SKIN, rel))) {
      fail.push(`branding: ${bf} logo.${slot} points at '${rel}', which does not exist`);
    }
  }
  // The accent goes through the same gate the plugin applies server-side.
  if (profile.accent && !/^#[0-9a-f]{6}$/i.test(profile.accent)) {
    fail.push(`branding: ${bf} accent '${profile.accent}' fails /^#[0-9a-f]{6}$/i`);
  }
}

// Top level of images/ only. images/icons/ holds the generated sprite, which is
// inlined into the document by sprite.html rather than loaded through <img>, so
// the intrinsic-size rule below does not apply to it.
const images = path.join(SKIN, "images");
let svgCount = 0;
const brandSvgs = fs.existsSync(images)
  ? fs.readdirSync(images).filter(f => f.endsWith(".svg")).map(f => path.join(images, f))
  : [];
for (const svg of brandSvgs) {
  svgCount++;
  const src = read(svg);
  const name = path.relative(SKIN, svg);
  // `--` is illegal *inside* an XML comment, and the whole comment body is what
  // matters — not the delimiters, hence the capture rather than a flat search.
  for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) {
    if (m[1].includes("--")) {
      fail.push(`svg: ${name} has "--" inside a comment, which makes it unparseable`);
    }
  }
  // An XML declaration is only legal as the very first thing in the document.
  if (/<\?xml/.test(src) && !src.startsWith("<?xml")) {
    fail.push(`svg: ${name} has an XML declaration that is not at the start of the file`);
  }
  // Referenced through <img>, so it needs an intrinsic size: a viewBox alone
  // gives a ratio with no size, and a replaced element with no intrinsic size in
  // a shrink-to-fit container lays out at zero.
  //
  // Scoped to the opening <svg> tag, not the file. Searching the whole source
  // finds the width= on any child <rect> and passes an SVG whose root has none —
  // which is precisely the file that fails. (Caught by testing the check against
  // the bug rather than trusting it because it was green.)
  const open = src.match(/<svg\b[^>]*>/);
  if (!open) {
    fail.push(`svg: ${name} has no <svg> element`);
  } else if (!/\swidth="/.test(open[0]) || !/\sheight="/.test(open[0])) {
    fail.push(`svg: ${name} root has no width/height, so it lays out at 0 in a flex or grid track`);
  }
}

console.log(`branding profiles checked: ${brandFiles.length}, skin SVGs checked: ${svgCount}`);
console.log(`sprite symbols referenced: ${wanted.size}/${have.size}`);
console.log(`label keys used: ${used.size}`);
console.log(`template objects used: ${[...usedObjects].join(", ")}`);

if (fail.length) {
  console.error("\n" + fail.join("\n"));
  process.exit(1);
}
console.log("\nALL REFERENCES RESOLVE");
