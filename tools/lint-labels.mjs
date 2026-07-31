#!/usr/bin/env node
/**
 * Localization guard for the BusinessClass skin.
 *
 * Three failures it exists to catch, all of which are silent at runtime — a
 * label that never reaches the client simply renders as its own key, which
 * looks like content rather than like a bug:
 *
 *  1. <roundcube:add_label name="a,b,c" />. xml_command() passes $attrib['name']
 *     to add_label() whole and nothing splits on the comma, so that registers
 *     one label literally named "a,b,c" and none of a, b or c are usable from
 *     JS. Core's own skins write one tag per label.
 *  2. A key ui.js asks rcmail.get_label() for that no template registers.
 *     get_label() returns the key itself when it is missing.
 *  3. A bc_ key used anywhere but absent from a localization file — either
 *     missing from en_US.inc, or present there and untranslated elsewhere.
 *
 * Usage: node tools/lint-labels.mjs [project-root]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || process.cwd();
const skin = join(root, 'skins/businessclass');
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const templates = walk(skin).filter(p => p.endsWith('.html'));

// -- 1. add_label must name exactly one label ---------------------------------

const registered = new Set();

for (const path of templates) {
  const src = readFileSync(path, 'utf8');
  for (const m of src.matchAll(/<roundcube:add_label\s+name="([^"]*)"/g)) {
    if (m[1].includes(',')) {
      problems.push(
        `${relative(root, path)}: add_label name="${m[1]}" — a comma list registers one ` +
        `label of that literal name; write one tag per label`
      );
    }
    registered.add(m[1].trim());
  }
}

// -- 2. every key ui.js looks up must be registered ---------------------------

const ui = readFileSync(join(skin, 'ui.js'), 'utf8');

// Labels the plugin publishes itself: add_texts('localization', true) puts every
// businessclass_prefs text into the client env, so pluginLabel() needs no tag.
const pluginTexts = new Set();
const pluginLoc = join(root, 'plugins/businessclass_prefs/localization/en_US.inc');
for (const m of readFileSync(pluginLoc, 'utf8').matchAll(/\$labels\['([^']+)'\]/g)) {
  pluginTexts.add(m[1]);
}

for (const m of ui.matchAll(/(?<!plugin)\blabel\('([a-z0-9_]+)'\)/gi)) {
  const key = m[1];
  if (!registered.has(key) && !pluginTexts.has(key)) {
    problems.push(`ui.js: label('${key}') is registered by no template's add_label`);
  }
}

// label(spec.key) indirection: the quick actions, date groups and sort orders
// hold their keys in tables, so check every bc_ string literal in the file too.
for (const m of ui.matchAll(/'(bc_[a-z0-9_]+)'/g)) {
  const key = m[1];
  if (!registered.has(key) && !pluginTexts.has(key)) {
    problems.push(`ui.js: '${key}' is neither registered by a template nor a plugin text`);
  }
}

// -- 3. every bc_ key used must be translated in every localization file -------

const locDir = join(skin, 'localization');
const catalogs = {};
for (const name of readdirSync(locDir)) {
  const keys = new Set();
  for (const m of readFileSync(join(locDir, name), 'utf8').matchAll(/\$labels\['([^']+)'\]/g)) {
    keys.add(m[1]);
  }
  catalogs[name] = keys;
}

const base = catalogs['en_US.inc'];
if (!base) problems.push('localization/en_US.inc is missing');

const used = new Set();
for (const path of templates) {
  const src = readFileSync(path, 'utf8');
  for (const m of src.matchAll(/name=['"](bc_[a-z0-9_]+)['"]/g)) used.add(m[1]);
}
for (const m of ui.matchAll(/'(bc_[a-z0-9_]+)'/g)) used.add(m[1]);

for (const key of [...used].sort()) {
  // env values published by businessclass_prefs share the bc_ prefix but are not texts.
  if (/^bc_(logo|product_name|vendor|support_url|mail_domain|login_background|languages|accent|labels|density|theme|focused|folders_w|list_w|list_h|categories|pinflag|preview)/.test(key)) continue;
  if (base && !base.has(key) && !pluginTexts.has(key)) {
    problems.push(`localization/en_US.inc: '${key}' is used but not defined`);
  }
}

for (const [name, keys] of Object.entries(catalogs)) {
  if (name === 'en_US.inc' || !base) continue;
  for (const key of [...base].sort()) {
    if (!keys.has(key)) problems.push(`localization/${name}: '${key}' is untranslated`);
  }
  for (const key of [...keys].sort()) {
    if (!base.has(key)) problems.push(`localization/${name}: '${key}' is not in en_US.inc`);
  }
}

if (problems.length) {
  for (const p of problems) console.error('  ' + p);
  console.error(`\nLABEL LINT FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}

console.log(`LABELS OK — ${registered.size} registered, ${used.size} bc_ keys, ` +
  `${Object.keys(catalogs).length} localization file(s)`);
