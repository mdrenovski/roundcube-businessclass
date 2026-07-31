// =============================================================================
// tools/verify/themecheck.mjs   —   npm run verify:theme
//
// The contrast gate for BUILD.md §9, across every theme (§12 step 12).
//
// Why this does not use a browser
// -------------------------------
// The rest of tools/verify measures a *rendered* page, because layout is what it
// is asking about. Contrast is not a layout question: it is arithmetic over the
// token graph, and the graph is fully determined by styles.css plus the accent
// an install sets. So this reads the compiled stylesheet, resolves var() and
// color-mix() itself, and computes the ratios — which makes it deterministic,
// fast enough to sit inside `npm run verify`, and able to sweep accents that no
// fixture would ever be rendered with.
//
// It sweeps ACCENTS deliberately. The bug this file exists to prevent (D-58,
// D-66) was invisible with the shipping accent and catastrophic with a dark one:
// a navy header band with black icons on it, at 1.82:1. A gate that only ever
// checked #0F6CBD would have passed it.
//
// What it cannot see
// ------------------
// forced-colors mode, where the OS replaces colours after the cascade has run.
// Nothing computed here applies there. That mode is checked structurally instead
// — see the assertions at the foot of this file and the fixtures it writes.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || '.';
const OUT = process.argv[3] || '.verify-out';
const CSS = path.join(ROOT, 'skins/businessclass/styles/styles.css');

let failures = 0;
let checks = 0;

function fail(msg) {
    failures++;
    console.error(`  FAIL  ${msg}`);
}

function ok(msg) {
    if (process.env.VERBOSE) console.log(`  ok    ${msg}`);
}

// -- Colour ------------------------------------------------------------------

function parseHex(s) {
    const m = /^#([0-9a-f]{6})$/i.exec(s.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const NAMED = { white: [255, 255, 255], black: [0, 0, 0], transparent: null };

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]) {
    const f = (c) => {
        c /= 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
    const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
    return (hi + 0.05) / (lo + 0.05);
}

/**
 * Split a function's argument list on top-level commas. color-mix() nests, so
 * a naive split on "," tears `color-mix(in srgb, var(--x) 55%, white)` apart at
 * the wrong comma.
 */
function splitArgs(s) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of s) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur);
    return out;
}

/** Take the text inside the parentheses of the first `name(` at or after `i`. */
function readCall(src, i) {
    const open = src.indexOf('(', i);
    let depth = 0;
    for (let j = open; j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')') {
            depth--;
            if (depth === 0) return { body: src.slice(open + 1, j), end: j + 1 };
        }
    }
    throw new Error(`unbalanced parentheses in: ${src.slice(i, i + 60)}`);
}

/**
 * Resolve one token to an [r,g,b], following var() through `vars` and computing
 * color-mix() in sRGB the way the browser does.
 *
 * `seen` guards against a cycle in the token graph — which is not hypothetical:
 * --bc-brand-primary reads --bc-accent, and an edit that made --bc-accent read
 * back would hang this rather than fail it.
 */
function resolve(value, vars, seen = new Set()) {
    const v = value.trim();
    if (v === '') return null;
    if (v in NAMED) return NAMED[v];

    const hex = parseHex(v);
    if (hex) return hex;

    if (v.startsWith('var(')) {
        const { body, end } = readCall(v, 0);
        const trailing = v.slice(end).trim();
        const args = splitArgs(body);
        const name = args[0].trim();
        const fallback = args.slice(1).join(',').trim();

        if (seen.has(name)) throw new Error(`cycle at ${name}`);

        let inner;
        if (name in vars) inner = vars[name];
        else if (fallback) inner = fallback;
        else return null;

        const next = new Set(seen);
        next.add(name);
        // Anything after the var() — the `55%` in `var(--x) 55%` — belongs to the
        // enclosing color-mix, which reads it before calling in here.
        void trailing;
        return resolve(inner, vars, next);
    }

    if (v.startsWith('color-mix(')) {
        const { body } = readCall(v, 0);
        const args = splitArgs(body);
        if (!/^\s*in\s+srgb\s*$/.test(args[0])) {
            throw new Error(`only "in srgb" is supported, got: ${args[0]}`);
        }

        const parse = (part) => {
            const s = part.trim();
            const pct = /\s(\d+(?:\.\d+)?)%$/.exec(s);
            const colour = pct ? s.slice(0, pct.index).trim() : s;
            return { colour: resolve(colour, vars, seen), pct: pct ? parseFloat(pct[1]) : null };
        };

        const a = parse(args[1]);
        const b = parse(args[2]);
        if (!a.colour || !b.colour) return null;

        // Percentages that do not sum to 100 are normalised; an omitted one is
        // whatever is left over. Both are what CSS Color 5 specifies.
        let pa = a.pct, pb = b.pct;
        if (pa == null && pb == null) { pa = 50; pb = 50; }
        else if (pa == null) pa = 100 - pb;
        else if (pb == null) pb = 100 - pa;
        const sum = pa + pb;
        pa /= sum; pb /= sum;

        return [0, 1, 2].map((i) => Math.round(a.colour[i] * pa + b.colour[i] * pb));
    }

    return null;
}

// -- Reading the stylesheet --------------------------------------------------

/**
 * Pull the custom-property declarations out of one rule block, found by its
 * selector. Deliberately literal: it matches the compiled CSS, so a change in
 * how the themes are expressed shows up here as a missing block rather than as
 * a silently empty one.
 */
function block(css, selector) {
    // Sass drops the quotes from [data-bc-theme="dark"] on the way out, so the
    // selector written here and the one in styles.css are not the same string.
    // Match either, rather than making every caller remember which is which.
    const i = [selector, selector.replace(/"/g, '')]
        .map((s) => css.indexOf(s + ' {'))
        .find((n) => n !== -1);
    if (i === undefined) return null;

    const open = css.indexOf('{', i);
    let depth = 0;
    let body = null;
    for (let j = open; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') {
            depth--;
            if (depth === 0) { body = css.slice(open + 1, j); break; }
        }
    }
    if (body === null) throw new Error(`unbalanced braces after ${selector}`);

    const vars = {};
    for (const line of body.split(';')) {
        const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/i.exec(line);
        if (m) vars[m[1]] = m[2].trim();
    }
    return vars;
}

const css = fs.readFileSync(CSS, 'utf8');

const ROOT_VARS = block(css, ':root');
const DARK_VARS = block(css, 'html[data-bc-theme="dark"]');
const HC_VARS = block(css, 'html[data-bc-theme="hc"]');
const SHEET_LIGHT = block(css, 'html[data-bc-sheet="light"]');

for (const [name, v] of [[':root', ROOT_VARS], ['dark', DARK_VARS], ['hc', HC_VARS], ['sheet', SHEET_LIGHT]]) {
    if (!v) fail(`token block for "${name}" not found in styles.css — did a selector change?`);
}
if (failures) process.exit(1);

// -- The four inline properties, as the server computes them -------------------
// These mirror businessclass_prefs::on_accent / accent_text / accent_fill. They
// are restated here rather than imported — this is Node and that is PHP — which
// makes them the *other side of a contract*: if the two ever disagree, every
// number this file prints describes a page the server does not render. The
// checks at the foot of the file are what catch that drift.

const AA = 4.5;
const SURFACE_LIGHT = '#FFFFFF';
const SURFACE_DARK = '#292929';

const mix = (a, b, pct) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * (pct / 100)));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Black or white on the given colour — whichever reads better. */
function onAccent(hex) {
    return luminance(parseHex(hex)) > 0.179 ? '#000000' : '#FFFFFF';
}

/** The accent walked away from `surface` until it is readable AS TEXT on it. */
function accentText(hex, surface) {
    const accent = parseHex(hex);
    const bg = parseHex(surface);
    if (contrast(accent, bg) >= AA) return hex.toUpperCase();

    const target = luminance(bg) > 0.179 ? [0, 0, 0] : [255, 255, 255];
    for (let pct = 2; pct <= 100; pct += 2) {
        const c = mix(accent, target, pct);
        if (contrast(c, bg) >= AA) return toHex(c);
    }
    return toHex(target);
}

/** The accent as a FILL, nudged only if neither black nor white reaches AA on it. */
function accentFill(hex) {
    const accent = parseHex(hex);
    const best = (c) => Math.max(contrast(c, [255, 255, 255]), contrast(c, [0, 0, 0]));
    if (best(accent) >= AA) return hex.toUpperCase();

    const target = luminance(accent) > 0.179 ? [255, 255, 255] : [0, 0, 0];
    for (let pct = 2; pct <= 100; pct += 2) {
        const c = mix(accent, target, pct);
        if (best(c) >= AA) return toHex(c);
    }
    return toHex(target);
}

/**
 * The inline style header.html writes, for a given accent.
 *
 * ALL FIVE properties, which is the point: emitting only --bc-accent leaves the
 * other four at the initial values their @property registrations declare, and
 * those default to the shipped blue. A navy fixture then renders as the default
 * accent and looks perfectly fine — which is exactly the fixture you would be
 * looking at to check that navy is fine.
 */
function inlineStyle(accent) {
    const fill = accentFill(accent);
    return [
        `--bc-accent: ${accent}`,
        `--bc-accent-fill: ${fill}`,
        `--bc-on-accent: ${onAccent(fill)}`,
        `--bc-accent-text: ${accentText(accent, SURFACE_LIGHT)}`,
        `--bc-accent-text-dark: ${accentText(accent, SURFACE_DARK)}`,
    ].join('; ');
}

/** The token set an install actually renders with, for one theme and accent. */
function themeVars(theme, accent, sheet = 'theme') {
    const vars = { ...ROOT_VARS };
    if (theme === 'dark') Object.assign(vars, DARK_VARS);
    if (theme === 'hc') Object.assign(vars, HC_VARS);
    if (sheet === 'light') Object.assign(vars, SHEET_LIGHT);

    const fill = accentFill(accent);
    vars['--bc-accent'] = accent;
    vars['--bc-accent-fill'] = fill;
    vars['--bc-on-accent'] = onAccent(fill);
    vars['--bc-accent-text'] = accentText(accent, SURFACE_LIGHT);
    vars['--bc-accent-text-dark'] = accentText(accent, SURFACE_DARK);
    return vars;
}

// -- What is being asserted ---------------------------------------------------

// A spread of accents, not just the shipped one. Each is here for a reason.
const ACCENTS = [
    ['#0F6CBD', 'the default, and what both JetHost presets set'],
    ['#253082', 'JetHost navy — a dark accent; this is the D-58 case'],
    ['#FFD966', 'a pale accent, where on-accent has to come out black'],
    ['#767676', 'mid-luminance: the worst case for any fixed on-accent colour'],
    ['#0E700E', 'a dark green, to catch a hue-specific mistake in the ramp'],
];

// BUILD.md §9: text ≥ 4.5:1, UI strokes and icons ≥ 3:1.
const TEXT = 4.5;
const UI = 3;

const PAIRS = [
    // The header band — the whole reason this file exists.
    ['--bc-header-fg', '--bc-header-bg', TEXT, 'header text/icons on the band'],

    // Body copy on each surface.
    ['--bc-fg-1', '--bc-bg-1', TEXT, 'primary text on the list/reading surface'],
    ['--bc-fg-1', '--bc-bg-2', TEXT, 'primary text on sidebars and toolbars'],
    ['--bc-fg-1', '--bc-bg-3', TEXT, 'primary text on the rail'],
    ['--bc-fg-2', '--bc-bg-1', TEXT, 'secondary text'],
    ['--bc-fg-3', '--bc-bg-1', TEXT, 'metadata and placeholders'],
    ['--bc-fg-3', '--bc-bg-2', TEXT, 'metadata on a toolbar'],

    // Links and the accented text that lands on tinted rows. §9 names this one
    // explicitly: never brand for body text on a tint — use fg-strong there.
    ['--bc-brand-fg', '--bc-bg-1', TEXT, 'a link on the reading surface'],
    ['--bc-fg-on-tint', '--bc-brand-tint-selected', TEXT, 'text on a selected row'],
    ['--bc-fg-on-tint', '--bc-brand-tint-strong', TEXT, 'text on a strongly tinted row'],
    ['--bc-brand-fg-strong', '--bc-bg-1', TEXT, 'accented text on a plain surface'],

    // Status.
    ['--bc-danger-fg', '--bc-danger-tint', TEXT, 'error text in its notice box'],
    ['--bc-warning-fg', '--bc-warning-tint', TEXT, 'warning text in its notice box'],

    // Categories: chip label on chip tint, all six.
    ...['important', 'infra', 'finance', 'qa', 'personal', 'waiting'].map((c) => [
        `--bc-cat-${c}-fg`, `--bc-cat-${c}-tint`, TEXT, `the "${c}" category chip`,
    ]),

    // Avatars: initials on their fill, all six.
    ...[1, 2, 3, 4, 5, 6].map((n) => [
        `--bc-avatar-${n}-fg`, `--bc-avatar-${n}-bg`, TEXT, `avatar initials, palette ${n}`,
    ]),

    // A primary button's label, on the fill it sits on. --bc-accent-fill exists
    // so that this holds for a mid-luminance accent, where neither black nor
    // white reaches AA on the raw hex (white on #808080 is 3.95:1).
    ['--bc-on-brand', '--bc-brand-primary', TEXT, 'a primary button label on its fill'],

    // Non-text at 3:1 — strokes, the unread bar, the category dots, the focus ring.
    //
    // --bc-stroke-1 is deliberately NOT here. It is the decorative stroke — the
    // outline of a secondary button, whose label identifies it — and it is
    // Fluent's own #D1D1D1, at 1.53:1 on white. The token that carries the 3:1
    // requirement is --bc-stroke-accessible, which is what every input is
    // actually bordered with (_controls.scss:224, 266, 304).
    ['--bc-stroke-accessible', '--bc-bg-1', UI, 'an input border at rest'],
    ['--bc-brand-fg', '--bc-bg-1', UI, 'the unread bar and selected-task indicator'],
    ['--bc-brand-fg', '--bc-bg-3', UI, 'the selected-task indicator in the rail'],
    ['--bc-focus-ring-color', '--bc-bg-1', UI, 'the focus ring on a surface'],
    ['--bc-focus-ring-color', '--bc-bg-2', UI, 'the focus ring on a toolbar'],
    // The dot's RING, not its fill. The fill is the category's hue and is not
    // required to clear 3:1 — see the comment on .bc-dot in _controls.scss.
    ...['important', 'infra', 'finance', 'qa', 'personal', 'waiting'].map((c) => [
        `--bc-cat-${c}-fg`, '--bc-bg-1', UI, `the ring on the "${c}" category dot`,
    ]),

    // The header rule is what carries the brand in dark, so it has to be visible
    // against the band it sits under.
    ['--bc-header-rule', '--bc-header-bg', UI, 'the accent rule under the header'],

    // The message-body sheet.
    ['--bc-sheet-fg', '--bc-sheet-bg', TEXT, 'a plain-text message body on its sheet'],
];

// -- Run ----------------------------------------------------------------------

console.log('themecheck: contrast across themes and accents (BUILD.md §9)');

for (const theme of ['light', 'dark', 'hc']) {
    for (const [accent, why] of ACCENTS) {
        // The rule under a light header is transparent by design: the band's own
        // colour is the edge there, so there is nothing to measure.
        const skip = theme === 'light' ? new Set(['--bc-header-rule']) : new Set();

        for (const [fgName, bgName, min, label] of PAIRS) {
            if (skip.has(fgName) || skip.has(bgName)) continue;
            checks++;

            const vars = themeVars(theme, accent);
            let fg, bg;
            try {
                fg = resolve(`var(${fgName})`, vars);
                bg = resolve(`var(${bgName})`, vars);
            } catch (e) {
                fail(`${theme}/${accent} ${label}: ${e.message}`);
                continue;
            }

            if (!fg || !bg) {
                fail(`${theme}/${accent} ${label}: ${!fg ? fgName : bgName} did not resolve to a colour`);
                continue;
            }

            const ratio = contrast(fg, bg);
            if (ratio < min) {
                fail(`${theme}/${accent} (${why})\n        ${label}: ${ratio.toFixed(2)}:1, needs ${min}:1`
                    + `\n        ${fgName} on ${bgName}`);
            } else {
                ok(`${theme}/${accent} ${label}: ${ratio.toFixed(2)}:1`);
            }
        }
    }
}

// -- The sheet toggle ---------------------------------------------------------
// Its whole purpose is to be readable when the theme's own sheet is not, so it
// is checked in the theme where that matters.
for (const theme of ['dark', 'hc']) {
    checks++;
    const vars = themeVars(theme, '#0F6CBD', 'light');
    const ratio = contrast(resolve('var(--bc-sheet-fg)', vars), resolve('var(--bc-sheet-bg)', vars));
    if (ratio < TEXT) fail(`${theme} with the sheet toggled to light: ${ratio.toFixed(2)}:1, needs ${TEXT}:1`);
    else ok(`${theme} sheet=light: ${ratio.toFixed(2)}:1`);

    checks++;
    const bg = resolve('var(--bc-sheet-bg)', vars);
    if (luminance(bg) < 0.5) {
        fail(`${theme} with the sheet toggled to light: the sheet is not light (${bg.join(',')})`);
    }
}

// -- The server agrees about on-accent ----------------------------------------
// businessclass_prefs::on_accent computes the value this file assumes. If the
// two pivots drift apart, every number above describes a page that is not the
// page the server renders.
{
    const php = fs.readFileSync(path.join(ROOT, 'plugins/businessclass_prefs/businessclass_prefs.php'), 'utf8');
    checks++;
    if (!/0\.2126 \* \$r \+ 0\.7152 \* \$g \+ 0\.0722 \* \$b\) > 0\.179/.test(php)) {
        fail('businessclass_prefs::on_accent no longer uses the 0.179 luminance pivot this file assumes');
    }
    const header = fs.readFileSync(path.join(ROOT, 'skins/businessclass/templates/includes/header.html'), 'utf8');
    for (const prop of ['--bc-accent', '--bc-accent-fill', '--bc-on-accent', '--bc-accent-text', '--bc-accent-text-dark']) {
        checks++;
        const env = prop.slice(2).replace(/-/g, '_');   // --bc-accent-fill -> bc_accent_fill
        if (!header.includes(`${prop}: <roundcube:var name='env:${env}' />`)) {
            fail(`header.html no longer writes ${prop} as an inline property`);
        }
    }
    for (const fn of ['accent_text', 'accent_fill']) {
        checks++;
        if (!php.includes(`private function ${fn}(`)) {
            fail(`businessclass_prefs::${fn} is gone; this file's accent derivations no longer mirror the server`);
        }
    }
}

// -- Structural assertions the arithmetic cannot make -------------------------
{
    // The accent must not be reachable from the high-contrast theme. This is the
    // regression that D-66 fixed: while --bc-brand-primary *was* the inline
    // property, hc could not override it and silently kept the admin's band.
    checks++;
    const hcJoined = Object.values(HC_VARS).join(' ');
    if (/var\(--bc-accent/.test(hcJoined)) {
        fail('the high-contrast theme reads --bc-accent; it must not depend on admin input');
    }

    // color-scheme, without which the browser paints its own widgets light
    // inside a dark app.
    for (const [sel, want] of [
        [':root', 'light'],
        ['html[data-bc-theme="dark"]', 'dark'],
        ['html[data-bc-theme="system"]', 'light dark'],
        ['html[data-bc-theme="hc"]', 'dark'],
    ]) {
        checks++;
        // Same quote-stripping as block(): Sass emits [data-bc-theme=dark].
        const i = [sel, sel.replace(/"/g, '')]
            .map((s2) => css.indexOf(s2 + ' {'))
            .find((n) => n !== -1);
        const seg = i === undefined ? '' : css.slice(i, css.indexOf('}', i));
        if (!new RegExp(`color-scheme:\\s*${want}\\s*;`).test(seg)) {
            fail(`${sel} does not declare color-scheme: ${want}`);
        }
    }

    // forced-colors cannot be computed, so it is asserted structurally: the
    // block has to exist, and it has to draw the borders that keep surfaces
    // apart once the OS has flattened every fill to Canvas.
    checks++;
    const fc = /@media \(forced-colors: active\) \{([\s\S]*?)\n\}/.exec(css);
    if (!fc) {
        fail('no @media (forced-colors: active) block in styles.css');
    } else {
        for (const needed of ['CanvasText', 'Highlight', 'ButtonText']) {
            checks++;
            if (!fc[1].includes(needed)) {
                fail(`the forced-colors block never uses the ${needed} system colour`);
            }
        }
        checks++;
        if (/forced-color-adjust:\s*auto/.test(fc[1])) {
            fail('forced-color-adjust: auto is the default and asserts nothing — remove it or mean "none"');
        }
    }
}

// -- The compose editor stays on paper ----------------------------------------
// embed.css styles the TinyMCE editing surface and the HTML-attachment frame,
// both of which core renders with a bare <html> (rcmail_html_page::write). Every
// theme block is keyed on an attribute of that element, so none of them can
// match and the editor is white in every theme — which is the decision, because
// composing is WYSIWYG (D-69).
//
// What would break it is a theme block written against a bare :root or html.
// That is what this looks for.
{
    const embed = fs.readFileSync(path.join(ROOT, 'skins/businessclass/styles/embed.css'), 'utf8');

    checks++;
    const darkMedia = /@media \(prefers-color-scheme: dark\) \{([\s\S]*?)\n\}/.exec(embed);
    if (darkMedia && !/\[data-bc-theme/.test(darkMedia[1])) {
        fail('embed.css darkens on prefers-color-scheme alone — the compose editor '
            + 'would go dark, and composing is WYSIWYG (D-69)');
    }

    checks++;
    // Any rule that sets a dark neutral without requiring the attribute.
    for (const sel of [':root {', 'html {']) {
        const i = embed.indexOf(sel);
        if (i === -1) continue;
        const seg = embed.slice(i, embed.indexOf('}', i));
        if (/color-scheme:\s*dark/.test(seg)) {
            fail(`embed.css declares color-scheme: dark on "${sel.trim()}" — the compose `
                + 'editor must stay light in every theme (D-69)');
        }
    }
}

// -- Fixtures for the eye -----------------------------------------------------
// The arithmetic proves the tokens. It cannot show that the dark header looks
// like a header, so the same fixtures every other check in tools/verify uses are
// written out here, one per theme, ready for Chrome.
fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
{
    const src = path.join(ROOT, OUT, 't-theme-src.html');
    const { execFileSync } = await import('node:child_process');
    execFileSync(process.execPath, [path.join(ROOT, 'tools/verify/render.mjs'), 'mail', src], { cwd: ROOT });

    const base = fs.readFileSync(src, 'utf8');
    for (const theme of ['light', 'dark', 'hc']) {
        for (const [accent] of [['#0F6CBD'], ['#253082']]) {
            const name = `t-theme-${theme}-${accent.slice(1)}.html`;
            fs.writeFileSync(
                path.join(ROOT, OUT, name),
                base.replace(/<html[^>]*>/, `<html lang="en" data-bc-theme="${theme}" data-bc-density="comfortable"`
                    + ` data-bc-sheet="theme" style="${inlineStyle(accent)}">`)
            );
        }
    }
    fs.unlinkSync(src);
}

console.log(`themecheck: ${checks} checks, ${failures} failure${failures === 1 ? '' : 's'}`);
if (failures) {
    console.error('\nContrast is a gate, not a warning (BUILD.md §9, §13).');
    process.exit(1);
}
