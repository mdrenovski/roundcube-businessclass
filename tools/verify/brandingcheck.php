<?php
// Exercises businessclass_prefs::load_branding() against the real branding files.
//
//   php tools/verify/brandingcheck.php .
//
// What this is for: the profile name from $config['businessclass_branding']
// reaches a filesystem path. That makes it the one piece of admin config in this
// plugin where getting the validation wrong reads a file outside the skin, so the
// traversal cases below are the point of the harness, not an afterthought.
//
// One process per case. load_branding() memoises into a function-level `static`,
// which is shared across instances and cannot be reset from outside, so a single
// process would answer every case with whichever profile it loaded first — and
// the suite would pass while testing nothing. Hence the re-exec.

$root = $argv[1] ?? '.';

// -- Parent: run each case in its own process and report ----------------------
if (!isset($argv[2])) {
    // name, expected logo.symbol, expected vendor, what it is testing
    //
    // Keyed on logo.symbol, not on accent. All three profiles carry the same
    // accent since D-63 — the JetHost presets brand through the logos and leave
    // the interface the design's blue — so accent no longer tells them apart and
    // an assertion on it would pass for every profile. logo.symbol is only in the
    // JetHost presets, which is what makes it a discriminator.
    $SYM = 'images/symbol-jethost.svg';
    $cases = [
        ['',                     null,  'JetHost.com', 'unset -> branding.json'],
        ['default',              null,  'JetHost.com', "'default' -> branding.json"],
        ['jethost',              $SYM,  'JetHost.com', 'jethost -> branding.jethost.json'],
        ['jethost-bg',           $SYM,  'JetHost.BG',  'jethost-bg -> hyphen is allowed'],
        ['nosuchprofile',        null,  'JetHost.com', 'named but missing -> falls back'],
        ['../branding',          null,  'JetHost.com', 'traversal with .. -> rejected'],
        ['../../config/config',  null,  'JetHost.com', 'traversal out of the skin -> rejected'],
        ['jethost/../../secret', null,  'JetHost.com', 'separator -> rejected'],
        ['jethost.json',         null,  'JetHost.com', 'a dot -> rejected'],
        // Deliberately no case-variant case ('JETHOST'). Whether that resolves is
        // a property of the *filesystem*, not of this code: it falls back on the
        // Linux servers this ships to and loads branding.jethost.json on the
        // case-insensitive macOS volume it is developed on. Measured both ways;
        // asserting either would make the suite lie on the other platform.
    ];

    $fail = 0;
    foreach ($cases as [$profile, $symbol, $vendor, $what]) {
        $out = shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__)
            . ' ' . escapeshellarg($root) . ' ' . escapeshellarg($profile) . ' 2>&1');
        $got = json_decode(trim((string) $out), true);

        $ok = is_array($got)
            && ($got['symbol'] ?? null) === $symbol
            && $got['vendor'] === $vendor;
        printf("  %-44s %s\n", $what, $ok ? 'ok' : 'FAIL  ' . trim((string) $out));
        if (!$ok) {
            $fail++;
        }
    }

    // -- The traversal case that actually bites --------------------------------
    // The cases above pass with the guard removed, so on their own they prove
    // nothing: the profile is interpolated *between* 'branding.' and '.json', so
    // '../evil' builds 'branding.../evil.json' and simply does not resolve.
    //
    // Escaping needs a real directory named 'branding.<something>'. Given one,
    // 'x/../../evil' builds 'skins/businessclass/branding.x/../../evil.json',
    // which is 'skins/evil.json' — outside the skin. Verified against the guard
    // both ways: with it removed this returns accent #FF0000 / vendor PWNED.
    $skins = rtrim(realpath($root), '/') . '/skins/';
    @mkdir($skins . 'businessclass/branding.x');
    file_put_contents($skins . 'evil.json', '{"accent":"#FF0000","vendor":"PWNED"}');

    $out = shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__FILE__)
        . ' ' . escapeshellarg($root) . ' ' . escapeshellarg('x/../../evil') . ' 2>&1');
    $got = json_decode(trim((string) $out), true);

    @unlink($skins . 'evil.json');
    @rmdir($skins . 'businessclass/branding.x');

    $ok = is_array($got) && $got['vendor'] === 'JetHost.com';
    printf("  %-44s %s\n", 'reachable file outside the skin -> refused',
        $ok ? 'ok' : 'FAIL  ' . trim((string) $out));
    if (!$ok) {
        $fail++;
    }

    if ($fail) {
        echo "\nBRANDING PROFILE FAILURES: $fail\n";
        exit(1);
    }
    echo "\nBRANDING PROFILE SELECTION OK\n";
    exit(0);
}

// -- Child: load one profile and print what came back -------------------------
define('RCUBE_CHARSET', 'UTF-8');
define('RCUBE_INSTALL_PATH', rtrim(realpath($root), '/') . '/');

class rcube_plugin
{
    public $ID = 'businessclass_prefs';
    public $home = '';
    public function add_texts($d, $c = false) {}
    public function add_hook($n, $c) {}
    public function register_action($n, $c) {}
    public function gettext($k) { return is_array($k) ? $k['name'] : $k; }
}
class rcube
{
    // Swallowed: a rejected or missing profile is *expected* to raise here, and
    // the assertion is on which file got loaded, not on the log line.
    public static function raise_error($a, $b = false, $c = false) {}
    public static function Q($s, $m = 'strict', $n = true) { return (string) $s; }
}
class rcube_utils
{
    const INPUT_POST = 4;
    const INPUT_GPC = 7;
    public static function get_input_string($n, $m, $h = false) { return ''; }
}
class stub_config
{
    private $d;
    public function __construct($d) { $this->d = $d; }
    public function get($k, $def = null) { return $this->d[$k] ?? $def; }
    public function set($k, $v) { $this->d[$k] = $v; }
    public function all() { return $this->d; }
}
class rcmail
{
    public static $inst;
    public $config;
    public $task = 'mail';
    public static function get_instance() { return self::$inst; }
    public function gettext($k) { return $k; }
}

require_once RCUBE_INSTALL_PATH . 'plugins/businessclass_prefs/businessclass_prefs.php';

$rc = new rcmail();
$rc->config = new stub_config(['businessclass_branding' => $argv[2]]);
rcmail::$inst = $rc;

$plugin = new businessclass_prefs();

// No setAccessible(): it is a no-op since PHP 8.1 and deprecated in 8.5, where
// the notice lands on stdout and corrupts the JSON this prints.
$m = new ReflectionMethod('businessclass_prefs', 'load_branding');
$branding = $m->invoke($plugin, 'businessclass');

echo json_encode([
    'accent' => $branding['accent'] ?? null,
    'vendor' => $branding['vendor'] ?? null,
    'symbol' => $branding['logo']['symbol'] ?? null,
]);
