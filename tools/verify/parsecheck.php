<?php
// Runs Roundcube's own parse_xml regex + html::parse_attrib_string over the
// skin templates, so template syntax errors surface without a live install.

define('RCUBE_CHARSET', 'UTF-8');
require_once $argv[1] . '/vendor/roundcube/program/lib/Roundcube/html.php';

$root = $argv[1];
$templates = glob($root . '/skins/businessclass/templates/*.html');
$templates = array_merge($templates, glob($root . '/skins/businessclass/templates/includes/*.html'));
// Plugin template overrides (managesieve, …) go through the same parser.
$templates = array_merge($templates, glob($root . '/skins/businessclass/plugins/*/templates/*.html'));

$regexp = '/<roundcube:([-_a-z]+)\s+((?:[^>]|\\\\>)+)(?<!\\\\)>/Ui';
$fail = 0;

foreach ($templates as $file) {
    if (basename($file) === 'sprite.html') {
        continue; // generated icon sprite, no template tags
    }

    $src = file_get_contents($file);
    echo "\n=== " . str_replace($root . '/', '', $file) . " ===\n";

    // Every roundcube: tag must be matched by the engine's regex.
    preg_match_all('/<roundcube:([-_a-z]+)/', $src, $all);
    preg_match_all($regexp, $src, $matched, PREG_SET_ORDER);

    $selfClosing = 0;
    foreach ($all[1] as $t) {
        if (!in_array($t, ['else', 'endif'], true)) $selfClosing++;
    }

    printf("  tags present: %d   matched by engine regex: %d\n", count($all[1]), count($matched));

    if (count($all[1]) !== count($matched)) {
        echo "  !! UNMATCHED TAG — engine would emit it as literal text\n";
        $fail++;
    }

    foreach ($matched as $m) {
        $attrib = html::parse_attrib_string($m[2]);
        $cmd = strtolower($m[1]);

        // Surface the attributes that carry raw HTML, to confirm the entity
        // round-trip through DOMDocument produced real markup.
        if (isset($attrib['content'])) {
            $ok = strpos($attrib['content'], '<svg') === 0;
            printf("  %-9s content -> %s %s\n", $cmd, $ok ? 'OK' : 'BAD', substr($attrib['content'], 0, 52));
            if (!$ok) $fail++;
        }
        if ($cmd === 'object' || $cmd === 'include' || $cmd === 'label' || $cmd === 'var') {
            printf("  %-9s %s\n", $cmd, $attrib['name'] ?? ($attrib['file'] ?? '?'));
        }
    }
}

echo "\n" . ($fail ? "FAILURES: $fail\n" : "ALL TEMPLATES PARSE CLEAN\n");
exit($fail ? 1 : 0);
