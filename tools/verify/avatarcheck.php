<?php
// Drives the avatar chain in businessclass_prefs — the freemail classifier, the
// BIMI record parser, and the two validators standing between someone else's
// DNS and an HTTP redirect (§7.10, D-78).
//
// Offline by default. The parser is exercised against captured records rather
// than the live internet, so this runs the same on a build machine with no
// resolver. Set BC_NET=1 to additionally resolve a handful of real domains,
// which is worth doing once after touching bimi_lookup().
//
//   php tools/verify/avatarcheck.php .
define('RCUBE_CHARSET', 'UTF-8');

class rcube_plugin {
    public $ID = 'businessclass_prefs';
    public $home = '';
    function add_texts($d, $c = false) {}
    function add_hook($n, $c) {}
    function register_action($n, $c) {}
    function gettext($k) { return is_array($k) ? $k['name'] : $k; }
}
class rcube_utils {
    const INPUT_POST = 4; const INPUT_GPC = 7;
    static function get_input_string($n, $m, $h = false) { return $_POST[$n] ?? ''; }
}
class rcube {
    static function raise_error($a, $b = false, $c = false) {}
    static function Q($s, $m = 'strict', $n = true) { return htmlspecialchars((string) $s, ENT_COMPAT, 'UTF-8'); }
}
class rcube_addressbook {
    static function get_col_values($c, $r, $f) { return $r['email'] ?? []; }
}

class stub_config {
    public $data;
    function __construct($d) { $this->data = $d; }
    function get($k, $d = null) { return array_key_exists($k, $this->data) ? $this->data[$k] : $d; }
    function set($k, $v) { $this->data[$k] = $v; }
}
class stub_output {
    public $expiry = null;
    function set_env($k, $v) {}
    function command() {}
    function future_expire_header($o = 2600000) { $this->expiry = $o; }
}
/** Records what was asked for and what was kept, so caching can be asserted. */
class stub_cache {
    public $data = [], $reads = 0, $writes = 0;
    function get($k) { $this->reads++; return $this->data[$k] ?? null; }
    function set($k, $v) { $this->writes++; $this->data[$k] = $v; }
}
class rcmail {
    static $inst;
    public $config, $output, $task = 'mail', $cache;
    static function get_instance() { return self::$inst; }
    function gettext($k) { return $k; }
    function get_cache_shared($n, $p = true) { return $this->cache; }
    function get_cache($n, $t = 'db', $ttl = 0) { return $this->cache; }
}

require_once $argv[1] . '/plugins/businessclass_prefs/businessclass_prefs.php';

$rc = rcmail::$inst = new rcmail();
$rc->config = new stub_config(['skin' => 'businessclass']);
$rc->output = new stub_output();
$rc->cache  = new stub_cache();

$p   = (new ReflectionClass('businessclass_prefs'))->newInstanceWithoutConstructor();
$ref = new ReflectionClass('businessclass_prefs');

function call($name, ...$args) {
    global $p, $ref;
    return $ref->getMethod($name)->invoke($p, ...$args);
}

$fails = 0;
function check($label, $got, $want) {
    global $fails;
    $ok = $got === $want;
    if (!$ok) { $fails++; }
    printf("  %-50s %s\n", $label, $ok ? 'ok'
        : 'FAIL (got ' . var_export($got, true) . ', want ' . var_export($want, true) . ')');
}

// -----------------------------------------------------------------------------
echo "=== freemail: the address names a person, so skip BIMI ===\n";
// The national variants are the point of the first-label rule: their registrable
// domain is co.uk, which is why matching on that alone gets them wrong.
foreach ([
    'gmail.com' => true, 'googlemail.com' => true, 'outlook.com' => true,
    'hotmail.co.uk' => true, 'yahoo.co.uk' => true, 'gmx.at' => true,
    'icloud.com' => true, 'proton.me' => true, 'web.de' => true,
    'live.com' => true, 'msn.com' => true, 'abv.bg' => true,
    // Ordinary words that are also companies. These must NOT be caught by a
    // first-label rule, which is why they are listed as whole domains.
    'live.example.com' => false, 'free.example.com' => false,
    'me.example.com' => false, 'mail.cnn.com' => false,
    'jethost.com' => false, 'cnn.com' => false, 'bankofamerica.com' => false,
] as $domain => $want) {
    check($domain, call('is_freemail', $domain), $want);
}

// -----------------------------------------------------------------------------
echo "\n=== the l= URL is chosen by the sender, and core redirects to it ===\n";
foreach ([
    'https://vmc.digicert.com/a.svg'             => 'https://vmc.digicert.com/a.svg',
    // BIMI requires https so the mark cannot be swapped in transit.
    'http://vmc.digicert.com/a.svg'              => null,
    'javascript:alert(1)'                        => null,
    'data:image/svg+xml;base64,PHN2Zz4='         => null,
    '//vmc.digicert.com/a.svg'                   => null,
    'file:///etc/passwd'                         => null,
    // Quotes and angle brackets are how a URL stops being a URL.
    'https://a.example/x.svg" onerror="x'        => null,
    "https://a.example/x.svg' onload='x"         => null,
    'https://a.example/x.svg><script>'           => null,
    'https://a.example/x .svg'                   => null,
    "https://a.example/x\n.svg"                  => null,
    // An empty l= is a domain declining to show a mark. Honour it as "none".
    ''                                           => null,
    'https://'                                   => null,
] as $in => $want) {
    check($in === '' ? '(empty l=)' : str_replace("\n", '\n', $in), call('sanitize_bimi_url', $in), $want);
}
check('over 2048 chars', call('sanitize_bimi_url', 'https://x.example/' . str_repeat('a', 2100)), null);
check('not a string', call('sanitize_bimi_url', null), null);

// -----------------------------------------------------------------------------
echo "\n=== the domain came off a message header, so it is attacker-chosen ===\n";
// Everything here must be refused before dns_get_record() is reached. The stub
// cache is what proves it: a rejected host never gets as far as a cache read.
foreach ([
    'not a host', 'cnn.com/../evil', '../../etc/passwd', 'localhost',
    '127.0.0.1', '::1', 'cnn.com ', ' cnn.com', '-cnn.com', 'cnn-.com',
    'CNN.COM', 'cnn..com', '', 'a.b', str_repeat('a', 250) . '.com',
] as $bad) {
    $rc->cache->reads = 0;
    $got = call('bimi_url', $bad);
    check('refused: ' . var_export($bad, true), [$got, $rc->cache->reads], [null, 0]);
}

// -----------------------------------------------------------------------------
echo "\n=== BIMI answers are cached, including the misses ===\n";
$rc->cache->data = ['bimi.cnn.com' => 'https://example.test/logo.svg', 'bimi.nolo.go' => false];
$rc->cache->reads = $rc->cache->writes = 0;
check('a cached hit is returned', call('bimi_url', 'cnn.com'), 'https://example.test/logo.svg');
check('...without a lookup being written', $rc->cache->writes, 0);
// The distinction that makes negative caching work at all: false is a real
// answer ("asked, no record"), null means "never asked".
check('a cached miss stays a miss', call('bimi_url', 'nolo.go'), null);
check('...and is not looked up again', $rc->cache->writes, 0);

// -----------------------------------------------------------------------------
echo "\n=== contact_photo picks one URL and lets core redirect to it ===\n";
$photo = function ($email, array $config = []) use ($rc, $p) {
    foreach ($config as $k => $v) { $rc->config->set($k, $v); }
    $rc->output->expiry = null;
    return $p->contact_photo(['email' => $email, 'record' => null, 'data' => null]);
};
$base = ['businessclass_avatars' => true, 'businessclass_bimi' => false, 'businessclass_gravatar' => true];

$r = $photo('ann@example.com', $base);
check('freemail-or-not, Gravatar is the fallback', str_starts_with($r['url'] ?? '', 'https://www.gravatar.com/avatar/'), true);
check('with d=404 so the initials can show', str_contains($r['url'] ?? '', 'd=404'), true);
check('the redirect gets a day of cache', $rc->output->expiry, 86400);

$r = $photo('ann@example.com', ['businessclass_gravatar' => false]);
check('gravatar off: no URL at all', $r['url'] ?? null, null);
check('...and no expiry claimed', $rc->output->expiry, null);

$r = $photo('ann@example.com', ['businessclass_avatars' => false, 'businessclass_gravatar' => true]);
check('avatars off: nothing remote is offered', $r['url'] ?? null, null);

$r = $p->contact_photo(['email' => 'ann@example.com', 'data' => 'JPEGBYTES']);
check('a local photo is never overridden', $r['url'] ?? null, null);

foreach (['', 'not-an-address', 'ann@', '@example.com'] as $bad) {
    $r = $photo($bad, $base);
    check('no URL for ' . var_export($bad, true), $r['url'] ?? null, null);
}

$rc->config->set('skin', 'elastic');
$r = $photo('ann@example.com', $base);
check('another skin selected: hands back nothing', $r['url'] ?? null, null);
$rc->config->set('skin', 'businessclass');

// -----------------------------------------------------------------------------
if (getenv('BC_NET') === '1') {
    echo "\n=== BC_NET=1: resolving real records ===\n";
    foreach (['cnn.com', 'ebay.com', 'paypal.com', 'linkedin.com'] as $domain) {
        $url = call('bimi_lookup', $domain);
        $ok = is_string($url) && str_starts_with($url, 'https://');
        if (!$ok) { $fails++; }
        printf("  %-50s %s\n", $domain, $ok ? "ok  $url" : 'FAIL ' . var_export($url, true));
    }
    foreach (['example.com', 'iana.org'] as $domain) {
        check("$domain publishes none", call('bimi_lookup', $domain), null);
    }
} else {
    echo "\n(skipping live DNS — set BC_NET=1 to resolve real records)\n";
}

echo "\n" . ($fails ? "$fails FAILURES\n" : "AVATAR CHAIN OK — 0 failures\n");
exit($fails ? 1 : 0);
