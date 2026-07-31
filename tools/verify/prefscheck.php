<?php
// Smoke-tests businessclass_prefs::preferences_list() / preferences_save() with
// just enough of Roundcube stubbed to run them.
define('RCUBE_CHARSET', 'UTF-8');
define('RCUBE_INSTALL_PATH', $argv[1] . '/vendor/roundcube/');
require_once $argv[1] . '/vendor/roundcube/program/lib/Roundcube/html.php';

class rcube_plugin {
    public $ID = 'businessclass_prefs';
    public $home = '';
    private $texts = [];
    function add_texts($d, $c = false) {
        $labels = [];
        /* texts not needed */;
    }
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

class stub_config {
    public $data;
    function __construct($d) { $this->data = $d; }
    function get($k, $d = null) { return array_key_exists($k, $this->data) ? $this->data[$k] : $d; }
    function set($k, $v) { $this->data[$k] = $v; }
    function all() { return $this->data; }
}
class stub_output {
    public $commands = [];
    function set_env($k, $v) {}
    function command() { $this->commands[] = func_get_args(); }
}
class rcmail {
    static $inst;
    public $config, $output, $task = 'settings';
    static function get_instance() { return self::$inst; }
    function gettext($k) { return $k; }
    function list_languages() { return ['en_US' => 'English']; }
}

require_once $argv[1] . '/plugins/businessclass_prefs/businessclass_prefs.php';

$rc = new rcmail();
$rc->config = new stub_config([
    'skin' => 'businessclass',
    'supported_layouts' => ['widescreen', 'desktop', 'list'],
    'layout' => 'widescreen',
    'businessclass_theme' => 'dark',
    'businessclass_density' => 'compact',
    'businessclass_focused' => true,
    'dont_override' => [],
]);
$rc->output = new stub_output();
rcmail::$inst = $rc;

$p = new businessclass_prefs();

// --- preferences_list --------------------------------------------------------
$args = ['section' => 'general', 'current' => 'general', 'blocks' => [
    'main' => ['name' => 'Main options', 'options' => ['language' => ['title' => 'L', 'content' => 'x']]],
    'skin' => ['name' => 'Skin'],
    'browser' => ['name' => 'Browser'],
    'advanced' => ['name' => 'Advanced'],
]];
$out = $p->preferences_list($args);
echo "block order: " . implode(' > ', array_keys($out['blocks'])) . "\n";
$block = $out['blocks']['businessclass_appearance'];
echo "appearance options: " . implode(', ', array_keys($block['options'])) . "\n";
foreach ($block['options'] as $k => $o) {
    $sel = preg_match('/selected="selected"[^>]*>([^<]*)|value="([^"]*)" selected/', $o['content'], $m);
    echo sprintf("  %-24s title=%s\n", $k, strip_tags($o['title']));
}
echo "theme select shows dark: " . (strpos($block['options']['businessclass_theme']['content'], 'value="dark" selected') !== false ? 'yes' : 'NO') . "\n";
echo "layout select shows widescreen: " . (strpos($block['options']['layout']['content'], 'value="widescreen" selected') !== false ? 'yes' : 'NO') . "\n";
echo "focused checkbox checked: " . (strpos($block['options']['businessclass_focused']['content'], 'checked') !== false ? 'yes' : 'NO') . "\n";

// other sections untouched
$other = $p->preferences_list(['section' => 'mailbox', 'current' => 'mailbox', 'blocks' => ['main' => []]]);
echo "mailbox untouched: " . (isset($other['blocks']['businessclass_appearance']) ? 'NO' : 'yes') . "\n";

// --- preferences_save --------------------------------------------------------
$_POST = ['_businessclass_theme' => 'hc', '_businessclass_density' => 'comfortable', '_layout' => 'desktop'];
$saved = $p->preferences_save(['section' => 'general', 'prefs' => ['language' => 'en_US']]);
echo "saved: " . json_encode($saved['prefs']) . "\n";
echo "reload queued: " . (count($rc->output->commands) ? 'yes' : 'NO') . "\n";

// a hostile value must not survive
$rc->output->commands = [];
$_POST = ['_businessclass_theme' => '"><script>', '_businessclass_density' => 'x', '_layout' => '../../etc'];
$saved = $p->preferences_save(['section' => 'general', 'prefs' => []]);
echo "sanitized: " . json_encode($saved['prefs']) . "\n";

// no change -> no reload
$rc->output->commands = [];
$rc->config->set('businessclass_theme', 'system');
$rc->config->set('businessclass_density', 'comfortable');
$rc->config->set('businessclass_focused', false);
$_POST = ['_businessclass_theme' => 'system', '_businessclass_density' => 'comfortable'];
$p->preferences_save(['section' => 'general', 'prefs' => []]);
echo "no-op save reloads: " . (count($rc->output->commands) ? 'YES (bad)' : 'no') . "\n";

// dont_override respected
$rc->config->set('dont_override', ['businessclass_theme', 'layout']);
$frozen = $p->preferences_list(['section' => 'general', 'current' => 'general', 'blocks' => ['main' => []]]);
echo "frozen options: " . implode(', ', array_keys($frozen['blocks']['businessclass_appearance']['options'])) . "\n";
$_POST = ['_businessclass_theme' => 'dark', '_layout' => 'list'];
$fs = $p->preferences_save(['section' => 'general', 'prefs' => []]);
echo "frozen save: " . json_encode($fs['prefs']) . "\n";
