<?php

/**
 * BusinessClass skin — message list preview text ("snippets").
 *
 * The design's comfortable message row has a third line of preview text
 * (BUILD.md §3.5). Roundcube has no such data: rows are built client-side by
 * rcube_webmail.add_message_row() from message headers only, and no core column
 * carries body text. This plugin supplies it.
 *
 * How it travels to the browser
 * -----------------------------
 * The 'messages_list' hook runs inside rcmail_action_mail_index::js_message_list(),
 * for both the initial page render and every AJAX list refresh. A header's
 * ->list_flags is merged into the per-row flags array, and add_message_row()
 * stores flags.extra_flags at rcmail.env.messages[uid].flags — so setting
 *     $header->list_flags['extra_flags']['snippet']
 * makes the text readable in ui.js as row.flags.snippet on the 'insertrow'
 * event. 'extra_flags' is unused by core (app.js:2224 is its only reference),
 * so nothing is clobbered. The value is injected with textContent, never HTML.
 *
 * Cost
 * ----
 * Two IMAP round trips per message that has never been seen (BODYSTRUCTURE, then
 * a truncated part fetch), after which the snippet is cached per folder for 30
 * days. Fetches are capped per request, so a jump to a 10 000-message folder
 * costs one page of fetches, not ten thousand. On the target deployment (cPanel,
 * Dovecot on localhost) a full page of new messages costs a few tens of ms.
 *
 * Requires no configuration. Disabling the plugin simply removes line 3.
 *
 * @license GPL-3.0
 */
class businessclass_preview extends rcube_plugin
{
    public $task = 'mail';

    /** Bytes fetched from the text part. Truncated UTF-8 is repaired below. */
    private const MAX_BYTES = 2048;

    /** Visible snippet length, in characters. */
    private const SNIPPET_LEN = 160;

    /** Hard cap on IMAP fetches per request, so a cold folder cannot stall it. */
    private const MAX_FETCH = 60;

    /** Snippets kept per folder before the oldest are dropped. */
    private const MAX_CACHED = 2000;

    private const CACHE_TTL = '30d';

    /** @var rcube_cache|null */
    private $cache;

    public function init()
    {
        $this->add_hook('messages_list', [$this, 'messages_list']);
    }

    /**
     * Attach a snippet to every listed message.
     *
     * @param array $args {messages: rcube_message_header[], cols: string[]}
     *
     * @return array
     */
    public function messages_list($args)
    {
        if (empty($args['messages']) || !is_array($args['messages'])) {
            return $args;
        }

        $rcmail  = rcmail::get_instance();
        $storage = $rcmail->get_storage();

        if (!$storage) {
            return $args;
        }

        // A multi-folder search returns headers from several folders at once.
        $by_folder = [];
        foreach ($args['messages'] as $header) {
            if (!empty($header->uid)) {
                $folder = strlen((string) $header->folder) ? $header->folder : $storage->get_folder();
                $by_folder[$folder][] = $header;
            }
        }

        // get_message_part() reads $this->folder, so the folder is switched per
        // group and restored afterwards.
        $restore = $storage->get_folder();
        $budget  = self::MAX_FETCH;

        foreach ($by_folder as $folder => $headers) {
            $budget = $this->annotate_folder($storage, $folder, $headers, $budget);
        }

        if ($restore !== $storage->get_folder()) {
            $storage->set_folder($restore);
        }

        return $args;
    }

    /**
     * Fill in snippets for one folder's headers, reading and writing one cache
     * entry for the whole folder rather than one per message.
     *
     * @return int Remaining fetch budget
     */
    private function annotate_folder($storage, $folder, $headers, $budget)
    {
        $key = $this->cache_key($storage, $folder);
        $map = $key ? (array) $this->cache()->get($key) : [];
        $new = false;

        foreach ($headers as $header) {
            $uid = (string) $header->uid;

            if (!array_key_exists($uid, $map)) {
                if ($budget <= 0) {
                    continue;
                }

                if ($storage->get_folder() !== $folder) {
                    $storage->set_folder($folder);
                }

                $budget--;
                $map[$uid] = $this->build_snippet($storage, $header->uid);
                $new       = true;
            }

            if ($map[$uid] !== '') {
                // list_flags is merged into the row's flags; extra_flags is the
                // only key add_message_row() carries through to env.messages.
                $extra = $header->list_flags['extra_flags'] ?? [];
                $extra['snippet'] = $map[$uid];

                $header->list_flags['extra_flags'] = $extra;
            }
        }

        if ($new && $key) {
            if (count($map) > self::MAX_CACHED) {
                $map = array_slice($map, -self::MAX_CACHED, null, true);
            }

            $this->cache()->set($key, $map);
        }

        return $budget;
    }

    /**
     * Fetch and condense the first text part of one message.
     *
     * Returns '' for anything with no readable text part; '' is cached too, so a
     * message is never re-fetched just because it had nothing to show.
     */
    private function build_snippet($storage, $uid)
    {
        try {
            $message = $storage->get_message($uid);

            if (!$message || empty($message->structure)) {
                return '';
            }

            $part = $this->find_text_part($message->structure);

            if (!$part) {
                return '';
            }

            $body = $storage->get_message_part(
                $uid, $part->mime_id, $part,
                null,   // print
                null,   // fp
                false,  // convert charset to UTF-8
                self::MAX_BYTES,
                false   // no line wrapping
            );
        }
        catch (Exception $e) {
            // A snippet is never worth failing the message list over.
            rcube::raise_error($e, true, false);
            return '';
        }

        if (!is_string($body) || $body === '') {
            return '';
        }

        return $this->condense($body, $part->mimetype === 'text/html');
    }

    /**
     * First displayable text part, preferring text/plain over text/html.
     * Attachments are skipped so a .txt attachment never becomes the preview.
     */
    private function find_text_part($part, $depth = 0)
    {
        if ($depth > 8) {
            return null;
        }

        $html = null;
        $queue = !empty($part->parts) && is_array($part->parts) ? $part->parts : [$part];

        foreach ($queue as $child) {
            if (!empty($child->disposition) && strtolower($child->disposition) === 'attachment') {
                continue;
            }

            if (!empty($child->parts)) {
                if ($found = $this->find_text_part($child, $depth + 1)) {
                    if ($found->mimetype === 'text/plain') {
                        return $found;
                    }
                    $html = $html ?: $found;
                }
                continue;
            }

            if ($child->mimetype === 'text/plain') {
                return $child;
            }

            if ($child->mimetype === 'text/html' && !$html) {
                $html = $child;
            }
        }

        return $html;
    }

    /** Collapse a body fragment into one line of plain text. */
    private function condense($body, $is_html)
    {
        // The fetch is cut at a byte boundary, so the tail may be a partial
        // multi-byte sequence or a half-open tag.
        $body = rcube_charset::clean($body);

        if ($is_html) {
            $body = preg_replace('#<(script|style|head)\b[^>]*>.*?</\1>#is', ' ', $body);
            $body = preg_replace('#<(script|style|head)\b.*$#is', ' ', $body);
            $body = preg_replace('/<[^>]*>?/', ' ', $body);
            $body = html_entity_decode($body, ENT_QUOTES | ENT_HTML5, RCUBE_CHARSET);
        }

        // Drop quoted replies and the usual separators, which say nothing about
        // this message.
        $keep = [];
        foreach (preg_split('/\R/', $body) as $line) {
            $line = trim($line);

            if ($line === '' || $line[0] === '>') {
                continue;
            }
            if (preg_match('/^(--\s*$|-{4,}|_{4,}|={4,})/', $line)) {
                break;
            }

            $keep[] = $line;
        }

        $text = preg_replace('/[\s\x{00A0}\x{200B}]+/u', ' ', implode(' ', $keep));
        $text = trim((string) $text);

        if ($text === '') {
            return '';
        }

        if (mb_strlen($text) > self::SNIPPET_LEN) {
            $text = rtrim(mb_substr($text, 0, self::SNIPPET_LEN)) . '…';
        }

        return $text;
    }

    /**
     * Cache key for a folder. UIDVALIDITY is part of it because UIDs are only
     * unique within one validity generation — without it, a recreated folder
     * would serve the previous folder's snippets.
     */
    private function cache_key($storage, $folder)
    {
        $data = $storage->folder_data($folder);

        if (empty($data['UIDVALIDITY'])) {
            return null;
        }

        return 'f' . md5($folder) . '_' . $data['UIDVALIDITY'];
    }

    private function cache()
    {
        if (!$this->cache) {
            $this->cache = rcmail::get_instance()->get_cache('businessclass_preview', 'db', self::CACHE_TTL);
        }

        return $this->cache;
    }
}
