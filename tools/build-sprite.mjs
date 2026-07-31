// Builds skins/businessclass/images/icons/fluent-sprite.svg from the vendored
// Fluent UI System Icons (MIT). BUILD.md §10: 20px regular for rest, 20px
// filled for selected/active; currentColor fill; subset to what the skin uses.
//
//   node tools/build-sprite.mjs
//
// The upstream SVGs hardcode fill="#212121"; that is rewritten to currentColor
// so a single sprite works in light, dark and high-contrast themes.

import fs from "node:fs";
import path from "node:path";

const ASSETS = "vendor/fluent-icons/assets";
const OUT = "skins/businessclass/images/icons/fluent-sprite.svg";

// Icon id -> asset folder. Ids are the upstream file basenames so markup reads
// <svg class="bc-icon"><use href="…#ic_fluent_mail_20_regular"/></svg>.
const ICONS = {
  // App header (§3.2)
  grid: ["Grid", ["regular"]],
  // Filled too: a saved contact search is a row in the Contacts directory pane,
  // where the selected row is drawn filled like every other list row (§10).
  search: ["Search", ["regular", "filled"]],
  question_circle: ["Question Circle", ["regular"]],
  settings: ["Settings", ["regular", "filled"]],
  dismiss: ["Dismiss", ["regular"]],
  // Sign out (§3.3). A power symbol rather than Dismiss: at the foot of the rail
  // an X reads as "close this panel", which is what it does everywhere else in
  // the skin, and the one thing it must not be mistaken for here.
  power: ["Power", ["regular"]],
  // App rail (§3.3)
  mail: ["Mail", ["regular", "filled"]],
  calendar_ltr: ["Calendar LTR", ["regular", "filled"]],
  people: ["People", ["regular", "filled"]],
  task_list: ["Task List Square LTR", ["regular", "filled"]],
  filter: ["Filter", ["regular", "filled"]],
  // Folder pane (§3.4)
  compose: ["Compose", ["regular"]],
  mail_inbox: ["Mail Inbox", ["regular", "filled"]],
  drafts: ["Drafts", ["regular", "filled"]],
  send: ["Send", ["regular", "filled"]],
  archive: ["Archive", ["regular", "filled"]],
  // Junk. The mockup's stand-in font used Material "report"; BUILD.md §10 says
  // match the shape, not that font — "mail prohibited" is the Fluent analogue.
  mail_prohibited: ["Mail Prohibited", ["regular", "filled"]],
  delete: ["Delete", ["regular", "filled"]],
  folder: ["Folder", ["regular", "filled"]],
  chevron_right: ["Chevron Right", ["regular"]],
  chevron_down: ["Chevron Down", ["regular"]],
  // Message list toolbar (§3.5)
  checkbox_unchecked: ["Checkbox Unchecked", ["regular"]],
  checkbox_checked: ["Checkbox Checked", ["filled"]],
  checkbox_indeterminate: ["Checkbox Indeterminate", ["regular"]],
  mail_unread: ["Mail Unread", ["regular"]],
  mail_read: ["Mail Read", ["regular"]],
  arrow_sort: ["Arrow Sort", ["regular"]],
  text_density: ["Text Density", ["regular"]],
  panel_right: ["Panel Right", ["regular"]],
  more_horizontal: ["More Horizontal", ["regular"]],
  // Message row (§3.5)
  attach: ["Attach", ["regular"]],
  flag: ["Flag", ["regular", "filled"]],
  pin: ["Pin", ["regular", "filled"]],
  arrow_reply: ["Arrow Reply", ["regular"]],
  // Filled: also the Settings nav's "Forward" section (managesieve), where the
  // selected row is drawn filled (§10).
  arrow_forward: ["Arrow Forward", ["regular", "filled"]],
  // Reading pane ribbon + message body (§3.6)
  arrow_reply_all: ["Arrow Reply All", ["regular"]],
  print: ["Print", ["regular"]],
  open: ["Open", ["regular"]],
  arrow_download: ["Arrow Download", ["regular"]],
  document: ["Document", ["regular"]],
  warning: ["Warning", ["regular", "filled"]],
  chevron_up: ["Chevron Up", ["regular"]],
  // Compose (§4.1). The mockup's stand-in font used Material "open_in_full" for
  // the expand affordance and "mood" for the emoji one; BUILD.md §10 says match
  // the shape, not that font.
  arrow_expand: ["Arrow Expand", ["regular"]],
  emoji: ["Emoji", ["regular"]],
  signature: ["Signature", ["regular"]],
  edit: ["Edit", ["regular"]],
  // Login, notices and empty states (§4.2, §12 step 8)
  eye: ["Eye", ["regular"]],
  eye_off: ["Eye Off", ["regular"]],
  checkmark_circle: ["Checkmark Circle", ["regular"]],
  arrow_clockwise: ["Arrow Clockwise", ["regular"]],
  arrow_upload: ["Arrow Upload", ["regular"]],
  info: ["Info", ["regular"]],
  // Settings nav (§4.4). One per section registered by settings_actions, keyed
  // off the class core puts on the row. Both variants, because the selected row
  // is filled. The mockup's stand-in font used Material "tune" / "badge" /
  // "quickreply" / "key"; BUILD.md §10 says match the shape, not that font.
  options: ["Options", ["regular", "filled"]],
  contact_card: ["Contact Card", ["regular", "filled"]],
  mail_template: ["Mail Template", ["regular", "filled"]],
  key: ["Key", ["regular", "filled"]],
  clock: ["Clock", ["regular", "filled"]],
  // Settings actions (§4.4): create buttons, "Add condition", the folder
  // manager's drag handle and the raw-Sieve editor toggle.
  add: ["Add", ["regular"]],
  folder_add: ["Folder Add", ["regular"]],
  person_add: ["Person Add", ["regular"]],
  reorder: ["Reorder", ["regular"]],
  code: ["Code", ["regular"]],
  // Contacts (§4.5). The directory pane is the folder tree over again, so its
  // rows carry both variants for the same reason folder rows do: the selected
  // one is drawn filled (§10). The mockup's stand-in font used Material
  // "contacts"/"group"; §10 asks for the shape, not that font.
  book_contacts: ["Book Contacts", ["regular", "filled"]],
  people_team: ["People Team", ["regular", "filled"]],
  // Contact actions. The four in §4.5's detail toolbar are already here (edit,
  // mail, arrow_download, delete); these are the rest of what core registers,
  // which the More popover has to be able to name.
  person: ["Person", ["regular"]],
  qr_code: ["QR Code", ["regular"]],
  people_add: ["People Add", ["regular"]],
  people_prohibited: ["People Prohibited", ["regular"]],
  copy: ["Copy", ["regular"]],
  folder_arrow_right: ["Folder Arrow Right", ["regular"]],
  // Plugins (§1.6, §12 step 11). The only glyph the plugin screens need that
  // nothing else already uses: enigma's encryption state on a message. A
  // verified signature reuses checkmark_circle, and the keys screen reuses key,
  // search, add, delete, arrow_upload and arrow_download.
  lock_closed: ["Lock Closed", ["regular"]],
};

function findSvg(folder, size, variant) {
  const dir = path.join(ASSETS, folder, "SVG");
  if (!fs.existsSync(dir)) return null;
  const hit = fs
    .readdirSync(dir)
    .find((f) => f.endsWith(`_${size}_${variant}.svg`));
  return hit ? path.join(dir, hit) : null;
}

const symbols = [];
const missing = [];

for (const [key, [folder, variants]] of Object.entries(ICONS)) {
  for (const variant of variants) {
    const file = findSvg(folder, 20, variant);
    if (!file) {
      missing.push(`${key} (${folder}, ${variant})`);
      continue;
    }
    const raw = fs.readFileSync(file, "utf8");
    const viewBox = (/viewBox="([^"]+)"/.exec(raw) || [, "0 0 20 20"])[1];
    const body = raw
      .replace(/^[\s\S]*?<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "")
      .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')
      .trim();
    symbols.push(
      `<symbol id="${path.basename(file, ".svg")}" viewBox="${viewBox}">${body}</symbol>`
    );
  }
}

if (missing.length) {
  console.error("MISSING:\n  " + missing.join("\n  "));
  process.exit(1);
}

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
<!-- Fluent UI System Icons (MIT) — github.com/microsoft/fluentui-system-icons
     Generated by tools/build-sprite.mjs. Do not edit by hand. -->
${symbols.join("\n")}
</svg>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, sprite);

// Also emit the sprite as a template include. <use> against an EXTERNAL file
// does not inherit currentColor reliably across Chrome/Firefox/Safari, and the
// skin needs one sprite to recolour for light, dark and high contrast — so the
// subset is inlined once per document instead. Same generated source.
const INCLUDE = "skins/businessclass/templates/includes/sprite.html";
fs.mkdirSync(path.dirname(INCLUDE), { recursive: true });
fs.writeFileSync(INCLUDE, sprite);

console.log(`${symbols.length} symbols -> ${OUT} + ${INCLUDE} (${sprite.length} bytes)`);
