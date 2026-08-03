<?php

/**
 * Strings introduced by the BusinessClass skin that have no equivalent in
 * Roundcube core. Loaded because meta.json sets "localization": true
 * (rcmail_output_html::load_skin -> rcube::read_localization).
 *
 * Keys are prefixed bc_ so they can never collide with a core or plugin label.
 */

$labels = [];

// About (§4.4). Its own key so a translator can put the attribution the right
// way round for the language: "BusinessClass by JetHost.com".
$labels['bc_by'] = 'by';

// Folder pane (§3.4) / categories (§8)
$labels['bc_labels'] = 'Labels';
$labels['bc_favorites'] = 'Favorites';

// The ribbon (D-75)
$labels['bc_ribbontabs'] = 'Ribbon';
$labels['bc_tabhome'] = 'Home';
// Not core's 'newmessage' ("Compose"): the ribbon's primary button is worded
// the way Outlook words it, and core's label is used elsewhere unchanged.
$labels['bc_newemail'] = 'New Email';
$labels['bc_tabview'] = 'View';
$labels['bc_tabhelp'] = 'Help';
$labels['bc_togglefolders'] = 'Toggle the folder pane';
$labels['bc_togglebooks'] = 'Toggle the address book pane';
$labels['bc_togglesections'] = 'Toggle the sections pane';

// View tab (D-76)
$labels['bc_viewsettings'] = 'View settings';
$labels['bc_vmessages'] = 'Messages';
$labels['bc_vconversations'] = 'Conversations';
$labels['bc_vgrouped'] = 'Group messages by conversation';
$labels['bc_vungrouped'] = 'Do not group messages';
$labels['bc_vpreview'] = 'Message preview';
$labels['bc_voff'] = 'Off';
$labels['bc_v1line'] = '1 line';
$labels['bc_v2lines'] = '2 lines';
$labels['bc_vexpand'] = 'Expand conversation';
$labels['bc_folderpane'] = 'Folder pane';
$labels['bc_vshow'] = 'Show';
$labels['bc_vhide'] = 'Hide';
$labels['bc_addfavorite'] = 'Add to Favorites';
$labels['bc_removefavorite'] = 'Remove from Favorites';

// App header (§3.2)
$labels['bc_appmenu'] = 'App menu';
$labels['bc_support'] = 'Help';
// Appended to the vendor name for the rail logo's link, so a screen reader
// announces "JetHost.com website" and not just the company name.
$labels['bc_website'] = 'website';
$labels['bc_account'] = 'Account';

// Panes (§3.1) — accessible names for the draggable dividers
$labels['bc_resizefolders'] = 'Resize folder pane';
$labels['bc_resizelist'] = 'Resize message list';

// Message list date groups (§3.5). Core supplies 'today'; the rest are new.
$labels['bc_yesterday'] = 'Yesterday';
$labels['bc_thisweek'] = 'This week';
$labels['bc_lastweek'] = 'Last week';
$labels['bc_thismonth'] = 'This month';
$labels['bc_older'] = 'Older';

// Message list toolbar (§3.5)
$labels['bc_selectnone'] = 'Clear selection';
$labels['bc_quickactions'] = 'Message actions';
$labels['bc_thread'] = 'Messages in conversation';

// Density (§3.5). Core has no equivalent — its list options offer layout only.
$labels['bc_density'] = 'Row density';
$labels['bc_comfortable'] = 'Comfortable';
$labels['bc_compact'] = 'Compact';

// Reading pane (§3.5). Core's layout labels describe the whole three-column
// arrangement; these name it the way the toolbar control does.
$labels['bc_readingpane'] = 'Reading pane';
$labels['bc_paneright'] = 'Right';
$labels['bc_panebottom'] = 'Bottom';
$labels['bc_paneoff'] = 'Off';

// Sort split-button (§3.5)
$labels['bc_sortascending'] = 'Ascending';
$labels['bc_sortdescending'] = 'Descending';
$labels['bc_sortoptions'] = 'Sort options';

// Focused / Other (§7.4)
$labels['bc_focused'] = 'Focused';
$labels['bc_other'] = 'Other';
$labels['bc_focusedtabs'] = 'Inbox scope';

// Hover quick actions (§3.5, §7.5)
$labels['bc_quickarchive'] = 'Archive';
$labels['bc_quickdelete'] = 'Delete';
$labels['bc_quickflag'] = 'Flag';
$labels['bc_quickunflag'] = 'Remove flag';
$labels['bc_quickpin'] = 'Pin';
$labels['bc_quickunpin'] = 'Unpin';

// Threading (§3.5)
$labels['bc_expandthread'] = 'Expand conversation';
$labels['bc_collapsethread'] = 'Collapse conversation';

// Compose (§4.1). Core has no string for any of these: it never draws a
// recipient pill, a drop target, an emoji button or a draft timestamp.
$labels['bc_addrecipients'] = 'Add recipients…';
$labels['bc_removerecipient'] = 'Remove recipient';
$labels['bc_dropfiles'] = 'Drop files to attach';
$labels['bc_emoji'] = 'Emoji';
// $time is substituted client-side, the way core's own $-placeholders are.
$labels['bc_draftsaved'] = 'Draft saved $time';
$labels['bc_discardconfirm'] = 'Discard this message and delete the saved draft?';

// Login (§4.2). Core has no password reveal, and no reset flow to link to.
$labels['bc_showpassword'] = 'Show password';
$labels['bc_hidepassword'] = 'Hide password';
$labels['bc_forgotpassword'] = 'Forgot password?';

// Search + refine (§4.3). Core names its scopes and filters, but has no word
// for the token chips or the results summary.
$labels['bc_filters'] = 'Filters';
$labels['bc_refine'] = 'Refine';
$labels['bc_onlyshow'] = 'Only show';
$labels['bc_removefilter'] = 'Remove filter';
// $count and $scope are substituted client-side, as core's own labels do.
$labels['bc_resultsin'] = '$count results in $scope';
$labels['bc_searchfrom'] = 'From';
$labels['bc_searchto'] = 'To';
$labels['bc_searchcc'] = 'Cc';
$labels['bc_searchbcc'] = 'Bcc';
$labels['bc_searchsubject'] = 'Subject';
$labels['bc_searchbody'] = 'Body';
$labels['bc_searchhas'] = 'Has';
$labels['bc_searchis'] = 'Is';

// Empty states (§12 step 8). Core's 'nomessagesfound' and 'listempty' are one
// flat sentence each; these are the title plus the line of guidance under it.
$labels['bc_nomessages'] = 'Nothing here';
$labels['bc_noresults'] = 'No matches';
$labels['bc_noresultstext'] = 'Try different words, or widen the scope in Filters.';
$labels['bc_nomessageselected'] = 'No message selected';
$labels['bc_pickmessage'] = 'Choose a message from the list to read it here.';

// Settings (§4.4). Every screen title, section name and form label already
// exists in core or in the plugin that owns the screen; these are the strings
// the design adds — the empty states in the detail pane, and the affordances
// that have no core equivalent.
$labels['bc_nosectionselected'] = 'No section selected';
$labels['bc_picksection'] = 'Choose a settings section to see its options.';
$labels['bc_nofolderselected'] = 'No folder selected';
$labels['bc_pickfolder'] = 'Choose a folder to rename, move or empty it.';
$labels['bc_noidentityselected'] = 'No identity selected';
$labels['bc_pickidentity'] = 'Choose an identity to edit the name, address and signature you send with.';
$labels['bc_noresponseselected'] = 'No response selected';
$labels['bc_pickresponse'] = 'Choose a canned response to edit its text.';
$labels['bc_nofilterselected'] = 'No filter selected';
$labels['bc_pickfilter'] = 'Choose a filter to edit its conditions and actions.';
// Cancel on the settings forms is a native form reset, so the announcement has
// to say what happened — nothing else on screen changes to show it.
$labels['bc_changesdiscarded'] = 'Changes discarded';
// The folder manager's drag handle and the per-filter switch, neither of which
// core gives a name to.
$labels['bc_dragfolder'] = 'Drag to move this folder';
$labels['bc_subscribed'] = 'Subscribed';
$labels['bc_filterenabled'] = 'Filter is on';
$labels['bc_filterdisabled'] = 'Filter is off';

// Contacts (§4.5). Core has 'addressbook' but only in the singular, and no name
// for the section over several of them; the rest are the pane's empty states.
$labels['bc_addressbooks'] = 'Address books';
$labels['bc_nocontactselected'] = 'No contact selected';
$labels['bc_pickcontact'] = 'Choose a contact to see their details.';
$labels['bc_nocontacts'] = 'No contacts yet';

// Identity photo (§7.10). Roundcube has 'contactphoto' for the picture on a
// contact, but nothing for one attached to an identity — which is what this is,
// stored on the matching contact because identities have no photo of their own.
$labels['bc_photo'] = 'Photo';
$labels['bc_photoupload'] = 'Upload photo';
$labels['bc_photoremove'] = 'Remove photo';
$labels['bc_photohint'] = 'Shown next to your name in webmail. Saved to your own contact, so it is not sent with your messages.';
$labels['bc_photoaftersave'] = 'Save this identity first, then a photo can be added to it.';
$labels['bc_photouploading'] = 'Saving photo…';
$labels['bc_photoinvalid'] = 'That file is not an image webmail can use.';
$labels['bc_photoconfirmremove'] = 'Remove the photo from this identity?';

// Plugin screens (§12 step 11). Only the enigma keys pane needs strings of its
// own: everything else on those screens is named by core or by the plugin's own
// localization. Roundcube has no "no key selected" of either kind.
$labels['bc_nokeyselected'] = 'No key selected';
$labels['bc_pickkey'] = 'Choose a key to see its details.';

// The message-body sheet toggle in the reading pane (§12 step 12, D-68). Two
// keys because the button names the ACTION it will perform, not the state it is
// in — a toggle titled with its current state is the classic ambiguity.
$labels['bc_sheetlight'] = 'Show this message on a light background';
$labels['bc_sheetdark'] = 'Show this message on the dark background';
