<?php

/**
 * BusinessClass skin support plugin.
 *
 * Two jobs, both of which the skin cannot do on its own:
 *
 *  1. Whitelist the skin's user preferences. program/actions/utils/save_pref.php
 *     rejects any pref not in its hardcoded list or in
 *     $rcmail->plugins->allowed_prefs, logging "Hack attempt detected". Without
 *     this, every rcmail.save_pref() call from ui.js fails.
 *
 *  2. Read skins/businessclass/branding.json and expose it to the templates. Skin
 *     templates are HTML with a fixed tag set (object/var/env/config/if/exp) —
 *     they cannot open a file or parse JSON. The accent hex is validated here
 *     before it is echoed into an inline style by includes/header.html.
 *
 * No core files are modified (BUILD.md §1.1); plugins/businessclass_* is permitted.
 *
 * @license GPL-3.0
 */
class businessclass_prefs extends rcube_plugin
{
    /** Runs on every task — the login screen needs branding too. */
    public $task = '.*';

    /**
     * Preferences the skin persists via rcmail.save_pref().
     * Merged into the save_pref whitelist by rcube_plugin_api::load_plugin().
     */
    public $allowed_prefs = [
        'businessclass_theme',        // light | dark | system | hc
        'businessclass_density',      // comfortable | compact
        'businessclass_focused',      // Focused/Other tabs on/off
        'businessclass_folders_w',    // folder pane width, px
        'businessclass_list_w',       // message list width, px
        'businessclass_list_h',       // message list height, px — 'desktop' layout only
    ];

    /** Defaults applied when a pref or branding key is absent. */
    private const DEFAULTS = [
        'theme' => 'system',
        'density' => 'comfortable',
        'accent' => '#0F6CBD',
        'product_name' => 'BusinessClass',
        'vendor' => 'JetHost.com',
        'folders_w' => 236,
        'list_w' => 400,
        'list_h' => 280,
    ];

    /** Clamp ranges for the resizable panes (BUILD.md §3.1 / _tokens.scss). */
    private const FOLDERS_W_MIN = 200;
    private const FOLDERS_W_MAX = 360;
    private const LIST_W_MIN = 320;
    private const LIST_W_MAX = 520;

    /** The list's height, used only where the reading pane sits below it. */
    private const LIST_H_MIN = 200;
    private const LIST_H_MAX = 640;

    /** IMAP keyword behind the Pin action (BUILD.md §7.5). */
    private const PIN_FLAG = '$PINNED';

    /**
     * Where an avatar photo is looked for, in order (§7.10).
     *
     * Gravatar is asked only after every address book has come back empty, and
     * only where the admin leaves $config['businessclass_gravatar'] on. It is an
     * outbound request that carries a hash of the address and the user's IP to a
     * third party, so it is a documented choice rather than a silent default.
     */
    private const GRAVATAR_BASE = 'https://www.gravatar.com/avatar/';

    /** Image formats accepted for an identity photo, matching core's own list. */
    private const PHOTO_TYPES = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp'];

    public function init()
    {
        $this->add_texts('localization', true);
        $this->add_hook('startup', [$this, 'startup']);
        $this->add_hook('messages_list', [$this, 'messages_list']);
        $this->add_hook('html_editor', [$this, 'html_editor']);
        $this->add_hook('preferences_list', [$this, 'preferences_list']);
        $this->add_hook('preferences_save', [$this, 'preferences_save']);
        $this->add_hook('contact_photo', [$this, 'contact_photo']);
        $this->add_hook('identity_update', [$this, 'identity_update']);
        $this->add_hook('identity_create_after', [$this, 'identity_created']);
        $this->register_action('plugin.businessclass.pin', [$this, 'pin']);
        $this->register_action('plugin.businessclass.identityphoto', [$this, 'identity_photo']);
    }

    /**
     * Gravatar as the last resort for an avatar (§7.10).
     *
     * Fires from two places in core, and both are wanted: the contacts/photo
     * action, which the skin's avatars point an <img> at, and the contactphoto
     * template object on the contact detail page. Either way core takes the URL
     * returned here — the action by redirecting to it, the template object by
     * putting it in the src.
     *
     * Only when nothing local was found. d=404 rather than one of Gravatar's
     * generated fallbacks, because the skin already draws initials underneath and
     * a 404 is what lets the <img> fail and leave them showing.
     */
    public function contact_photo($args)
    {
        $rcmail = rcmail::get_instance();

        if (!empty($args['data']) || !empty($args['url'])) {
            return $args;
        }

        if (
            $rcmail->config->get('skin') !== 'businessclass'
            || !$rcmail->config->get('businessclass_gravatar', true)
        ) {
            return $args;
        }

        // The action passes the address it was asked about; the template object
        // passes the record instead, so take the first address off that.
        $email = $args['email'] ?? null;

        if (!$email && !empty($args['record'])) {
            $emails = rcube_addressbook::get_col_values('email', $args['record'], true);
            $email = $emails[0] ?? null;
        }

        if (!is_string($email) || !strlen($email) || !strpos($email, '@')) {
            return $args;
        }

        $args['url'] = $this->gravatar_url($email);

        return $args;
    }

    /**
     * Store an uploaded photo for one identity (§7.10).
     *
     * Roundcube's identities table has no photo column and this plugin does not
     * touch the schema, so the picture goes where Roundcube already keeps
     * pictures: the photo column of the contact whose address matches the
     * identity. That is also what makes it show up everywhere else on its own —
     * the sender avatar, the contact card, an exported vCard — because every one
     * of those already reads the address book.
     *
     * The identity is read from the database rather than from the form, so the
     * photo can only ever be attached to the address that identity actually has.
     */
    public function identity_photo()
    {
        $rcmail = rcmail::get_instance();

        $iid = rcube_utils::get_input_string('_iid', rcube_utils::INPUT_POST);
        $identity = strlen($iid) ? $rcmail->user->get_identity($iid) : null;

        if (!is_array($identity) || empty($identity['email'])) {
            return $this->photo_result(false, $this->gettext('bc_photonoidentity'));
        }

        $email = $identity['email'];

        if (rcube_utils::get_input_string('_delete', rcube_utils::INPUT_POST) === '1') {
            $found = $this->identity_contact($email, false);

            if (!$found) {
                return $this->photo_result(false, $this->gettext('bc_photonocontact'));
            }

            [$abook, $record] = $found;
            $abook->update($record['ID'], ['photo' => '']);

            return $this->photo_result(true, $this->gettext('bc_photoremoved'), $email);
        }

        $data = $this->photo_upload($rcmail);

        if (!is_string($data)) {
            return $this->photo_result(false, $data ?: $rcmail->gettext('fileuploaderror'));
        }

        $found = $this->identity_contact($email, true, (string) ($identity['name'] ?? ''));

        if (!$found) {
            return $this->photo_result(false, $this->gettext('bc_photonobook'));
        }

        [$abook, $record] = $found;

        if (!$abook->update($record['ID'], ['photo' => $data])) {
            return $this->photo_result(false, $rcmail->gettext('errorsaving'));
        }

        return $this->photo_result(true, $this->gettext('bc_photosaved'), $email);
    }

    /**
     * Keep the photo with the identity when its address changes (§7.10).
     *
     * The picture lives on the contact whose address matches the identity, so an
     * identity that moves to a new address would otherwise leave its face behind
     * on the old one — the account circle and the sender avatar both look the
     * *new* address up and find nothing.
     *
     * This hook is the only moment both addresses are knowable: it fires before
     * core writes the identity (identity_save.php:124), so the new address is in
     * the posted record while the old one is still in the database.
     *
     * At identities_level 1 and 3 the address field is disabled and core merges
     * the stored identity back over the post, so the two addresses come out equal
     * and nothing happens — which is correct, there was no change to follow.
     */
    public function identity_update($args)
    {
        $rcmail = rcmail::get_instance();
        $new = isset($args['record']['email']) ? (string) $args['record']['email'] : '';

        if (!strlen($new)) {
            return $args;
        }

        // Normalised the way core normalises it four lines after this hook
        // (identity_save.php:128), or an internationalised address would never
        // match the ASCII form already stored.
        $new = (string) rcube_utils::idn_to_ascii($new);

        $identity = $rcmail->user->get_identity($args['id']);
        $old = is_array($identity) ? (string) ($identity['email'] ?? '') : '';
        $name = (string) ($args['record']['name'] ?? ($identity['name'] ?? ''));

        // Core hands the editor straight back after a save through
        // overwrite_action(), which is long past 'startup' — so the env the photo
        // well needs is set here, for the address the identity is about to have.
        // If the write below then fails, core re-renders the form with the posted
        // values anyway, so pointing at the posted address is still the honest
        // answer.
        $this->identity_photo_env($new, $name);

        // A photo fetched by address is cached for a day (contacts/photo.php's
        // future_expire_header), and that includes the 204 that stood in for one
        // before the move — so the well has to ask again with a fresh query string
        // or the browser answers from a cache that predates the move.
        if (strlen($old) && strcasecmp($old, $new) !== 0 && $this->move_photo($old, $new, $name)) {
            $output = $rcmail->output;
            $output->set_env('bc_idphoto_bust', (string) time());
        }

        return $args;
    }

    /**
     * A brand-new identity can take a photo straight away (§7.10).
     *
     * There is nothing to move here — the point is the env. Core sets _iid to the
     * new row and re-renders the editor (identity_save.php:182 and :210), and this
     * hook fires before that, so the well is on the form the user is handed back
     * rather than only after they navigate to the identity again.
     */
    public function identity_created($args)
    {
        if (!empty($args['record']['email'])) {
            $this->identity_photo_env(
                (string) rcube_utils::idn_to_ascii($args['record']['email']),
                (string) ($args['record']['name'] ?? '')
            );
        }

        return $args;
    }

    /**
     * Carry a photo from one address's contact to another's.
     *
     * Deliberately conservative, because this rides along with saving an identity
     * and that save is the thing the user asked for:
     *
     * - nothing is moved unless the old address actually has a picture;
     * - a picture already on the new address wins, being the more recent choice
     *   for that address;
     * - one card carrying both addresses is left alone — it already answers a
     *   lookup by either, so there is nothing to move and clearing it would lose
     *   the photo outright;
     * - the old photo is cleared only once the new one is written.
     *
     * Every failure is silent. There is no sensible way to interrupt a successful
     * identity save to report that a picture could not follow it, and the picture
     * is still where it was.
     *
     * @return bool Whether a photo was actually written to the new address
     */
    private function move_photo($from, $to, $name = '')
    {
        $source = $this->identity_contact($from, false);

        if (!$source) {
            return false;
        }

        [$from_abook, $from_record] = $source;

        // Re-read the whole card: the search above asks for the address columns,
        // and get_record() is what core itself uses when it wants the photo
        // (contacts/photo.php:71).
        $full = $from_abook->get_record($from_record['ID'], true);

        if (!is_array($full)) {
            return false;
        }

        $photo = $full['photo'] ?? null;
        $photo = is_array($photo) ? ($photo[0] ?? null) : $photo;

        if (!is_string($photo) || !strlen($photo)) {
            return false;
        }

        foreach (rcube_addressbook::get_col_values('email', $full, true) as $address) {
            if (strcasecmp(trim((string) $address), $to) === 0) {
                return false;
            }
        }

        $target = $this->identity_contact($to, true, $name);

        if (!$target) {
            return false;
        }

        [$to_abook, $to_record] = $target;
        $existing = $to_abook->get_record($to_record['ID'], true);

        if (is_array($existing) && !empty($existing['photo'])) {
            return false;
        }

        // Written back byte for byte rather than decoded and re-encoded: backends
        // differ on whether this column holds raw bytes or base64, and core's
        // reader copes with either (contacts/photo.php:77), so the safest thing to
        // hand a backend is exactly what came out of one.
        if (!$to_abook->update($to_record['ID'], ['photo' => $photo])) {
            return false;
        }

        $from_abook->update($from_record['ID'], ['photo' => '']);

        return true;
    }

    /** Point the photo well at one address. */
    private function identity_photo_env($email, $name = '')
    {
        $output = rcmail::get_instance()->output;

        $output->set_env('bc_idphoto', (string) $email);
        $output->set_env('bc_idphoto_name', (string) $name);
    }

    /**
     * Validate and scale the posted file, returning its raw bytes.
     *
     * Same shape as core's contacts/upload_photo: rcube_image reads the real
     * format rather than trusting the name or the browser's content type, and
     * anything over contact_photo_size is scaled down before it is stored.
     *
     * @return string|null Image data, or null with the error already worded
     */
    private function photo_upload($rcmail)
    {
        $file = $_FILES['_photo'] ?? null;

        if (empty($file['tmp_name']) || !is_uploaded_file($file['tmp_name'])) {
            return null;
        }

        $image = new rcube_image($file['tmp_name']);
        $props = $image->props();

        if (
            empty($props['type'])
            || !in_array(strtolower($props['type']), self::PHOTO_TYPES, true)
            || empty($props['width'])
            || empty($props['height'])
        ) {
            return null;
        }

        $path = $file['tmp_name'];
        $max = (int) $rcmail->config->get('contact_photo_size', 160);

        if ($max > 0 && ($props['width'] > $max || $props['height'] > $max)) {
            $scaled = rcube_utils::temp_filename('bcphoto');

            if ($image->resize($max, $scaled)) {
                $path = $scaled;
            }
        }

        $data = @file_get_contents($path);

        // Stored as raw bytes, which is the format the addressbook backends and
        // core's own save action both use for this column.
        return is_string($data) && strlen($data) ? $data : null;
    }

    /**
     * The contact an identity's photo belongs on.
     *
     * Every writeable source is searched, so a photo already sitting on the
     * user's own card in a shared or CardDAV book is updated where it is rather
     * than duplicated into the personal one. Only when nothing matches, and only
     * when asked, is a contact created — in whichever book Roundcube considers
     * the default target for new ones.
     *
     * @return array|null [rcube_addressbook, record] or null
     */
    private function identity_contact($email, $create, $name = '')
    {
        $rcmail = rcmail::get_instance();

        // Writeable sources only. A card in a read-only directory — an LDAP
        // company address book, say — cannot take a photo, so there is nothing to
        // gain by matching it; that case falls through and a personal card is
        // created instead, which is the only place the picture can actually live.
        foreach ($rcmail->get_address_sources() as $source) {
            $abook = $rcmail->get_address_book($source['id']);

            if (!$abook || $abook->readonly) {
                continue;
            }

            $abook->set_page(1);
            $abook->set_pagesize(1);

            $result = $abook->search(['email'], $email, rcube_addressbook::SEARCH_STRICT, true, true, 'email');
            $record = $result ? $result->first() : null;

            if (!empty($record['ID'])) {
                return [$abook, $record];
            }
        }

        if (!$create) {
            return null;
        }

        $abook = $rcmail->get_address_book(rcube_addressbook::TYPE_DEFAULT, true);

        if (!$abook || $abook->readonly) {
            return null;
        }

        $insert = ['email' => $email];

        if (strlen($name)) {
            $insert['name'] = $name;
        }

        $id = $abook->insert($insert, false);

        return $id ? [$abook, ['ID' => $id, 'email' => $email]] : null;
    }

    /**
     * Answer the photo upload.
     *
     * A plugin. command so the client takes it as an event rather than a method
     * call on rcmail (rcmail_output_json::command). The address comes back with
     * it because the browser has to cache-bust the <img>: core sets a one-day
     * expiry on a photo fetched by address, so without a fresh query string the
     * old picture — or the 204 that stood in for it — would be reused.
     */
    private function photo_result($ok, $message, $email = null)
    {
        $rcmail = rcmail::get_instance();

        $rcmail->output->command('plugin.businessclass_identityphoto', [
            'success' => (bool) $ok,
            'message' => $message,
            'email'   => $email,
        ]);

        $rcmail->output->command('display_message', $message, $ok ? 'confirmation' : 'error');
        $rcmail->output->send();
    }

    /** Gravatar keys on the SHA-256 of the trimmed, lowercased address. */
    private function gravatar_url($email)
    {
        $size = (int) rcmail::get_instance()->config->get('contact_photo_size', 160);

        return self::GRAVATAR_BASE . hash('sha256', strtolower(trim($email)))
            . '?d=404&s=' . max(16, $size);
    }

    /**
     * The "Appearance" block in Settings > Preferences > User Interface (§4.4).
     *
     * Four settings, three of them the skin's own; the fourth, the reading-pane
     * position, is core's 'layout' pref. Core also offers that one under Mailbox
     * View, and both controls read the same stored value, so they always agree
     * on load — whichever screen you save last is simply the one that wrote it.
     *
     * Rendered only under the businessclass skin: with another skin selected these
     * preferences control nothing, and offering them would be a lie.
     *
     * The hook fires once per section, and only for the section actually being
     * rendered — core's `continue 2` in the section loop skips it entirely while
     * it is just deciding which sections are non-empty.
     */
    public function preferences_list($args)
    {
        $rcmail = rcmail::get_instance();

        if ($args['section'] !== 'general' || $rcmail->config->get('skin') !== 'businessclass') {
            return $args;
        }

        $no_override = array_flip((array) $rcmail->config->get('dont_override'));
        $block = ['name' => rcube::Q($this->gettext('bc_appearance')), 'options' => []];

        if (!isset($no_override['businessclass_theme'])) {
            $block['options']['businessclass_theme'] = $this->pref_select(
                'businessclass_theme', 'bc_theme', [
                    'light' => 'bc_themelight',
                    'dark' => 'bc_themedark',
                    'system' => 'bc_themesystem',
                    'hc' => 'bc_themehc',
                ],
                $this->sanitize_theme($rcmail->config->get('businessclass_theme'))
            );
        }

        if (!isset($no_override['businessclass_density'])) {
            $block['options']['businessclass_density'] = $this->pref_select(
                'businessclass_density', 'bc_density', [
                    'comfortable' => 'bc_densitycomfortable',
                    'compact' => 'bc_densitycompact',
                ],
                $this->sanitize_density($rcmail->config->get('businessclass_density'))
            );
        }

        // Only the layouts this skin declares in meta.json, the same set core
        // filters its own Layout select against.
        $layouts = array_intersect_key(
            ['widescreen' => 'bc_paneright', 'desktop' => 'bc_panebottom', 'list' => 'bc_paneoff'],
            array_flip((array) $rcmail->config->get('supported_layouts', ['widescreen']))
        );

        if (!isset($no_override['layout']) && count($layouts) > 1) {
            $block['options']['layout'] = $this->pref_select(
                'layout', 'bc_readingpane', $layouts,
                $rcmail->config->get('layout') ?: 'widescreen'
            );
        }

        if (!isset($no_override['businessclass_focused'])) {
            $field_id = 'rcmfd_businessclass_focused';
            $checkbox = new html_checkbox(['name' => '_businessclass_focused', 'id' => $field_id, 'value' => 1]);

            $block['options']['businessclass_focused'] = [
                'title' => html::label($field_id, rcube::Q($this->gettext('bc_focused'))),
                'content' => $checkbox->show($rcmail->config->get('businessclass_focused') ? 1 : 0),
            ];
        }

        if (empty($block['options'])) {
            return $args;
        }

        // Straight after 'main', so Appearance reads as part of the interface
        // settings rather than trailing the advanced ones. Rebuilt key by key
        // because PHP arrays have no insert-at-position.
        $blocks = [];
        foreach ($args['blocks'] as $key => $value) {
            $blocks[$key] = $value;
            if ($key === 'main') {
                $blocks['businessclass_appearance'] = $block;
            }
        }

        if (!isset($blocks['businessclass_appearance'])) {
            $blocks['businessclass_appearance'] = $block;
        }

        $args['blocks'] = $blocks;

        return $args;
    }

    /** One labelled <select> in the shape prefs_edit expects. */
    private function pref_select($pref, $label, $options, $value)
    {
        $field_id = 'rcmfd_' . $pref;
        $select = new html_select(['name' => '_' . $pref, 'id' => $field_id, 'class' => 'custom-select']);

        foreach ($options as $key => $text) {
            $select->add($this->gettext($text), $key);
        }

        return [
            'title' => html::label($field_id, rcube::Q($this->gettext($label))),
            'content' => $select->show($value),
        ];
    }

    /**
     * Persist the Appearance block.
     *
     * Everything is re-validated here rather than trusted from the form: the
     * post is as forgeable as any other, and these values are echoed straight
     * into attributes on <html> by includes/header.html.
     *
     * A checkbox that is off is simply absent from the post, so 'focused' is
     * read as isset() rather than from a value.
     */
    public function preferences_save($args)
    {
        $rcmail = rcmail::get_instance();

        if ($args['section'] !== 'general' || $rcmail->config->get('skin') !== 'businessclass') {
            return $args;
        }

        // dont_override is checked here as well as when rendering: core applies
        // it after this hook, but only to keys it lists, and a value the admin
        // has frozen should never have been read from the post in the first
        // place.
        $no_override = array_flip((array) $rcmail->config->get('dont_override'));

        if (!isset($no_override['businessclass_theme'])) {
            $args['prefs']['businessclass_theme'] = $this->sanitize_theme(
                rcube_utils::get_input_string('_businessclass_theme', rcube_utils::INPUT_POST));
        }

        if (!isset($no_override['businessclass_density'])) {
            $args['prefs']['businessclass_density'] = $this->sanitize_density(
                rcube_utils::get_input_string('_businessclass_density', rcube_utils::INPUT_POST));
        }

        if (!isset($no_override['layout']) && isset($_POST['_layout'])) {
            $layout = rcube_utils::get_input_string('_layout', rcube_utils::INPUT_POST);

            if (in_array($layout, (array) $rcmail->config->get('supported_layouts', ['widescreen']), true)) {
                $args['prefs']['layout'] = $layout;
            }
        }

        // An unchecked checkbox is absent from the post, so this is read as
        // isset() rather than from a value.
        if (!isset($no_override['businessclass_focused'])) {
            $args['prefs']['businessclass_focused'] = isset($_POST['_businessclass_focused']);
        }

        // All four are rendered into the page server-side — the theme and
        // density as attributes on <html>, the layout and the Focused tabs as
        // markup — so a saved change is invisible until the page is built
        // again. Core does the same for the language and skin pickers.
        // Compared against the same sanitized reading of the stored value that
        // the form was rendered from, so a save that changes nothing does not
        // reload the page just because a pref had never been written before.
        $current = [
            'businessclass_theme' => $this->sanitize_theme($rcmail->config->get('businessclass_theme')),
            'businessclass_density' => $this->sanitize_density($rcmail->config->get('businessclass_density')),
            'businessclass_focused' => (bool) $rcmail->config->get('businessclass_focused', false),
            'layout' => $rcmail->config->get('layout') ?: 'widescreen',
        ];

        foreach ($current as $pref => $was) {
            if (array_key_exists($pref, $args['prefs']) && $args['prefs'][$pref] !== $was) {
                $rcmail->output->command('reload', 500);
                break;
            }
        }

        return $args;
    }

    /**
     * Add TinyMCE's emoticons plugin to the compose editor.
     *
     * BUILD.md §4.1 draws an emoji button in the compose footer. Roundcube
     * already ships that plugin and its emoji database, so this is the whole of
     * it — no new dependency (§14), and no custom TinyMCE build.
     *
     * extra_plugins only, never extra_buttons: the skin drives the dialog from
     * its own footer button, so a second copy in Tiny's toolbar would be
     * redundant. The identity and response editors ($mode 'identity' /
     * 'response') are the cut-down ones and are left alone.
     */
    public function html_editor($args)
    {
        $rcmail = rcmail::get_instance();

        if ($rcmail->config->get('skin') !== 'businessclass' || !empty($args['mode'])) {
            return $args;
        }

        $file = RCUBE_INSTALL_PATH . 'program/js/tinymce/plugins/emoticons/plugin.min.js';

        if (is_readable($file)) {
            $args['extra_plugins'][] = 'emoticons';
        }

        return $args;
    }

    /**
     * Set or clear the $Pinned keyword on the selected messages.
     *
     * Core's 'mark' command only knows the flags it has commands for — read,
     * unread, flagged, unflagged, delete, undelete — so a keyword of our own
     * needs an action of our own. set_flag() uppercases the name, which is
     * harmless: IMAP flag names are case-insensitive, so '$PINNED' and '$Pinned'
     * are the same keyword, and the round trip through fetch() strips the '$'
     * either way. Going through set_flag() rather than the connection directly
     * is what keeps the message cache in step.
     *
     * Servers that do not advertise \* in PERMANENTFLAGS reject arbitrary
     * keywords; modFlag() returns false and the client is told so.
     */
    public function pin()
    {
        $rcmail = rcmail::get_instance();

        $uids = rcube_utils::get_input_string('_uid', rcube_utils::INPUT_POST);
        $mbox = rcube_utils::get_input_string('_mbox', rcube_utils::INPUT_POST, true);
        $set  = rcube_utils::get_input_string('_set', rcube_utils::INPUT_POST) === '1';

        if (!strlen($uids)) {
            $rcmail->output->command('display_message', $this->gettext('bc_pinfailed'), 'error');
            $rcmail->output->send();
            return;
        }

        $storage = $rcmail->get_storage();
        $flag    = $set ? self::PIN_FLAG : 'UN' . self::PIN_FLAG;
        $done    = $storage->set_flag($uids, $flag, strlen($mbox) ? $mbox : null);

        if (!$done) {
            $rcmail->output->command('display_message', $this->gettext('bc_pinunsupported'), 'error');
        }
        else {
            // The plugin. prefix routes this through the response's callbacks
            // rather than its commands (rcmail_output_json::command), so the
            // client receives it as an event instead of a method call on rcmail.
            $rcmail->output->command('plugin.businessclass_pinned', [
                'uids' => explode(',', $uids),
                'set'  => $set,
            ]);
        }

        $rcmail->output->send();
    }

    /**
     * Give every message row its send timestamp.
     *
     * The date column reaches the browser already formatted by format_date() —
     * "09:14", "Mon", "24 Jul" depending on the user's date_short/date_today
     * config — so it cannot be turned back into a date. The message list's
     * "Today / Yesterday / Last week" group headers (BUILD.md §3.5) need the real
     * value, and this is the only place it is still available.
     *
     * extra_flags is the one key add_message_row() carries through to
     * rcmail.env.messages[uid].flags (app.js:2224). It is merged rather than
     * assigned, because businessclass_preview writes its snippet into the same array
     * and the two hooks may run in either order.
     */
    public function messages_list($args)
    {
        if (empty($args['messages']) || !is_array($args['messages'])) {
            return $args;
        }

        // Category keyword -> token, from branding.json. fetchHeaders() always
        // asks IMAP for FLAGS, so a message's keywords are already here at no
        // extra cost; they just are not among the keys add_message_row() copies
        // into env.messages, which is why they travel in extra_flags (§8).
        $categories = [];

        foreach ((array) ($this->load_branding('businessclass')['categories'] ?? []) as $category) {
            if (!empty($category['key']) && !empty($category['token'])) {
                // fetch() stores flags stripped of '$' and '\' and uppercased,
                // so '$Important' arrives as 'IMPORTANT'.
                $categories[strtoupper(ltrim((string) $category['key'], '$\\'))] = $category['token'];
            }
        }

        foreach ($args['messages'] as $header) {
            $extra = $header->list_flags['extra_flags'] ?? [];

            $ts = !empty($header->timestamp) ? $header->timestamp : ($header->internaldate ?? null);

            if ($ts) {
                $extra['ts'] = is_numeric($ts) ? (int) $ts : (int) rcube_utils::strtotime($ts);
            }

            $flags = array_change_key_case((array) $header->flags, CASE_UPPER);
            $tokens = [];

            foreach ($categories as $keyword => $token) {
                if (!empty($flags[$keyword])) {
                    $tokens[] = $token;
                }
            }

            if ($tokens) {
                $extra['cats'] = $tokens;
            }

            if (!empty($flags['PINNED'])) {
                $extra['pinned'] = 1;
            }

            if ($extra) {
                $header->list_flags['extra_flags'] = $extra;
            }
        }

        return $args;
    }

    /**
     * Publish branding + skin prefs into the template env.
     *
     * Must be 'startup', not 'render_page': render_page fires *after*
     * parse_xml() (rcmail_output_html.php:828), by which point every
     * <roundcube:var name="env:…"> in the template has already been resolved.
     * 'startup' runs at index.php:92 — output exists from line 46, and nothing
     * has been sent yet. It also covers the login screen and error pages.
     */
    public function startup($args)
    {
        $rcmail = rcmail::get_instance();
        $skin = $rcmail->config->get('skin');

        if ($skin !== 'businessclass') {
            return $args;
        }

        $branding = $this->load_branding($skin);
        $output = $rcmail->output;

        if ($rcmail->task === 'login') {
            $this->login_language($rcmail);
            $output->set_env('bc_languages', $rcmail->list_languages());
            $output->set_env('bc_mail_domain', $this->mail_domain($rcmail, $branding));
        }

        $output->set_env('bc_accent', $this->sanitize_accent($branding['accent'] ?? null));
        $output->set_env('bc_product_name', (string) ($branding['product_name'] ?? self::DEFAULTS['product_name']));
        // Who this build is attributed to on the About page: "BusinessClass by
        // JetHost.com" for the free distribution, "…by JetHost.BG" where the
        // Bulgarian preset is installed. Free text, so it is escaped on the way
        // out like any other branding string.
        $output->set_env('bc_vendor', (string) ($branding['vendor'] ?? self::DEFAULTS['vendor']));
        $output->set_env('bc_support_url', $this->sanitize_url($branding['support_url'] ?? null));
        $output->set_env('bc_login_background', $this->sanitize_asset($branding['login_background'] ?? null));
        $output->set_env('bc_categories', $branding['categories'] ?? []);

        $logo = is_array($branding['logo'] ?? null) ? $branding['logo'] : [];
        // Two ways to fill the header brand slot, and they are not interchangeable:
        //
        //   `header` is a full lockup and *replaces* the product name — the name is
        //           already drawn inside the artwork, so printing it again would
        //           double it.
        //   `symbol` is a mark and *accompanies* the product name, which stays as
        //           live text beside it.
        //
        // Separate entries rather than one plus a flag, because whether an asset
        // carries the name is a property of the asset, not a preference. `symbol`
        // wins where both are set; the template picks one branch of three.
        $output->set_env('bc_logo_header', $this->sanitize_asset($logo['header'] ?? null));
        $output->set_env('bc_logo_symbol', $this->sanitize_asset($logo['symbol'] ?? null));
        // The foot of the app rail, below logout. Optional and independent of the
        // header: an install can carry a mark up top and the full logo down there,
        // which is what the JetHost presets do.
        $output->set_env('bc_logo_rail', $this->sanitize_asset($logo['rail'] ?? null));
        // Where that logo goes when clicked — the vendor's own site. Absent, the
        // logo is a plain image and not a link at all.
        //
        // Through sanitize_url, the same gate as support_url, so it is http(s)
        // only. That is what keeps `javascript:` out of an href built from a file
        // an admin edits by hand.
        $output->set_env('bc_brand_url', $this->sanitize_url($branding['brand_url'] ?? null));
        $output->set_env('bc_logo_login', $this->sanitize_asset($logo['login'] ?? null));
        $output->set_env('bc_favicon', $this->sanitize_asset($logo['favicon'] ?? null));
        // The letterhead on the two print views. Its own entry rather than the
        // header logo reused: a letterhead is usually a different asset — often the
        // full name where the header carries a mark — and printing is the one place
        // an install may want no logo at all. Absent, the templates fall back to
        // core's own logo object and $config['skin_logo'], so an install that
        // configures logos the Roundcube way still gets one.
        $output->set_env('bc_logo_print', $this->sanitize_asset($logo['print'] ?? null));

        // The address the account circle in the app header looks a photo up by
        // (§7.10). Derived from the username rather than from an identity, so it
        // costs no query: get_user_email() reads the session.
        if ($rcmail->task !== 'login') {
            $output->set_env('bc_account_email', (string) $rcmail->get_user_email());
        }

        // The saved address of the identity being edited, which is what the photo
        // well on that screen writes to and reads back.
        //
        // Set here and not from the identity_form hook: the template tests it in a
        // <roundcube:if>, and conditions are resolved in an earlier pass than
        // template objects (parse_conditions() then parse_xml(),
        // rcmail_output_html.php:824-825), so by the time identity_form fires the
        // branch has already been taken.
        //
        // 'save-identity' is deliberately not handled here — at startup a new
        // identity does not exist yet and an edited one still carries its old
        // address. The identity_update and identity_create_after hooks set the env
        // for the form core hands back, and both fire before it is rendered.
        //
        // identities_level 4 disables every field on the form, so a photo control
        // there would be the one editable thing on a screen that is meant to be
        // read-only.
        if ($rcmail->task === 'settings' && (int) $rcmail->config->get('identities_level', 0) !== 4) {
            if ($rcmail->action === 'edit-identity') {
                $iid = rcube_utils::get_input_string('_iid', rcube_utils::INPUT_GPC);
                $identity = strlen((string) $iid) ? $rcmail->user->get_identity($iid) : null;

                if (is_array($identity) && !empty($identity['email'])) {
                    $this->identity_photo_env($identity['email'], $identity['name'] ?? '');
                }
            }
            // An identity that has not been saved has no address for a picture to
            // attach to, so the well cannot work yet. The template says so rather
            // than showing controls that would fail.
            elseif ($rcmail->action === 'add-identity') {
                $output->set_env('bc_idphoto_new', true);
            }
        }

        // Roundcube stores the language as en_US; HTML lang= needs BCP-47 (en-US).
        // Core sets no env for it, so derive it here — §9 requires a valid lang.
        $lang = isset($_SESSION['language']) ? (string) $_SESSION['language'] : 'en_US';
        $output->set_env('bc_lang', str_replace('_', '-', $lang));

        $output->set_env('bc_theme', $this->sanitize_theme($rcmail->config->get('businessclass_theme')));
        $output->set_env('bc_density', $this->sanitize_density($rcmail->config->get('businessclass_density')));
        $output->set_env('bc_focused', (bool) $rcmail->config->get('businessclass_focused', false));
        $output->set_env('bc_folders_w', $this->clamp_int(
            $rcmail->config->get('businessclass_folders_w'),
            self::FOLDERS_W_MIN, self::FOLDERS_W_MAX, self::DEFAULTS['folders_w']
        ));
        $output->set_env('bc_list_w', $this->clamp_int(
            $rcmail->config->get('businessclass_list_w'),
            self::LIST_W_MIN, self::LIST_W_MAX, self::DEFAULTS['list_w']
        ));
        $output->set_env('bc_list_h', $this->clamp_int(
            $rcmail->config->get('businessclass_list_h'),
            self::LIST_H_MIN, self::LIST_H_MAX, self::DEFAULTS['list_h']
        ));

        return $args;
    }

    /**
     * Let the sign-in page be read in a chosen language (BUILD.md §4.2).
     *
     * Roundcube has no language switch before login: it takes the language from
     * $config['language'], or from Accept-Language when that is unset
     * (rcube::language_prop). load_language() is the supported way to change it,
     * and it writes $_SESSION['language'] itself.
     *
     * The choice deliberately does not outlive the sign-in. A successful login
     * resets the session to the user's own stored language (rcmail.php:1012),
     * which is the right answer — this only decides what language the form in
     * front of you is written in.
     */
    private function login_language($rcmail)
    {
        $lang = rcube_utils::get_input_string('_lang', rcube_utils::INPUT_GPC);

        if (!$lang || !preg_match('/^[a-z]{2}(_[A-Z]{2})?$/', $lang)) {
            return;
        }

        // Only a language that is actually installed; language_prop() would
        // otherwise silently fall back and the select would look broken.
        if (array_key_exists($lang, $rcmail->list_languages())) {
            $rcmail->load_language($lang);
        }
    }

    /**
     * The domain named under "Sign in" (§4.2: "Webmail for company.example").
     *
     * branding.json wins, because an admin serving several domains from one
     * install needs to be able to say which one this is. Otherwise
     * $config['mail_domain'] — but only when it is a plain string; it is also
     * allowed to be a host => domain map, and guessing which entry applies
     * before the user has identified themselves would be a guess. With neither,
     * the subtitle is simply absent.
     */
    private function mail_domain($rcmail, $branding)
    {
        if (!empty($branding['mail_domain']) && is_string($branding['mail_domain'])) {
            return $branding['mail_domain'];
        }

        $domain = $rcmail->config->get('mail_domain');

        return is_string($domain) && $domain !== '' ? $domain : null;
    }

    /**
     * Read and decode the active branding profile.
     *
     * Which file that is comes from $config['businessclass_branding']:
     *
     *     $config['businessclass_branding'] = 'jethost';   // branding.jethost.json
     *     $config['businessclass_branding'] = 'jethost-bg';// branding.jethost-bg.json
     *
     * unset, empty or 'default' → branding.json, the generic profile the theme
     * is distributed with.
     *
     * A named profile rather than renaming a file over branding.json, because the
     * rename is undone by the next deploy that ships the skin — silently, and the
     * install reverts to generic branding with nothing in any log. The config
     * setting lives outside the skin directory and survives.
     *
     * A missing or malformed file is not an error: the skin must still render
     * with defaults (BUILD.md §2 — "never a broken image"). A profile that was
     * *named* and cannot be read is different — that is a typo in the config, and
     * silently serving someone else's branding is worse than saying so — so it is
     * logged before falling back.
     */
    private function load_branding($skin)
    {
        static $cache = null;

        if ($cache !== null) {
            return $cache;
        }

        $cache = [];
        $dir   = RCUBE_INSTALL_PATH . 'skins/' . $skin . '/';
        $file  = $dir . 'branding.json';

        // The profile name reaches a filesystem path, so it is whitelisted rather
        // than escaped: letters, digits, hyphen and underscore only. That admits
        // no separator, no dot and therefore no '..' — 'jethost-bg' passes,
        // '../../config/config' and 'a/b' do not. Anything else is treated as if
        // no profile had been named at all.
        $profile = rcmail::get_instance()->config->get('businessclass_branding');

        if (is_string($profile) && $profile !== '' && $profile !== 'default') {
            if (!preg_match('/^[A-Za-z0-9_-]+$/', $profile)) {
                rcube::raise_error([
                    'code' => 600,
                    'file' => __FILE__,
                    'line' => __LINE__,
                    'message' => "businessclass: branding profile name is not allowed, using branding.json",
                ], true, false);
            } elseif (!is_readable($dir . 'branding.' . $profile . '.json')) {
                rcube::raise_error([
                    'code' => 600,
                    'file' => __FILE__,
                    'line' => __LINE__,
                    'message' => "businessclass: branding profile '{$profile}' not found, using branding.json",
                ], true, false);
            } else {
                $file = $dir . 'branding.' . $profile . '.json';
            }
        }

        if (is_readable($file)) {
            $json = json_decode((string) file_get_contents($file), true);
            if (is_array($json)) {
                $cache = $json;
            } else {
                rcube::raise_error([
                    'code' => 600,
                    'file' => __FILE__,
                    'line' => __LINE__,
                    'message' => "businessclass: " . basename($file) . " is not valid JSON, using defaults",
                ], true, false);
            }
        }

        return $cache;
    }

    /** BUILD.md §2: validate the admin hex server-side before echoing it. */
    private function sanitize_accent($value)
    {
        return is_string($value) && preg_match('/^#[0-9a-f]{6}$/i', $value)
            ? $value
            : self::DEFAULTS['accent'];
    }

    /**
     * Asset paths are skin-relative and admin-supplied. Reject anything that
     * could escape the skin folder or inject a scheme (javascript:, data:).
     */
    private function sanitize_asset($value)
    {
        if (!is_string($value) || $value === '') {
            return null;
        }
        if (strpos($value, '..') !== false || strpos($value, ':') !== false || $value[0] === '/') {
            return null;
        }

        return preg_match('#^[A-Za-z0-9._/-]+$#', $value) ? $value : null;
    }

    private function sanitize_url($value)
    {
        if (!is_string($value) || $value === '') {
            return null;
        }

        return preg_match('#^https?://#i', $value) ? $value : null;
    }

    private function sanitize_theme($value)
    {
        return in_array($value, ['light', 'dark', 'system', 'hc'], true)
            ? $value
            : self::DEFAULTS['theme'];
    }

    private function sanitize_density($value)
    {
        return in_array($value, ['comfortable', 'compact'], true)
            ? $value
            : self::DEFAULTS['density'];
    }

    private function clamp_int($value, $min, $max, $default)
    {
        if (!is_numeric($value)) {
            return $default;
        }

        return max($min, min($max, (int) $value));
    }
}
