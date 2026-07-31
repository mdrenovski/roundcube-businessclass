<?php
// Exercises the identity photo (§7.10) in two halves:
//
//  1. The three states of the photo well in identityedit.html, through core's
//     *own* parse_conditions() — reached by reflection so the real regex, the
//     real elseif handling and the real eval path are what decide the branch.
//  2. The follow-the-address move, against address books that record every write,
//     so "the photo moved" and "the old one was cleared" are observed rather than
//     assumed.
//
// Real core classes where they load standalone (html, rcube_addressbook for
// get_col_values and the source-type constants, rcube_result_set, the output
// class); stubs only for what needs a live install.
define('RCUBE_CHARSET', 'UTF-8');
define('RCUBE_INSTALL_PATH', $argv[1] . '/vendor/roundcube/');

$root = rtrim($argv[1], '/');

require_once $root . '/vendor/roundcube/program/lib/Roundcube/html.php';
require_once $root . '/vendor/roundcube/program/lib/Roundcube/rcube_output.php';
require_once $root . '/vendor/roundcube/program/include/rcmail_output.php';
require_once $root . '/vendor/roundcube/program/include/rcmail_output_html.php';
require_once $root . '/vendor/roundcube/program/lib/Roundcube/rcube_result_set.php';
require_once $root . '/vendor/roundcube/program/lib/Roundcube/rcube_addressbook.php';

$fail = 0;

function check($label, $got, $want)
{
    global $fail;

    $ok = $got === $want;
    if (!$ok) {
        $fail++;
    }

    printf("  %-46s %s", $label, $ok ? "ok\n" : sprintf("FAIL  got %s, want %s\n", shown($got), shown($want)));
}

/** Photo payloads are binary and long; a failure line has to stay readable. */
function shown($value)
{
    if (is_string($value) && strlen($value) > 24) {
        return sprintf("<%d bytes, crc %s>", strlen($value), dechex(crc32($value)));
    }

    return var_export($value, true);
}

// -----------------------------------------------------------------------------
// 1. Template states, decided by core's parse_conditions()
// -----------------------------------------------------------------------------

$template = file_get_contents($root . '/skins/businessclass/templates/identityedit.html');

function conditions($template, $env)
{
    static $class = null, $method = null, $prop = null;

    if (!$class) {
        $class  = new ReflectionClass('rcmail_output_html');
        $method = $class->getMethod('parse_conditions');
        $prop   = $class->getProperty('env');
    }

    $output = $class->newInstanceWithoutConstructor();
    $prop->setValue($output, $env);

    return $method->invoke($output, $template);
}

echo "\n=== identityedit.html, three states ===\n";

$saved = conditions($template, ['bc_idphoto' => 'me@example.com', 'bc_idphoto_name' => 'Me']);
check('saved identity: upload control',    strpos($saved, 'bc-idphoto-file') !== false, true);
check('saved identity: the well',          strpos($saved, 'bc-idphoto__well') !== false, true);
check('saved identity: no "save first"',   strpos($saved, 'bc_photoaftersave') !== false, false);

$new = conditions($template, ['bc_idphoto_new' => true]);
check('new identity: "save first" shown',  strpos($new, 'bc_photoaftersave') !== false, true);
check('new identity: no upload control',   strpos($new, 'bc-idphoto-file') !== false, false);
check('new identity: no well to fill',     strpos($new, 'bc-idphoto__well') !== false, false);

$none = conditions($template, []);
check('no plugin: nothing at all',         strpos($none, 'bc-idphoto') !== false, false);

// identities_level 3+ / a plugin-supplied identity: the form has nothing to save,
// so it must not grow the one control that would still write.
$ro = conditions($template, ['bc_idphoto' => 'me@example.com', 'readonly' => true]);
check('read-only identity: no controls',   strpos($ro, 'bc-idphoto') !== false, false);
check('read-only identity: no save/cancel', strpos($ro, 'bc-form-cancel') !== false, false);

// The form itself must survive every one of those branches.
foreach (['saved' => $saved, 'new' => $new, 'none' => $none, 'read-only' => $ro] as $state => $out) {
    check("$state: identityform still rendered", strpos($out, 'name="identityform"') !== false, true);
}

// -----------------------------------------------------------------------------
// Stubs for the plugin
// -----------------------------------------------------------------------------

class rcube_plugin
{
    public $ID = 'businessclass_prefs';
    public $home = '';
    function add_texts($d, $c = false) {}
    function add_hook($n, $c) {}
    function register_action($n, $c) {}
    function gettext($k) { return is_array($k) ? $k['name'] : $k; }
}

class rcube_utils
{
    const INPUT_POST = 4;
    const INPUT_GPC = 7;

    static function get_input_string($n, $m, $h = false) { return $_POST[$n] ?? ''; }

    // Core normalises through the intl extension; same call, so an IDN address is
    // genuinely folded here rather than waved through.
    static function idn_to_ascii($str)
    {
        $str = (string) $str;
        $at = strrpos($str, '@');

        if ($at === false || !function_exists('idn_to_ascii')) {
            return $str;
        }

        $domain = @idn_to_ascii(substr($str, $at + 1), IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);

        return $domain ? substr($str, 0, $at + 1) . $domain : $str;
    }
}

class rcube
{
    static function raise_error($a, $b = false, $c = false) {}
    static function Q($s, $m = 'strict', $n = true) { return htmlspecialchars((string) $s, ENT_COMPAT, 'UTF-8'); }
    static function get_instance() { return rcmail::get_instance(); }
}

class stub_config
{
    public $data;
    function __construct($d) { $this->data = $d; }
    function get($k, $d = null) { return array_key_exists($k, $this->data) ? $this->data[$k] : $d; }
    function set($k, $v) { $this->data[$k] = $v; }
    function all() { return $this->data; }
}

class stub_output
{
    public $env = [];
    public $commands = [];
    function set_env($k, $v) { $this->env[$k] = $v; }
    function command() { $this->commands[] = func_get_args(); }
    function send() {}
}

class stub_user
{
    public $identities = [];
    function get_identity($id = null)
    {
        return $this->identities[(string) $id] ?? null;
    }
}

/** An address book that remembers what was written to it. */
class fake_book extends rcube_addressbook
{
    public $primary_key = 'ID';
    public $readonly = false;
    public $groups = false;
    public $name;
    public $records = [];
    public $writes = [];
    public $inserts = [];
    public $fail_update = false;
    private $seq = 1;

    function __construct($name, $records = [], $readonly = false)
    {
        $this->name = $name;
        $this->records = $records;
        $this->readonly = $readonly;
    }

    function get_name() { return $this->name; }
    function set_search_set($set) {}
    function get_search_set() { return null; }
    function reset() {}
    function get_result() { return null; }
    function count() { return new rcube_result_set(count($this->records)); }
    function list_records($cols = null, $subset = 0, $nocount = false) { return new rcube_result_set(0); }

    function search($fields, $value, $mode = 0, $select = true, $nocount = false, $required = [])
    {
        $set = new rcube_result_set(0);

        foreach ($this->records as $id => $record) {
            foreach (rcube_addressbook::get_col_values('email', $record, true) as $address) {
                if (strcasecmp(trim((string) $address), (string) $value) === 0) {
                    $set->count++;
                    $set->add(['ID' => $id] + $record);
                    break;
                }
            }
        }

        return $set;
    }

    function get_record($id, $assoc = false)
    {
        return isset($this->records[$id]) ? ['ID' => $id] + $this->records[$id] : false;
    }

    function update($id, $save_cols)
    {
        $shown = [];
        foreach ($save_cols as $k => $v) {
            $shown[$k] = $k === 'photo' ? (strlen((string) $v) ? strlen((string) $v) . 'B' : 'cleared') : $v;
        }

        $this->writes[] = $this->name . '/' . $id . ' ' . json_encode($shown);

        if ($this->fail_update) {
            return false;
        }

        $this->records[$id] = array_merge($this->records[$id] ?? [], $save_cols);

        return true;
    }

    function insert($save_data, $check = false)
    {
        $id = $this->name . '-new' . $this->seq++;
        $this->records[$id] = $save_data;
        $this->inserts[] = $id;

        return $id;
    }

    /** The photo as it would be served, or null. */
    function photo_of($email)
    {
        foreach ($this->records as $record) {
            foreach (rcube_addressbook::get_col_values('email', $record, true) as $address) {
                if (strcasecmp(trim((string) $address), $email) === 0) {
                    return strlen((string) ($record['photo'] ?? '')) ? $record['photo'] : null;
                }
            }
        }

        return null;
    }
}

class rcmail
{
    static $inst;
    public $config, $output, $user;
    public $task = 'settings';
    public $action = 'edit-identity';
    public $books = [];
    public $default_book = 'personal';

    static function get_instance() { return self::$inst; }
    function gettext($k) { return is_array($k) ? $k['name'] : $k; }
    function get_user_email() { return 'me@example.com'; }
    function list_languages() { return ['en_US' => 'English']; }

    function get_address_sources($writeable = false, $skip_hidden = false)
    {
        $out = [];
        foreach ($this->books as $id => $book) {
            $out[] = ['id' => $id, 'name' => $id, 'readonly' => $book->readonly];
        }

        return $out;
    }

    function get_address_book($id, $writeable = false)
    {
        if ($id === rcube_addressbook::TYPE_DEFAULT) {
            $id = $this->default_book;
        }

        return $this->books[$id] ?? null;
    }
}

require_once $root . '/plugins/businessclass_prefs/businessclass_prefs.php';

/**
 * One identity save, from a described starting state.
 *
 * @return array [plugin, rcmail, books]
 */
function scenario($books, $identity, $posted, $default_book = 'personal')
{
    $rc = new rcmail();
    $rc->config = new stub_config(['skin' => 'businessclass', 'contact_photo_size' => 160]);
    $rc->output = new stub_output();
    $rc->user = new stub_user();
    $rc->user->identities = ['1' => ['identity_id' => 1] + $identity];
    $rc->books = $books;
    $rc->default_book = $default_book;
    rcmail::$inst = $rc;

    $plugin = new businessclass_prefs();
    $plugin->identity_update(['id' => '1', 'record' => $posted]);

    return [$rc, $books];
}

$PHOTO = str_repeat("\x89PNG-bytes", 40);   // 400 bytes of not-base64
$OTHER = str_repeat("\x89PNG-other", 30);

// --- the wart itself: the photo follows the address --------------------------
echo "\n=== address changed ===\n";

$book = new fake_book('personal', ['c1' => ['name' => 'Me', 'email' => 'old@example.com', 'photo' => $PHOTO]]);
[$rc] = scenario(['personal' => $book], ['email' => 'old@example.com', 'name' => 'Me'],
    ['email' => 'new@example.com', 'name' => 'Me']);

check('photo now answers for the new address', $book->photo_of('new@example.com'), $PHOTO);
check('photo no longer on the old address',    $book->photo_of('old@example.com'), null);
check('a contact was created for it',          count($book->inserts), 1);
check('the new contact carries the name',      $book->records[$book->inserts[0] ?? '?']['name'] ?? null, 'Me');
check('well points at the new address',        $rc->output->env['bc_idphoto'] ?? null, 'new@example.com');
check('cache bust issued',                     !empty($rc->output->env['bc_idphoto_bust']), true);

// --- everything that must NOT move -------------------------------------------
echo "\n=== address unchanged ===\n";

$book = new fake_book('personal', ['c1' => ['email' => 'me@example.com', 'photo' => $PHOTO]]);
[$rc] = scenario(['personal' => $book], ['email' => 'me@example.com', 'name' => 'Me'],
    ['email' => 'me@example.com', 'name' => 'Me Renamed']);

check('nothing written',            $book->writes, []);
check('nothing created',            $book->inserts, []);
check('photo untouched',            $book->photo_of('me@example.com'), $PHOTO);
check('no pointless cache bust',    isset($rc->output->env['bc_idphoto_bust']), false);
check('well still points at it',    $rc->output->env['bc_idphoto'] ?? null, 'me@example.com');
check('name follows the rename',    $rc->output->env['bc_idphoto_name'] ?? null, 'Me Renamed');

echo "\n=== an IDN address, same domain either way ===\n";

$idn = rcube_utils::idn_to_ascii('me@пример.bg');
$book = new fake_book('personal', ['c1' => ['email' => $idn, 'photo' => $PHOTO]]);
[$rc] = scenario(['personal' => $book], ['email' => $idn, 'name' => 'Me'], ['email' => 'me@пример.bg']);

check('unicode form matches the stored ASCII', $book->writes, []);
check('and it is not the raw unicode',         $idn !== 'me@пример.bg' || !function_exists('idn_to_ascii'), true);

echo "\n=== old address has no photo ===\n";

$book = new fake_book('personal', ['c1' => ['email' => 'old@example.com', 'name' => 'Me']]);
[$rc] = scenario(['personal' => $book], ['email' => 'old@example.com'], ['email' => 'new@example.com']);

check('no stray contact created',   $book->inserts, []);
check('nothing written',            $book->writes, []);
check('no cache bust',              isset($rc->output->env['bc_idphoto_bust']), false);

echo "\n=== new address already has a photo ===\n";

$book = new fake_book('personal', [
    'c1' => ['email' => 'old@example.com', 'photo' => $PHOTO],
    'c2' => ['email' => 'new@example.com', 'photo' => $OTHER],
]);
[$rc] = scenario(['personal' => $book], ['email' => 'old@example.com'], ['email' => 'new@example.com']);

check('the newer choice wins',      $book->photo_of('new@example.com'), $OTHER);
check('the old one is left alone',  $book->photo_of('old@example.com'), $PHOTO);
check('nothing written',            $book->writes, []);

echo "\n=== one card carries both addresses ===\n";

$book = new fake_book('personal', [
    'c1' => ['email' => 'old@example.com', 'email:home' => ['new@example.com'], 'photo' => $PHOTO],
]);
[$rc] = scenario(['personal' => $book], ['email' => 'old@example.com'], ['email' => 'new@example.com']);

check('already answers for both',   $book->photo_of('new@example.com'), $PHOTO);
check('not cleared',                $book->photo_of('old@example.com'), $PHOTO);
check('nothing written',            $book->writes, []);

echo "\n=== the write to the new address fails ===\n";

$book = new fake_book('personal', ['c1' => ['email' => 'old@example.com', 'photo' => $PHOTO]]);
$book->fail_update = true;
[$rc] = scenario(['personal' => $book], ['email' => 'old@example.com'], ['email' => 'new@example.com']);

check('the photo is not lost',      $book->photo_of('old@example.com'), $PHOTO);
check('no cache bust claimed',      isset($rc->output->env['bc_idphoto_bust']), false);

echo "\n=== the photo sits in a read-only book ===\n";

$ro = new fake_book('company', ['c1' => ['email' => 'old@example.com', 'photo' => $PHOTO]], true);
$rw = new fake_book('personal', []);
[$rc] = scenario(['company' => $ro, 'personal' => $rw], ['email' => 'old@example.com'], ['email' => 'new@example.com']);

check('read-only book untouched',   $ro->writes, []);
check('nothing copied out of it',   $rw->inserts, []);

echo "\n=== a different writeable book holds the card ===\n";

$shared = new fake_book('shared', ['c1' => ['email' => 'old@example.com', 'photo' => $PHOTO]]);
$personal = new fake_book('personal', []);
[$rc] = scenario(['shared' => $shared, 'personal' => $personal],
    ['email' => 'old@example.com'], ['email' => 'new@example.com']);

check('cleared where it was',       $shared->photo_of('old@example.com'), null);
check('written to the default book', $personal->photo_of('new@example.com'), $PHOTO);

// --- a brand-new identity ----------------------------------------------------
echo "\n=== identity just created ===\n";

$book = new fake_book('personal', []);
$rc = new rcmail();
$rc->config = new stub_config(['skin' => 'businessclass']);
$rc->output = new stub_output();
$rc->user = new stub_user();
$rc->books = ['personal' => $book];
rcmail::$inst = $rc;

(new businessclass_prefs())->identity_created(['id' => 7, 'record' => ['email' => 'fresh@example.com', 'name' => 'Fresh']]);

check('well appears on the form handed back', $rc->output->env['bc_idphoto'] ?? null, 'fresh@example.com');
check('with the identity name',               $rc->output->env['bc_idphoto_name'] ?? null, 'Fresh');
check('nothing written to any book',          $book->writes, []);

// --- the startup gate --------------------------------------------------------
echo "\n=== startup, per screen and access level ===\n";

function startup_env($action, $level, $iid = '1')
{
    $rc = new rcmail();
    $rc->config = new stub_config([
        'skin' => 'businessclass',
        'identities_level' => $level,
        'supported_layouts' => ['widescreen', 'desktop', 'list'],
    ]);
    $rc->output = new stub_output();
    $rc->user = new stub_user();
    $rc->user->identities = ['1' => ['identity_id' => 1, 'email' => 'me@example.com', 'name' => 'Me']];
    $rc->books = [];
    $rc->action = $action;
    rcmail::$inst = $rc;

    $_POST = ['_iid' => $iid];
    $_SESSION = ['language' => 'en_US'];

    (new businessclass_prefs())->startup([]);
    $_POST = [];

    return $rc->output->env;
}

$env = startup_env('edit-identity', 0);
check('edit-identity: well on the saved address', $env['bc_idphoto'] ?? null, 'me@example.com');

$env = startup_env('add-identity', 0, '');
check('add-identity: "save first" state',         $env['bc_idphoto_new'] ?? null, true);
check('add-identity: no address to write to',     isset($env['bc_idphoto']), false);

$env = startup_env('edit-identity', 4);
check('identities_level 4: no photo control',     isset($env['bc_idphoto']), false);

$env = startup_env('identities', 0);
check('the identities list itself: nothing',      isset($env['bc_idphoto']), false);

echo "\n" . ($fail ? "FAILURES: $fail\n" : "IDENTITY PHOTO OK\n");
exit($fail ? 1 : 0);
