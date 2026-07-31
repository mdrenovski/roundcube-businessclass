// Derive the skin's branding assets from the JetHost logo kit.
//
//   node tools/build-brand-assets.mjs
//
// Nothing here redraws anything: every path in the output is the vendor's own
// path data, byte for byte. What this does is three mechanical edits that the
// kit's files need before they can go in a 24px-tall box:
//
//   1. Strip the preview backdrop. Two of the source files open with a
//      <rect width="2500" height="1500"> — black behind the white logo, navy
//      behind the white+orange one. It is there so the artwork is visible in a
//      file browser. Left in, the header logo paints a 2500x1500 block of navy
//      over the header, and the print logo a block of black over the paper.
//
//   2. Re-viewBox to the ink. Every source file is viewBox="0 0 2500 1500"
//      (1.667:1) with the mark occupying x=450 y=623.5 w=1600 h=253 (6.325:1) —
//      measured in Chrome via getBBox over every path and rect, see
//      docs/DECISIONS.md D-55. object-fit: contain fits the *canvas*, not the
//      ink: measured, the untrimmed canvas fits the header's 120x24 box as
//      40x24 with 25.6x4.0 of that being wordmark. Trimmed, the same box holds
//      120x19 of solid logo. The trim is what makes it legible at all.
//
//      Clear space is not baked in. The brandbook's rule (p.4) is one bar height
//      of margin — 41.25 user units, which at a 24px-tall logo is 3.9px — and
//      .bc-header__brand already sets gap: var(--bc-s-8) and padding-left:
//      var(--bc-s-4) around it. Baking margin into the file would spend the box
//      on whitespace that the layout is already providing twice over.
//
//   3. Cut the symbol out for the favicon. Elements 9-11 of every horizontal
//      lockup are the three speed bars: widths 258/172/86 at 41.25 tall on a
//      79.56 pitch, which is the 6-across-by-5-down grid the brandbook describes
//      on p.2. They are the only part of the logo that reads at 16px.
//
// The SOURCE_RECTS assertion below is the guard: if the kit is ever reissued
// with the artwork moved, the coordinates stop matching and this fails loudly
// rather than silently emitting a mistrimmed logo.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const KIT = path.join(ROOT, 'jethost-branding/JetHost logo RGB/SVG');
const OUT = path.join(ROOT, 'skins/businessclass/images');

// Measured in Chrome over the union of every path and rect, backdrop excluded.
// Identical across all four horizontal lockups — the variants differ only in
// fill, never in geometry.
const INK = { x: 450, y: 623.5, w: 1600, h: 253 };

// The three speed bars, from the source markup. Also the assertion: these exact
// attributes have to be present in every file we touch.
const SOURCE_RECTS = [
  { x: 985.89, y: 671.5,  width: 258.01, height: 41.25 },
  { x: 985.89, y: 751.06, width: 172.01, height: 41.26 },
  { x: 985.89, y: 830.62, width: 86,     height: 41.25 },
];
const BAR_RADIUS = 3.54;

// Symbol bounds, from those rects: 258.01 wide by 200.37 tall.
const SYM = {
  x: SOURCE_RECTS[0].x,
  y: SOURCE_RECTS[0].y,
  w: SOURCE_RECTS[0].width,
  h: SOURCE_RECTS[2].y + SOURCE_RECTS[2].height - SOURCE_RECTS[0].y,
};

/**
 * Read a kit file and assert it is the artwork we measured.
 *
 * The XML prolog goes here. Every kit file opens `<?xml version="1.0"?>`, and an
 * XML declaration is only legal as the very first thing in the document — so
 * prepending the provenance comment to the file as-shipped produces a document
 * that no XML parser will accept, and Chrome renders an <img> pointing at it as
 * nothing at all. (Measured: the header logo box collapsed to its alt text.) An
 * SVG loaded through <img> does not need the declaration, so it comes off.
 */
function source(name) {
  const svg = fs.readFileSync(path.join(KIT, name), 'utf8')
    .replace(/^<\?xml[^>]*\?>\s*/, '');
  for (const r of SOURCE_RECTS) {
    const re = new RegExp(`x="${r.x}"\\s+y="${r.y}"\\s+width="${r.width}"\\s+height="${r.height}"`);
    if (!re.test(svg)) {
      throw new Error(`${name}: expected bar at ${r.x},${r.y} ${r.width}x${r.height} — ` +
        'the kit artwork has moved, re-measure INK before trusting this script');
    }
  }
  if (!svg.includes('viewBox="0 0 2500 1500"')) {
    throw new Error(`${name}: expected viewBox="0 0 2500 1500"`);
  }
  return svg;
}

/**
 * Strip the full-canvas backdrop rect, if present, and re-viewBox to the ink.
 * The backdrop is identified by being 2500x1500 with no x/y — the three bars all
 * carry coordinates, so there is no way to hit one by accident.
 */
function trim(svg) {
  // The class is optional: the "on BLUE" file carries class="cls-2" and takes its
  // navy from the stylesheet, while the "on BLACK" one is `<rect width="2500"
  // height="1500"/>` with no class at all and falls back to SVG's default black
  // fill. Requiring the class made the guard reject the second file — which is
  // the guard working, and the regex being too narrow.
  const out = svg.replace(/<rect(?:\s+class="[^"]*")?\s+width="2500"\s+height="1500"\s*\/>/, '');
  if (out === svg && /width="2500"/.test(svg)) {
    throw new Error('a 2500-wide rect is present but did not match the backdrop shape');
  }
  // width/height as well as the viewBox, and they are not decoration. The kit
  // files carry a viewBox alone, which gives them an aspect ratio but no
  // intrinsic size — and .bc-header__brand is a flex item inside a grid `auto`
  // track, so the width it would resolve against depends on its own content.
  // That circularity resolves to zero: measured, the header logo laid out at
  // 0x0 and the navy band came up empty. The skin's own logo-default.svg has
  // carried width/height for this reason since step 3.
  //
  // The values are the ink box in user units, so the ratio is exact; the boxes
  // in _header.scss (120x24), _login.scss (200x36) and _print.scss (32 tall)
  // scale it down from there.
  return out.replace('viewBox="0 0 2500 1500"',
    `viewBox="${INK.x} ${INK.y} ${INK.w} ${INK.h}" width="${INK.w}" height="${INK.h}"`);
}

/**
 * The provenance comment that opens every generated file.
 *
 * The guard is not decoration. XML forbids `--` *inside* a comment, so a note
 * mentioning a custom property by name — and every token in this skin is spelled
 * `--bc-something` — produces a file that no XML parser accepts and that Chrome
 * refuses to render. Measured: the rail logo came back `naturalWidth = 0` and
 * laid out at 0px wide. Caught here rather than left to whoever edits a note
 * next, because the symptom is a blank slot with no console error.
 */
function header(note) {
  if (note.includes('--')) {
    throw new Error('the note for a generated SVG contains "--", which is illegal ' +
      'inside an XML comment and makes the file unparseable:\n  ' + note);
  }
  return '<!-- JetHost logo, from jethost-branding/JetHost logo RGB/SVG/.\n' +
    '     ' + note + '\n' +
    '     Generated by tools/build-brand-assets.mjs, do not hand-edit. -->\n';
}

fs.mkdirSync(OUT, { recursive: true });

const assets = [
  // The app header is a solid --bc-brand-primary band (_header.scss:17), so the
  // logo on it has to be the reversed lockup. The kit supplies exactly this
  // pairing — white wordmark, orange bars, navy ground — as its "on BLUE"
  // variant; we keep the wordmark and bars and drop the ground, because the
  // header already is the ground.
  ['JH_logo_HORIZONTAL_WHITE_ORANGE on_BLUE.svg', 'logo-jethost-header.svg',
    'Reversed lockup for the navy app header; the navy backdrop rect is dropped\n' +
    '     because .bc-header supplies it. Orange on navy measures 3.86:1 — past the\n' +
    '     3:1 bar for a non-text graphic, and the kit\'s own pairing for this ground.'],

  // The login card sits on --bc-bg-1, so this one is the ordinary positive
  // lockup. No backdrop to strip.
  ['JH_logo_HORIZONTAL_BLUE_ORANGE.svg', 'logo-jethost-login.svg',
    'Positive lockup for the login card, which sits on a light surface.\n' +
    '     Navy on white measures 11.51:1.'],

  // Paper. bc-print takes the UI monochrome but does not touch an <img>, so the
  // kit's own black-and-orange paper variant is what goes here.
  ['JH_logo_HORIZONTAL_BLACK ORANGE.svg', 'logo-jethost-print.svg',
    'The kit\'s paper variant, used for the print letterhead. bc-print takes the\n' +
    '     surrounding UI monochrome but leaves an <img> alone, so this stays as drawn.'],

  // The foot of the app rail, rotated 90deg by _shell.scss. Same artwork as the
  // login lockup and a separate file on purpose: the two slots are independent,
  // and an install re-pointing one should not silently move the other.
  //
  // The positive lockup, not the reversed one — the rail is a light neutral, not
  // the accent. In DARK the rail is near-black and this artwork measures 1.50:1
  // against it, which is why the two reversed files below exist.
  ['JH_logo_HORIZONTAL_BLUE_ORANGE.svg', 'logo-jethost-rail.svg',
    'Positive lockup for the foot of the app rail, which _rail.scss rotates 90deg\n' +
    '     to run bottom to top. The rail is a light neutral, not the accent, so this\n' +
    '     is the same artwork as the login card rather than the reversed lockup.'],

  // The dark pair (step 12, D-67). An SVG loaded through <img> cannot see the
  // host document, so it cannot follow data-bc-theme itself — ui.js swaps the
  // src instead, driven by logo.rail_dark / logo.login_dark in branding.json.
  //
  // The kit's own "on BLACK" variant is the right source rather than a recolour
  // of the positive one: it is the reversed lockup as the brandbook draws it,
  // white wordmark with the orange bars kept, and the backdrop comes off for the
  // same reason it does on the header asset — the surface is already there.
  ['JH_logo_HORIZONTAL_WHITE_ORANGE on_BLACK.svg', 'logo-jethost-rail-dark.svg',
    'Reversed lockup for the app rail in the dark and high-contrast themes, where\n' +
    '     the positive one measures 1.50:1 on the rail and is effectively invisible.\n' +
    '     White on that surface measures 15.3:1.'],

  ['JH_logo_HORIZONTAL_WHITE_ORANGE on_BLACK.svg', 'logo-jethost-login-dark.svg',
    'Reversed lockup for the login card in dark, where the positive one measures\n' +
    '     1.13:1 against the card and is gone. A separate file from the rail asset\n' +
    '     even though the artwork is identical, because the two slots are\n' +
    '     independent and re-pointing one must not silently move the other.'],
];

for (const [src, dest, note] of assets) {
  const svg = trim(source(src));
  fs.writeFileSync(path.join(OUT, dest), header(note) + svg + '\n');
  console.log('wrote ' + dest + '  (from ' + src + ')');
}

// -- Favicon ------------------------------------------------------------------
// The kit has no symbol-only file — all 72 assets are lockups — so the symbol is
// reconstructed here from the three bars, at their original coordinates, in a
// square viewBox padded to 320 units so the glyph is not flush to the tab edge.
//
// Single colour, because at 16px the orange-on-white pairing (2.98:1) is the
// weakest thing the brand owns and a favicon is the smallest place it could
// appear. Navy for light browser chrome, white for dark — an SVG favicon can
// carry that switch itself, which a raster one cannot.
//
// Precedent for a one-colour symbol is the kit's own JH_logo_HORIZONTAL_WHITE,
// where the bars are drawn white along with the wordmark.
const PAD = 320;
const box = {
  x: SYM.x + SYM.w / 2 - PAD / 2,
  y: SYM.y + SYM.h / 2 - PAD / 2,
};

const bars = SOURCE_RECTS.map(r =>
  `  <rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" ` +
  `rx="${BAR_RADIUS}" ry="${BAR_RADIUS}" />`).join('\n');

const favicon = header(
  'The symbol alone — the three speed bars, at their coordinates in the\n' +
  '     horizontal lockup, in a square viewBox. The kit ships no symbol-only file;\n' +
  '     this is cut from JH_logo_HORIZONTAL_BLUE_ORANGE.svg.') +
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${PAD} ${PAD}" width="32" height="32">
  <style>
    rect { fill: #253082; }
    @media (prefers-color-scheme: dark) { rect { fill: #FFFFFF; } }
  </style>
${bars}
</svg>
`;

fs.writeFileSync(path.join(OUT, 'favicon-jethost.svg'), favicon);
console.log('wrote favicon-jethost.svg  (symbol reconstructed from the three bars)');

// -- Header symbol -------------------------------------------------------------
// The same three bars again, for the app header, where they sit beside the
// product name rather than replacing it. Two files rather than one because they
// are not the same drawing:
//
//   - the favicon is padded to a square, so it is not flush to the tab edge, and
//     is one colour so it survives 16px;
//   - this one is trimmed to the ink, because .bc-header__brand supplies its own
//     gap, and is white, to match the product name and the icons beside it.
//
// White rather than orange, and that is a measurement rather than a preference.
// The band is whatever the active profile's accent is (BUILD.md 3.2), so the
// symbol has to survive any of them:
//
//     orange on #253082 (navy)        3.92:1   ok
//     orange on #0F6CBD (Fluent blue) 1.83:1   invisible
//     white  on #0F6CBD               5.38:1   same as the name beside it
//     white  on #253082              11.51:1
//
// Orange only worked on the darkest accent the brand owns. White is the pairing
// the kit itself ships for a single-colour lockup — JH_logo_HORIZONTAL_WHITE
// draws the bars white along with the wordmark — and it tracks the header's own
// --bc-on-brand, which is what every other mark on that band uses.
const symbol = header(
  'The symbol alone, trimmed to the ink, for the app header, where it sits beside\n' +
  '     the product name. White, to match the name and the icons on the accent band:\n' +
  '     orange survives a navy accent but falls to 1.83:1 on the default blue.') +
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${SYM.x} ${SYM.y} ${SYM.w} ${SYM.h}" ` +
`width="${SYM.w}" height="${SYM.h}" fill="#FFFFFF">
${bars}
</svg>
`;

fs.writeFileSync(path.join(OUT, 'symbol-jethost.svg'), symbol);
console.log('wrote symbol-jethost.svg  (header symbol, trimmed, orange)');
