<?php

/**
 * Strings for the BusinessClass support plugin.
 *
 * These belong to the plugin rather than to skins/businessclass/localization, because
 * $this->gettext() inside a plugin resolves against the plugin's own texts.
 * add_texts('localization', true) also pushes them to the browser, so ui.js can
 * read them with rcmail.get_label('businessclass_prefs.<key>').
 */

$labels = [];

// Pin (§7.5)
$labels['bc_pin'] = 'Pin';
$labels['bc_unpin'] = 'Unpin';
$labels['bc_pinned'] = 'Pinned';
$labels['bc_pinfailed'] = 'Nothing was selected to pin.';
$labels['bc_pinunsupported'] = 'This mail server does not allow custom message tags, so pinning is unavailable.';

// Appearance block, Settings > Preferences > User Interface (§4.4)
$labels['bc_appearance'] = 'Appearance';
$labels['bc_theme'] = 'Theme';
$labels['bc_themelight'] = 'Light';
$labels['bc_themedark'] = 'Dark';
$labels['bc_themesystem'] = 'Match system';
$labels['bc_themehc'] = 'High contrast';
$labels['bc_density'] = 'Message list density';
$labels['bc_densitycomfortable'] = 'Comfortable';
$labels['bc_densitycompact'] = 'Compact';
$labels['bc_readingpane'] = 'Reading pane';
$labels['bc_paneright'] = 'Right';
$labels['bc_panebottom'] = 'Bottom';
$labels['bc_paneoff'] = 'Off';
$labels['bc_focused'] = 'Sort mail into Focused and Other';

// The hint names the key that documents the rest, because a switch labelled only
// "keyboard shortcuts" tells someone the feature exists and not one thing they
// can press.
$labels['bc_shortcuts'] = 'Single-key shortcuts';
$labels['bc_shortcutshint'] = 'Press ? for the full list. Typing in a text box is never affected.';
// Worded as what it does rather than as "show avatars", because the initials are
// avatars too and stay either way. What this switch governs is whether anything
// is asked of the internet to replace them.
$labels['bc_avatars'] = 'Look up sender pictures online';

// Identity photo (§7.10). These are the plugin's because the action that writes
// the photo is the plugin's, and $this->gettext() there resolves against these.
$labels['bc_photosaved'] = 'Photo saved.';
$labels['bc_photoremoved'] = 'Photo removed.';
$labels['bc_photonoidentity'] = 'That identity no longer exists.';
$labels['bc_photonocontact'] = 'There is no contact with this address to take a photo from.';
$labels['bc_photonobook'] = 'No address book here can be written to, so the photo cannot be stored.';
