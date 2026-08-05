/**
 * BusinessClass skin behaviour (BUILD.md §7).
 *
 * Vanilla ES5-safe, no build step, no framework. Everything here is progressive
 * enhancement: with JS disabled the skin must still list, open and send mail
 * (§1.4, §13), so nothing below is load-bearing for basic function.
 *
 * Namespaced on window.businessclass.
 */
/* global rcmail, rcube_webmail */

(function (window, document) {
  'use strict';

  var businessclass = window.businessclass = window.businessclass || {};

  // Pane width bounds — must match _tokens.scss and businessclass_prefs.php.
  var LIMITS = {
    folders: { min: 200, max: 360, pref: 'businessclass_folders_w', varname: '--bc-folders-w' },
    list: { min: 320, max: 520, pref: 'businessclass_list_w', varname: '--bc-list-w' },
    // The same divider, turned on its side: in the 'desktop' layout the reading
    // pane sits below the list, so it resizes a height against different bounds
    // and a different preference (§3.1).
    listH: { min: 200, max: 640, pref: 'businessclass_list_h', varname: '--bc-list-h' }
  };

  // Folder class (emitted by rcmail_action::folder_classname) -> sprite symbol.
  // 'archive' comes from the archive plugin, which appends to $folder_types.
  var FOLDER_ICONS = {
    inbox: 'mail_inbox',
    drafts: 'drafts',
    sent: 'send',
    archive: 'archive',
    junk: 'mail_prohibited',
    trash: 'delete'
  };

  var CATEGORY_TOKENS = ['important', 'infra', 'finance', 'qa', 'personal', 'waiting'];

  // Plugin toolbar buttons arrive as <a class="button archive">…; they are keyed
  // by the class token the plugin sets, since command names vary between
  // plugin versions. Anything not listed keeps its own text label.
  var PLUGIN_ICONS = {
    archive: 'archive',
    junk: 'mail_prohibited',
    notjunk: 'mail_inbox',
    // enigma's compose button, on every skin that is not Elastic-derived
    // (enigma_ui.php:860) — which is this one.
    enigma: 'lock_closed'
  };

  // A plugin that registers a task of its own adds its rail button through the
  // taskbar container, carrying a class but no icon (help.php:41). At 48px the
  // rail has no room for a text label, so one is put in front of it, keyed off
  // that class. Anything unlisted keeps its label and simply looks plainer.
  var TASK_ICONS = {
    'button-help': 'question_circle',
    'button-calendar': 'calendar_ltr',
    'button-tasks': 'task_list_square_ltr'
  };

  /**
   * Focused / Other (§7.4).
   *
   * Both scopes are raw IMAP searches: the search action drops _filter straight
   * into the SEARCH command (search.php:57), which is the "existing search API"
   * the brief refers to — no server code, no per-message work. Bulk is anything
   * carrying a list or automation header; Focused is the complement.
   *
   * OR takes two arguments in IMAP, so three terms nest as OR a OR b c.
   */
  var BULK_SEARCH = 'OR HEADER LIST-UNSUBSCRIBE "" OR HEADER PRECEDENCE "bulk" HEADER AUTO-SUBMITTED ""';

  var SCOPES = {
    focused: 'NOT (' + BULK_SEARCH + ')',
    other: BULK_SEARCH
  };

  /** Quick actions, in the order the design lays them out (§3.5). */
  var QUICK_ACTIONS = [
    { key: 'archive', icon: 'archive', label: 'bc_quickarchive' },
    { key: 'delete', icon: 'delete', label: 'bc_quickdelete', danger: true },
    { key: 'flag', icon: 'flag', label: 'bc_quickflag' },
    { key: 'pin', icon: 'pin', label: 'bc_quickpin' }
  ];

  // Date group buckets, in the order they are tested (§3.5).
  var DATE_GROUPS = [
    { key: 'today', label: 'today' },
    { key: 'yesterday', label: 'bc_yesterday' },
    { key: 'thisweek', label: 'bc_thisweek' },
    { key: 'lastweek', label: 'bc_lastweek' },
    { key: 'thismonth', label: 'bc_thismonth' },
    { key: 'older', label: 'bc_older' }
  ];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function svgIcon(symbol, variant) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    var use = document.createElementNS(ns, 'use');

    svg.setAttribute('class', 'bc-icon');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#ic_fluent_' + symbol + '_20_' + (variant || 'regular'));
    svg.appendChild(use);

    return svg;
  }

  /** Stable non-cryptographic hash, used only to pick an avatar palette entry. */
  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < String(str).length; i++) {
      hash = ((hash << 5) - hash + String(str).charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function initials(name) {
    var parts = String(name || '').replace(/<[^>]*>/g, '').trim().split(/[\s@._-]+/);
    var out = '';
    for (var i = 0; i < parts.length && out.length < 2; i++) {
      if (parts[i]) out += parts[i].charAt(0);
    }
    return out.toUpperCase() || '?';
  }

  businessclass.initials = initials;
  businessclass.avatarIndex = function (key) { return (hashCode(key) % 6) + 1; };

  /**
   * The bare address out of anything that might contain one.
   *
   * Message rows carry it in the title of the span address_string() built, but
   * that is a whole address string on some paths and a display name on others,
   * and only an address is any use as a photo lookup key.
   */
  function addressOf(value) {
    var found = String(value || '').match(/[^\s<>,;:"']+@[^\s<>,;:"']+\.[^\s<>,;:"']+/);
    return found ? found[0].toLowerCase().replace(/[.,;]+$/, '') : '';
  }

  businessclass.addressOf = addressOf;

  /**
   * Addresses this session has already been told have no photo.
   *
   * Core answers those with a 204, and gives it a day's expiry — but a 204 has
   * no body and browsers are inconsistent about reusing one across a reload, so
   * without this a folder of senders nobody has a picture for would re-ask on
   * every visit. Remembering the misses costs a string per sender and turns the
   * common case into no traffic at all.
   *
   * Deliberately not persisted. It is a negative answer about the outside world
   * that could stop being true at any moment, and a page load is a cheap enough
   * moment to find out.
   */
  var photoMisses = {};

  /**
   * Lay a real photo over an initials avatar, where one exists (§7.10).
   *
   * The src is core's own contacts/photo action: it searches every address book
   * for a contact with this address and a picture, and businessclass_prefs'
   * contact_photo hook redirects to Gravatar when none is found. _error=1 makes
   * it answer 204 rather than a blank GIF when there is nothing at all, which is
   * what lets onerror fire and leave the initials showing.
   *
   * Appended rather than swapped in, so the initials are never removed: whatever
   * happens to the request, the circle still identifies the person.
   */
  businessclass.avatarPhoto = function (el, email, bust) {
    if (!el || !email || !window.rcmail || !rcmail.url || el.querySelector('img')) return;

    // A cache-busted request is asking to be told again, so it skips the memory
    // rather than being refused by it.
    if (!bust && photoMisses[email]) return;

    var img = document.createElement('img');

    // The circle is aria-hidden and the name is always beside it in text, so a
    // photo of the person adds nothing an assistive technology should read.
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', function () {
      photoMisses[email] = true;
      if (img.parentNode) img.parentNode.removeChild(img);
    });

    img.src = rcmail.url('addressbook/photo', {
      _email: email,
      _error: 1,
      // Core sets a one-day expiry on a photo fetched by address, so a change
      // needs a different URL or the browser reuses the old one — including the
      // 204 that stood in for a photo that did not exist yet.
      _bc: bust || null
    });

    el.appendChild(img);
  };

  /**
   * Fill any avatar a template declared with data-bc-avatar="<name or address>".
   *
   * Used by the account circle in the app header (§3.2), which core can only
   * give the login name for — the element itself arrives empty, and .bc-avatar's
   * default palette entry made it a featureless grey disc. data-bc-photo, where
   * businessclass_prefs has published one, is the address a picture is looked up
   * by; the initials stay underneath it either way.
   */
  function decorateDeclaredAvatars(root) {
    var nodes = (root || document).querySelectorAll('[data-bc-avatar]');

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = String(el.getAttribute('data-bc-avatar') || '').trim();

      if (!key || el.firstChild) continue;

      el.classList.add('bc-avatar--' + businessclass.avatarIndex(key));
      el.textContent = initials(key);

      businessclass.avatarPhoto(el, String(el.getAttribute('data-bc-photo') || '').trim());
    }
  }

  /** Announce to screen readers (§9). */
  businessclass.announce = function (text, assertive) {
    var el = document.getElementById(assertive ? 'bc-live-assertive' : 'bc-live');
    if (el) el.textContent = text;
  };

  function savePref(name, value) {
    // Whitelisted by plugins/businessclass_prefs. Without that plugin the request is
    // rejected server-side, so guard rather than throw.
    if (window.rcmail && rcmail.save_pref) {
      rcmail.save_pref({ name: name, value: value });
    }
  }

  // ---------------------------------------------------------------------------
  // Theme (§7.3)
  // ---------------------------------------------------------------------------

  businessclass.setTheme = function (theme) {
    if (['light', 'dark', 'system', 'hc'].indexOf(theme) < 0) theme = 'system';
    document.documentElement.setAttribute('data-bc-theme', theme);
    savePref('businessclass_theme', theme);
    applyBrandArt();
    syncSheetToggle();
  };

  /**
   * Is the app currently painting on a dark surface?
   *
   * The pref alone does not answer this: "system" is a media query, which is why
   * nothing server-side can decide it and why anything that depends on the
   * answer has to be done here. 'hc' counts as dark — its surfaces are black.
   */
  function isDark() {
    var theme = document.documentElement.getAttribute('data-bc-theme');

    if (theme === 'dark' || theme === 'hc') return true;
    if (theme && theme !== 'system') return false;

    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ---------------------------------------------------------------------------
  // Brand artwork that has to change with the surface (§12 step 12, D-67)
  // ---------------------------------------------------------------------------

  /**
   * Swap a logo for its reversed twin on dark surfaces.
   *
   * A logo drawn in dark ink is chosen against a light background — D-59 picked
   * the positive JetHost lockup precisely because the rail is a light neutral.
   * The same artwork measures 1.50:1 on the dark rail and 1.13:1 on the dark
   * login card. It is not faint there, it is absent.
   *
   * Opt-in and non-destructive: an <img> takes part only by carrying a non-empty
   * data-bc-src-dark, which is set from branding.json's logo.rail_dark /
   * logo.login_dark. Every install that has not configured one keeps exactly the
   * behaviour it has today, and the original src is stashed on first run so the
   * swap is reversible however many times the theme changes in a session.
   *
   * Deliberately NOT a CSS filter. invert() on a two-colour lockup produces a
   * colour nobody chose, and a brand is not ours to recolour.
   */
  function applyBrandArt() {
    var nodes = document.querySelectorAll('img[data-bc-src-dark]');
    var dark = isDark();

    for (var i = 0; i < nodes.length; i++) {
      var img = nodes[i];
      var alt = img.getAttribute('data-bc-src-dark');

      if (!alt) continue;                       // no reversed asset configured
      if (!img.hasAttribute('data-bc-src-light')) {
        img.setAttribute('data-bc-src-light', img.getAttribute('src') || '');
      }

      var want = dark ? alt : img.getAttribute('data-bc-src-light');
      if (want && img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }

  function initBrandArt() {
    applyBrandArt();

    // "system" follows the OS, which can change under a session that is left
    // open overnight — the tokens follow it by media query, and the artwork has
    // to follow it too or the two disagree.
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () { applyBrandArt(); syncSheetToggle(); };

      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // ---------------------------------------------------------------------------
  // The message-body sheet (§3.6, §12 step 12, D-68)
  // ---------------------------------------------------------------------------

  /**
   * A sender's HTML follows the theme by default, and this flips it to paper.
   *
   * Outlook darkens the message body too, and can do it safely because it
   * rewrites the sender's CSS server-side before painting. Nothing here can: the
   * body is untrusted and stays inside Roundcube's sanitiser (§3.6), so all a
   * skin can set is the surface behind it. Mail that names a text colour but no
   * background — most newsletters — therefore arrives dark on dark, and this is
   * the one click that fixes it.
   *
   * The state is a preference rather than per-message, because someone whose
   * mail needs paper needs it for the next message too.
   */
  businessclass.setSheet = function (sheet, persist) {
    if (sheet !== 'light') sheet = 'theme';
    document.documentElement.setAttribute('data-bc-sheet', sheet);

    // The message opens in an iframe; the pref lives on the account, so the
    // parent's own <html> is updated too or the next message reverts on load.
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        window.parent.document.documentElement.setAttribute('data-bc-sheet', sheet);
      }
    } catch (e) {
      // A cross-origin parent cannot happen in Roundcube, but a thrown
      // SecurityError here would take the whole toggle down with it.
    }

    if (persist) savePref('businessclass_sheet', sheet);
    syncSheetToggle();
  };

  /**
   * Show the toggle only where it can do something, and name the action it will
   * perform rather than the state it is in.
   *
   * Hidden in light: the sheet and the theme surface are the same paper there,
   * so the button would be a control with no effect. forced-colors hides it too,
   * from _contrast.scss — that decision belongs to the OS, not to this button.
   */
  function syncSheetToggle() {
    var button = document.getElementById('bc-sheet');
    if (!button) return;

    var dark = isDark();
    var onPaper = document.documentElement.getAttribute('data-bc-sheet') === 'light';
    var use = button.querySelector('use');
    var voice = button.querySelector('.voice');
    var text = label(onPaper ? 'bc_sheetdark' : 'bc_sheetlight');

    button.hidden = !dark;
    button.setAttribute('aria-pressed', onPaper ? 'true' : 'false');
    button.title = text;
    if (voice) voice.textContent = text;
    if (use) use.setAttribute('href', '#ic_fluent_weather_' + (onPaper ? 'moon' : 'sunny') + '_20_regular');
  }

  function initSheet() {
    var button = document.getElementById('bc-sheet');
    if (!button) return;

    button.addEventListener('click', function () {
      var onPaper = document.documentElement.getAttribute('data-bc-sheet') === 'light';
      businessclass.setSheet(onPaper ? 'theme' : 'light', true);
      businessclass.announce(label(onPaper ? 'bc_sheetlight' : 'bc_sheetdark'));
    });

    syncSheetToggle();
  }

  // ---------------------------------------------------------------------------
  // Density (§7.2)
  // ---------------------------------------------------------------------------

  /**
   * Comfortable <-> compact (§3.5).
   *
   * Compact is the same DOM re-gridded onto one 28px line, so this is only ever
   * a class and a preference — no list refresh, and no dependence on the layout
   * pref that actually decides how many cells core emits.
   */
  businessclass.setDensity = function (density, persist) {
    if (density !== 'compact') density = 'comfortable';

    var list = document.getElementById('messagelist');
    var button = document.getElementById('bc-density');
    var compact = density === 'compact';

    if (list) list.classList.toggle('bc-density-compact', compact);
    document.documentElement.setAttribute('data-bc-density', density);

    // A menu since D-76, not the two-state toggle §3.5 drew. aria-pressed is
    // still written where a toggle is what is on screen — the message list's
    // own toolbar carried one until the View tab took it — so both shapes stay
    // correct without the caller having to know which is installed.
    if (button) {
      if (button.hasAttribute('aria-pressed')) {
        button.setAttribute('aria-pressed', compact ? 'true' : 'false');
        button.title = label(compact ? 'bc_comfortable' : 'bc_compact');
      }

      checkRadios('bc-density-menu', 'data-bc-density', density);
    }

    if (persist !== false) savePref('businessclass_density', density);
  };

  /** Tick exactly one menuitemradio in a menu, by the value it carries. */
  function checkRadios(menuId, attribute, value) {
    var menu = document.getElementById(menuId);
    if (!menu) return;

    var items = menu.querySelectorAll('[' + attribute + ']');
    for (var i = 0; i < items.length; i++) {
      items[i].setAttribute('aria-checked',
        items[i].getAttribute(attribute) === String(value) ? 'true' : 'false');
    }
  }

  function initDensity() {
    // Reflect the stored preference even where no control is present, so the
    // class is on the list before the first rows land.
    businessclass.setDensity((window.rcmail && rcmail.env.bc_density) || 'comfortable', false);

    initMenu('bc-density', 'bc-density-menu', function (item) {
      var next = item.getAttribute('data-bc-density');
      if (!next) return;

      businessclass.setDensity(next);

      // The key is resolved before the call, not inside it: verify:refs reads
      // the first quoted string in a label() call to check it is shipped to the
      // client, and a ternary there hands it a comparison operand instead.
      var announced = next === 'compact' ? 'bc_compact' : 'bc_comfortable';
      businessclass.announce(label(announced));
    });
  }

  /**
   * How many lines of the message body show under a row (View tab, D-76).
   *
   * A class on the list rather than a token, because the three states are
   * "none", "one line" and "two lines" — the middle one is the truncation the
   * row already had, and only the last needs a line clamp.
   */
  businessclass.setPreview = function (value, persist) {
    if (['off', '1', '2'].indexOf(String(value)) < 0) value = '1';

    var list = document.getElementById('messagelist');

    if (list) {
      list.classList.toggle('bc-preview-off', value === 'off');
      list.classList.toggle('bc-preview-2', value === '2');
    }

    checkRadios('bc-vmessages-menu', 'data-bc-preview', value);

    if (persist !== false) savePref('businessclass_preview', value);
  };

  function initPreview() {
    businessclass.setPreview((window.rcmail && rcmail.env.bc_preview) || '1', false);
  }

  /**
   * Reading-pane position (§3.5).
   *
   * 'layout' is not a save_pref-able preference — it is not on that action's
   * whitelist. Core persists it as a side effect of reloading the list, which
   * set_list_options() does by posting _layout (list.php:63). Going through the
   * core call also keeps env.layout and the list columns in step.
   */
  function initPane() {
    var menu = document.getElementById('bc-pane-menu');
    if (!menu) return;

    function sync() {
      var current = (window.rcmail && rcmail.env.layout) || 'widescreen';
      var items = menu.querySelectorAll('[data-bc-layout]');
      var shell = document.getElementById('layout');

      for (var i = 0; i < items.length; i++) {
        items[i].setAttribute('aria-checked',
          items[i].getAttribute('data-bc-layout') === current ? 'true' : 'false');
      }

      if (shell) shell.setAttribute('data-bc-layout', current);
    }

    initMenu('bc-pane', 'bc-pane-menu', function (item) {
      var next = item.getAttribute('data-bc-layout');
      if (!next || next === rcmail.env.layout) return;

      rcmail.set_list_options(null, undefined, undefined, rcmail.env.threading, next);
    });

    // set_list_options fires this before it reloads, so the shell re-grids at
    // the same moment the list does.
    if (window.rcmail) {
      rcmail.addEventListener('layout-change', function (props) {
        var shell = document.getElementById('layout');
        if (shell) shell.setAttribute('data-bc-layout', props.new_layout);
        sync();
      });
    }

    sync();
  }

  // ---------------------------------------------------------------------------
  // Icon injection
  // ---------------------------------------------------------------------------

  /** Buttons that carry both an icon and a translated label (§3.4 compose). */
  function decorateIconButtons(root) {
    var nodes = (root || document).querySelectorAll('[data-bc-icon]');

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-bc-icon-done')) continue;
      el.insertBefore(svgIcon(el.getAttribute('data-bc-icon')), el.firstChild);
      el.setAttribute('data-bc-icon-done', '1');
    }
  }

  /**
   * Wrap a tree row's label so it can be truncated.
   *
   * render_folder_tree_html and directory_list both put the name into the <a> as
   * a bare text node, and the <a> is a grid — an anonymous grid item cannot be
   * styled, so it can be told neither to stay on one line nor to end in an
   * ellipsis. In a 200px pane that is the difference between a truncated row and
   * one that silently grows to two lines and breaks the 32px rhythm.
   */
  function wrapRowLabel(link) {
    if (link.querySelector('.bc-rowlabel')) return;

    var nodes = [];
    for (var i = 0; i < link.childNodes.length; i++) {
      var node = link.childNodes[i];
      if (node.nodeType === 3 && String(node.nodeValue).trim()) nodes.push(node);
    }

    if (!nodes.length) return;

    var span = document.createElement('span');
    span.className = 'bc-rowlabel';
    link.insertBefore(span, nodes[0]);
    for (var n = 0; n < nodes.length; n++) span.appendChild(nodes[n]);
  }

  /**
   * Collapsible headings in the folder pane (§3.4).
   *
   * The heading and its body are both in the template, already expanded, so a
   * user without JS gets the tree open rather than a heading that will not
   * open — the button is simply inert. [hidden] rather than a class: it is the
   * one way of hiding something that a screen reader and the CSS agree on, and
   * it takes the body out of the tab order along with the display.
   *
   * Not persisted. Which sections of the pane are folded is a property of this
   * sitting, and there is no server pref behind it — see the date groups in the
   * message list, which work the same way for the same reason.
   */
  function initFolderGroups() {
    var heads = document.querySelectorAll('.bc-folders__grouphead');

    for (var i = 0; i < heads.length; i++) {
      heads[i].addEventListener('click', function () {
        var body = document.getElementById(this.getAttribute('aria-controls'));
        if (!body) return;

        var open = this.getAttribute('aria-expanded') !== 'true';
        this.setAttribute('aria-expanded', open ? 'true' : 'false');
        body.hidden = !open;
      });
    }
  }

  // -- Favorites (§3.4) --------------------------------------------------------

  /** The pinned folders, in order. Mirrors businessclass_favorites. */
  var favorites = [];

  /**
   * Which folder a tree row points at.
   *
   * render_folder_tree_html gives the <li> an id built by html_identifier(),
   * which is not reversible, so the name is read off the anchor instead — from
   * the rcmail.command('list', …) call core writes into onclick, falling back to
   * the href's _mbox for any row that arrived without one. Both are core's own
   * output; neither is parsed from anything the user typed.
   */
  function folderOf(li) {
    var a = li.querySelector('a');
    if (!a) return '';

    var onclick = a.getAttribute('onclick') || '';
    var m = /rcmail\.command\(\s*'list'\s*,\s*'((?:\\.|[^'\\])*)'/.exec(onclick);
    if (m) return m[1].replace(/\\(.)/g, '$1');

    m = /[?&]_mbox=([^&"']*)/.exec(a.getAttribute('href') || '');
    return m ? decodeURIComponent(m[1]) : '';
  }

  function isFavorite(folder) {
    return favorites.indexOf(folder) >= 0;
  }

  /**
   * Persist the list. One "\n"-separated string, because that is the only shape
   * save_pref carries — and the separator an IMAP name cannot contain. The
   * plugin re-checks every name against the subscribed folders on the way back
   * out, so this is a convenience, never the authority.
   */
  function saveFavorites() {
    if (window.rcmail && rcmail.save_pref) {
      rcmail.save_pref({ name: 'businessclass_favorites', value: favorites.join('\n') });
    }
  }

  /** The star that pins a folder. One per tree row and per Favorites row. */
  function favButton(folder) {
    var on = isFavorite(folder);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bc-folders__fav';
    btn.setAttribute('data-bc-folder', folder);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = label(on ? 'bc_removefavorite' : 'bc_addfavorite');

    var name = document.createElement('span');
    name.className = 'voice';
    name.textContent = btn.title;
    btn.appendChild(name);

    var icon = svgIcon('star', on ? 'filled' : 'regular');
    icon.setAttribute('class', 'bc-icon bc-icon--16');
    btn.appendChild(icon);

    // The row's anchor is a link; a click that reached it would navigate to the
    // folder as well as pin it.
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var target = this.getAttribute('data-bc-folder');
      var at = favorites.indexOf(target);

      if (at >= 0) favorites.splice(at, 1);
      else favorites.push(target);

      saveFavorites();
      renderFavorites();
      syncFavorites();
      decorateFolderStars();
    });

    return btn;
  }

  /**
   * Build the Favorites list out of the real tree rows.
   *
   * The rows are CLONES, not hand-built links: core wires each anchor to its own
   * list command and writes the row's classes itself, and a link assembled here
   * would be one this skin has to keep in step with render_folder_tree_html for
   * ever. Cloning means the only thing to maintain is what gets stripped —
   * the ids, which must not exist twice, and the children, which belong to the
   * tree rather than to a favourite.
   */
  function renderFavorites() {
    var group = document.getElementById('bc-favorites');
    var out = document.getElementById('bc-favlist');
    var tree = document.getElementById('mailboxlist');
    if (!group || !out || !tree) return;

    out.textContent = '';

    var rows = tree.querySelectorAll('li');
    var found = {};

    for (var i = 0; i < rows.length; i++) {
      var folder = folderOf(rows[i]);
      if (!folder || !isFavorite(folder) || found[folder]) continue;
      found[folder] = rows[i];
    }

    // Ordered by the pref, not by the tree, so the list stays in the order the
    // user pinned things in.
    for (var f = 0; f < favorites.length; f++) {
      var source = found[favorites[f]];
      if (!source) continue;

      var li = source.cloneNode(true);
      li.removeAttribute('id');
      li.setAttribute('data-bc-fav-of', favorites[f]);

      // Sub-folders belong to the tree; a favourite is one folder. The twisty
      // and any nested list go with them.
      var drop = li.querySelectorAll('ul, div.treetoggle, .bc-folders__fav');
      for (var d = 0; d < drop.length; d++) drop[d].parentNode.removeChild(drop[d]);

      var ided = li.querySelectorAll('[id]');
      for (var n = 0; n < ided.length; n++) ided[n].removeAttribute('id');

      li.appendChild(favButton(favorites[f]));
      out.appendChild(li);
    }

    group.hidden = !out.children.length;
  }

  /**
   * Keep the clones in step with the rows they came from.
   *
   * Unread counts and the selected row are written straight into the tree by
   * core, through several different paths (set_unread_count, select_folder, the
   * folder manager). Rather than find and wrap each one, this watches the tree
   * and copies what changed — so anything that edits a folder row, including a
   * plugin, is covered without knowing it exists.
   */
  function syncFavorites() {
    var out = document.getElementById('bc-favlist');
    var tree = document.getElementById('mailboxlist');
    if (!out || !tree || !out.children.length) return;

    var source = {};
    var rows = tree.querySelectorAll('li');
    for (var i = 0; i < rows.length; i++) {
      var folder = folderOf(rows[i]);
      if (folder && !source[folder]) source[folder] = rows[i];
    }

    for (var c = 0; c < out.children.length; c++) {
      var clone = out.children[c];
      var from = source[clone.getAttribute('data-bc-fav-of')];
      if (!from) continue;

      clone.className = from.className;

      var a = clone.querySelector('a');
      var b = from.querySelector('a');
      if (a && b) a.className = b.className;

      // The count element may not exist on either side: core adds it to a folder
      // that becomes unread and removes it again when it is read. A clone taken
      // while the folder was read has nothing to write into, so the element is
      // created here rather than the new count being dropped on the floor.
      var live = from.querySelector('.unreadcount');
      var count = clone.querySelector('.unreadcount');

      if (live && !count && a) {
        count = document.createElement('span');
        count.className = live.className;
        a.appendChild(count);
      }

      if (count) count.textContent = live ? live.textContent : '';
    }
  }

  /** Everything the folder pane needs after core has redrawn the tree. */
  function refreshFolders() {
    decorateFolders();
    renderFavorites();
    syncFavorites();
    decorateFolderStars();
  }

  function initFavorites() {
    var tree = document.getElementById('mailboxlist');
    if (!tree) return;

    var stored = window.rcmail && rcmail.env.bc_favorites;
    favorites = Array.isArray(stored) ? stored.slice() : [];

    renderFavorites();
    syncFavorites();

    // No core event covers every write to a folder row, so the tree itself is
    // the signal. Attributes and character data only — the subtree is small and
    // the callback is a handful of string copies.
    if (window.MutationObserver) {
      new MutationObserver(syncFavorites).observe(tree, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
        attributeFilter: ['class'],
      });
    }
  }

  /**
   * Folder icons (§3.4). render_folder_tree_html emits no icon element, so one
   * is prepended per row from the folder's class. Without JS the 20px grid
   * column stays empty and the list still works.
   */
  function decorateFolders() {
    var list = document.getElementById('mailboxlist');
    if (!list) return;

    var items = list.querySelectorAll('li');

    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var link = li.querySelector('a');
      if (!link || link.querySelector('.bc-icon')) continue;

      var symbol = 'folder';
      for (var name in FOLDER_ICONS) {
        if (li.classList.contains(name)) { symbol = FOLDER_ICONS[name]; break; }
      }

      wrapRowLabel(link);
      link.insertBefore(
        svgIcon(symbol, li.classList.contains('selected') ? 'filled' : 'regular'),
        link.firstChild
      );
    }
  }

  /**
   * The pin star on every tree row (§3.4).
   *
   * A pass of its own rather than part of decorateFolders(), which stops at the
   * first row that already has an icon — that guard is what keeps it idempotent
   * across list refreshes, and it would skip the one thing here that has to be
   * redrawn when the state changes. Replaces rather than mutates, so there is a
   * single place where a star's icon, label and aria-pressed are decided.
   */
  function decorateFolderStars() {
    var list = document.getElementById('mailboxlist');
    if (!list) return;

    var items = list.querySelectorAll('li');

    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var folder = folderOf(li);
      if (!folder) continue;

      var old = li.querySelector(':scope > .bc-folders__fav');
      if (old) old.parentNode.removeChild(old);

      li.appendChild(favButton(folder));
    }
  }

  /** Category filters under the folder tree (§8), from branding.json. */
  function renderCategories() {
    var host = document.getElementById('bc-labellist');
    if (!host || !window.rcmail) return;

    var cats = rcmail.env.bc_categories;
    if (!cats || !cats.length) return;

    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var token = CATEGORY_TOKENS.indexOf(cat.token) >= 0 ? cat.token : 'waiting';

      var swatch = document.createElement('span');
      swatch.className = 'bc-swatch bc-dot--' + token;

      var label = document.createElement('span');
      label.textContent = cat.label || cat.key;

      var button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-bc-keyword', cat.key);
      button.setAttribute('aria-pressed', 'false');
      button.appendChild(swatch);
      button.appendChild(label);

      var li = document.createElement('li');
      li.appendChild(button);
      host.appendChild(li);
    }

    // Filtering by keyword is another raw IMAP search, the same mechanism the
    // Focused/Other tabs use (§8). Clicking the active one clears it.
    host.addEventListener('click', function (event) {
      var target = event.target.closest && event.target.closest('[data-bc-keyword]');
      if (!target || !window.rcmail) return;

      var on = target.getAttribute('aria-pressed') === 'true';
      var buttons = host.querySelectorAll('[data-bc-keyword]');

      for (var b = 0; b < buttons.length; b++) {
        buttons[b].setAttribute('aria-pressed', 'false');
      }

      if (on) {
        rcmail.filter_mailbox('ALL');
      }
      else {
        target.setAttribute('aria-pressed', 'true');
        rcmail.filter_mailbox('KEYWORD ' + target.getAttribute('data-bc-keyword'));
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Message list (§3.5)
  //
  // Everything here decorates the markup rcube_webmail builds in
  // add_message_row(); no row is ever created or moved by this skin (§1.3).
  // ---------------------------------------------------------------------------

  function messagelist() {
    return document.getElementById('messagelist');
  }

  function label(key) {
    return window.rcmail && rcmail.get_label ? rcmail.get_label(key) : key;
  }

  /**
   * Avatar + preview text + accessible name for one row.
   *
   * Called from the list widget's 'insertrow' event, whose row object has
   * already been merged with rcmail.env.messages[uid] — so row.flags holds
   * whatever businessclass_prefs and businessclass_preview put in extra_flags.
   */
  function decorateRow(event) {
    var row = event.row;
    var tr = row && row.obj;
    if (!tr) return;

    var cell = tr.querySelector('td.subject');
    if (!cell || cell.querySelector('.bc-avatar')) return;

    var fromto = cell.querySelector('span.fromto');
    var subject = cell.querySelector('span.subject a');
    var date = cell.querySelector('span.date');

    var sender = fromto ? String(fromto.textContent || '').trim() : '';
    // address_string() wraps the display name in a span carrying the full
    // address; that is the stable key for the palette, per §4.5.
    var titled = fromto ? fromto.querySelector('[title]') : null;
    var key = (titled && titled.getAttribute('title')) || sender;

    var avatar = document.createElement('span');
    avatar.className = 'bc-avatar bc-avatar--' + businessclass.avatarIndex(key);
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(sender);
    cell.insertBefore(avatar, cell.firstChild);

    // The sender's real picture, where there is one (§7.10, D-78). This reverses
    // D-26, which kept list rows on initials because fifty rows meant fifty
    // lookups; the three things that decision asked for before it were reversed
    // are all here — the <img> is loading="lazy" so a row below the fold costs
    // nothing until it is scrolled to, an address already known to have no photo
    // is never asked about twice (photoMisses), and the redirect the server
    // builds now carries a day's expiry so the browser stops re-asking.
    //
    // Layered over the initials rather than replacing them, so the circle
    // identifies the sender from the first frame and keeps doing so if the
    // request 204s, times out, or never returns at all.
    if (rcmail.env.bc_avatars) {
      businessclass.avatarPhoto(avatar, addressOf(key));
    }

    var extra = row.flags || {};

    if (extra.snippet) {
      var line = document.createElement('span');
      line.className = 'bc-snippet';
      line.textContent = extra.snippet;
      cell.appendChild(line);
    }

    var folder = decorateFolderChip(cell, row);
    var categories = decorateCategories(cell, extra.cats);
    decorateThread(tr, row);
    decoratePin(tr, extra.pinned);
    addQuickActions(cell, tr, row);

    // §9: unread is weight + bar + an aria-label prefix, never colour alone.
    // An explicit name also makes the row independent of the aria-labelledby
    // that the widget points at td.subject, which has no box of its own.
    decorateAttachmentMark(tr);

    var parts = [];
    if (tr.classList.contains('unread')) parts.push(label('unread'));
    if (sender) parts.push(sender);
    if (subject) parts.push(String(subject.textContent || '').trim());
    if (date) parts.push(String(date.textContent || '').trim());
    if (tr.querySelector('span.attachment')) parts.push(label('withattachment'));
    if (tr.classList.contains('flagged')) parts.push(label('flagged'));
    if (extra.pinned) parts.push(pluginLabel('bc_pinned'));
    if (folder) parts.push(folder);

    // Compact collapses a chip to its dot, so the name is the only place the
    // category is still readable there (§8, §9).
    if (categories.length) parts.push(categories.join(', '));

    tr.setAttribute('aria-label', parts.join(', '));
  }

  /**
   * Put the paperclip in the flags cell (step 14).
   *
   * Core emits `<span class="attachment" title="…"></span>` — empty (app.js:2347),
   * because every stock skin fills it from an icon font the §10 rules put out of
   * reach here. So the mark was a 16px box with nothing in it: in the list, a
   * message with an attachment looked exactly like one without.
   *
   * It is an accessibility bug in the direction people do not usually look for.
   * The row's aria-label has said "with attachment" since step 3 (below), so a
   * screen reader was told and a sighted user was not — the information existed
   * and only the eye was missing it.
   *
   * .report and .encrypted are the same shape and are left alone: both are
   * plugin territory (§1.6) and neither has an agreed glyph in §10.
   */
  function decorateAttachmentMark(tr) {
    var mark = tr.querySelector('span.attachment');
    if (!mark || mark.querySelector('svg')) return;

    // The title core set is the accessible name; the glyph must not add a second.
    mark.appendChild(svgIcon('attach'));
  }

  /** Plugin-scoped label; businessclass_prefs ships its own texts. */
  function pluginLabel(key) {
    return label('businessclass_prefs.' + key);
  }

  /**
   * Category chips (§8), from the keywords businessclass_prefs forwarded.
   *
   * Returns the visible labels so the row's accessible name can carry them,
   * which is what keeps compact density honest — there the chip is only a dot.
   */
  /**
   * The row's chip line, created on demand.
   *
   * Every child of td.subject is placed explicitly in the row grid, so anything
   * added has to go through a container that has a cell of its own. Categories
   * and the search folder chip share this one, which is why it is lazy: a row
   * with neither must not grow a fourth empty line.
   */
  function rowMeta(cell) {
    var wrap = cell.querySelector('.bc-cats');

    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'bc-cats';
      cell.appendChild(wrap);
    }

    return wrap;
  }

  function decorateCategories(cell, tokens) {
    if (!tokens || !tokens.length || !window.rcmail) return [];

    var defined = rcmail.env.bc_categories || [];
    var chips = [];
    var names = [];

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (CATEGORY_TOKENS.indexOf(token) < 0) continue;

      var text = token;
      for (var d = 0; d < defined.length; d++) {
        if (defined[d].token === token) { text = defined[d].label || token; break; }
      }

      var chip = document.createElement('span');
      chip.className = 'bc-chip bc-chip--' + token;
      chip.textContent = text;
      chip.title = text;
      chips.push(chip);
      names.push(text);
    }

    if (chips.length) {
      var wrap = rowMeta(cell);
      for (var c = 0; c < chips.length; c++) wrap.appendChild(chips[c]);
    }

    return names;
  }

  /**
   * Threading (§3.5): real indent per level, and a count pill on the parent.
   *
   * Core sizes span.branch inline at 15px a level and offers no count, so the
   * depth moves onto the row as a custom property the stylesheet can use, and
   * the pill is built from the thread's own child counters.
   */
  function decorateThread(tr, row) {
    if (row.depth) {
      tr.setAttribute('data-bc-depth', String(row.depth));
      tr.style.setProperty('--bc-depth', String(row.depth));
    }
  }

  /**
   * Count pill on each thread root (§3.5).
   *
   * Core sends only unread_children, which says nothing about a thread that has
   * been read, so the size is counted from the rows themselves. This runs after
   * a list update rather than per row because a root arrives before its
   * children do. Collapsed children are still in the DOM — core hides them with
   * display:none rather than leaving them out — so the count is right either way.
   */
  function renderThreadCounts() {
    var list = window.rcmail && rcmail.message_list;
    if (!list || !list.tbody || !rcmail.env.threading) return;

    var rows = list.tbody.children;
    var root = null;
    var count = 0;

    function flush() {
      if (!root) return;

      var subject = root.querySelector('span.subject');
      var existing = subject && subject.querySelector('.bc-threadcount');

      if (existing) existing.parentNode.removeChild(existing);

      // A thread of one is just a message.
      if (subject && count > 0) {
        var pill = document.createElement('span');
        pill.className = 'bc-threadcount';
        pill.textContent = String(count + 1);
        pill.title = label('bc_thread');
        subject.appendChild(pill);
      }
    }

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!tr.className || tr.className.indexOf('message') < 0) continue;

      if (tr.hasAttribute('data-bc-depth')) {
        count++;
      }
      else {
        flush();
        root = tr;
        count = 0;
      }
    }

    flush();
  }

  function decoratePin(tr, pinned) {
    tr.classList.toggle('bc-pinned', !!pinned);

    var flags = tr.querySelector('td.flags');
    if (!flags || flags.querySelector('.bc-pinmark')) return;

    var mark = document.createElement('span');
    mark.className = 'bc-pinmark';
    mark.title = pluginLabel('bc_pinned');
    mark.appendChild(svgIcon('pin', 'filled'));
    flags.appendChild(mark);
  }

  /**
   * Hover quick actions (§3.5, §7.5).
   *
   * Real buttons in the row, not an overlay, so they are in the tab order and
   * reachable by keyboard once the row has focus. They replace the timestamp on
   * hover and are hidden entirely to a coarse pointer, where §6 makes the same
   * actions swipes instead.
   */
  function addQuickActions(cell, tr, row) {
    if (cell.querySelector('.bc-quickactions')) return;

    var group = document.createElement('span');
    group.className = 'bc-quickactions';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label('bc_quickactions'));

    for (var i = 0; i < QUICK_ACTIONS.length; i++) {
      var action = QUICK_ACTIONS[i];

      // Archive only exists when the archive plugin is configured.
      if (action.key === 'archive' && !(window.rcmail && rcmail.env.archive_folder)) continue;

      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'bc-quickactions__btn' + (action.danger ? ' is-danger' : '');
      button.setAttribute('data-bc-action', action.key);
      button.setAttribute('tabindex', '-1');
      button.title = label(action.label);
      button.appendChild(svgIcon(action.icon));

      var name = document.createElement('span');
      name.className = 'voice';
      name.textContent = label(action.label);
      button.appendChild(name);

      group.appendChild(button);
    }

    syncQuickActions(group, tr, row);
    cell.appendChild(group);
  }

  function syncQuickActions(group, tr, row) {
    var flag = group.querySelector('[data-bc-action="flag"]');
    var pin = group.querySelector('[data-bc-action="pin"]');

    if (flag) {
      var flagged = tr.classList.contains('flagged');
      flag.setAttribute('aria-pressed', flagged ? 'true' : 'false');
      flag.title = label(flagged ? 'bc_quickunflag' : 'bc_quickflag');
    }

    if (pin) {
      var pinned = tr.classList.contains('bc-pinned');
      pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      pin.title = pluginLabel(pinned ? 'bc_unpin' : 'bc_pin');
    }
  }

  /**
   * One delegated listener for every row's quick actions (§7.5), rather than
   * handlers per row — the list is rebuilt on every folder change.
   */
  function initQuickActions() {
    var table = messagelist();
    if (!table || table.getAttribute('data-bc-quick')) return;
    table.setAttribute('data-bc-quick', '1');

    table.addEventListener('click', function (event) {
      var button = event.target.closest && event.target.closest('[data-bc-action]');
      if (!button) return;

      var tr = button.closest('tr');
      var uid = tr && rcmail.message_list.get_row_uid(tr);
      if (!uid) return;

      event.stopPropagation();
      event.preventDefault();

      // Act on the clicked row, not on whatever happened to be selected.
      rcmail.message_list.select(uid);

      switch (button.getAttribute('data-bc-action')) {
        case 'archive':
          rcmail.command('plugin.archive', '', button);
          break;
        case 'delete':
          rcmail.command('delete', '', button);
          break;
        case 'flag':
          rcmail.command('mark', tr.classList.contains('flagged') ? 'unflagged' : 'flagged', button);
          break;
        case 'pin':
          businessclass.pin(uid, !tr.classList.contains('bc-pinned'));
          break;
      }
    });
  }

  /**
   * Pin or unpin (§7.5). The $Pinned keyword is not something core's 'mark'
   * command knows, so this goes to the action businessclass_prefs registers.
   */
  businessclass.pin = function (uid, set) {
    if (!window.rcmail) return;

    var lock = rcmail.set_busy(true, 'loading');

    rcmail.http_post('plugin.businessclass.pin', {
      _uid: uid,
      _mbox: rcmail.env.mailbox,
      _set: set ? '1' : '0'
    }, lock);
  };

  /** Server confirmation; only then does the row change (see businessclass_prefs). */
  function onPinned(props) {
    var list = window.rcmail && rcmail.message_list;
    if (!list || !props || !props.uids) return;

    for (var i = 0; i < props.uids.length; i++) {
      var row = list.rows[props.uids[i]];
      if (!row || !row.obj) continue;

      row.obj.classList.toggle('bc-pinned', !!props.set);

      var group = row.obj.querySelector('.bc-quickactions');
      if (group) syncQuickActions(group, row.obj, row);

      var message = rcmail.env.messages[props.uids[i]];
      if (message) {
        message.flags = message.flags || {};
        message.flags.pinned = props.set ? 1 : 0;
      }
    }

    businessclass.announce(pluginLabel(props.set ? 'bc_pinned' : 'bc_unpin'));
    sortPinnedToTop();
  }

  /**
   * Float pinned rows to the top of the loaded page (§7.5).
   *
   * Only the current page: the order itself comes from the server, and pinning
   * across a whole folder would mean the plugin taking over how the list is
   * built. Reordering the DOM is safe for navigation because the list widget
   * walks siblings rather than an index.
   */
  function sortPinnedToTop() {
    var list = window.rcmail && rcmail.message_list;
    if (!list || !list.tbody) return;

    var rows = list.tbody.querySelectorAll('tr.bc-pinned');
    var first = list.tbody.firstChild;

    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i] !== first) list.tbody.insertBefore(rows[i], list.tbody.firstChild);
    }
  }

  /**
   * Focused / Other tabs (§7.4). The chosen scope is remembered per folder in
   * sessionStorage, so it lasts the session without becoming a stored setting.
   */
  // -- The ribbon (D-75) -------------------------------------------------------

  /**
   * Home / View / Help, and the folder-pane toggle beside them.
   *
   * A separate tablist from Focused/Other, sharing the component but not the
   * behaviour: these switch which command row is on screen, and switch nothing
   * on the server. Both are wired by aria-controls, so the markup states the
   * relationship a screen reader is told about and the script reads it back
   * rather than keeping a second copy of it.
   */
  function initRibbon() {
    var bar = document.getElementById('bc-ribbonbar');
    if (!bar) return;

    var tabs = bar.querySelectorAll('.bc-tabs__tab');

    function select(tab) {
      for (var i = 0; i < tabs.length; i++) {
        var on = tabs[i] === tab;
        var panel = document.getElementById(tabs[i].getAttribute('aria-controls'));

        tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
        // Roving tabindex: a tablist is one tab stop and the arrows move inside
        // it, so only the selected tab is reachable with Tab (§9).
        tabs[i].setAttribute('tabindex', on ? '0' : '-1');
        if (panel) panel.hidden = !on;
      }

      // Nothing to do about the overflow rule here: initOverflow() watches each
      // bar with a ResizeObserver, and going from hidden to shown is a resize —
      // a panel that was 0 wide while hidden is measured the moment it is not.
    }

    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { select(this); });

      tabs[i].addEventListener('keydown', function (event) {
        var all = Array.prototype.slice.call(tabs);
        var index = all.indexOf(this);
        var next = null;

        if (event.key === 'ArrowRight') next = all[(index + 1) % all.length];
        else if (event.key === 'ArrowLeft') next = all[(index - 1 + all.length) % all.length];
        else return;

        next.focus();
        next.click();
        event.preventDefault();
      });
    }

    var toggle = document.getElementById('bc-folderpane');

    if (toggle) {
      toggle.addEventListener('click', function () {
        setFolderPane(this.getAttribute('aria-pressed') !== 'true');
      });
    }

    // Two controls, one state (D-76): the hamburger beside the tabs and the
    // View tab's "Folder pane" menu, exactly as Outlook has both. They are
    // routed through setFolderPane() rather than each toggling the class, so
    // neither can end up describing a state the other just changed.
    initMenu('bc-folderpane-menu-btn', 'bc-folderpane-menu', function (item) {
      var choice = item.getAttribute('data-bc-folderpane');
      if (choice) setFolderPane(choice === 'hide');
    });

    initView();
    syncRibbonCommands();
    initOverflow('bc-ribbon-view', '.bc-ribbon__more');
  }

  // ---------------------------------------------------------------------------
  // Breakpoints (§6, D-79)
  // ---------------------------------------------------------------------------

  /**
   * Below this the folder pane stops being a column and becomes a drawer.
   * Kept in step with the bc-medium/bc-wide boundary in _mixins.scss by hand;
   * there is no way to read a Sass breakpoint back out of the compiled CSS.
   */
  var DRAWER_MQ = '(max-width: 1199px)';

  /** Below this the reading pane covers the list. The bc-narrow mixin's width. */
  var COVER_MQ = '(max-width: 767px)';

  /** What the user had chosen at full width, to give back on the way out. */
  var wideFolderState = null;

  /**
   * Fold the folder pane away on narrow screens, and give it back on the way
   * out (§6).
   *
   * The pane is collapsed rather than restyled in place: below 1200px it costs
   * 236px of a 1024px tablet before a single message is shown, and on a phone
   * there is no width left to put anything in. _responsive.scss then floats it
   * over the list when it is reopened, so the same button still works — it just
   * no longer takes the room from the list.
   *
   * The user's own choice is remembered rather than overwritten. Someone who
   * hides the pane on a desktop, narrows the window and widens it again gets it
   * back hidden; someone who had it showing gets it back showing. Nothing here
   * is persisted either way — this is a response to the window, not a
   * preference, and writing it would let a phone dictate what a desktop sees.
   */
  function initResponsive() {
    if (!window.matchMedia) return;

    var mq = window.matchMedia(DRAWER_MQ);
    var shell = document.getElementById('layout');
    if (!shell) return;

    function apply(narrow) {
      if (narrow) {
        // Only on the way in. Re-reading it while already narrow would capture
        // the collapsed state and lose what the user actually chose.
        if (wideFolderState === null) {
          wideFolderState = shell.classList.contains('bc-folders-hidden');
        }
        setFolderPane(true);
      } else if (wideFolderState !== null) {
        setFolderPane(wideFolderState);
        wideFolderState = null;
      }
    }

    apply(mq.matches);

    // addEventListener on a MediaQueryList is the modern spelling; addListener
    // is the one Safari understood until 14.
    if (mq.addEventListener) mq.addEventListener('change', function (e) { apply(e.matches); });
    else if (mq.addListener) mq.addListener(function (e) { apply(e.matches); });

    // Crossing 768px with a message already open changes what is covered without
    // changing the folder pane, so setFolderPane()'s call is not enough on its
    // own — a tablet turned to landscape has to give the list back.
    var cover = window.matchMedia(COVER_MQ);
    if (cover.addEventListener) cover.addEventListener('change', syncOverlayInert);
    else if (cover.addListener) cover.addListener(syncOverlayInert);

    syncOverlayInert();

    // Dismissing the drawer. The scrim is a ::before on the shell rather than an
    // element (_responsive.scss), so a click on it arrives with the shell itself
    // as the target — which is also true of no other part of the shell, since
    // every pane covers its own area.
    shell.addEventListener('click', function (event) {
      if (event.target === shell && mq.matches
        && !shell.classList.contains('bc-folders-hidden')) {
        setFolderPane(true);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || !mq.matches) return;
      if (shell.classList.contains('bc-folders-hidden')) return;

      setFolderPane(true);

      // Focus would otherwise be left inside a pane that is no longer on screen.
      var toggle = document.getElementById('bc-folderpane');
      if (toggle) toggle.focus();
    });
  }

  /**
   * The way back to the list from a message that is covering it (§6).
   *
   * Only reachable below 768px, where _responsive.scss turns the reading pane
   * into an overlay. Everything else the pane could offer is in the command bar
   * above it (D-75), so this is the one control it owns.
   *
   * show_contentframe(false) is core's own way of saying "nothing is open"; the
   * skin already wraps it to put .is-empty on the pane, and that class is what
   * the overlay keys off. The selection is cleared as well, or tapping the same
   * message again would select an already-selected row and open nothing.
   */
  function initReadingBack() {
    var button = document.querySelector('.bc-reading__back');
    if (!button) return;

    button.addEventListener('click', function () {
      if (!window.rcmail) return;

      if (rcmail.show_contentframe) rcmail.show_contentframe(false);

      var list = rcmail.message_list || rcmail.contact_list;
      if (list && list.clear_selection) list.clear_selection();

      // Back to where the reader came from, rather than to the top of the page.
      var selected = document.querySelector('#layout-list tr.selected, #layout-list li.selected');
      if (selected && selected.focus) selected.focus();
    });
  }

  /** Show or hide the folder pane, and tell both controls about it. */
  function setFolderPane(hidden) {
    var shell = document.getElementById('layout');
    var toggle = document.getElementById('bc-folderpane');

    if (shell) shell.classList.toggle('bc-folders-hidden', hidden);

    // aria-pressed says "the folder pane is hidden", which is the state this
    // button puts the app in — not "the pane is showing".
    if (toggle) toggle.setAttribute('aria-pressed', hidden ? 'true' : 'false');

    checkRadios('bc-folderpane-menu', 'data-bc-folderpane', hidden ? 'hide' : 'show');
    syncOverlayInert();
  }

  /**
   * Take the covered content out of the tab order while something floats over it
   * (§9, step 14).
   *
   * Below 1200px the folder pane is a drawer over the list, and below 768px the
   * reading pane covers the list entirely — both drawn by _responsive.scss with
   * position and z-index, which a stylesheet can do and the accessibility tree
   * knows nothing about. Without this, Tab walks from the open drawer straight
   * into a list nobody can see, and a screen reader reads a covered message list
   * as though it were on screen.
   *
   * `inert` rather than aria-hidden: aria-hidden would silence it while leaving
   * every control in it tabbable, which is the worse of the two failures.
   * Supported everywhere the skin targets; where it is not, nothing changes and
   * the behaviour is what it was before this function existed.
   */
  function syncOverlayInert() {
    var shell = document.getElementById('layout');
    var list = document.getElementById('layout-list');
    var folders = document.getElementById('layout-sidebar');
    var pane = document.getElementById('layout-content');
    if (!shell || !window.matchMedia) return;

    var drawerOpen = window.matchMedia(DRAWER_MQ).matches
      && !shell.classList.contains('bc-folders-hidden');

    // The same signal _responsive.scss draws the overlay from: below 768px the
    // pane is absolutely positioned over everything unless it is .is-empty.
    var covered = window.matchMedia(COVER_MQ).matches
      && !!pane && !pane.classList.contains('is-empty')
      && !shell.classList.contains('bc-shell--settings-plain');

    // The drawer covers the list; the open message covers both. Ordered so the
    // narrower case wins: with a message open on a phone the drawer is shut.
    if (list) list.inert = drawerOpen || covered;
    if (folders) folders.inert = covered;
  }

  /** The View tab's Messages menu: conversation grouping and preview lines. */
  function initView() {
    initPreview();
    syncThreads();

    initMenu('bc-vmessages', 'bc-vmessages-menu', function (item) {
      var preview = item.getAttribute('data-bc-preview');
      if (preview) {
        businessclass.setPreview(preview);
        return;
      }

      var threads = item.getAttribute('data-bc-threads');
      if (threads === null || !window.rcmail) return;

      // Threading is not a save_pref-able preference either. set_list_options()
      // is how core persists it, the same call the reading-pane position goes
      // through — its fourth argument is the threading flag (list.php:63).
      if (Number(threads) === Number(rcmail.env.threading)) return;

      rcmail.set_list_options(null, undefined, undefined, Number(threads), rcmail.env.layout);
    });
  }

  function syncThreads() {
    checkRadios('bc-vmessages-menu', 'data-bc-threads',
      (window.rcmail && rcmail.env.threading) ? '1' : '0');
  }

  /**
   * Hide any ribbon control whose command core has not registered.
   *
   * Roundcube's command set is not part of the skin API and differs by version
   * and by which plugins are loaded, so a skin cannot know from its templates
   * whether "checkmail" or "expand-all" exist on this install. Binding a button
   * to a command that was never registered leaves it permanently disabled — a
   * control offering the user something their server cannot do, which is the one
   * thing this ribbon was built not to have (D-75).
   *
   * rcmail.commands holds every command enable_command() has touched, including
   * the ones currently disabled — so presence as a key is the test, and a false
   * value means "exists, not available right now", which core already draws.
   *
   * [hidden], not removal, and re-run on every list update: a command can be
   * registered late — expand-all only appears once threading is on — and a
   * control deleted at startup would stay gone until the page was reloaded.
   * [hidden] takes it out of the tab order and the accessibility tree just as
   * removal would, and can be undone the moment the command shows up.
   *
   * Driven by an explicit data-bc-command, not by parsing the onclick core
   * writes. Two reasons, and both matter: the attribute says which buttons this
   * is *meant* to govern, so a command that is simply absent from rcmail.commands
   * at the moment this runs cannot silently hide a button nobody was unsure
   * about; and it does not depend on the shape of core's generated markup.
   */
  function syncRibbonCommands() {
    var bar = document.getElementById('bc-ribbonbar');
    if (!bar || !window.rcmail || !rcmail.commands) return;

    var items = bar.querySelectorAll('[data-bc-command]');

    for (var i = 0; i < items.length; i++) {
      var command = items[i].getAttribute('data-bc-command');
      var item = items[i].closest('.bc-ribbon__item') || items[i];

      item.hidden = !(command in rcmail.commands);
    }
  }

  function initTabs() {
    // [data-bc-scope], not .bc-tabs__tab: the ribbon's Home/View/Help use the
    // same tab component (D-75) and an unqualified selector would wire them to
    // applyScope(null) and drag them into this tablist's arrow navigation.
    var tabs = document.querySelectorAll('.bc-tabs__tab[data-bc-scope]');
    if (!tabs.length || !window.rcmail) return;

    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        applyScope(this.getAttribute('data-bc-scope'), true);
      });

      // A tablist is one tab stop; arrows move between the tabs (§9).
      tabs[i].addEventListener('keydown', function (event) {
        var all = Array.prototype.slice.call(document.querySelectorAll('.bc-tabs__tab[data-bc-scope]'));
        var index = all.indexOf(this);
        var next = null;

        if (event.key === 'ArrowRight') next = all[(index + 1) % all.length];
        else if (event.key === 'ArrowLeft') next = all[(index - 1 + all.length) % all.length];
        else return;

        next.focus();
        next.click();
        event.preventDefault();
      });
    }

    restoreScope();
  }

  /**
   * Re-apply the folder's remembered scope after a list update.
   *
   * Roundcube has no "folder changed" event to hang this on, so it runs on
   * every update and compares the filter already in force with the one wanted.
   * That comparison is also the loop guard: filter_mailbox triggers another
   * update, but by then the two agree and nothing further happens.
   */
  function restoreScope() {
    // Qualified for the reason initTabs() is: the ribbon's tabs are the same
    // component, and an unqualified test would report Focused/Other as present
    // on every install and filter the mailbox for a control that is not there.
    if (!window.rcmail || !document.querySelector('.bc-tabs__tab[data-bc-scope]')) return;

    var scope = scopeFor(rcmail.env.mailbox);
    var want = SCOPES[scope];

    syncTabs(scope);

    if ((rcmail.env.search_filter || '') === want) return;

    // Never fight a search the user started themselves.
    if (rcmail.env.search_request) return;

    rcmail.filter_mailbox(want);
  }

  function scopeKey(folder) {
    return 'bc-scope:' + (folder || '');
  }

  function scopeFor(folder) {
    try {
      return window.sessionStorage.getItem(scopeKey(folder)) || 'focused';
    }
    catch (e) {
      return 'focused';
    }
  }

  function applyScope(scope, request) {
    if (!SCOPES[scope]) scope = 'focused';

    try {
      window.sessionStorage.setItem(scopeKey(rcmail.env.mailbox), scope);
    }
    catch (e) { /* private browsing; the tab still works for this view */ }

    syncTabs(scope);

    if (request) rcmail.filter_mailbox(SCOPES[scope]);
  }

  function syncTabs(scope) {
    var tabs = document.querySelectorAll('.bc-tabs__tab[data-bc-scope]');

    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-bc-scope') === scope;
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].setAttribute('tabindex', on ? '0' : '-1');
    }
  }

  /** Which "Today / Yesterday / …" bucket a timestamp falls in. */
  function dateGroup(seconds, now) {
    var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var when = seconds * 1000;
    var day = 86400000;

    if (when >= midnight) return 'today';
    if (when >= midnight - day) return 'yesterday';
    if (when >= midnight - day * 7) return 'thisweek';
    if (when >= midnight - day * 14) return 'lastweek';
    if (when >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()) return 'thismonth';

    return 'older';
  }

  function groupLabel(key) {
    for (var i = 0; i < DATE_GROUPS.length; i++) {
      if (DATE_GROUPS[i].key === key) return label(DATE_GROUPS[i].label);
    }
    return '';
  }

  /**
   * Which date groups the user has collapsed, keyed by group name.
   *
   * Module-level rather than per-render: the list is rebuilt on every page,
   * search, sort and folder change, and a heading that sprang back open each
   * time would make collapsing it pointless. Not persisted to the server —
   * "Last month is collapsed" is a property of this sitting, not of the account.
   */
  var collapsedGroups = {};

  /**
   * Show or hide the rows under each heading, from `collapsedGroups`.
   *
   * Hiding is display:none, which is also what the list widget treats as an
   * absent row (list.js:959) — so a collapsed group drops out of j/k navigation
   * and out of select-all with no further help, because the widget tests the
   * same property this does.
   *
   * Only rows this function hid are ever shown again, which is what
   * data-bc-collapsed records. Core hides rows too — a search that filters the
   * list leaves them in the tbody at display:none — and clearing that blindly
   * would put messages back on screen that the user had filtered away.
   */
  function applyGroupCollapse() {
    var table = messagelist();
    if (!table) return;

    var headers = table.querySelectorAll('tr.bc-group');

    for (var i = 0; i < headers.length; i++) {
      var header = headers[i];
      var toggle = header.querySelector('.bc-group__toggle');
      var key = toggle && toggle.getAttribute('data-bc-group');
      var collapsed = !!(key && collapsedGroups[key]);

      if (toggle) toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      header.classList.toggle('bc-group--collapsed', collapsed);

      var row = header.nextSibling;

      while (row) {
        if (row.nodeType === 1) {
          if (String(row.className).indexOf('bc-group') >= 0) break;

          if (collapsed) {
            if (row.style.display !== 'none') {
              row.setAttribute('data-bc-collapsed', '1');
              row.style.display = 'none';
            }
          } else if (row.getAttribute('data-bc-collapsed')) {
            row.removeAttribute('data-bc-collapsed');
            row.style.display = '';
          }
        }

        row = row.nextSibling;
      }
    }
  }

  /**
   * Insert sticky date headings between rows.
   *
   * Only meaningful while the list is sorted by date, so any other sort column
   * simply removes them. Timestamps come from businessclass_prefs — the date column
   * itself reaches the browser already formatted and cannot be parsed back.
   */
  function renderDateGroups() {
    var list = window.rcmail && rcmail.message_list;
    var table = messagelist();
    if (!list || !list.tbody || !table) return;

    var stale = table.querySelectorAll('tr.bc-group');
    for (var s = 0; s < stale.length; s++) {
      stale[s].parentNode.removeChild(stale[s]);
    }

    // Undo the previous pass's collapsing before deciding anything. The loop
    // below skips hidden rows — that is how it stays out of core's filtering —
    // so a group left collapsed would contribute no visible row, get no heading,
    // and become the one group with no way back open.
    var hidden = table.querySelectorAll('tr[data-bc-collapsed]');
    for (var h = 0; h < hidden.length; h++) {
      hidden[h].removeAttribute('data-bc-collapsed');
      hidden[h].style.display = '';
    }

    if (['date', 'arrival'].indexOf(rcmail.env.sort_col) < 0) return;

    var now = new Date();
    var current = null;
    var rows = list.tbody.children;

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.style.display === 'none' || !tr.className || tr.className.indexOf('message') < 0) {
        continue;
      }

      // Pinned rows have been lifted out of date order, so a heading above them
      // would describe the wrong thing. They sit above the first one instead.
      if (tr.classList.contains('bc-pinned')) continue;

      var message = rcmail.env.messages[list.get_row_uid(tr)];
      var stamp = message && message.flags && message.flags.ts;
      if (!stamp) continue;

      var group = dateGroup(stamp, now);
      if (group === current) continue;
      current = group;

      // A real <button>, not a styled <td>: collapsing a group is an action, and
      // aria-expanded on anything else means nothing. The chevron is decorative
      // — the button's name is the group label, and its state is the attribute.
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'bc-group__toggle';
      toggle.setAttribute('data-bc-group', group);
      toggle.setAttribute('aria-expanded', 'true');
      var chevron = svgIcon('chevron_down');
      chevron.setAttribute('class', 'bc-icon bc-icon--16 bc-group__chevron');
      toggle.appendChild(chevron);

      var name = document.createElement('span');
      name.textContent = groupLabel(group);
      toggle.appendChild(name);

      // The list widget binds selection on the tbody, so a click that reaches it
      // from here would also move the selection to whatever row is underneath.
      toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = this.getAttribute('data-bc-group');
        collapsedGroups[key] = !collapsedGroups[key];
        applyGroupCollapse();
      });

      var cell = document.createElement('td');
      cell.appendChild(toggle);

      var header = document.createElement('tr');
      header.className = 'bc-group';
      // Presentational: the rows it separates already carry their own date, and
      // the only thing here that a screen reader needs is the button.
      header.setAttribute('role', 'presentation');
      header.appendChild(cell);

      tr.parentNode.insertBefore(header, tr);
    }

    applyGroupCollapse();
  }

  /**
   * Teach the list widget to step over the headings.
   *
   * get_next_row()/get_prev_row() walk raw DOM siblings (list.js:959) and skip
   * only hidden nodes, so a heading would be returned as the "next row" and
   * j/k would stall on it. Wrapping the two methods on the instance keeps every
   * core file untouched (§1.1); if it ever stops applying, the headings are the
   * only thing lost.
   */
  function patchRowNavigation(list) {
    if (!list || list.bcNavPatched) return;
    list.bcNavPatched = true;

    var names = ['get_next_row', 'get_prev_row'];

    for (var i = 0; i < names.length; i++) {
      (function (name, step) {
        var original = list[name];

        list[name] = function (uid) {
          var row = original.call(this, uid);

          while (row && row.nodeType === 1 && String(row.className).indexOf('bc-group') >= 0) {
            do {
              row = row[step];
            } while (row && (row.nodeType !== 1 || row.style.display === 'none'));
          }

          return row;
        };
      })(names[i], names[i] === 'get_next_row' ? 'nextSibling' : 'previousSibling');
    }
  }

  /** Selection state: the select-all button, multi-select tint, aria-selected. */
  function syncSelection() {
    var list = window.rcmail && rcmail.message_list;
    var table = messagelist();
    if (!list || !table) return;

    var selected = list.selection.length;
    var total = list.rowcount;

    table.classList.toggle('bc-multiselect', selected > 1);

    for (var uid in list.rows) {
      var row = list.rows[uid];
      if (row && row.obj) {
        row.obj.setAttribute('aria-selected', list.in_selection(uid) ? 'true' : 'false');
      }
    }

    var button = document.getElementById('bc-select-all');
    if (!button) return;

    var symbol = !selected ? 'checkbox_unchecked_20_regular'
      : selected >= total ? 'checkbox_checked_20_filled'
      : 'checkbox_indeterminate_20_regular';

    var use = button.querySelector('use');
    if (use) use.setAttribute('href', '#ic_fluent_' + symbol);

    button.setAttribute('aria-disabled', total ? 'false' : 'true');
    button.setAttribute('aria-pressed', selected && selected >= total ? 'true' : 'false');
    button.title = selected ? label('bc_selectnone') : label('select');
  }

  function initSelectAll() {
    var button = document.getElementById('bc-select-all');
    if (!button) return;

    button.addEventListener('click', function () {
      var list = rcmail.message_list;
      rcmail.command(list && list.selection.length ? 'select-none' : 'select-all');
    });
  }

  /**
   * Sort split-button (§3.5).
   *
   * The main half flips the order — core toggles ASC/DESC itself when asked to
   * sort by the column already in force. The chevron opens the column list,
   * built from env.coltypes so it offers exactly what core will accept for this
   * folder, and never a column it would reject.
   */
  function initSort() {
    var button = document.getElementById('bc-sort');
    if (!button) return;

    button.addEventListener('click', function () {
      rcmail.command('sort', rcmail.env.sort_col || 'date', this);
    });

    var menu = document.getElementById('bc-sort-menu');

    if (menu) {
      buildSortMenu(menu);

      initMenu('bc-sort-more', 'bc-sort-menu', function (item) {
        var column = item.getAttribute('data-bc-sortcol');
        var order = item.getAttribute('data-bc-sortorder');

        if (column) {
          rcmail.command('sort', column, item);
        }
        else if (order && order !== rcmail.env.sort_order) {
          // Asking for the current column again is how core flips the order.
          rcmail.command('sort', rcmail.env.sort_col || 'date', item);
        }
      });
    }

    syncSort();
  }

  function buildSortMenu(menu) {
    if (!window.rcmail || menu.children.length) return;

    var types = rcmail.env.coltypes || {};

    for (var key in types) {
      if (!types[key].sortable || !types[key].label) continue;

      var item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', 'false');
      item.setAttribute('data-bc-sortcol', key);
      item.textContent = types[key].label;
      menu.appendChild(item);
    }

    var separator = document.createElement('div');
    separator.setAttribute('role', 'separator');
    separator.className = 'bc-popover__sep';
    menu.appendChild(separator);

    var orders = [['DESC', 'bc_sortdescending'], ['ASC', 'bc_sortascending']];

    for (var o = 0; o < orders.length; o++) {
      var opt = document.createElement('button');
      opt.type = 'button';
      opt.setAttribute('role', 'menuitemradio');
      opt.setAttribute('aria-checked', 'false');
      opt.setAttribute('data-bc-sortorder', orders[o][0]);
      opt.textContent = label(orders[o][1]);
      menu.appendChild(opt);
    }
  }

  function syncSort() {
    var button = document.getElementById('bc-sort');
    if (!button || !window.rcmail) return;

    var column = rcmail.env.sort_col || 'date';
    var order = rcmail.env.sort_order || 'DESC';
    var types = rcmail.env.coltypes || {};
    var text = (types[column] && types[column].label) || column;

    button.querySelector('.bc-sort__label').textContent = text;
    button.setAttribute('aria-label', label('sortby') + ': ' + text
      + ', ' + label(order === 'ASC' ? 'bc_sortascending' : 'bc_sortdescending'));
    button.setAttribute('data-bc-order', order);

    var menu = document.getElementById('bc-sort-menu');
    if (!menu) return;

    var items = menu.querySelectorAll('[data-bc-sortcol], [data-bc-sortorder]');

    for (var i = 0; i < items.length; i++) {
      var col = items[i].getAttribute('data-bc-sortcol');
      var ord = items[i].getAttribute('data-bc-sortorder');

      items[i].setAttribute('aria-checked',
        (col && col === column) || (ord && ord === order) ? 'true' : 'false');
    }
  }

  /** Give plugin-injected toolbar buttons (archive, markasjunk, …) an icon. */
  function decoratePluginButtons() {
    var nodes = document.querySelectorAll('.bc-toolbar > a.button');

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute('data-bc-icon-done')) continue;

      var symbol = null;
      for (var token in PLUGIN_ICONS) {
        if (el.classList.contains(token)) { symbol = PLUGIN_ICONS[token]; break; }
      }
      if (!symbol) continue;

      el.insertBefore(svgIcon(symbol), el.firstChild);
      el.setAttribute('data-bc-icon-done', '1');
    }
  }

  /** Core renders no empty state; step 8 expands this into the full set. */
  /**
   * The list's empty state (§12 step 8).
   *
   * Core emits no empty-state row at all — the list is simply a table with no
   * <tr>s — so the whole thing is ours. A search that found nothing is a
   * different situation from a folder that is empty, and says so.
   */
  function syncEmptyState(rowcount) {
    var host = document.getElementById('messagelist-content');
    if (!host) return;

    var note = host.querySelector('.bc-empty');

    if (rowcount) {
      if (note) note.parentNode.removeChild(note);
      return;
    }

    var searching = !!(window.rcmail && rcmail.env.search_request);

    if (!note) {
      note = document.createElement('div');
      note.className = 'bc-empty';
      note.appendChild(svgIcon('search'));
      note.appendChild(document.createElement('p')).className = 'bc-empty__title';
      note.appendChild(document.createElement('p')).className = 'bc-empty__text';
      host.appendChild(note);
    }

    var use = note.querySelector('use');
    if (use) {
      use.setAttribute('href', '#ic_fluent_' + (searching ? 'search' : 'mail_inbox') + '_20_regular');
    }

    note.querySelector('.bc-empty__title').textContent =
      searching ? label('bc_noresults') : label('bc_nomessages');
    note.querySelector('.bc-empty__text').textContent =
      searching ? label('bc_noresultstext') : label('nomessagesfound');
  }

  /**
   * The reading pane before anything is chosen (§12 step 8).
   *
   * show_contentframe() hides the iframe with an inline style and leaves no
   * mark on the pane, so there is nothing for CSS to key off; wrapping it puts
   * the state where the empty block can see it. Safari and Konqueror are
   * exempted from the hiding inside core (app.js:2614) but still get pointed at
   * the blank page, so the class is the more reliable signal on every browser.
   */
  function initReadingEmpty(startsEmpty) {
    var pane = document.getElementById('layout-content');
    if (!pane || !window.rcmail || !rcmail.show_contentframe) return;

    var original = rcmail.show_contentframe;

    rcmail.show_contentframe = function (show) {
      pane.classList.toggle('is-empty', !show);
      // Below 768px this is the moment the pane starts and stops covering the
      // list, so it is the moment the list starts and stops being reachable.
      syncOverlayInert();
      return original.apply(this, arguments);
    };

    // Something may already be open on load — a reload with a message selected
    // on the mail screen, a section still in the frame in Settings. How to tell
    // differs per screen, so the caller decides; the default is the mail one.
    pane.classList.toggle(
      'is-empty',
      startsEmpty ? !!startsEmpty() : (!rcmail.env.uid && !rcmail.preview_id)
    );
  }

  // ---------------------------------------------------------------------------
  // Notices (§2)
  // ---------------------------------------------------------------------------

  var NOTICE_ICONS = {
    error: 'warning',
    warning: 'warning',
    confirmation: 'checkmark_circle',
    loading: 'arrow_clockwise',
    uploading: 'arrow_upload'
  };

  /**
   * Give each notice an icon matching its kind.
   *
   * display_message() builds <div class="<type> content"> and appends it to the
   * "message" gui object, with no icon of its own. Colour alone would not carry
   * the meaning (§9), so one is added here — on the toast host and on the login
   * page's banner alike, since both are that same object.
   */
  function decorateNotice(props) {
    var node = props && props.object && props.object.length ? props.object[0] : null;
    if (!node || node.querySelector('.bc-icon')) return;

    var symbol = NOTICE_ICONS[props.type] || 'info';
    node.insertBefore(svgIcon(symbol), node.firstChild);
  }

  function onListUpdate(props) {
    var table = messagelist();
    if (table) table.classList.toggle('bc-threaded', !!rcmail.env.threading);

    patchRowNavigation(rcmail.message_list);
    sortPinnedToTop();
    renderThreadCounts();
    renderDateGroups();
    syncThreads();
    syncRibbonCommands();
    decoratePluginButtons();
    restoreScope();

    // env.coltypes is replaced by set_message_coltypes on every list response,
    // and a multi-folder search adds a column, so the menu is (re)built here as
    // well as at init. buildSortMenu no-ops once it has content.
    var sortMenu = document.getElementById('bc-sort-menu');
    if (sortMenu) buildSortMenu(sortMenu);

    syncSort();
    syncSelection();
    syncSearchSummary();
    syncClearButton();
    syncEmptyState(props && props.rowcount !== undefined ? props.rowcount : (rcmail.message_list || {}).rowcount);
  }

  // ---------------------------------------------------------------------------
  // Popover primitive (§7.7)
  //
  // Escape closes and returns focus, arrow keys move between items, Tab closes
  // (a role="menu" is a single tab stop — APG), and a click outside dismisses.
  // ---------------------------------------------------------------------------

  var openPopover = null;

  var MENUITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

  function popoverItems(panel) {
    return Array.prototype.slice.call(panel.querySelectorAll(MENUITEM))
      .filter(function (el) { return el.getAttribute('aria-disabled') !== 'true'; });
  }

  businessclass.closePopover = function (returnFocus) {
    if (!openPopover) return;

    var state = openPopover;
    openPopover = null;

    state.panel.hidden = true;
    state.button.setAttribute('aria-expanded', 'false');

    if (returnFocus !== false && state.origin && state.origin.focus) {
      state.origin.focus();
    }
  };

  businessclass.openPopover = function (button, panel) {
    businessclass.closePopover(false);

    openPopover = { button: button, panel: panel, origin: document.activeElement };
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');

    var items = popoverItems(panel);

    if (items.length) {
      items[0].focus();
    }
    else {
      // A panel of form controls rather than a menu (compose's More): move to
      // the first control instead, so opening it still lands the focus inside.
      var first = panel.querySelector('button, [href], input, select, textarea');
      if (first) first.focus();
    }
  };

  function initPopover(button, panel) {
    if (!button || !panel || button.getAttribute('data-bc-popover')) return;
    button.setAttribute('data-bc-popover', '1');

    button.addEventListener('click', function (event) {
      event.preventDefault();
      if (openPopover && openPopover.panel === panel) businessclass.closePopover();
      else businessclass.openPopover(button, panel);
    });

    panel.addEventListener('keydown', function (event) {
      var items = popoverItems(panel);
      var index = items.indexOf(document.activeElement);
      var next = null;

      if (event.key === 'Escape') { businessclass.closePopover(); }
      else if (event.key === 'Tab') { businessclass.closePopover(); return; }
      // A panel with no menu items is a form panel: its selects and text fields
      // own the arrow keys, so nothing below applies and nothing is swallowed.
      else if (!items.length) { return; }
      else if (event.key === 'ArrowDown') next = items[(index + 1) % items.length];
      else if (event.key === 'ArrowUp') next = items[(index - 1 + items.length) % items.length];
      else if (event.key === 'Home') next = items[0];
      else if (event.key === 'End') next = items[items.length - 1];
      else return;

      if (next) next.focus();
      event.preventDefault();
    });

    // An item runs a Roundcube command; the menu should not stay open after it.
    panel.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest(MENUITEM)) {
        businessclass.closePopover();
      }
    });
  }

  /** Wire a popover whose items are written in the template, not moved in. */
  function initMenu(buttonId, panelId, onChoose) {
    var button = document.getElementById(buttonId);
    var panel = document.getElementById(panelId);
    if (!button || !panel) return;

    // Rendered in the markup so it works without JS being able to build it, but
    // it must start closed.
    panel.hidden = true;
    initPopover(button, panel);

    panel.addEventListener('click', function (event) {
      var item = event.target.closest && event.target.closest(MENUITEM);
      if (item) onChoose(item);
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') businessclass.closePopover();
  });

  document.addEventListener('pointerdown', function (event) {
    if (!openPopover) return;
    if (openPopover.panel.contains(event.target) || openPopover.button.contains(event.target)) return;
    businessclass.closePopover(false);
  });

  // ---------------------------------------------------------------------------
  // Toolbar overflow (§5)
  //
  // The real command elements are moved into the popover and back, never cloned:
  // core addresses its buttons by id when it enables and disables them, so a
  // copy would go stale the moment the selection changed.
  // ---------------------------------------------------------------------------

  /** Priority given to plugin-injected buttons, which carry none of their own. */
  var PLUGIN_PRIORITY = 6;

  /** Priorities at or below this are never moved out (§5: never drop the first three). */
  var PINNED_PRIORITY = 3;

  function initOverflow(barId, anchorSelector) {
    var bar = document.getElementById(barId);
    if (!bar || bar.getAttribute('data-bc-overflow')) return;

    var anchor = bar.querySelector(anchorSelector);
    var panel = anchor && anchor.querySelector('.bc-popover');
    var button = anchor && anchor.querySelector('button');
    if (!anchor || !panel || !button) return;

    bar.setAttribute('data-bc-overflow', '1');
    initPopover(button, panel);

    // Plugin buttons land between the skin's own items and have no priority.
    var plugins = bar.querySelectorAll('a.button');
    for (var p = 0; p < plugins.length; p++) {
      if (!plugins[p].getAttribute('data-bc-priority')) {
        plugins[p].setAttribute('data-bc-priority', String(PLUGIN_PRIORITY));
        plugins[p].classList.add('bc-ribbon__item');
      }
    }

    var items = Array.prototype.slice.call(bar.querySelectorAll('[data-bc-priority]'));

    for (var i = 0; i < items.length; i++) {
      items[i].bcHome = { parent: items[i].parentNode, next: items[i].nextSibling };
    }

    // Highest priority number leaves first.
    var order = items.slice().sort(function (a, b) {
      return Number(b.getAttribute('data-bc-priority')) - Number(a.getAttribute('data-bc-priority'));
    });

    function overflows() {
      return bar.scrollWidth > bar.clientWidth + 1;
    }

    var reflowing = false;

    function reflow() {
      // The observer watches the bar, and this rearranges the bar's children.
      // Its own border box should not change, but a browser that disagrees would
      // otherwise log "ResizeObserver loop completed with undelivered
      // notifications" — and §13 requires a clean console.
      if (reflowing) return;
      reflowing = true;

      try {
        rebuild();
      }
      finally {
        reflowing = false;
      }
    }

    function rebuild() {
      businessclass.closePopover(false);

      for (var r = 0; r < items.length; r++) {
        var el = items[r];
        if (el.parentNode === panel) {
          el.bcHome.parent.insertBefore(el, el.bcHome.next);
          el.removeAttribute('role');
        }
      }

      anchor.hidden = true;
      bar.classList.remove('is-overflowing');

      if (!overflows()) return;

      anchor.hidden = false;
      bar.classList.add('is-overflowing');

      for (var o = 0; o < order.length && overflows(); o++) {
        if (Number(order[o].getAttribute('data-bc-priority')) <= PINNED_PRIORITY) break;
        order[o].setAttribute('role', 'menuitem');
        panel.appendChild(order[o]);
      }

      // Everything fitted after all — the trigger would be an empty menu.
      if (!panel.children.length) {
        anchor.hidden = true;
        bar.classList.remove('is-overflowing');
      }
    }

    if (window.ResizeObserver) new window.ResizeObserver(reflow).observe(bar);
    else window.addEventListener('resize', reflow);

    reflow();
  }

  // ---------------------------------------------------------------------------
  // Message document (§3.6)
  // ---------------------------------------------------------------------------

  /**
   * Wrap the sender photo in the same initials avatar the list uses.
   *
   * message_contactphoto() always emits an <img>: the address-book picture when
   * the sender has one, otherwise a 1x1 transparent GIF. Wrapping rather than
   * replacing means a real photo still wins, and a transparent one simply lets
   * the initials show through (§4.5).
   */
  function decorateSender() {
    var photo = document.getElementById('bc-contactphoto');
    if (!photo || photo.parentNode.classList.contains('bc-avatar')) return;

    var from = document.querySelector('.bc-message__from');
    var name = from ? String(from.textContent || '').trim() : '';
    var address = window.rcmail && rcmail.env.sender ? rcmail.env.sender : name;

    var avatar = document.createElement('span');
    avatar.className = 'bc-avatar bc-avatar--lg bc-avatar--' + businessclass.avatarIndex(address);
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initials(name);

    photo.parentNode.insertBefore(avatar, photo);
    avatar.appendChild(photo);
  }

  /** Flag toggle in the sender block. State comes from env.message_flags. */
  function initFlag() {
    var button = document.getElementById('bc-flag');
    if (!button || !window.rcmail) return;

    function flagged() {
      return (rcmail.env.message_flags || []).indexOf('flagged') >= 0;
    }

    function sync() {
      var on = flagged();
      var use = button.querySelector('use');

      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.title = label(on ? 'markunflagged' : 'markflagged');
      if (use) use.setAttribute('href', '#ic_fluent_flag_20_' + (on ? 'filled' : 'regular'));
    }

    button.addEventListener('click', function () {
      var on = flagged();
      var flags = rcmail.env.message_flags || [];

      rcmail.command('mark', on ? 'unflagged' : 'flagged');

      // Core does not push the new flag set back into env, so track it here;
      // a reload re-reads the real state from the server either way.
      rcmail.env.message_flags = on
        ? flags.filter(function (f) { return f !== 'flagged'; })
        : flags.concat(['flagged']);

      sync();
      businessclass.announce(label(flagged() ? 'flagged' : 'unflagged'));
    });

    sync();
  }

  /**
   * A document glyph per attachment row, as the design draws it.
   *
   * Shared by the reading pane and compose. Compose rows get two extras core
   * does not draw: an icon on the delete link (whose text comes from the
   * textbuttons attribute, so there is something to hide behind it) and, while
   * an upload is running, the 2px determinate bar of §4.1.
   */
  function decorateAttachments() {
    var rows = document.querySelectorAll('.bc-attachments > li');

    for (var i = 0; i < rows.length; i++) {
      decorateAttachmentRow(rows[i]);
    }
  }

  function decorateAttachmentRow(row) {
    if (!row.querySelector('.bc-icon')) {
      row.insertBefore(svgIcon('document'), row.firstChild);
    }

    var remove = row.querySelector('a.delete');

    if (remove && !remove.querySelector('.bc-icon')) {
      var text = document.createElement('span');
      text.className = 'voice';
      text.textContent = remove.textContent;
      remove.textContent = '';
      remove.appendChild(text);
      remove.appendChild(svgIcon('dismiss'));
    }

    if (row.classList.contains('uploading') && !row.querySelector('.bc-upload__track')) {
      var track = document.createElement('div');
      var fill = document.createElement('div');

      track.className = 'bc-upload__track';
      fill.className = 'bc-upload__fill';
      track.appendChild(fill);
      row.appendChild(track);
    }
  }

  // ---------------------------------------------------------------------------
  // Compose (§4.1)
  // ---------------------------------------------------------------------------

  // An address is "\S+@\S+", or that inside angle brackets with a display name
  // in front. CHUNKS splits on , and ; while leaving quoted ones alone, so
  // '"Sørensen, Rita" <r@x>' stays one recipient. Ported from Elastic's parser,
  // which is the shape Roundcube's own server side expects to read back.
  var ADDR = '(?:\\S+|"[^"]+")@\\S+';
  var ADDR_ANGLE = new RegExp('<(' + ADDR + ')>');
  var ADDR_BARE = new RegExp('(' + ADDR + ')');
  var CHUNKS = /(?=\S)[^",;]*(?:"[^\\"]*(?:\\[,;\S][^\\"]*)*"[^",;]*)*/g;

  function isValidAddress(email) {
    return /^[^\s@]+@[^\s@]+$/.test(email);
  }

  function formatRecipient(item) {
    if (!item.name) return item.email;

    var name = item.name;
    if (/[",;<>]/.test(name)) {
      name = '"' + name.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    }

    return name + ' <' + item.email + '>';
  }

  /** Text -> {recipients: [{name, email, valid}], text: whatever was left}. */
  function parseRecipients(text) {
    text = String(text || '').replace(/[,;\s]*[\r\n]+/g, ',').trim();

    var recipients = [];
    var matches = text.match(CHUNKS) || [];

    for (var i = 0; i < matches.length; i++) {
      var chunk = String(matches[i]).trim();
      if (!chunk) continue;

      var consumed = false;
      var rest = chunk;
      var guard = 0;

      // One chunk can hold several space-separated addresses.
      while (rest && guard++ < 50) {
        var m = ADDR_ANGLE.exec(rest) || ADDR_BARE.exec(rest);
        if (!m) break;

        var email = m[1].replace(/[.,;\s]+$/, '');
        var name = rest.slice(0, m.index).trim()
          .replace(/^"|"$/g, '')
          .replace(/[,;]+$/, '')
          .trim();

        recipients.push({ name: name, email: email, valid: isValidAddress(email) });
        rest = rest.slice(m.index + m[0].length).trim();
        consumed = true;
      }

      if (consumed) text = text.replace(matches[i], '');
    }

    text = text.replace(/[,;]+/g, ',').replace(/^[,;\s]+/, '').replace(/[,;\s]+$/, '');

    return { recipients: recipients, text: text };
  }

  /**
   * Turn a To/Cc/Bcc textarea into a list of pills (§4.1).
   *
   * The textarea is hidden but stays in the DOM and stays authoritative: every
   * change is written back into it, so the form posts exactly what core expects,
   * core's own writers (compose_add_recipient, the contacts dialog) still work
   * by firing a change on it, and with JS off it is an ordinary address field.
   *
   * Autocomplete is core's: rcmail.init_address_input_events() binds ksearch to
   * our inner input, and ksearch_input_replace() writes the chosen address into
   * it and fires a jQuery change — which is why the listeners below are bound
   * through jQuery. A native addEventListener never sees .trigger('change').
   */
  function recipientInput(textarea) {
    var $ = window.jQuery;
    if (!$ || textarea.getAttribute('data-bc-ready')) return;
    textarea.setAttribute('data-bc-ready', '1');

    var items = [];
    var list = document.createElement('ul');
    var entry = document.createElement('li');
    var input = document.createElement('input');
    var labelEl = textarea.id ? document.querySelector('label[for="' + textarea.id + '"]') : null;

    list.className = 'bc-recipients ac-input';
    entry.className = 'bc-recipients__entry';
    input.type = 'text';
    input.setAttribute('tabindex', textarea.getAttribute('tabindex') || '1');
    input.setAttribute('placeholder', label('bc_addrecipients'));

    if (labelEl) input.setAttribute('aria-label', String(labelEl.textContent || '').trim());
    if (textarea.getAttribute('aria-required')) input.setAttribute('aria-required', 'true');

    entry.appendChild(input);
    list.appendChild(entry);

    textarea.className += ' bc-recipients__source';
    textarea.setAttribute('tabindex', '-1');
    textarea.parentNode.insertBefore(list, textarea.nextSibling);

    function serialize() {
      var out = [];

      for (var i = 0; i < items.length; i++) out.push(formatRecipient(items[i]));
      if (input.value.trim()) out.push(input.value.trim());

      return out.join(', ');
    }

    function sync() {
      textarea.value = serialize();
    }

    function render() {
      var old = list.querySelectorAll('.bc-recipient');
      var i;

      for (i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

      for (i = 0; i < items.length; i++) {
        list.insertBefore(pill(items[i], i), entry);
      }
    }

    function pill(item, index) {
      var li = document.createElement('li');
      var full = formatRecipient(item);

      li.className = 'bc-recipient';
      li.title = full;
      if (!item.valid) li.setAttribute('aria-invalid', 'true');

      var avatar = document.createElement('span');
      avatar.className = 'bc-avatar bc-avatar--xs bc-avatar--' + businessclass.avatarIndex(item.email);
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = initials(item.name || item.email);

      var name = document.createElement('span');
      name.className = 'bc-recipient__name';
      name.textContent = item.name || item.email;

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bc-recipient__remove';
      remove.setAttribute('aria-label', label('bc_removerecipient') + ' ' + full);
      remove.title = label('bc_removerecipient');
      remove.appendChild(svgIcon('dismiss'));

      // Keep the mouse from blurring the input: the blur handler commits, which
      // re-renders the pills, and the button would be detached before its own
      // click ever fired. Keyboard activation is unaffected.
      remove.addEventListener('mousedown', function (event) { event.preventDefault(); });

      remove.addEventListener('click', function () {
        items.splice(index, 1);
        render();
        sync();
        input.focus();
      });

      // An address that did not parse goes back into the input so it can be
      // corrected in place rather than only deleted.
      if (!item.valid) {
        name.addEventListener('mousedown', function (event) { event.preventDefault(); });
        name.addEventListener('click', function () {
          items.splice(index, 1);
          input.value = (input.value ? input.value + ' ' : '') + full;
          render();
          sync();
          input.focus();
        });
      }

      li.appendChild(avatar);
      li.appendChild(name);
      li.appendChild(remove);

      return li;
    }

    /** Take whatever parses out of the input; on blur keep the rest as a pill. */
    function commit(final) {
      var parsed = parseRecipients(input.value);
      var added = parsed.recipients.length > 0;

      if (added) {
        items = items.concat(parsed.recipients);
        input.value = parsed.text;
      }

      if (final && input.value.trim()) {
        items.push({ name: '', email: input.value.trim(), valid: false });
        input.value = '';
        added = true;
      }

      if (added) render();
      sync();

      return added;
    }

    /**
     * Rebuild from the textarea, which core may have written to directly.
     *
     * Deliberately does not write back: rcmail.cmp_hash is taken from these
     * fields during init, and re-serialising a pristine value would leave the
     * form looking edited and prompt about unsaved changes on the way out.
     */
    function rebuild() {
      var parsed = parseRecipients(textarea.value);

      items = parsed.recipients;
      input.value = parsed.text;
      render();
    }

    $(input)
      // Keystroke by keystroke, so the textarea is current even for a send that
      // never blurs the field, and so the local autosave copy is complete.
      .on('input', sync)
      .on('change', function () { commit(false); })
      .on('paste', function () { window.setTimeout(function () { commit(false); }, 0); })
      .on('focus', function () { list.classList.add('is-focused'); })
      .on('blur', function () {
        list.classList.remove('is-focused');
        // Blurring into the autocomplete list is not the user finishing with
        // the field: turning the half-typed name into an invalid pill there
        // would pull the ground out from under the suggestion being clicked.
        commit(!(rcmail.ksearch_visible && rcmail.ksearch_visible()));
      })
      .on('keydown', function (event) {
        if (event.key === 'Backspace' && !input.value.length && items.length) {
          items.pop();
          render();
          sync();
          return false;
        }

        // The separators, and Enter unless the autocomplete owns it.
        if (event.key === ',' || event.key === ';'
          || (event.key === 'Enter' && !rcmail.ksearch_visible())
        ) {
          if (commit(false)) return false;
        }
      });

    list.addEventListener('mousedown', function (event) {
      if (event.target === list || event.target === entry) input.focus();
    });

    $(textarea)
      .on('change', rebuild)
      .on('focus', function (event) {
        input.focus();
        event.preventDefault();
      });

    rebuild();
    rcmail.init_address_input_events($(input));

    // init_messageform_inputs() focuses the first empty header field, and it
    // runs inside rcmail.init() — before the init event this is called from.
    // Without this the caret would be sitting in the off-screen textarea.
    if (document.activeElement === textarea) input.focus();
  }

  /**
   * Cc / Bcc / Reply-To / Followup-To disclosure.
   *
   * The rows are always in the form so their values are always posted; only
   * their visibility is toggled. A header that already carries a value is shown
   * straight away — a reply with a Cc list must not hide it.
   */
  function initHeaderToggles() {
    var buttons = document.querySelectorAll('[data-bc-header]');

    function row(name) {
      return document.getElementById('compose_' + name);
    }

    function show(name, on, focus) {
      var el = row(name);
      if (!el) return;

      el.hidden = !on;

      var trigger = document.querySelector('button[data-bc-header="' + name + '"]');
      var check = document.querySelector('input[data-bc-header="' + name + '"]');

      if (trigger) trigger.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (check) check.checked = on;

      if (on && focus) {
        var field = el.querySelector('.bc-recipients input, input, textarea');
        if (field) field.focus();
      }
    }

    for (var i = 0; i < buttons.length; i++) {
      (function (el) {
        var name = el.getAttribute('data-bc-header');

        el.addEventListener(el.tagName === 'INPUT' ? 'change' : 'click', function () {
          var target = row(name);
          if (!target) return;
          show(name, el.tagName === 'INPUT' ? el.checked : target.hidden, true);
        });
      })(buttons[i]);
    }

    // Reveal anything that arrived with content (reply-all, editing a draft).
    // Without moving the focus: core has just put the caret in the first empty
    // header field, and that choice is the right one.
    var names = ['cc', 'bcc', 'replyto', 'followupto'];

    for (var n = 0; n < names.length; n++) {
      var el = row(names[n]);
      var source = el ? el.querySelector('textarea, input[type="text"]') : null;

      if (source && String(source.value || '').trim()) show(names[n], true, false);
    }
  }

  /**
   * The 2px determinate upload bar (§4.1).
   *
   * Core only ever turns the progress events into a localised text message
   * (app.js:9684), so the percentage itself never reaches the skin. It is
   * recovered by tapping the XHR jQuery is about to use: the upload id core
   * generated is in the request URL as _uploadid, which is the same id it gives
   * the <li>, so each bar is driven by its own request even when two uploads
   * overlap. Everything here is inert for any request without that parameter.
   */
  var uploadTapped = false;

  function initUploadProgress() {
    var $ = window.jQuery;
    if (!$ || !$.ajaxSettings || !$.ajaxSettings.xhr || uploadTapped) return;
    uploadTapped = true;

    var base = $.ajaxSettings.xhr;

    $.ajaxSettings.xhr = function () {
      var xhr = base.apply(this, arguments);
      if (!xhr || !xhr.upload || !xhr.open) return xhr;

      var open = xhr.open;

      xhr.open = function (method, url) {
        var match = /[?&]_uploadid=([^&]+)/.exec(String(url || ''));

        if (match) {
          var id = decodeURIComponent(match[1]);

          xhr.upload.addEventListener('progress', function (event) {
            if (event.lengthComputable && event.total) {
              setUploadProgress(id, event.loaded / event.total);
            }
          });
        }

        return open.apply(xhr, arguments);
      };

      return xhr;
    };
  }

  function setUploadProgress(id, ratio) {
    var row = document.getElementById(id);
    var fill = row ? row.querySelector('.bc-upload__fill') : null;

    if (fill) fill.style.width = Math.round(clamp(ratio, 0, 1) * 100) + '%';
  }

  /** "Draft saved HH:MM" (§4.1). */
  function initDraftStatus() {
    var host = document.getElementById('bc-draftsaved');
    if (!host || !window.rcmail || !rcmail.set_draft_id) return;

    var original = rcmail.set_draft_id;

    rcmail.set_draft_id = function () {
      var result = original.apply(this, arguments);
      var time = new Date().toLocaleTimeString(document.documentElement.lang || undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });

      host.textContent = label('bc_draftsaved').replace('$time', time);

      return result;
    };
  }

  /**
   * Discard (§4.1).
   *
   * Nothing saved yet: leave, and let core's own unsaved-changes prompt decide.
   * A draft already in the Drafts folder is deleted through core's delete
   * action, so it honours the trash folder and is recoverable. _from=show makes
   * that action answer with command('command','list') rather than trying to
   * refresh a message list this page does not have (delete.php:75).
   */
  function initDiscard() {
    var button = document.getElementById('bc-discard');
    if (!button || !window.rcmail) return;

    button.addEventListener('click', function () {
      var id = rcmail.env.draft_id;

      if (!id || !rcmail.env.drafts_mailbox) {
        rcmail.command('list');
        return;
      }

      rcmail.confirm_dialog(label('bc_discardconfirm'), 'discard', function () {
        rcmail.remove_compose_data(rcmail.env.compose_id);
        rcmail.compose_skip_unsavedcheck = true;
        rcmail.http_post('delete',
          { _uid: id, _mbox: rcmail.env.drafts_mailbox, _from: 'show' },
          rcmail.set_busy(true, 'loading'));
      });
    });
  }

  /**
   * Emoji (§4.1).
   *
   * Roundcube ships TinyMCE's emoticons plugin and its emoji database, and
   * businessclass_prefs adds it to the editor through the html_editor hook, so this
   * only has to open it. There is no equivalent in plain-text mode, so the
   * button follows the editor: shown while an HTML editor exists, hidden
   * otherwise. Absent the plugin the button never appears at all.
   */
  function initEmoji() {
    var button = document.getElementById('bc-emoji');
    if (!button || !window.rcmail) return;

    function editor() {
      return window.tinymce && tinymce.activeEditor && !tinymce.activeEditor.removed
        ? tinymce.activeEditor : null;
    }

    function sync() {
      var ed = editor();
      button.hidden = !(ed && ed.plugins && ed.plugins.emoticons);
    }

    button.addEventListener('click', function () {
      var ed = editor();
      if (ed) ed.execCommand('mceEmoticons');
    });

    // editor-load fires when an HTML editor finishes building. Switching back
    // to plain text raises no event at all, so the selector itself is watched
    // too; the tick lets the editor finish tearing down first.
    var selector = document.getElementById('editor-selector');

    rcmail.addEventListener('editor-load', sync);

    if (selector) {
      selector.addEventListener('change', function () { window.setTimeout(sync, 0); });
    }

    // The editor is built during rcmail.init(), before the init event we are
    // running inside; a tick later it has registered its plugins.
    window.setTimeout(sync, 0);
  }

  function initCompose() {
    var fields = document.querySelectorAll('[data-bc-recipients]');
    if (!document.querySelector('.bc-compose')) return;

    initUploadProgress();

    for (var i = 0; i < fields.length; i++) recipientInput(fields[i]);

    initHeaderToggles();
    initPopover(document.getElementById('bc-compose-more'),
      document.getElementById('bc-compose-menu'));
    initDraftStatus();
    initDiscard();
    initEmoji();
  }

  // ---------------------------------------------------------------------------
  // Login (§4.2)
  // ---------------------------------------------------------------------------

  /**
   * The three things core's login_form() has no markup for.
   *
   * The form itself is left exactly as core renders it, so login_username_filter,
   * the multi-host selector, OAuth and any loginform_content plugin keep working
   * (§1.3). Everything here degrades to "the form still signs you in".
   */
  function initLogin() {
    var card = document.querySelector('.bc-login');
    if (!card) return;

    initLoginBackground();
    initPasswordReveal();
    initAutocompleteHints();
    initLoginLanguage();
    focusLoginError();
  }

  /** branding.json's login_background, layered over the gradient (§4.2). */
  function initLoginBackground() {
    var url = window.rcmail && rcmail.env.bc_login_background;
    if (!url) return;

    // Sanitised server-side (businessclass_prefs::sanitize_asset) to a skin-relative
    // path, so it cannot carry a scheme or escape the skin folder.
    var style = document.createElement('style');
    style.textContent = '.bc-login::before{background-image:url("/' + url + '")}';
    document.head.appendChild(style);
  }

  function initPasswordReveal() {
    var input = document.getElementById('rcmloginpwd');
    var cell = input ? input.closest('td') : null;
    if (!input || !cell || cell.querySelector('.bc-login__reveal')) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'bc-login__reveal';
    button.tabIndex = -1;
    button.appendChild(svgIcon('eye'));

    function sync() {
      var shown = input.type === 'text';
      var use = button.querySelector('use');

      button.setAttribute('aria-pressed', shown ? 'true' : 'false');
      button.title = label(shown ? 'bc_hidepassword' : 'bc_showpassword');
      button.setAttribute('aria-label', button.title);
      if (use) use.setAttribute('href', '#ic_fluent_' + (shown ? 'eye_off' : 'eye') + '_20_regular');
    }

    button.addEventListener('click', function () {
      input.type = input.type === 'password' ? 'text' : 'password';
      sync();
      input.focus();
    });

    sync();
    cell.classList.add('bc-login__field--reveal');
    cell.appendChild(button);
  }

  /**
   * autocomplete="username" / "current-password" (§4.2).
   *
   * Set here rather than on the template object, because $attrib is merged into
   * both inputs and they need different values. Where the admin has turned
   * autocompletion off, core has already written autocomplete="off" and that
   * decision is left alone.
   */
  function initAutocompleteHints() {
    var pairs = [['rcmloginuser', 'username'], ['rcmloginpwd', 'current-password']];

    for (var i = 0; i < pairs.length; i++) {
      var field = document.getElementById(pairs[i][0]);
      if (field && !field.getAttribute('autocomplete')) {
        field.setAttribute('autocomplete', pairs[i][1]);
      }
    }
  }

  /**
   * Language of the sign-in page (§4.2).
   *
   * Roundcube has no language switch before login, so the list comes from
   * businessclass_prefs (env.bc_languages) and picking one reloads the page with
   * _lang, which the same plugin applies. Both halves are needed: without the
   * plugin the list is empty and the control stays hidden rather than sitting
   * there doing nothing.
   */
  function initLoginLanguage() {
    var select = document.getElementById('bc-login-lang');
    var languages = window.rcmail ? rcmail.env.bc_languages : null;
    if (!select || !languages) return;

    var current = String(document.documentElement.lang || '').replace('-', '_');
    var names = [];
    var code;

    for (code in languages) names.push(code);
    if (names.length < 2) return;

    names.sort(function (a, b) { return String(languages[a]).localeCompare(String(languages[b])); });

    for (var i = 0; i < names.length; i++) {
      var option = document.createElement('option');
      option.value = names[i];
      option.textContent = languages[names[i]];
      if (names[i] === current) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', function () {
      window.location.href = '?_task=login&_lang=' + encodeURIComponent(select.value);
    });

    select.parentNode.hidden = false;
  }

  /**
   * §4.2: the error banner must receive focus.
   *
   * Core focuses the first empty field during rcmail.init(); when a sign-in has
   * failed that is the wrong place to be, because the reason is above it and
   * would never be read out. The banner is made focusable and takes over.
   */
  function focusLoginError() {
    var banner = document.getElementById('bc-login-message');
    if (!banner || !banner.querySelector('.error, .warning')) return;

    banner.setAttribute('tabindex', '-1');
    banner.focus();
  }

  // ---------------------------------------------------------------------------
  // Search + refine (§4.3)
  //
  // Every control maps onto a parameter Roundcube already has: free text is _q,
  // the scope radios are env.search_scope, the date select is core's own
  // searchinterval object, and each token or checkbox is one more IMAP criterion
  // merged into _filter — which search.php passes straight to SEARCH. No new
  // server code (§4.3).
  // ---------------------------------------------------------------------------

  // key -> how it becomes an IMAP criterion, and what the chip is called.
  // 'address' keys additionally get core's contact autocomplete while their
  // value is being typed. Every label named here is shipped by mail.html's
  // add_label; naming them one by one rather than building the key from the
  // token is what lets that be checked.
  var TOKEN_KEYS = {
    from: { header: 'FROM', address: true, label: 'bc_searchfrom' },
    to: { header: 'TO', address: true, label: 'bc_searchto' },
    cc: { header: 'CC', address: true, label: 'bc_searchcc' },
    bcc: { header: 'BCC', address: true, label: 'bc_searchbcc' },
    subject: { header: 'SUBJECT', label: 'bc_searchsubject' },
    body: { body: true, label: 'bc_searchbody' },
    has: { values: { attachment: 'ATTACHMENT' }, label: 'bc_searchhas' },
    is: {
      values: { unread: 'UNSEEN', read: 'SEEN', flagged: 'FLAGGED', answered: 'ANSWERED' },
      label: 'bc_searchis'
    }
  };

  var SCOPE_LABELS = { base: 'currentfolder', sub: 'subfolders', all: 'allfolders' };

  // The same criterion core's own "with attachment" filter uses
  // (rcmail_action_mail_index::search_filter), so results match its list.
  var ATTACHMENT_TYPES = ['application/', 'multipart/mixed', 'multipart/signed', 'multipart/report'];

  var searchTokens = [];

  /** IMAP quoted string. The server also strips CR/LF, but not before we do. */
  function imapQuote(value) {
    return '"' + String(value).replace(/[\r\n]+/g, ' ').replace(/[\\"]/g, '\\$&') + '"';
  }

  function attachmentCriteria() {
    var parts = [];

    for (var i = 0; i < ATTACHMENT_TYPES.length - 1; i++) parts.push('OR');
    for (var n = 0; n < ATTACHMENT_TYPES.length; n++) {
      parts.push('HEADER Content-Type ' + imapQuote(ATTACHMENT_TYPES[n]));
    }

    return parts.join(' ');
  }

  /** One token -> one IMAP search key, or null if it means nothing. */
  function tokenCriteria(token) {
    var spec = TOKEN_KEYS[token.key];
    if (!spec || !token.value) return null;

    if (spec.header) return 'HEADER ' + spec.header + ' ' + imapQuote(token.value);
    if (spec.body) return 'BODY ' + imapQuote(token.value);

    if (spec.values) {
      var mapped = spec.values[String(token.value).toLowerCase()];
      if (!mapped) return null;
      return mapped === 'ATTACHMENT' ? attachmentCriteria() : mapped;
    }

    return null;
  }

  /** Everything the user has asked for, as one IMAP criteria string. */
  function buildFilter() {
    var parts = [];
    var i;

    for (i = 0; i < searchTokens.length; i++) {
      var criteria = tokenCriteria(searchTokens[i]);
      if (criteria) parts.push(criteria);
    }

    var boxes = document.querySelectorAll('#bc-refine [data-bc-filter]');

    for (i = 0; i < boxes.length; i++) {
      if (!boxes[i].checked) continue;

      var kind = boxes[i].getAttribute('data-bc-filter');
      if (kind === 'attachment') parts.push(attachmentCriteria());
      else if (kind === 'unread') parts.push('UNSEEN');
      else if (kind === 'flagged') parts.push('FLAGGED');
    }

    // IMAP ANDs adjacent search keys, so joining is all the composition needed.
    return parts.join(' ');
  }

  function searchBox() {
    return document.getElementById('rcmqsearchbox');
  }

  function renderTokens() {
    var host = document.getElementById('bc-search-tokens');
    var bar = document.querySelector('.bc-search');
    if (!host) return;

    host.textContent = '';

    for (var i = 0; i < searchTokens.length; i++) {
      host.appendChild(tokenChip(searchTokens[i], i));
    }

    if (bar) bar.classList.toggle('is-active', searchTokens.length > 0);
    syncClearButton();
  }

  function tokenChip(token, index) {
    var li = document.createElement('li');
    var text = document.createElement('span');
    var key = document.createElement('span');
    var remove = document.createElement('button');
    var spec = TOKEN_KEYS[token.key] || {};
    var name = spec.label ? label(spec.label) : token.key;

    li.className = 'bc-token';
    li.title = name + ': ' + token.value;

    key.className = 'bc-token__key';
    key.textContent = name + ': ';
    text.className = 'bc-token__text';
    text.appendChild(key);
    text.appendChild(document.createTextNode(token.value));

    remove.type = 'button';
    remove.className = 'bc-token__remove';
    remove.title = label('bc_removefilter');
    remove.setAttribute('aria-label', label('bc_removefilter') + ' ' + li.title);
    remove.appendChild(svgIcon('dismiss'));
    remove.addEventListener('mousedown', function (event) { event.preventDefault(); });
    remove.addEventListener('click', function () {
      searchTokens.splice(index, 1);
      renderTokens();
      runSearch();
    });

    li.appendChild(text);
    li.appendChild(remove);

    return li;
  }

  /** "key:value" at the start of the box becomes a chip; the rest stays text. */
  function consumeToken(force) {
    var box = searchBox();
    if (!box) return false;

    var match = /^\s*([a-z-]+)\s*:\s*(.*)$/i.exec(box.value);
    if (!match) return false;

    var key = match[1].toLowerCase();
    if (!TOKEN_KEYS[key]) return false;

    var rest = match[2];
    // Until the value is finished, leave it in the box so it stays editable and
    // the autocomplete can still see it.
    var ended = /[,;]\s*$|\s$/.test(rest);
    if (!ended && !force) return false;

    var value = rest.replace(/[,;\s]+$/, '').trim();
    if (!value) return false;

    // An autocompleted contact arrives as 'Name <addr>'; the address is the part
    // an IMAP HEADER search should match on.
    var address = /<([^<>]+)>\s*$/.exec(value);
    if (address && TOKEN_KEYS[key].address) value = address[1];

    searchTokens.push({ key: key, value: value });
    box.value = '';
    renderTokens();

    return true;
  }

  function syncClearButton() {
    var clear = document.getElementById('bc-search-clear');
    var box = searchBox();
    if (!clear) return;

    var active = searchTokens.length > 0
      || (box && box.value !== '')
      || !!(window.rcmail && rcmail.env.search_request);

    clear.hidden = !active;
  }

  function runSearch() {
    if (!window.rcmail) return;

    var box = searchBox();
    var scope = document.querySelector('#bc-refine [name="bc-scope"]:checked');

    if (scope) rcmail.env.search_scope = scope.value;

    // With neither text nor criteria there is nothing to search for; drop back
    // to the plain folder listing rather than sending an empty query.
    if ((!box || !box.value) && !buildFilter()) {
      rcmail.command('reset-search');
      return;
    }

    rcmail.command('search');
  }

  function resetSearch() {
    searchTokens = [];
    renderTokens();

    var boxes = document.querySelectorAll('#bc-refine [data-bc-filter]');
    for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;

    var base = document.querySelector('#bc-refine [name="bc-scope"][value="base"]');
    if (base) base.checked = true;

    var interval = document.getElementById('bc-search-interval');
    if (interval) interval.value = '';

    if (window.rcmail) {
      rcmail.env.search_scope = 'base';
      rcmail.command('reset-search');
    }

    syncClearButton();
  }

  /** "18 results in All folders" (§4.3). */
  function syncSearchSummary() {
    var host = document.getElementById('bc-search-summary');
    if (!host || !window.rcmail) return;

    if (!rcmail.env.search_request) {
      host.hidden = true;
      host.textContent = '';
      return;
    }

    var scope = rcmail.env.search_scope || 'base';
    var scopeName = label(SCOPE_LABELS[scope] || SCOPE_LABELS.base);
    var count = rcmail.env.messagecount;

    if (count === undefined || count === null) count = (rcmail.message_list || {}).rowcount || 0;

    host.textContent = label('bc_resultsin')
      .replace('$count', count)
      .replace('$scope', scopeName);
    host.hidden = false;
  }

  /**
   * The folder a result came from (§4.3).
   *
   * Only in a cross-folder search: anywhere else the folder is whichever one is
   * selected in the pane, and repeating it on every row would be noise. The
   * name comes from env.mailboxes, which the folder list publishes; a folder
   * that is not in the list (unsubscribed, but searched by scope=all) falls
   * back to its last path segment.
   */
  function decorateFolderChip(cell, row) {
    if (!window.rcmail || !rcmail.env.multifolder_listing) return null;

    var message = rcmail.env.messages[row.uid] || {};
    var mbox = message.mbox;
    if (!mbox) return null;

    var known = rcmail.env.mailboxes && rcmail.env.mailboxes[mbox];
    var name = known && known.name ? known.name : String(mbox).split(/[\/.]/).pop();

    var chip = document.createElement('span');
    chip.className = 'bc-folderchip';
    chip.textContent = name;
    chip.title = mbox;
    rowMeta(cell).appendChild(chip);

    return name;
  }

  function initSearch() {
    var box = searchBox();
    if (!box || !window.rcmail || rcmail.env.task !== 'mail') return;

    var clear = document.getElementById('bc-search-clear');
    var bar = document.querySelector('.bc-search');

    // Tokens are recognised as they are typed: a completed "key:value " turns
    // into a chip, and Enter both finishes a half-typed one and searches.
    box.addEventListener('input', function () {
      consumeToken(false);
      syncClearButton();
    });

    box.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        // Never while the autocomplete owns the key — that Enter is a choice
        // from the list, and core's handler has already taken it.
        if (rcmail.ksearch_visible && rcmail.ksearch_visible()) return;
        consumeToken(true);
      }
      else if (event.key === 'Backspace' && !box.value && searchTokens.length) {
        searchTokens.pop();
        renderTokens();
        event.preventDefault();
      }
    });

    if (bar) {
      bar.addEventListener('click', function (event) {
        if (event.target === bar || event.target.classList.contains('bc-search__box')) box.focus();
      });
    }

    if (clear) clear.addEventListener('click', resetSearch);

    initRefine();
    tapSearchParams();
    tapAddressAutocomplete(box);
    syncClearButton();
  }

  /**
   * Merge the skin's criteria into every search Roundcube makes.
   *
   * search_params() is where core assembles _q, _headers, _scope, _interval and
   * _filter, and everything that searches goes through it — the search command,
   * filter_mailbox(), paging, continue_search(). Adding to _filter here rather
   * than at each call site is what makes tokens compose with the refine boxes,
   * with Focused/Other, and with paging through a result set.
   */
  function tapSearchParams() {
    if (rcmail.search_params.bcTapped) return;

    var original = rcmail.search_params;

    rcmail.search_params = function () {
      var url = original.apply(this, arguments);
      var extra = buildFilter();
      var base = url._filter && url._filter !== 'ALL' ? url._filter : '';
      var merged = [base, extra].filter(Boolean).join(' ');

      if (merged) url._filter = merged;

      return url;
    };

    rcmail.search_params.bcTapped = true;
  }

  /**
   * Contact autocomplete while an address token is being typed (§4.3).
   *
   * ksearch is core's, bound to the search box like any address field. The one
   * thing it cannot do by itself is see past the "from:" prefix: it takes the
   * text back to the last comma. ksearch_input_get() is the single place that
   * decision is made, so the prefix is stripped there — and free text returns
   * nothing, which keeps the contact lookup out of ordinary searches.
   */
  function tapAddressAutocomplete(box) {
    var $ = window.jQuery;
    if (!$ || !rcmail.init_address_input_events || !rcmail.ksearch_input_get) return;
    if (rcmail.ksearch_input_get.bcTapped) return;

    var original = rcmail.ksearch_input_get;

    rcmail.ksearch_input_get = function () {
      var value = original.apply(this, arguments);

      if (this.ksearch_input !== box) return value;

      var match = /^\s*([a-z-]+)\s*:\s*(.*)$/i.exec(value);
      var spec = match ? TOKEN_KEYS[match[1].toLowerCase()] : null;

      return spec && spec.address ? match[2] : '';
    };

    rcmail.ksearch_input_get.bcTapped = true;
    rcmail.init_address_input_events($(box));
  }

  function initRefine() {
    var toggle = document.getElementById('bc-refine-toggle');
    var panel = document.getElementById('bc-refine');
    if (!toggle || !panel) return;

    function open(on) {
      panel.hidden = !on;
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      document.body.classList.toggle('bc-refine-open', on);

      if (on) {
        var first = panel.querySelector('.bc-refine__body input, .bc-refine__body select');
        if (first) first.focus();
      }
      else {
        toggle.focus();
      }
    }

    toggle.addEventListener('click', function () { open(panel.hidden); });

    // The scope is read off env by search_params(), and a search can start from
    // the box's own Enter as well as from Apply — so it is kept in step as soon
    // as it changes rather than only on the way out of this panel.
    var scopes = panel.querySelectorAll('[name="bc-scope"]');

    for (var i = 0; i < scopes.length; i++) {
      scopes[i].addEventListener('change', function () {
        if (this.checked && window.rcmail) rcmail.env.search_scope = this.value;
      });
    }

    var close = document.getElementById('bc-refine-close');
    if (close) close.addEventListener('click', function () { open(false); });

    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') open(false);
    });

    var apply = document.getElementById('bc-refine-apply');
    if (apply) {
      apply.addEventListener('click', function () {
        open(false);
        runSearch();
      });
    }

    var reset = document.getElementById('bc-refine-reset');
    if (reset) {
      reset.addEventListener('click', function () {
        resetSearch();
        open(false);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Settings (§4.4)
  //
  // Every screen here is core's or a plugin's markup. Nothing below rebuilds
  // any of it: the icons, the drag handles and the per-filter switch are added
  // to what is already there, and each one is absent rather than broken when JS
  // does not run (§1.4).
  // ---------------------------------------------------------------------------

  /**
   * Settings nav icon per section (§4.4).
   *
   * Keyed off the class rcmail_action_settings_index::settings_tabs() puts on
   * each <li> — the four core actions, plus whatever settings_actions adds:
   * managesieve's filter/vacation/forward and password's password. Anything
   * else a plugin registers falls back to the gear.
   *
   * "enigma" is matched before "keys" would matter: the class enigma puts on its
   * row is "enigma keys" (enigma.php:199).
   */
  var SETTINGS_ICONS = {
    preferences: 'options',
    folders: 'folder',
    identities: 'contact_card',
    responses: 'mail_template',
    filter: 'filter',
    vacation: 'clock',
    forward: 'arrow_forward',
    password: 'key',
    enigma: 'key'
  };

  function decorateSettingsNav() {
    var list = document.getElementById('settings-menu');
    if (!list) return;

    var items = list.querySelectorAll('li');

    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var link = li.querySelector('a');
      if (!link || link.querySelector('.bc-icon')) continue;

      var symbol = 'settings';
      for (var name in SETTINGS_ICONS) {
        if (li.classList.contains(name)) { symbol = SETTINGS_ICONS[name]; break; }
      }

      link.insertBefore(
        svgIcon(symbol, li.classList.contains('selected') ? 'filled' : 'regular'),
        link.firstChild
      );
    }
  }

  /**
   * Cancel on the settings forms (§4.4).
   *
   * A native form.reset(), not a navigation: the form may have been loaded by
   * GET (choosing a section) or by POST (after a save), so reloading would
   * either lose the section or re-submit it. reset() puts every field back to
   * the values the page was rendered with, which after a save is the saved
   * state — exactly what "cancel my edits" should mean.
   *
   * Nothing on screen changes to show it happened, so it is announced (§9).
   */
  function initFormCancel() {
    var button = document.getElementById('bc-form-cancel');
    if (!button) return;

    var form = window.rcmail && rcmail.gui_objects ? rcmail.gui_objects.editform : null;

    // managesieve registers its form under a name of its own rather than as
    // 'editform', so fall back to the one form on the page.
    if (!form || !form.reset) {
      form = document.querySelector('.bc-formpage form');
    }

    if (!form || !form.reset) {
      button.hidden = true;
      return;
    }

    button.addEventListener('click', function () {
      form.reset();
      businessclass.announce(label('bc_changesdiscarded'));
    });
  }

  /**
   * Folder manager rows (§4.4).
   *
   * The tree is the same markup as the mail folder pane, so decorateFolders()
   * has already put the folder icon on. This adds the drag handle the design
   * draws and gives the bare subscribe checkbox an accessible name — core emits
   * it with neither a label nor a title.
   */
  function decorateFolderManager() {
    var list = document.getElementById('subscription-table');
    if (!list) return;

    var items = list.querySelectorAll('li');

    for (var i = 0; i < items.length; i++) {
      var li = items[i];
      var link = li.querySelector('a');

      if (!link || li.classList.contains('root')) continue;

      if (!link.querySelector('.bc-icon')) {
        var symbol = 'folder';
        for (var name in FOLDER_ICONS) {
          if (li.classList.contains(name)) { symbol = FOLDER_ICONS[name]; break; }
        }
        link.insertBefore(svgIcon(symbol), link.firstChild);
      }

      if (!link.querySelector('.bc-draghandle')) {
        // Decorative: the drag itself is rcmail.subscription_list's, bound to
        // the row, and reparenting is also possible from the detail pane's
        // parent-folder select — so this is an affordance, not the only way in.
        var handle = svgIcon('reorder');
        handle.classList.add('bc-draghandle');
        handle.setAttribute('title', label('bc_dragfolder'));
        link.insertBefore(handle, link.firstChild);
      }

      var box = link.querySelector('input[type="checkbox"]');
      if (box && !box.getAttribute('aria-label')) {
        box.setAttribute('aria-label', label('bc_subscribed'));
      }
    }
  }

  function initFolderManager() {
    var list = document.getElementById('subscription-table');
    if (!list) return;

    decorateFolderManager();

    // Creating or renaming a folder builds its row client-side
    // (rcmail.add_folder_row) without a page load, so new rows are decorated as
    // they appear rather than only at boot.
    if (window.MutationObserver) {
      new MutationObserver(decorateFolderManager)
        .observe(list, { childList: true, subtree: true });
    }
  }

  /**
   * The per-filter on/off switch (§4.4).
   *
   * managesieve has no such control: enabling a filter is the
   * plugin.managesieve-act command, which acts on whichever row is selected,
   * and the row's state is carried by a 'disabled' class. So the switch selects
   * its own row first and then runs the command, and reads its state back off
   * that class.
   */
  function filterSwitch(tr) {
    var cell = document.createElement('td');
    cell.className = 'bc-filterlist__switch';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'bc-switch';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', 'false');

    button.addEventListener('click', function () {
      if (!window.rcmail || !rcmail.filters_list) return;

      var uid = tr.id.replace(/^rcmrow/, '');

      // Deferred by a tick, and the event is deliberately not stopped: the
      // command is only enabled once managesieve_select() has run, and that is
      // driven by the list widget's own handlers on this same click. Selecting
      // here as well covers the case where the click never reached them.
      window.setTimeout(function () {
        rcmail.filters_list.select(uid);
        rcmail.command('plugin.managesieve-act');
      }, 0);
    });

    cell.appendChild(button);
    tr.appendChild(cell);

    return button;
  }

  function syncFilterSwitches() {
    var list = document.getElementById('filterslist');
    if (!list) return;

    var rows = list.querySelectorAll('tbody > tr');

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var button = tr.querySelector('.bc-switch') || filterSwitch(tr);
      var on = !tr.classList.contains('disabled');

      button.setAttribute('aria-checked', on ? 'true' : 'false');
      button.setAttribute('title', label(on ? 'bc_filterenabled' : 'bc_filterdisabled'));
    }
  }

  function initFilterSwitches() {
    var list = document.getElementById('filterslist');
    if (!list || !window.MutationObserver) return;

    syncFilterSwitches();

    // Rows are added, removed and re-classed by managesieve_updatelist() in
    // response to XHRs the skin does not see, so the switches are re-synced
    // from the DOM rather than from any event.
    new MutationObserver(syncFilterSwitches).observe(list, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  /** Icons for the per-row buttons managesieve puts at the end of each rule. */
  var SIEVE_ROW_ICONS = { add: 'add', del: 'delete', advanced: 'options' };

  /**
   * Condition and action rows in the filter editor (§4.4).
   *
   * Each row ends with <a class="button create add"><span class="inner">Add
   * </span></a> and the delete and advanced equivalents. The inner span holds
   * the localized name, so it becomes the accessible name and the icon goes in
   * front of it — the same trick the toolbars use.
   */
  function decorateSieveRows(root) {
    var links = (root || document).querySelectorAll('.rowbuttons a');

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.querySelector('.bc-icon')) continue;

      var symbol = null;
      for (var name in SIEVE_ROW_ICONS) {
        if (link.classList.contains(name)) { symbol = SIEVE_ROW_ICONS[name]; break; }
      }
      if (!symbol) continue;

      var inner = link.querySelector('.inner');
      if (inner) inner.className = 'voice';

      link.insertBefore(svgIcon(symbol), link.firstChild);
    }
  }

  function initSieveForm() {
    var form = document.getElementById('filter-form');
    if (!form) return;

    decorateSieveRows(form);

    if (!window.MutationObserver) return;

    // managesieve_rulefill() / managesieve_actionfill() drop whole rows in from
    // an XHR response, so new ones are decorated as they land.
    var observer = new MutationObserver(function () { decorateSieveRows(form); });

    ['rules', 'actions'].forEach(function (id) {
      var host = document.getElementById(id);
      if (host) observer.observe(host, { childList: true });
    });
  }

  /**
   * The photo well on one identity (§7.10).
   *
   * Roundcube's identities have no photo of their own, so this reads and writes
   * the picture on the contact whose address matches the identity — which is why
   * the same photo then turns up as that person's sender avatar and on their
   * contact card without anything else being told about it.
   *
   * The form around it is core's and is left alone: the file goes straight to the
   * plugin's own action, so saving the identity and setting its picture stay
   * independent, and neither can lose the other's work.
   */
  function initIdentityPhoto() {
    var well = document.getElementById('bc-idphoto');
    var file = document.getElementById('bc-idphoto-file');
    var remove = document.getElementById('bc-idphoto-remove');
    var email = window.rcmail && rcmail.env.bc_idphoto;

    if (!well || !file || !email) return;

    var name = (rcmail.env.bc_idphoto_name || '').trim() || email;

    well.classList.add('bc-avatar--' + businessclass.avatarIndex(email));
    well.textContent = initials(name);

    // Whether a picture is there at all is only knowable from whether the image
    // loads: the photo action answers 204 when there is none. So Remove starts
    // hidden and the load decides, which also keeps the button honest after an
    // upload or a removal without a second round trip to ask.
    function show(bust) {
      var img = well.querySelector('img');
      if (img) img.parentNode.removeChild(img);

      remove.hidden = true;
      well.classList.remove('is-photo');
      businessclass.avatarPhoto(well, email, bust);

      var added = well.querySelector('img');

      if (added) {
        added.addEventListener('load', function () {
          remove.hidden = false;
          well.classList.add('is-photo');
        });
      }
    }

    // Core's own uploader rather than a hand-rolled one: it sends the request
    // token in the header Roundcube checks, filters by type before anything
    // leaves the browser, and hands the reply to http_response() so the plugin's
    // commands are dispatched the same way every other action's are.
    file.addEventListener('change', function () {
      if (!file.files || !file.files.length) return;

      // file_upload()'s own type filter drops anything that does not match
      // without a word to the user (app.js:9640 says as much), so the picked file
      // is checked here where there is something to say about it.
      if (!/^image\//.test(file.files[0].type || '')) {
        rcmail.display_message(label('bc_photoinvalid'), 'error');
        file.value = '';
        return;
      }

      rcmail.file_upload(file.files, { _iid: rcmail.env.iid }, {
        name: '_photo',
        single: true,
        filter: '^image/',
        action: 'plugin.businessclass.identityphoto',
        lock: rcmail.set_busy(true, 'bc_photouploading')
      });

      // Cleared so choosing the same file twice still fires a change event.
      file.value = '';
    });

    remove.addEventListener('click', function () {
      rcmail.confirm_dialog(label('bc_photoconfirmremove'), 'delete', function () {
        rcmail.http_post('plugin.businessclass.identityphoto',
          { _iid: rcmail.env.iid, _delete: 1 },
          rcmail.set_busy(true, 'bc_photouploading'));
      });
    });

    rcmail.addEventListener('plugin.businessclass_identityphoto', function (event) {
      if (event && event.success) show(String(Date.now()));
    });

    // bc_idphoto_bust is set only on the form handed back after an identity's
    // address changed and its photo followed. Without it the first request could
    // be answered from the day-long cache the photo action sets — including a
    // cached 204 from before the move, which would look like the picture was lost.
    show(rcmail.env.bc_idphoto_bust || null);
  }

  function initSettings() {
    // The filter editor is also raised as a dialog from the mail screen
    // ("Create filter" on a message), where the task is 'mail'. Both of these
    // are guarded by their own markup, so they run wherever that form is.
    initFormCancel();
    initSieveForm();
    initIdentityPhoto();

    if (!window.rcmail || rcmail.env.task !== 'settings') return;

    decorateSettingsNav();
    initFolderManager();
    initFilterSwitches();

    // The detail pane before anything is chosen. Settings has no preview id to
    // read, so the starting state comes from where the frame is pointed.
    initReadingEmpty(function () {
      var frame = document.querySelector('#layout-content iframe');
      var src = frame ? frame.getAttribute('src') : null;
      return !src || src.indexOf('blank') > -1;
    });
  }

  // ---------------------------------------------------------------------------
  // Contacts (§4.5)
  // ---------------------------------------------------------------------------

  /** Directory rows, keyed off the class core puts on the <li>. */
  var DIRECTORY_ICONS = {
    addressbook: 'book_contacts',
    contactgroup: 'people_team',
    contactsearch: 'search'
  };

  /**
   * Address books, their groups and saved searches (§4.5).
   *
   * Same treelist markup as the mail folder pane and the same reason for doing
   * it here: neither directory_list() nor savedsearch_list() emits an icon
   * element. Without JS the 20px column stays empty and the lists still work.
   */
  function decorateDirectory() {
    ['directorylist', 'savedsearchlist'].forEach(function (id) {
      var list = document.getElementById(id);
      if (!list) return;

      var items = list.querySelectorAll('li');

      for (var i = 0; i < items.length; i++) {
        var li = items[i];
        var link = li.querySelector('a');
        if (!link || link.querySelector('.bc-icon')) continue;

        var symbol = DIRECTORY_ICONS.addressbook;
        for (var name in DIRECTORY_ICONS) {
          if (li.classList.contains(name)) { symbol = DIRECTORY_ICONS[name]; break; }
        }

        // 200px is narrow for a book name; without this they wrap.
        wrapRowLabel(link);
        link.insertBefore(
          svgIcon(symbol, li.classList.contains('selected') ? 'filled' : 'regular'),
          link.firstChild
        );
      }
    });

    // savedsearchlist always emits its <ul>, empty or not, so the heading over
    // it is hidden until there is something under it.
    var searches = document.getElementById('savedsearchlist');
    var heading = document.getElementById('bc-savedsearches');
    if (heading && searches) heading.hidden = !searches.querySelector('li');
  }

  /**
   * One contact row: 32px avatar, name, email underneath (§4.5).
   *
   * Core's row is a single <td class="name"> holding the display name as text,
   * with the email only in the row data it sent alongside — list.data[cid],
   * filled by add_contact_row (app.js:6605). Groups are rows in this list too
   * and have no email; their second line names them instead, so every row keeps
   * the same height and the avatars stay on a grid.
   */
  function decorateContactRow(event) {
    var tr = event.row && event.row.obj;
    var cell = tr && tr.querySelector('td.name');
    if (!cell || cell.querySelector('.bc-avatar')) return;

    var data = (window.rcmail && rcmail.contact_list && rcmail.contact_list.data[event.cid]) || {};
    var name = String(cell.textContent || '').trim();
    var email = data.email || '';
    var isGroup = data._type === 'group';

    // Text only — compose_list_name() is Q-escaped before it reaches the cell.
    cell.textContent = '';

    var avatar = document.createElement('span');
    // §4.5: the palette entry comes off the address, so a contact keeps the same
    // colour wherever it appears. Groups have no address to hash.
    avatar.className = 'bc-avatar bc-avatar--' + businessclass.avatarIndex(email || name);
    avatar.setAttribute('aria-hidden', 'true');

    if (isGroup) avatar.appendChild(svgIcon('people_team'));
    else avatar.textContent = initials(name);

    cell.appendChild(avatar);

    var line = document.createElement('span');
    line.className = 'bc-contactlist__name';
    line.textContent = name;
    cell.appendChild(line);

    var sub = document.createElement('span');
    sub.className = 'bc-contactlist__mail';
    sub.textContent = isGroup ? label('group') : email;
    cell.appendChild(sub);

    // The widget points aria-labelledby at td.name, which has no box of its own,
    // so the row gets an explicit name instead (§9).
    var parts = [name];
    if (isGroup) parts.push(label('group'));
    else if (email) parts.push(email);
    tr.setAttribute('aria-label', parts.join(', '));
  }

  /** Empty contact list (§8 states), the counterpart of syncEmptyState(). */
  function syncContactEmpty() {
    var host = document.getElementById('contacts-content');
    if (!host || !window.rcmail || !rcmail.contact_list) return;

    var note = host.querySelector('.bc-empty');

    if (rcmail.contact_list.rowcount) {
      if (note) note.parentNode.removeChild(note);
      return;
    }

    var searching = !!rcmail.env.search_request;

    if (!note) {
      note = document.createElement('div');
      note.className = 'bc-empty';
      note.appendChild(svgIcon(searching ? 'search' : 'contact_card'));
      note.appendChild(document.createElement('p')).className = 'bc-empty__title';
      note.appendChild(document.createElement('p')).className = 'bc-empty__text';
      host.appendChild(note);
    }

    note.querySelector('.bc-empty__title').textContent =
      searching ? label('bc_noresults') : label('bc_nocontacts');
    note.querySelector('.bc-empty__text').textContent = label('nocontactsfound');
  }

  /**
   * Watch the rows rather than the actions that produce them.
   *
   * The contact list is refilled by list, listgroup, listsearch and search, and
   * unlike the message list it publishes no 'listupdate' event — so one observer
   * covers every route into it.
   */
  function initContactList() {
    var table = document.getElementById('contacts-table');
    if (!table) return;

    syncContactEmpty();

    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function () { syncContactEmpty(); });
    var body = table.tBodies[0] || table;
    observer.observe(body, { childList: true });
  }

  /**
   * Compose is enabled for every task (app.js:239), so core never dims it —
   * but in Contacts it composes to the selected contacts, and with nothing
   * selected it would open an empty message instead. aria-disabled is what the
   * pane head already styles as unavailable, and it blocks the click too.
   */
  function syncComposeButton() {
    var button = document.getElementById('bc-contact-compose');
    if (!button || !window.rcmail || !rcmail.contact_list) return;

    var usable = rcmail.contact_list.get_selection().length > 0
      || (!!rcmail.env.group && !!rcmail.env.pagecount);

    button.setAttribute('aria-disabled', usable ? 'false' : 'true');
  }

  /**
   * The role line: job title · organization · department (§4.5).
   *
   * Core emits those three as separate rows, in the other order, so they are
   * composed into one line here and only then hidden. Without JS they stack —
   * correct, just three lines instead of one.
   */
  function decorateContactRole(ident) {
    var parts = [];

    ['jobtitle', 'organization', 'department'].forEach(function (name) {
      var field = ident.querySelector('.' + name + ' .namefield');
      var text = field ? String(field.textContent || '').trim() : '';
      if (text) parts.push(text);
    });

    if (!parts.length) return;

    var line = document.createElement('div');
    line.className = 'bc-contact__role';
    line.textContent = parts.join(' · ');
    ident.appendChild(line);
    ident.classList.add('is-composed');
  }

  /**
   * The 64px initials avatar in the detail header (§4.5).
   *
   * Core's contactphoto object is a <div> around an <img>, and with no
   * placeholder= that img is a transparent GIF — so the initials go in the same
   * element, underneath it, and a contact who has a picture simply covers them.
   * Nothing is fetched for a contact who has none.
   */
  function decorateContactPhoto(ident) {
    var photo = document.getElementById('contactpic');
    if (!photo || photo.querySelector('.bc-avatar__initials')) return;

    var source = ident.querySelector('.names') || ident.querySelector('.displayname');
    var name = source ? String(source.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (!name) return;

    // Hashed on the address, like every other avatar in the skin, so one person
    // keeps one colour across the list, the detail pane and their messages.
    var mail = document.querySelector('.bc-contact__details a.email');
    var key = (mail && String(mail.textContent || '').trim()) || name;

    photo.classList.add('bc-avatar--' + businessclass.avatarIndex(key));

    // The <img> already carries alt="Contact photo"; a second reading of the
    // name here would only repeat what the heading beside it says.
    var text = document.createElement('span');
    text.className = 'bc-avatar__initials';
    text.setAttribute('aria-hidden', 'true');
    text.textContent = initials(name);
    photo.insertBefore(text, photo.firstChild);
  }

  /**
   * Make the label column read "Email" rather than "Home" (§4.5).
   *
   * Core labels each value row with its subtype and puts the field name on the
   * group's <legend>, which a fieldset renders above its content box and so can
   * never sit in the label column. The name is moved into the first row's label
   * and the subtype travels to the value it belongs to, which keeps both without
   * repeating the field name down the group.
   *
   * Read view only. compact-form="true" gives the edit form a different shape:
   * the subtype is a <select> in the label's place and there is no
   * .contactfieldcontent wrapper to move anything into.
   */
  function decorateContactFields(details) {
    var groups = details.querySelectorAll('fieldset.contactfieldgroup');

    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      // Group membership is chips, not a field group.
      if (group.classList.contains('contactgroups')) continue;

      var legend = group.querySelector(':scope > legend');
      var field = legend ? String(legend.textContent || '').trim() : '';
      if (!field) continue;

      var rows = group.querySelectorAll(':scope > .row');

      for (var r = 0; r < rows.length; r++) {
        var cellLabel = rows[r].querySelector('.contactfieldlabel');
        if (!cellLabel) continue;

        var subtype = String(cellLabel.textContent || '').trim();
        var value = rows[r].querySelector('.contactfieldcontent');

        if (value && subtype && subtype !== field) {
          var tag = document.createElement('span');
          tag.className = 'bc-contact__subtype';
          tag.textContent = subtype;
          value.appendChild(tag);
        }

        cellLabel.textContent = r === 0 ? field : '';
      }
    }

    details.classList.add('is-composed');
  }

  /**
   * Group membership as chips (§4.5).
   *
   * The checkbox stays the control — app.js binds group_member_change to its
   * change event, and it is what a screen reader reads and a keyboard toggles.
   * Only the look moves to the label, since :has() is not used in this skin.
   */
  function decorateGroupChips(details) {
    var boxes = details.querySelectorAll('input.groupmember');

    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        var chip = box.parentNode;
        while (chip && chip.tagName !== 'LABEL') chip = chip.parentNode;
        if (!chip) return;

        function sync() { chip.classList.toggle('is-member', box.checked); }

        // A read-only book disables the boxes; nothing reverts them otherwise,
        // so the change event is the whole story.
        chip.classList.toggle('is-locked', box.disabled);
        box.addEventListener('change', sync);
        sync();
      })(boxes[i]);
    }
  }

  /** Core's per-value delete link in the edit form: text 'Delete' -> icon. */
  function decorateFieldButtons(root) {
    var buttons = root.querySelectorAll('a.contactfieldbutton');

    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (button.querySelector('.bc-icon')) continue;

      var inner = button.querySelector('span');
      if (inner) inner.className = 'voice';
      button.insertBefore(svgIcon('dismiss'), button.firstChild);
    }
  }

  function initContacts() {
    if (!window.rcmail || rcmail.env.task !== 'addressbook') return;

    // The detail and edit pages are framed and run their own ui.js, so this half
    // is guarded by its markup rather than by the task.
    var details = document.querySelector('.bc-contact__details');

    if (details) {
      var ident = document.querySelector('.bc-contact__ident');
      if (ident) {
        decorateContactRole(ident);
        decorateContactPhoto(ident);
      }

      var editing = !!document.querySelector('.bc-contact--edit');
      if (!editing) decorateContactFields(details);

      decorateGroupChips(details);

      if (editing) {
        decorateFieldButtons(details);

        // insert_edit_field() drops new rows in when you pick from "Add field".
        if (window.MutationObserver) {
          new MutationObserver(function () { decorateFieldButtons(details); })
            .observe(details, { childList: true, subtree: true });
        }
      }
    }

    if (rcmail.env.framed) return;

    decorateDirectory();
    initContactList();
    syncComposeButton();

    if (rcmail.contact_list) {
      rcmail.contact_list.addEventListener('select', syncComposeButton);
    }

    // The detail pane before anything is chosen. Contacts has no preview id
    // either, so the starting state comes from where the frame is pointed.
    initReadingEmpty(function () {
      var frame = document.querySelector('#layout-content iframe');
      var src = frame ? frame.getAttribute('src') : null;
      return !src || src.indexOf('blank') > -1;
    });
  }

  // ---------------------------------------------------------------------------
  // Quota (§3.4)
  // ---------------------------------------------------------------------------

  function updateQuota(content) {
    var host = document.getElementById('bc-quota');
    if (!host || !content) return;

    var track = host.querySelector('.bc-quota__track');
    var fill = host.querySelector('.bc-quota__fill');
    var value = host.querySelector('.bc-quota__value');

    if (content.total === undefined || !content.total) {
      if (track) track.hidden = true;
      return;
    }

    var percent = clamp(parseInt(content.percent, 10) || 0, 0, 100);

    if (track) track.hidden = false;
    if (fill) fill.style.width = percent + '%';

    // content.title is core's whole sentence — "Disk usage: 4.4 GB / 200 GB
    // (2%)" — and the label beside it is already that same 'quota' string, so
    // the prefix is dropped rather than shown twice. Matched against the label's
    // own text instead of a pattern, so it holds in every language.
    if (value && content.title) {
      var text = String(content.title);
      var name = host.querySelector('.bc-quota__label');
      var prefix = name ? String(name.textContent || '').trim() + ': ' : '';

      if (prefix && text.indexOf(prefix) === 0) text = text.slice(prefix.length);

      value.textContent = text;
    }

    host.classList.toggle('is-critical', percent > 90);
  }

  // ---------------------------------------------------------------------------
  // Pane resize (§7.1)
  // ---------------------------------------------------------------------------

  /**
   * Which bounds and preference a divider is working against right now.
   *
   * Only the list divider changes: in the 'desktop' layout the reading pane is
   * below the list rather than beside it, so the same handle drags a height.
   */
  function splitterLimit(key) {
    if (key !== 'list') return LIMITS[key];

    var shell = document.getElementById('layout');

    return shell && shell.getAttribute('data-bc-layout') === 'desktop'
      ? LIMITS.listH
      : LIMITS.list;
  }

  function applySize(key, px) {
    var shell = document.getElementById('layout');
    var limit = splitterLimit(key);
    var size = clamp(Math.round(px), limit.min, limit.max);

    if (shell) shell.style.setProperty(limit.varname, size + 'px');

    var handle = document.getElementById('bc-splitter-' + key);

    if (handle) {
      // The bounds move with the orientation, so the announced range moves with
      // them — a separator reporting a valuenow outside its own min/max is
      // worse than one that reports nothing (§9).
      handle.setAttribute('aria-valuemin', String(limit.min));
      handle.setAttribute('aria-valuemax', String(limit.max));
      handle.setAttribute('aria-valuenow', String(size));
    }

    return size;
  }

  function initSplitter(key) {
    var handle = document.getElementById('bc-splitter-' + key);
    var shell = document.getElementById('layout');
    if (!handle || !shell) return;

    var pane = document.getElementById(key === 'folders' ? 'layout-sidebar' : 'layout-list');
    var dragging = false;
    var vertical = false;
    var origin = 0;
    var startSize = 0;

    function isVertical() {
      return key === 'list' && shell.getAttribute('data-bc-layout') === 'desktop';
    }

    function onMove(event) {
      if (!dragging) return;
      applySize(key, startSize + ((vertical ? event.clientY : event.clientX) - origin));
      event.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('is-dragging');
      document.body.classList.remove('bc-resizing');
      document.body.classList.remove('bc-resizing--v');
      savePref(splitterLimit(key).pref, parseInt(handle.getAttribute('aria-valuenow'), 10));
    }

    handle.addEventListener('pointerdown', function (event) {
      if (!pane) return;

      // The handles are hidden below the width at which their pane stops being
      // a resizable column (§6): the folder pane below 1200px, the list below
      // 768px. A hidden handle cannot be clicked, but it can still be reached
      // by a stylus or an assistive technology driving the pointer — and a drag
      // here would write a stored width for a pane that is not laid out that
      // way, which the next wide session would then be stuck with.
      if (window.matchMedia
        && window.matchMedia(key === 'folders' ? DRAWER_MQ : '(max-width: 767px)').matches) {
        return;
      }

      var box = pane.getBoundingClientRect();

      dragging = true;
      vertical = isVertical();
      origin = vertical ? event.clientY : event.clientX;
      startSize = vertical ? box.height : box.width;

      handle.classList.add('is-dragging');
      document.body.classList.add(vertical ? 'bc-resizing--v' : 'bc-resizing');
      event.preventDefault();
    });

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);

    // Keyboard-resizable, as role="separator" requires (§7.1, §9). Up and Down
    // drive the horizontal divider, Left and Right the vertical one.
    handle.addEventListener('keydown', function (event) {
      var limit = splitterLimit(key);
      var step = event.shiftKey ? 40 : 8;
      var current = parseInt(handle.getAttribute('aria-valuenow'), 10) || limit.min;
      var grow = isVertical() ? 'ArrowDown' : 'ArrowRight';
      var shrink = isVertical() ? 'ArrowUp' : 'ArrowLeft';
      var next = null;

      if (event.key === shrink) next = current - step;
      else if (event.key === grow) next = current + step;
      else if (event.key === 'Home') next = limit.min;
      else if (event.key === 'End') next = limit.max;
      else return;

      savePref(limit.pref, applySize(key, next));
      event.preventDefault();
    });

    // Switching layout swaps the axis this handle drives, and with it the
    // orientation a screen reader announces.
    function syncOrientation() {
      handle.setAttribute('aria-orientation', isVertical() ? 'horizontal' : 'vertical');
    }

    if (window.rcmail) rcmail.addEventListener('layout-change', syncOrientation);
    syncOrientation();
  }

  /**
   * Say that new mail has arrived (§9).
   *
   * Core has no event for it. What it has is set_unread_count(), which every
   * path that changes a folder's unread total goes through — the check-recent
   * poll, the refresh response, and marking a message read — so wrapping it
   * catches new mail without depending on newmail_notifier being installed.
   *
   * Only increases, and only the folder that grew: a count going down is
   * someone reading, which they can see for themselves. Rate-limited to one
   * announcement a minute, because a busy INBOX polls every 60s and a live
   * region that talks over the user is worse than one that says nothing.
   */
  var lastNewMail = 0;

  function initNewMail() {
    if (!window.rcmail || !rcmail.set_unread_count) return;

    var original = rcmail.set_unread_count;
    var counts = {};

    rcmail.set_unread_count = function (mbox, count) {
      var was = counts[mbox];
      counts[mbox] = count;

      // The first call for a folder is the page telling us what is already
      // there, not news. Date.now() is the clock, not a seed — nothing here is
      // reproduced by the verify harness.
      if (was !== undefined && count > was && Date.now() - lastNewMail > 60000) {
        lastNewMail = Date.now();
        businessclass.announce(label('bc_newmail'));
      }

      return original.apply(this, arguments);
    };
  }

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts (§9)
  //
  // Single letters, which is the whole difficulty: every one of them is also a
  // character somebody might be typing. Three guards keep them apart, and all
  // three have to pass before anything runs — see shortcutsAllowed().
  // ---------------------------------------------------------------------------

  /**
   * The §9 table, in the order the ? dialog lists them.
   *
   * `run` returns false to say "not applicable here", which leaves the key
   * alone rather than swallowing it: `e` with nothing selected should reach
   * the browser as a keystroke that did nothing, not be silently eaten.
   *
   * `needs` names the command a key stands for, and is checked against core's
   * own enabled/disabled state before running — so `e` does nothing in a folder
   * with no archive configured, for the same reason its toolbar button is grey.
   */
  var SHORTCUTS = [
    { keys: ['j'], label: 'bc_keynext', group: 'list', run: function () { return moveSelection(40); } },
    { keys: ['k'], label: 'bc_keyprev', group: 'list', run: function () { return moveSelection(38); } },
    { keys: ['Enter'], label: 'bc_keyopen', group: 'list', run: openSelected },
    { keys: ['x'], label: 'bc_keyselect', group: 'list', run: toggleSelected },
    { keys: ['e'], label: 'bc_keyarchive', group: 'message', needs: 'plugin.archive', run: command('plugin.archive') },
    { keys: ['#'], label: 'bc_keydelete', group: 'message', needs: 'delete', run: command('delete') },
    { keys: ['u'], label: 'bc_keyunread', group: 'message', needs: 'mark', run: command('mark', 'unread') },
    { keys: ['f'], label: 'bc_keyflag', group: 'message', needs: 'mark', run: toggleFlag },
    { keys: ['r'], label: 'bc_keyreply', group: 'message', needs: 'reply', run: command('reply') },
    { keys: ['a'], label: 'bc_keyreplyall', group: 'message', needs: 'reply-all', run: command('reply-all') },
    { keys: ['c'], label: 'bc_keycompose', group: 'app', needs: 'compose', run: command('compose') },
    { keys: ['/'], label: 'bc_keysearch', group: 'app', run: focusSearch },
    { keys: ['F6'], label: 'bc_keypanes', group: 'app', run: cyclePanes },
    { keys: ['?'], label: 'bc_keyhelp', group: 'app', run: function () { businessclass.openShortcuts(); return true; } }
  ];

  /** Shift+F10 is listed in the dialog but handled apart — it carries a modifier. */
  var SHORTCUT_ROWMENU = 'bc_keyrowmenu';

  /**
   * Whether a single key may be read as a command right now.
   *
   * 1. The preference. Off means the listener never binds at all.
   * 2. Modifiers. Anything with Ctrl/Meta/Alt belongs to the browser or the OS.
   *    Shift is allowed, because `#` and `?` are shifted characters on most
   *    layouts and reading them any other way would make them unreachable.
   * 3. Where the keystroke came from. A text field, a <select>, a
   *    contenteditable — including TinyMCE's body, which is a contenteditable
   *    inside an iframe and therefore never reaches this document at all — and
   *    an open menu, which owns its own arrow and letter handling.
   */
  function shortcutsAllowed(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (openPopover) return false;

    var el = event.target;
    if (!el || el === document || el === document.body) return true;

    if (el.isContentEditable) return false;

    var tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;

    // A dialog is core's, and its own controls own the keyboard while it is up.
    return !el.closest || !el.closest('.ui-dialog, [role="dialog"]');
  }

  /** Core's own answer to "is this command available", which the toolbar reads. */
  function commandEnabled(name) {
    if (!name) return true;
    return !!(window.rcmail && rcmail.commands && rcmail.commands[name]);
  }

  function command(name, props) {
    return function () {
      rcmail.command(name, props === undefined ? '' : props);
      return true;
    };
  }

  function moveSelection(keyCode) {
    var list = window.rcmail && rcmail.message_list;
    if (!list || !list.rowcount) return false;

    // The list widget only reads its own key events while it believes it has
    // focus, and j/k are being read here instead — so the move is asked for
    // directly. use_arrow_key() also handles "nothing selected yet".
    list.use_arrow_key(keyCode, null);
    list.focus();

    return true;
  }

  function openSelected() {
    var list = window.rcmail && rcmail.message_list;
    var uid = list && list.get_single_selection();
    if (!uid) return false;

    // What a double-click does. In the list-only layout this navigates; with a
    // reading pane it is already open, and core no-ops rather than reloading.
    rcmail.command('show', uid);
    return true;
  }

  function toggleSelected() {
    var list = window.rcmail && rcmail.message_list;
    if (!list || !list.rowcount || !list.multiselect) return false;

    var uid = list.last_selected;
    if (!uid) return false;

    // The second argument is the multi-select modifier: highlight_row() with it
    // adds or removes one row from the selection, which is what x means.
    list.highlight_row(uid, true);
    announceSelection(list);

    return true;
  }

  function toggleFlag() {
    var list = window.rcmail && rcmail.message_list;
    var uid = list && list.get_single_selection();
    var row = uid && list.rows[uid];
    if (!row || !row.obj) return false;

    rcmail.command('mark', row.obj.classList.contains('flagged') ? 'unflagged' : 'flagged');
    return true;
  }

  function focusSearch() {
    var input = document.getElementById('bc-search-input')
      || document.querySelector('#quicksearchbox, .bc-search input[type="text"]');
    if (!input) return false;

    input.focus();
    if (input.select) input.select();

    return true;
  }

  /**
   * F6 — move between the panes, which is the one navigation a keyboard user
   * cannot do any other way: the list is a single tab stop and the reading pane
   * is an iframe, so Tab alone crosses them in one direction and slowly.
   *
   * Skips whatever is not on screen, so it does the right thing with the folder
   * pane hidden and below 768px, where the reading pane covers the list.
   */
  var PANES = ['#layout-menu', '#layout-sidebar', '#messagelist-content', '#layout-content'];

  function cyclePanes() {
    var panes = [];

    for (var i = 0; i < PANES.length; i++) {
      var el = document.querySelector(PANES[i]);
      if (el && el.offsetParent !== null && el.getBoundingClientRect().width > 0) panes.push(el);
    }

    if (panes.length < 2) return false;

    var active = document.activeElement;
    var index = -1;

    for (var j = 0; j < panes.length; j++) {
      if (panes[j] === active || panes[j].contains(active)) { index = j; break; }
    }

    var next = panes[(index + 1) % panes.length];

    // Panes are containers, not controls: give focus to the first thing inside
    // that can take it, and fall back to the pane itself with a temporary
    // tabindex so focus lands somewhere a screen reader will announce.
    var target = next.querySelector('a[href], button:not([disabled]), input, [tabindex="0"]');

    if (!target) {
      target = next;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    }

    target.focus();
    return true;
  }

  function announceSelection(list) {
    var count = list.get_selection().length;
    businessclass.announce(count === 1
      ? label('bc_oneselected')
      : label('bc_nselected').replace('$n', count));
  }

  /**
   * Bind the table, once, if the preference allows it.
   *
   * keydown rather than keypress: keypress never fires for F6, and it is the
   * event the rest of the skin already listens on.
   */
  function initShortcuts() {
    if (!window.rcmail || !rcmail.command) return;
    if (rcmail.env.bc_shortcuts === false) return;

    document.addEventListener('keydown', function (event) {
      if (event.key === 'F10' && event.shiftKey && shortcutsAllowed(event)) {
        if (openRowMenu()) event.preventDefault();
        return;
      }

      if (!shortcutsAllowed(event)) return;

      for (var i = 0; i < SHORTCUTS.length; i++) {
        if (SHORTCUTS[i].keys.indexOf(event.key) === -1) continue;
        if (!commandEnabled(SHORTCUTS[i].needs)) return;
        if (SHORTCUTS[i].run() !== false) event.preventDefault();
        return;
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Row menu (§9's Shift+F10)
  //
  // One menu reused by every row, positioned at the row it was opened on. Per-row
  // menus would be rebuilt with the list on every folder change and every page.
  // ---------------------------------------------------------------------------

  function rowMenuPanel() {
    var panel = document.getElementById('bc-rowmenu');
    if (panel) return panel;

    var scroll = document.getElementById('messagelist-content');
    if (!scroll) return null;

    var anchor = document.createElement('div');
    anchor.className = 'bc-rowmenu__anchor';
    anchor.id = 'bc-rowmenu-anchor';
    anchor.hidden = true;

    // The popover primitive reports state on a button, so there is one — never
    // shown, because the pointer already reaches these actions from the row.
    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'bc-rowmenu-button';
    button.className = 'voice';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = label('bc_quickactions');

    panel = document.createElement('div');
    panel.id = 'bc-rowmenu';
    panel.className = 'bc-popover';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', label('bc_quickactions'));
    panel.hidden = true;

    anchor.appendChild(button);
    anchor.appendChild(panel);
    scroll.appendChild(anchor);

    initPopover(button, panel);

    panel.addEventListener('click', function (event) {
      var item = event.target.closest && event.target.closest('[role="menuitem"]');
      if (item) runRowAction(item.getAttribute('data-bc-action'), panel.bcUid);
    });

    return panel;
  }

  function runRowAction(action, uid) {
    var list = window.rcmail && rcmail.message_list;
    var row = list && uid && list.rows[uid];
    if (!row || !row.obj) return;

    list.select(uid);

    switch (action) {
      case 'archive': rcmail.command('plugin.archive', ''); break;
      case 'delete': rcmail.command('delete', ''); break;
      case 'flag':
        rcmail.command('mark', row.obj.classList.contains('flagged') ? 'unflagged' : 'flagged');
        break;
      case 'pin': businessclass.pin(uid, !row.obj.classList.contains('bc-pinned')); break;
    }
  }

  /**
   * Open the menu on the selected row. Returns false when there is nothing to
   * open it on, so Shift+F10 falls through to the browser's own context menu.
   */
  function openRowMenu() {
    var list = window.rcmail && rcmail.message_list;
    var uid = list && list.get_single_selection();
    var row = uid && list.rows[uid];
    if (!row || !row.obj) return false;

    var panel = rowMenuPanel();
    if (!panel) return false;

    panel.bcUid = uid;
    panel.textContent = '';

    for (var i = 0; i < QUICK_ACTIONS.length; i++) {
      var action = QUICK_ACTIONS[i];
      if (action.key === 'archive' && !rcmail.env.archive_folder) continue;

      var flagged = row.obj.classList.contains('flagged');
      var pinned = row.obj.classList.contains('bc-pinned');

      var item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('data-bc-action', action.key);
      if (action.danger) item.className = 'bc-iconbtn--danger';
      item.appendChild(svgIcon(action.icon));

      var text = document.createElement('span');
      text.textContent = action.key === 'flag' ? label(flagged ? 'bc_quickunflag' : 'bc_quickflag')
        : action.key === 'pin' ? pluginLabel(pinned ? 'bc_unpin' : 'bc_pin')
        : label(action.label);
      item.appendChild(text);

      panel.appendChild(item);
    }

    var anchor = document.getElementById('bc-rowmenu-anchor');
    anchor.hidden = false;
    anchor.style.top = (row.obj.offsetTop + row.obj.offsetHeight) + 'px';

    businessclass.openPopover(document.getElementById('bc-rowmenu-button'), panel);
    return true;
  }

  // ---------------------------------------------------------------------------
  // The ? dialog (§9: "document them in a ? dialog")
  // ---------------------------------------------------------------------------

  var SHORTCUT_GROUPS = [
    { key: 'list', label: 'bc_keyslist' },
    { key: 'message', label: 'bc_keysmessage' },
    { key: 'app', label: 'bc_keysapp' }
  ];

  /** How a key prints in the dialog. Enter and F6 are words, not characters. */
  function keyName(key) {
    return key === 'Enter' ? label('bc_keyenter') : key;
  }

  businessclass.openShortcuts = function () {
    if (!window.rcmail || !rcmail.show_popup_dialog) return;

    var body = document.createElement('div');
    body.className = 'bc-shortcuts';

    for (var g = 0; g < SHORTCUT_GROUPS.length; g++) {
      var group = SHORTCUT_GROUPS[g];
      var rows = SHORTCUTS.filter(function (s) { return s.group === group.key; });
      if (!rows.length) continue;

      var title = document.createElement('h3');
      title.className = 'bc-shortcuts__title';
      title.textContent = label(group.label);
      body.appendChild(title);

      var dl = document.createElement('dl');
      dl.className = 'bc-shortcuts__list';

      for (var i = 0; i < rows.length; i++) {
        appendShortcut(dl, rows[i].keys.map(keyName), label(rows[i].label));
      }

      // Shift+F10 belongs with the list but is not in the table, because it is
      // the one binding that carries a modifier.
      if (group.key === 'list') {
        appendShortcut(dl, ['Shift', 'F10'], label(SHORTCUT_ROWMENU));
      }

      body.appendChild(dl);
    }

    var note = document.createElement('p');
    note.className = 'bc-shortcuts__note';
    note.textContent = label('bc_keysnote');
    body.appendChild(note);

    rcmail.show_popup_dialog(body, label('bc_keystitle'), null, {
      button: false,
      cancel_button: 'close',
      width: 420
    });
  };

  function appendShortcut(dl, keys, text) {
    var dt = document.createElement('dt');

    for (var i = 0; i < keys.length; i++) {
      if (i) dt.appendChild(document.createTextNode('+'));
      var kbd = document.createElement('kbd');
      kbd.textContent = keys[i];
      dt.appendChild(kbd);
    }

    var dd = document.createElement('dd');
    dd.textContent = text;

    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  // ---------------------------------------------------------------------------
  // Print (_print.scss)
  // ---------------------------------------------------------------------------

  /**
   * Send Ctrl+P to Roundcube's own print view when there is one to send it to.
   *
   * The reading pane is an iframe, and an iframe cannot grow to its content — so
   * printing the app window can only ever produce the page the frame happens to
   * fill, however long the message is. Core already opens a proper standalone
   * document for exactly this (`?_action=print`, the messageprint and contactprint
   * templates), which is what the Print button does; this hands the keyboard the
   * same thing.
   *
   * Only when there is a single message or contact to print. With nothing open
   * the browser's own print is the right answer — @media print takes the chrome
   * off and the list prints as a table — so the event is left alone and nothing
   * is preventDefault()ed.
   */
  function initPrint() {
    if (!window.rcmail || !rcmail.command) return;

    document.addEventListener('keydown', function (event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (String(event.key || '').toLowerCase() !== 'p') return;
      if (!printTarget()) return;

      event.preventDefault();
      rcmail.command('print', '', null, event);
    });
  }

  /**
   * Whether core's print command has a single record to act on.
   *
   * get_single_uid()/get_single_cid() are the very functions core's own 'print'
   * command branches on (app.js:9850, :9858), so asking them first is what keeps
   * this from swallowing Ctrl+P and then doing nothing.
   */
  function printTarget() {
    var env = rcmail.env;

    // Already a print document, or a message in its own window: both are complete
    // pages the browser can print as they stand, and routing would open a second
    // window on top of the first.
    if (env.action === 'print' || env.extwin) return null;

    if (env.task === 'mail') return rcmail.get_single_uid ? rcmail.get_single_uid() : null;
    if (env.task === 'addressbook') return rcmail.get_single_cid ? rcmail.get_single_cid() : null;

    return null;
  }

  // ---------------------------------------------------------------------------
  // Plugins (§1.6, §12 step 11)
  //
  // Everything here is decoration over markup a plugin owns, and every piece is
  // absent rather than broken when its plugin is not installed (§1.4). The
  // plugins' own behaviour — acl.js, enigma.js, zipdownload.js — is untouched.
  // ---------------------------------------------------------------------------

  /**
   * An icon for a plugin-registered task in the app rail (§3.3).
   *
   * The taskbar container gives these buttons no icon of their own, and at 48px
   * the rail cannot show the text label they arrive with.
   */
  function decorateTaskButtons() {
    var menu = document.getElementById('taskmenu');
    if (!menu) return;

    var links = menu.querySelectorAll('a');

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.querySelector('.bc-icon')) continue;

      for (var token in TASK_ICONS) {
        if (link.classList.contains(token)) {
          link.insertBefore(svgIcon(TASK_ICONS[token]), link.firstChild);
          break;
        }
      }
    }
  }

  /**
   * Bounce (templates/bounce.html).
   *
   * The page reuses compose's recipient rows, so it reuses their behaviour: the
   * address pills and the Cc/Bcc disclosure. initCompose() cannot do it — it
   * returns early unless .bc-compose is on the page, and it would go on to look
   * for an editor, an attachment list and a draft indicator that a bounce has
   * none of.
   */
  function initBounce() {
    if (!document.querySelector('.bc-bounce')) return;

    var fields = document.querySelectorAll('[data-bc-recipients]');
    for (var i = 0; i < fields.length; i++) recipientInput(fields[i]);

    initHeaderToggles();
  }

  // Dialogs core and its plugins open too small for this skin's type and spacing,
  // matched on the URL the dialog's iframe was pointed at.
  //
  //   bounce  400x300 (app.js:4567) — cannot hold From, To, Cc, Bcc and
  //           "Save sent message in".
  //   enigma  500x180 / 500x150 (enigma.js:117, :133) — the import forms carry a
  //           storage notice above the field, measured at 288px tall.
  //
  // Resizing on the event core already fires is a good deal cheaper than
  // reimplementing rcmail.bounce() or enigma_key_import(): each of those reads a
  // form out of the frame and posts it from the parent, and a copy here would
  // have to be kept in step with theirs.
  var DIALOG_SIZES = [
    ['_action=bounce', 560, 460],
    ['_a=import-search', 520, 260],
    ['_a=import', 520, 340]
  ];

  /**
   * Size the dialogs core opens too small (§7.7).
   *
   * show_popup_dialog() fires 'dialog-open' with the popup element after the
   * dialog is built (app.js:8840). It runs in whichever window opened the
   * dialog, and ui.js is loaded in every frame, so the listener is registered
   * wherever the command was invoked.
   */
  function initDialogs() {
    if (!window.rcmail || !rcmail.addEventListener) return;

    rcmail.addEventListener('dialog-open', function (event) {
      var popup = event && event.obj;
      if (!popup || !popup.find || !popup.dialog) return;

      var frame = popup.find('iframe');
      if (!frame.length) return;

      // Identified by the URL the dialog was pointed at: the iframe is
      // same-origin but has not necessarily loaded at this point, so there is
      // nothing inside it to look at yet.
      var src = String(frame.attr('src') || '');
      var size = null;

      for (var i = 0; i < DIALOG_SIZES.length; i++) {
        if (src.indexOf(DIALOG_SIZES[i][0]) >= 0) { size = DIALOG_SIZES[i]; break; }
      }
      if (!size) return;

      popup.dialog('option', {
        width: Math.min(size[1], window.innerWidth - 40),
        height: Math.min(size[2], window.innerHeight - 40)
      });

      // Growing a dialog leaves it where its old, smaller box was centred.
      popup.dialog('option', 'position', { my: 'center', at: 'center', of: window });
    });
  }

  /**
   * enigma: the keys screen's export menu, and the encryption state on a message.
   */
  function initEnigma() {
    initPopover(document.getElementById('bc-keys-export'),
      document.getElementById('bc-keys-export-menu'));

    decorateEnigmaStatus();
  }

  /**
   * The signature / decryption box above a message body.
   *
   * enigma writes two classes on it: how serious it is (boxerror, boxwarning,
   * boxconfirmation) and what it is about (encrypted, signed) — see
   * enigma_ui.php:986. Colour alone must not carry that, so a glyph goes in
   * front of the sentence (§9).
   */
  function decorateEnigmaStatus() {
    var box = document.getElementById('enigma-message');
    if (!box || box.querySelector('.bc-icon')) return;

    var symbol = 'checkmark_circle';

    if (box.classList.contains('boxerror') || box.classList.contains('boxwarning')) {
      symbol = 'warning';
    }
    else if (box.classList.contains('encrypted')) {
      symbol = 'lock_closed';
    }

    box.insertBefore(svgIcon(symbol), box.firstChild);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function init() {
    decorateIconButtons(document);
    decorateDeclaredAvatars(document);

    // Before anything paints a logo: on a dark surface the light artwork has to
    // be swapped out, and the login screen carries one too — so this runs above
    // initLogin() and not with the reading-pane block further down.
    initBrandArt();

    // Sign-in is its own page with none of the shell on it; nothing below
    // applies there, and nothing here applies anywhere else.
    initLogin();

    // Order matters: the Favorites rows are clones of the tree rows, so the tree
    // has to have its icons and wrapped labels before anything is copied out of
    // it, and the stars go on last so the clones are not carrying one already.
    decorateFolders();
    initFavorites();
    decorateFolderStars();
    initFolderGroups();
    renderCategories();
    initSplitter('folders');
    initSplitter('list');

    // §6. After the splitters, because it may collapse the folder pane and the
    // splitter's own guard reads the same breakpoint; before nothing in
    // particular, since neither touches the list.
    initResponsive();
    initReadingBack();

    var shell = document.getElementById('layout');
    if (shell && window.rcmail && rcmail.env.layout) {
      shell.setAttribute('data-bc-layout', rcmail.env.layout);
    }

    // Reading pane: the ribbon lives in the shell, the message document inside
    // the frame — init() runs in both and each half no-ops where its markup is
    // absent.
    initRibbon();
    initOverflow('bc-ribbon', '.bc-ribbon__more');
    decorateSender();
    initFlag();
    initSheet();
    decorateAttachments();

    // Compose (§4.1), search (§4.3) and Settings (§4.4) — each no-ops where its
    // markup is absent.
    initCompose();
    initSearch();
    initSettings();
    initContacts();

    initDensity();
    initPrint();

    // §9. Last of the document-level key listeners, so Ctrl+P above and the
    // Escape handlers registered with the popover primitive are already bound —
    // the single-key table declines anything carrying a modifier, so the order
    // is a reading convenience rather than a dependency.
    initShortcuts();
    initNewMail();

    // Plugin screens (§1.6, §12 step 11) — each no-ops where its plugin is not
    // installed or its markup is absent.
    decorateTaskButtons();
    initBounce();
    initDialogs();
    initEnigma();

    if (rcmail.message_list) {
      // Compact density needs the checkbox column (§3.5). The widget can add it
      // to rows that already exist but has no way to take it away again, so it
      // goes on once here and comfortable hides it in CSS.
      rcmail.message_list.enable_checkbox_selection();

      initSelectAll();
      initSort();
      initPane();
      initQuickActions();
      initTabs();
      initReadingEmpty();
      patchRowNavigation(rcmail.message_list);
      // The widget's own selection event, so this stays correct however the
      // selection changed — click, shift-click, keyboard or select-all.
      rcmail.message_list.addEventListener('select', syncSelection);
      decoratePluginButtons();
    }
  }

  // Rows arrive in bursts; regroup once when a burst ends rather than per row.
  var regroupTimer = null;

  function onInsertRow(event) {
    // The contact list publishes this same event (app.js:485), with cid where
    // the message list sends uid. Nothing below it applies there — no threads, no
    // date groups, no pinning.
    if (event.cid !== undefined) {
      decorateContactRow(event);
      return;
    }

    decorateRow(event);

    if (regroupTimer) window.clearTimeout(regroupTimer);
    regroupTimer = window.setTimeout(function () {
      regroupTimer = null;
      // Pinned rows move first, so the date headings are placed over the final
      // order rather than one that is about to change under them.
      sortPinnedToTop();
      renderDateGroups();
      syncSelection();
    }, 0);
  }

  /**
   * Declare the message list a listbox before the widget is built.
   *
   * rcube_list_widget.init() reads role="listbox" off the element (list.js:106)
   * and, when it finds it, takes over role="option", aria-labelledby and the
   * roving tabindex for every row. The attribute cannot come from the template:
   * the messages object renders through html_table, whose whitelist (html.php:737)
   * keeps only id, class, style, width, summary, the cellpadding/cellspacing/border
   * trio, and any aria- or data- prefixed attribute. Everything else is dropped.
   *
   * This runs at file scope on purpose. ui.js is a classic script at the end of
   * <body>, so it executes while the document is still parsing — after the table
   * exists, but before jQuery's ready handler calls rcmail.init(). Registering it
   * on the 'init' event would be too late; the widget is already initialised by
   * the time that fires.
   */
  (function declareListbox() {
    var table = document.getElementById('messagelist');

    if (table && !table.getAttribute('role')) {
      table.setAttribute('role', 'listbox');
      table.setAttribute('aria-multiselectable', 'true');
    }

    // The Settings and Contacts lists are the same widget over the same
    // html_table, so they need the same treatment — and for the same reason,
    // since none of them can carry role= through the whitelist either.
    ['sections-table', 'identities-table', 'responses-table',
     'filterslist', 'filtersetslist'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.getAttribute('role')) el.setAttribute('role', 'listbox');
    });

    // Contacts is the one that is multi-selectable, like the message list.
    var contacts = document.getElementById('contacts-table');
    if (contacts && !contacts.getAttribute('role')) {
      contacts.setAttribute('role', 'listbox');
      contacts.setAttribute('aria-multiselectable', 'true');
    }
  })();

  // Hook into Roundcube properly; never re-render the list ourselves (§7).
  if (window.rcmail) {
    rcmail.addEventListener('init', init);
    rcmail.addEventListener('message', decorateNotice);
    rcmail.addEventListener('setquota', updateQuota);
    // Both of these can hand back a rebuilt folder tree, which arrives without
    // the icons, the wrapped labels or the stars — and with rows the Favorites
    // clones were copied from now replaced. All three passes have to follow it.
    rcmail.addEventListener('responseafterlist', refreshFolders);
    rcmail.addEventListener('responseaftergetunread', refreshFolders);
    rcmail.addEventListener('insertrow', onInsertRow);
    rcmail.addEventListener('listupdate', onListUpdate);
    rcmail.addEventListener('plugin.businessclass_pinned', onPinned);
    // Both the placeholder row an upload starts with and the real row that
    // replaces it come through here (app.js add2attachment_list).
    rcmail.addEventListener('fileappended', function (props) {
      if (props && props.item && props.item.length) decorateAttachmentRow(props.item[0]);
    });
  } else if (document.readyState === 'loading') {
    // Login and other pages that do not boot rcube_webmail. init() is never
    // called here, so anything these pages need has to be named explicitly —
    // and an error page carries the login logo, which on a dark surface is the
    // reversed one (D-67).
    document.addEventListener('DOMContentLoaded', function () {
      decorateIconButtons(document);
      initBrandArt();
    });
  } else {
    decorateIconButtons(document);
    initBrandArt();
  }
})(window, document);
