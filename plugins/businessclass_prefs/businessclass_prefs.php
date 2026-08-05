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
        'businessclass_sheet',        // theme | light — the message-body surface
        'businessclass_focused',      // Focused/Other tabs on/off
        'businessclass_shortcuts',    // single-key shortcuts on/off — §9
        'businessclass_preview',      // snippet lines under a row: off | 1 | 2
        'businessclass_favorites',    // pinned folders, "\n"-separated — see sanitize_favorites()
        'businessclass_folders_w',    // folder pane width, px
        'businessclass_list_w',       // message list width, px
        'businessclass_list_h',       // message list height, px — 'desktop' layout only
    ];

    /** Defaults applied when a pref or branding key is absent. */
    private const DEFAULTS = [
        'theme' => 'system',
        'density' => 'comfortable',
        // Snippet lines under a message row. Outlook's own default is 1.
        'preview' => '1',
        // "theme": a sender's HTML sits on whatever surface the theme is using,
        // which in dark means a dark one. Outlook's default, and chosen over the
        // safer paper default on 2026-07-31. See docs/DECISIONS.md D-68.
        'sheet' => 'theme',
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
     * Where an avatar photo is looked for, in order (§7.10, D-78).
     *
     *   1. every address book, which core does before this hook is reached
     *   2. BIMI, for a domain that stands for one organisation
     *   3. Gravatar
     *   4. nothing, and the initials the skin already drew stay showing
     *
     * Steps 2 and 3 are outbound and each has its own switch, because they
     * disclose different things to different people. Gravatar carries a hash of
     * the address and the user's IP to Automattic. BIMI is answered here, from
     * DNS, and the only thing that leaves the browser is a request for a logo
     * from a host the sender's own domain nominated. Both are documented
     * choices rather than silent defaults.
     */
    private const GRAVATAR_BASE = 'https://www.gravatar.com/avatar/';

    /**
     * Domains where the address identifies a person, not an organisation.
     *
     * BIMI publishes one mark per domain. On a company domain that mark is the
     * company, which is exactly what a sender avatar should be. On a freemail
     * domain it is the mail provider — so asking gmail.com for its logo would
     * put the same picture on every person who happens to have a Gmail address,
     * which is worse than the initials it replaced. These domains therefore skip
     * BIMI and go straight to Gravatar, which is keyed on the address.
     *
     * Two lists, because "is this a freemail domain" has two different shapes of
     * answer and conflating them is how the reference implementation gets
     * yahoo.co.uk wrong. Its registrable domain is co.uk and its TLD-stripped
     * form is yahoo.co, so neither reading ever matches an entry of "yahoo".
     *
     * BRANDS match the first label, which is what catches every national
     * variant — yahoo.co.uk, hotmail.fr, gmx.at — without listing the world.
     * Only words that are a mail provider and nothing else belong here: a false
     * positive costs a company its BIMI mark.
     *
     * DOMAINS match in full, and are where the ordinary words go. "live",
     * "free", "me" and "msn" are all real first labels of real companies, so
     * they are listed as the specific domains they are and nothing more.
     */
    private const FREEMAIL_BRANDS = [
        'gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'aol',
        'protonmail', 'yandex', 'icloud', 'gmx', 'zoho', 'fastmail', 'tutanota',
        'laposte', 'wanadoo', 'seznam',
    ];

    private const FREEMAIL_DOMAINS = [
        'proton.me', 'pm.me', 'tuta.com', 'me.com', 'mac.com', 'web.de',
        'mail.ru', 'live.com', 'live.co.uk', 'live.de', 'live.fr', 'msn.com',
        'free.fr', 'sfr.fr', 'bbox.fr', 'orange.fr',
        'abv.bg', 'mail.bg', 'dir.bg',
    ];

    /** Where a BIMI answer is kept when no shared cache backend is configured. */
    private const BIMI_TTL = '10d';

    /** The DNS label BIMI reserves for the default selector (RFC draft §4). */
    private const BIMI_HOST = 'default._bimi.';

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
     * The remote half of the avatar chain (§7.10, D-78).
     *
     * Fires from two places in core, and both are wanted: the contacts/photo
     * action, which the skin's avatars point an <img> at, and the contactphoto
     * template object on the contact detail page. Either way core takes the URL
     * returned here — the action by redirecting to it, the template object by
     * putting it in the src.
     *
     * Only when nothing local was found: core has already searched every address
     * book by the time this runs, and a photo the user saved themselves outranks
     * anything the internet has to offer.
     *
     * The hook can hand back exactly one URL, so the chain is walked here rather
     * than in the browser — there is no way to say "try this, then that" to a
     * single redirect. A BIMI mark that turns out to 404 therefore does not fall
     * through to Gravatar; it falls through to the initials, which is the same
     * place every other miss lands.
     *
     * Gravatar is asked with d=404 rather than one of its generated fallbacks,
     * because the skin already draws initials underneath and a 404 is what lets
     * the <img> fail and leave them showing.
     */
    public function contact_photo($args)
    {
        $rcmail = rcmail::get_instance();

        if (!empty($args['data']) || !empty($args['url'])) {
            return $args;
        }

        if (
            $rcmail->config->get('skin') !== 'businessclass'
            || !$rcmail->config->get('businessclass_avatars', true)
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

        // Both halves have to be there, and the domain has to have a dot in it.
        // "ann@" satisfies a strpos() test for '@' and then hashes into a
        // perfectly well-formed Gravatar URL for an address that does not exist
        // — an outbound request that can only ever 404. A domain with no dot
        // cannot publish BIMI and cannot be reached by Gravatar either.
        if (!is_string($email) || !preg_match('/^[^@\s]+@([^@\s]+\.[^@\s]+)$/', $email, $parts)) {
            return $args;
        }

        $domain = strtolower($parts[1]);
        $url = null;

        if (
            $rcmail->config->get('businessclass_bimi', true)
            && !$this->is_freemail($domain)
        ) {
            $url = $this->bimi_url($domain);
        }

        if (!$url && $rcmail->config->get('businessclass_gravatar', true)) {
            $url = $this->gravatar_url($email);
        }

        if (!$url) {
            return $args;
        }

        // Core sets a day's expiry on the answers it sends itself, including the
        // 204 that stands in for "no photo", but not on the redirect it is about
        // to build out of this URL — so without this the browser would ask again
        // for every row of every list, forever. The day matches what core
        // already chose for a photo looked up by address, and avatarPhoto()'s
        // _bc parameter is how a changed photo escapes it.
        $rcmail->output->future_expire_header(86400);

        $args['url'] = $url;

        return $args;
    }

    /**
     * Is this a domain where the address names a person rather than a company?
     *
     * No public suffix list, deliberately — that is a dependency (§14) for a
     * question these two lists already answer. Getting it wrong in either
     * direction is survivable: a company mistaken for freemail loses its BIMI
     * mark and falls back to Gravatar, and freemail mistaken for a company does
     * one wasted DNS lookup that almost always comes back empty.
     */
    private function is_freemail($domain)
    {
        if (in_array($domain, self::FREEMAIL_DOMAINS, true)) {
            return true;
        }

        $first = strstr($domain, '.', true);

        return $first !== false && in_array($first, self::FREEMAIL_BRANDS, true);
    }

    /**
     * The logo a domain publishes for itself, via BIMI (§7.10, D-78).
     *
     * BIMI exists so that a receiving client can show a sender's verified mark,
     * which is precisely this. Publishing one is expensive — DMARC at
     * quarantine or reject, and a Verified Mark Certificate (see D-24) — but
     * *reading* one is a DNS TXT lookup and costs nothing, which is why this is
     * the one remote source with no privacy cost attached: it is answered on the
     * server, from DNS, and no third party is contacted to answer it.
     *
     * Cached, and that is not optional. dns_get_record() blocks the PHP process
     * for as long as the resolver takes, and the message list asks about every
     * sender on the page; a folder page could otherwise be fifty serialised DNS
     * queries. Misses are cached too — most domains have no BIMI record and
     * re-asking them is the common case, not the rare one.
     *
     * @return string|null An https URL, or null for no record and for a record
     *                     that did not survive validation
     */
    private function bimi_url($domain)
    {
        // Present on any ordinary PHP build, absent on some hardened shared
        // hosts. Nothing else in the chain depends on it, so a host without it
        // simply gets the Gravatar step.
        if (!function_exists('dns_get_record')) {
            return null;
        }

        // This came off an address in a message header, which means an attacker
        // chose it. Constrain it to something that is unambiguously a hostname
        // before it is concatenated into a name to resolve. The last label is
        // required to be alphabetic, which is true of every TLD and is also what
        // rules out a bare IPv4 address — no such thing publishes BIMI, and it
        // is a shape worth never passing on by accident.
        if (!preg_match('/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/', $domain)) {
            return null;
        }

        $cache = $this->avatar_cache();
        $key = 'bimi.' . $domain;

        if ($cache) {
            $hit = $cache->get($key);

            // A miss is stored as false, which is a real answer and has to be
            // told apart from the null that means "never asked".
            if ($hit !== null) {
                return $hit ?: null;
            }
        }

        $url = $this->bimi_lookup($domain);

        if ($cache) {
            $cache->set($key, $url ?: false);
        }

        return $url;
    }

    /** One uncached BIMI query. Split out so bimi_url() reads as the cache. */
    private function bimi_lookup($domain)
    {
        // Silenced deliberately: a domain with no record, or a resolver that
        // times out, is an ordinary outcome here and not something to put in the
        // error log once per sender.
        $records = @dns_get_record(self::BIMI_HOST . $domain, \DNS_TXT);

        if (!is_array($records)) {
            return null;
        }

        foreach ($records as $record) {
            // A TXT record longer than 255 bytes arrives as several strings, and
            // a BIMI record with a long URL usually is. PHP joins them into
            // 'txt' for us; 'entries' is the unjoined form, kept as a fallback.
            $txt = $record['txt'] ?? '';

            if (!strlen($txt) && !empty($record['entries'])) {
                $txt = implode('', (array) $record['entries']);
            }

            if (stripos($txt, 'v=BIMI1') === false) {
                continue;
            }

            foreach (explode(';', $txt) as $tag) {
                [$name, $value] = array_pad(explode('=', trim($tag), 2), 2, '');

                if (strtolower(trim($name)) !== 'l') {
                    continue;
                }

                // An empty l= is a domain saying "I publish BIMI and I am
                // choosing not to show a logo". Honour it: return null and let
                // the chain move on rather than treating it as a parse failure.
                return $this->sanitize_bimi_url(trim($value));
            }
        }

        return null;
    }

    /**
     * Validate a URL that came out of someone else's DNS.
     *
     * This string is chosen by whoever controls the sender's domain, and core
     * puts it straight into output->redirect(). It is therefore exactly as
     * trustworthy as the sender is, which is to say not at all — so it is held
     * to the narrowest thing the BIMI spec allows: https, and nothing else.
     * That is not a tightening of the spec, it is the spec; BIMI requires https
     * for the location so that the mark cannot be swapped in transit.
     *
     * The scheme test is what keeps javascript: and data: out, matching the rule
     * sanitize_url() applies to the branding file. What makes the rest
     * survivable is that the result is only ever rendered inside <img>, where an
     * SVG — and a BIMI mark is always an SVG — cannot run script or fetch
     * anything of its own.
     */
    private function sanitize_bimi_url($value)
    {
        if (!is_string($value) || !strlen($value) || strlen($value) > 2048) {
            return null;
        }

        // No whitespace, quotes or angle brackets: those are how a URL stops
        // being a URL and starts being an injection into whatever consumes it.
        if (!preg_match('~^https://[^\s"\'<>\\\\]+$~i', $value)) {
            return null;
        }

        return filter_var($value, \FILTER_VALIDATE_URL) ? $value : null;
    }

    /**
     * Where BIMI answers are kept.
     *
     * A BIMI record is a public fact about a domain and has nothing to do with
     * the account that happened to receive the mail, so the shared cache is
     * where it belongs: one lookup then serves every user on the server. That
     * cache only exists once an admin names a backend for it —
     * $config['businessclass_bimi_cache'] = 'db' — so this falls back to the
     * per-user cache, which is always available. The fallback costs a row per
     * user per domain and still turns a page of DNS queries into none.
     */
    private function avatar_cache()
    {
        $rcmail = rcmail::get_instance();

        return $rcmail->get_cache_shared('businessclass_bimi')
            ?: $rcmail->get_cache('businessclass_bimi', 'db', self::BIMI_TTL);
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

        // §9's single-key shortcuts. On by default: they are an accessibility
        // feature, and one nobody switches on does not help the people it is
        // for. The switch exists because a single letter is the one binding
        // that can collide with something we cannot see — an assistive tool's
        // own quick-nav keys, a browser extension, an IME — and there has to be
        // a way out that is not "stop using the skin".
        if (!isset($no_override['businessclass_shortcuts'])) {
            $field_id = 'rcmfd_businessclass_shortcuts';
            $checkbox = new html_checkbox(['name' => '_businessclass_shortcuts', 'id' => $field_id, 'value' => 1]);

            $block['options']['businessclass_shortcuts'] = [
                'title' => html::label($field_id, rcube::Q($this->gettext('bc_shortcuts'))),
                'content' => $checkbox->show($rcmail->config->get('businessclass_shortcuts', true) ? 1 : 0)
                    . html::div('hint', rcube::Q($this->gettext('bc_shortcutshint'))),
            ];
        }

        // The one avatar switch a user gets. The per-source switches (BIMI,
        // Gravatar) stay with the admin, because which third parties this
        // installation is willing to talk to is an operator's decision and not
        // a per-account taste. This one is the taste: whether to look outside
        // the address book at all. Offered only where there is still a source
        // left switched on for it to govern — with both off it would be a
        // control over nothing.
        if (
            !isset($no_override['businessclass_avatars'])
            && ($rcmail->config->get('businessclass_bimi', true)
                || $rcmail->config->get('businessclass_gravatar', true))
        ) {
            $field_id = 'rcmfd_businessclass_avatars';
            $checkbox = new html_checkbox(['name' => '_businessclass_avatars', 'id' => $field_id, 'value' => 1]);

            $block['options']['businessclass_avatars'] = [
                'title' => html::label($field_id, rcube::Q($this->gettext('bc_avatars'))),
                'content' => $checkbox->show($rcmail->config->get('businessclass_avatars', true) ? 1 : 0),
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

        if (!isset($no_override['businessclass_shortcuts'])) {
            $args['prefs']['businessclass_shortcuts'] = isset($_POST['_businessclass_shortcuts']);
        }

        // Guarded by the same condition that decided whether to draw it: an
        // unchecked box and a box that was never on the page look identical in a
        // post, so without this, turning every source off in config would write
        // false over whatever the user had chosen and lose it.
        if (
            !isset($no_override['businessclass_avatars'])
            && ($rcmail->config->get('businessclass_bimi', true)
                || $rcmail->config->get('businessclass_gravatar', true))
        ) {
            $args['prefs']['businessclass_avatars'] = isset($_POST['_businessclass_avatars']);
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
            // Read from env once, when the shortcut engine binds — so switching
            // it off has to rebuild the page to actually stop listening.
            'businessclass_shortcuts' => (bool) $rcmail->config->get('businessclass_shortcuts', true),
            // Reaches the message list as an env flag read once, when a row is
            // built, so a change only shows after the page is built again.
            'businessclass_avatars' => (bool) $rcmail->config->get('businessclass_avatars', true),
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

        // §9's single-key shortcuts, defaulting on. Published even where the
        // admin has frozen it, because the engine still has to know which way
        // it was frozen — dont_override removes the control, not the setting.
        $output->set_env('bc_shortcuts', (bool) $rcmail->config->get('businessclass_shortcuts', true));

        // The accent, and the only two colours that can legibly sit on it.
        //
        // header.html writes both as inline custom properties on <html>. The
        // second cannot be derived in CSS — there is no way to ask a stylesheet
        // "is this colour light or dark", and that question decides whether text
        // drawn on the band is readable at all. So it is answered here, once,
        // beside the validation the hex already goes through.
        // Four properties, not one, because "the brand colour" answers four
        // different questions and only the first has the same answer every time:
        //
        //   bc_accent          the brand hex, untouched. The header band in light.
        //   bc_accent_fill     the same, nudged only if neither black nor white
        //                      reaches AA on it. What a primary button is filled
        //                      with, and what its label is guaranteed against.
        //   bc_on_accent       black or white — whichever reads on that fill.
        //   bc_accent_text     the accent as READABLE TEXT: links, the unread bar,
        //   bc_accent_text_dark  every indicator that has to be seen rather than
        //                      sat on. One per surface, because "readable" means
        //                      something different on #FFFFFF and on #292929.
        //
        // None of it can be done in CSS: every one of these is a contrast
        // measurement, and a stylesheet cannot measure. Doing it here also means
        // it is done once per request rather than per element, and beside the
        // validation the hex already goes through.
        $accent = $this->sanitize_accent($branding['accent'] ?? null);
        $fill = $this->accent_fill($accent);
        $output->set_env('bc_accent', $accent);
        $output->set_env('bc_accent_fill', $fill);
        $output->set_env('bc_on_accent', $this->on_accent($fill));
        $output->set_env('bc_accent_text', $this->accent_text($accent, self::SURFACE_LIGHT));
        $output->set_env('bc_accent_text_dark', $this->accent_text($accent, self::SURFACE_DARK));
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
        // The reversed pair, for dark and high contrast (§12 step 12, D-67).
        //
        // A logo drawn in dark ink is chosen against a light surface — D-59 picked
        // the *positive* JetHost lockup precisely because the rail is a light
        // neutral. In dark that rail is #141414 and the same artwork measures
        // 1.50:1 against it; the login card is worse, at 1.13:1. Neither is
        // "hard to see", they are gone.
        //
        // Optional, and absent it falls back to the light asset — so an install
        // that never touches branding.json keeps exactly today's behaviour, and
        // one that supplies a reversed lockup gets it. The fallback happens in
        // ui.js, which is where the theme is actually known: "system" is a media
        // query, not a value the server can resolve.
        $output->set_env('bc_logo_rail_dark', $this->sanitize_asset($logo['rail_dark'] ?? null));
        // Where that logo goes when clicked — the vendor's own site. Absent, the
        // logo is a plain image and not a link at all.
        //
        // Through sanitize_url, the same gate as support_url, so it is http(s)
        // only. That is what keeps `javascript:` out of an href built from a file
        // an admin edits by hand.
        $output->set_env('bc_brand_url', $this->sanitize_url($branding['brand_url'] ?? null));
        $output->set_env('bc_logo_login', $this->sanitize_asset($logo['login'] ?? null));
        $output->set_env('bc_logo_login_dark', $this->sanitize_asset($logo['login_dark'] ?? null));
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
        $output->set_env('bc_sheet', $this->sanitize_sheet($rcmail->config->get('businessclass_sheet')));
        $output->set_env('bc_focused', (bool) $rcmail->config->get('businessclass_focused', false));
        $output->set_env('bc_preview', $this->sanitize_preview($rcmail->config->get('businessclass_preview')));

        // Whether a message row should ask for a sender photo at all (§7.10,
        // D-78). The hook enforces this on its own — a request that arrives with
        // it off gets no remote URL back — so this is not a security boundary,
        // it is what stops the browser making the request in the first place.
        // Both halves matter: without the check here the requests still happen
        // and all 204, and without the check in the hook a crafted request could
        // still reach Gravatar.
        $output->set_env('bc_avatars', (bool) $rcmail->config->get('businessclass_avatars', true));

        // Favorites (§3.4). Only on the mail task: nothing else renders a folder
        // pane, and validating the list costs an IMAP LSUB — which is cheap, but
        // not worth spending on the settings and contacts screens that would
        // never read it. The default is null, not '', so that "never set" and
        // "emptied by the user" stay distinguishable (sanitize_favorites).
        if ($rcmail->task === 'mail') {
            $output->set_env('bc_favorites', $this->sanitize_favorites(
                $rcmail->config->get('businessclass_favorites', null)
            ));
        }
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

    /** The two app surfaces an accent has to be legible against (_tokens.scss). */
    private const SURFACE_LIGHT = '#FFFFFF';
    private const SURFACE_DARK = '#292929';

    /** WCAG AA for text. §9 makes it the gate, not the goal. */
    private const AA_TEXT = 4.5;

    /** #RRGGBB -> [r, g, b]. Assumes a value that passed sanitize_accent. */
    private static function rgb($hex)
    {
        return [
            hexdec(substr($hex, 1, 2)),
            hexdec(substr($hex, 3, 2)),
            hexdec(substr($hex, 5, 2)),
        ];
    }

    private static function hex(array $rgb)
    {
        return sprintf('#%02X%02X%02X', ...array_map(
            static function ($v) { return max(0, min(255, (int) round($v))); },
            $rgb
        ));
    }

    /** WCAG 2.1 relative luminance. */
    private static function luminance(array $rgb)
    {
        $f = static function ($v) {
            $v /= 255;
            return $v <= 0.03928 ? $v / 12.92 : pow(($v + 0.055) / 1.055, 2.4);
        };

        return 0.2126 * $f($rgb[0]) + 0.7152 * $f($rgb[1]) + 0.0722 * $f($rgb[2]);
    }

    private static function ratio(array $a, array $b)
    {
        $la = self::luminance($a);
        $lb = self::luminance($b);

        return ($la > $lb ? ($la + 0.05) / ($lb + 0.05) : ($lb + 0.05) / ($la + 0.05));
    }

    /** Mix $pct percent of $b into $a, in sRGB, exactly as CSS color-mix does. */
    private static function mix(array $a, array $b, $pct)
    {
        $t = $pct / 100;

        return [
            $a[0] + ($b[0] - $a[0]) * $t,
            $a[1] + ($b[1] - $a[1]) * $t,
            $a[2] + ($b[2] - $a[2]) * $t,
        ];
    }

    /**
     * The accent, moved just far enough to be readable AS TEXT on $surface.
     *
     * An accent is a brand decision; whether it can be read at 14px on white is
     * not. A pale brand — #FFD966, say — gives a 1.37:1 link, and a link nobody
     * can read is not a branding choice, it is a defect. So the hue is kept and
     * the lightness is walked toward the far end until AA is met: away from the
     * surface, so a light surface darkens the accent and a dark one lightens it.
     *
     * Walks in 2% steps rather than solving directly, because the sRGB transfer
     * curve makes the closed form ugly and 50 iterations of integer arithmetic
     * happen once per request. The FIRST step that passes is returned, so the
     * result is the smallest departure from the brand that satisfies §9 — not a
     * safe-and-ugly black.
     *
     * @param string $hex     the accent, already through sanitize_accent
     * @param string $surface #RRGGBB the text will sit on
     * @return string #RRGGBB
     */
    private function accent_text($hex, $surface)
    {
        $accent = self::rgb($hex);
        $bg = self::rgb($surface);

        if (self::ratio($accent, $bg) >= self::AA_TEXT) {
            return strtoupper($hex);
        }

        $target = self::luminance($bg) > 0.179 ? [0, 0, 0] : [255, 255, 255];

        for ($pct = 2; $pct <= 100; $pct += 2) {
            $candidate = self::mix($accent, $target, $pct);
            if (self::ratio($candidate, $bg) >= self::AA_TEXT) {
                return self::hex($candidate);
            }
        }

        return self::hex($target);
    }

    /**
     * The accent as a FILL that white or black text will sit on — the header
     * band in light, the primary button everywhere.
     *
     * Same idea as accent_text and a different question: there, the accent is the
     * text; here it is the background and the text is whichever of black or white
     * reads better on it. Most accents need no adjustment at all and are returned
     * untouched, which is the point — a mid-luminance grey is the only real case,
     * and it is exactly the one where neither black nor white reaches AA (white
     * on #808080 is 3.95:1). Nudged away from the middle, it does.
     *
     * @return string #RRGGBB
     */
    private function accent_fill($hex)
    {
        $accent = self::rgb($hex);

        $best = static function (array $c) {
            return max(self::ratio($c, [255, 255, 255]), self::ratio($c, [0, 0, 0]));
        };

        if ($best($accent) >= self::AA_TEXT) {
            return strtoupper($hex);
        }

        // Move the way it already leans, so a darkish brand goes darker rather
        // than flipping to a pale version of itself.
        $target = self::luminance($accent) > 0.179 ? [255, 255, 255] : [0, 0, 0];

        for ($pct = 2; $pct <= 100; $pct += 2) {
            $candidate = self::mix($accent, $target, $pct);
            if ($best($candidate) >= self::AA_TEXT) {
                return self::hex($candidate);
            }
        }

        return self::hex($target);
    }

    /**
     * Black or white — whichever reads on the given accent.
     *
     * WCAG relative luminance (WCAG 2.1, "relative luminance"), then the standard
     * pivot: a colour whose luminance is above 0.179 has better contrast with
     * black than with white, and below it the other way round. That threshold is
     * where the two contrast ratios cross, so this always picks the higher of the
     * two — never merely an acceptable one.
     *
     * This is why it is not a Sass constant or a CSS trick. The accent is admin
     * input, read from branding.json at runtime, and until step 12 the answer was
     * hard-coded to white in light and black in dark — which is how a navy accent
     * ended up with black icons on it at 1.82:1 (D-58/D-66).
     *
     * Takes a value that has already been through sanitize_accent, so the format
     * is known good; it still guards, because a caller that forgets would
     * otherwise get a silently wrong colour rather than a fault.
     *
     * @param string $hex #RRGGBB
     * @return string #FFFFFF or #000000
     */
    private function on_accent($hex)
    {
        if (!is_string($hex) || !preg_match('/^#[0-9a-f]{6}$/i', $hex)) {
            return '#FFFFFF';
        }

        $channel = static function ($v) {
            $v /= 255;
            return $v <= 0.03928 ? $v / 12.92 : pow(($v + 0.055) / 1.055, 2.4);
        };

        $r = $channel(hexdec(substr($hex, 1, 2)));
        $g = $channel(hexdec(substr($hex, 3, 2)));
        $b = $channel(hexdec(substr($hex, 5, 2)));

        return (0.2126 * $r + 0.7152 * $g + 0.0722 * $b) > 0.179 ? '#000000' : '#FFFFFF';
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

    /**
     * How many lines of the message body show under a row (View tab, D-76).
     *
     * Reaches the browser as a class name on the list, so it is whitelisted
     * rather than escaped — the same treatment as theme, density and sheet, and
     * for the same reason: rcmail.save_pref() writes it from the browser and it
     * arrives as whatever the client sent. Compared as a string because '0'
     * would be falsy and 'off' is not numeric.
     */
    private function sanitize_preview($value)
    {
        return in_array($value, ['off', '1', '2'], true)
            ? $value
            : self::DEFAULTS['preview'];
    }

    /**
     * The message-body surface. Reaches <html data-bc-sheet="…">, so it is
     * whitelisted rather than escaped — the same treatment as theme and density,
     * and for the same reason: it is written by rcmail.save_pref() from the
     * browser and arrives as whatever the client sent.
     */
    private function sanitize_sheet($value)
    {
        return in_array($value, ['theme', 'light'], true)
            ? $value
            : self::DEFAULTS['sheet'];
    }

    /**
     * The Favorites list (§3.4).
     *
     * Stored as one "\n"-separated string rather than an array, because that is
     * what rcmail.save_pref() can carry: save_pref.php reads a single _value and
     * an array would arrive as _value[] and be whitelisted as a different name.
     * "\n" is the one separator an IMAP mailbox name cannot contain — CRLF ends
     * the command line — so nothing here has to escape anything.
     *
     * The value is UNTRUSTED. save_pref.php checks only that the pref name is
     * whitelisted (rcube_plugin_api::$allowed_prefs) and then writes whatever the
     * browser sent straight into the user's preferences; there is no hook in
     * between. So the check is here, on the way out, and it is the strongest one
     * available: a name survives only if the user is actually subscribed to a
     * folder by that name. That leaves nothing to sanitise afterwards — every
     * string that reaches the browser is one the IMAP server just named.
     *
     * MAX exists so a crafted pref cannot make every page render a list of ten
     * thousand rows. It is a ceiling, not a design limit.
     */
    private const FAVORITES_MAX = 30;

    private function sanitize_favorites($value)
    {
        $rcmail = rcmail::get_instance();

        // Never set — seed it the way Outlook does, with the special folders that
        // exist. An empty string is a different thing: the user emptied the list,
        // and re-seeding it would put back what they just removed.
        if ($value === null) {
            $names = array_filter([
                'INBOX',
                $rcmail->config->get('drafts_mbox'),
                $rcmail->config->get('sent_mbox'),
            ]);
        } elseif (is_string($value)) {
            $names = explode("\n", $value);
        } else {
            return [];
        }

        $names = array_values(array_unique(array_filter(array_map('trim', $names), 'strlen')));

        if (!$names) {
            return [];
        }

        // list_folders_subscribed() talks to IMAP, so it is asked once and only
        // where there is something to check it against.
        $known = $rcmail->storage ? $rcmail->storage->list_folders_subscribed('', '*', 'mail') : [];

        if (!is_array($known)) {
            return [];
        }

        return array_slice(array_values(array_intersect($names, $known)), 0, self::FAVORITES_MAX);
    }

    private function clamp_int($value, $min, $max, $default)
    {
        if (!is_numeric($value)) {
            return $default;
        }

        return max($min, min($max, (int) $value));
    }
}
