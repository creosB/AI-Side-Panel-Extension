// Test harness: extracts the § PMEngine section from the bundle and evaluates it.
// Run with: node --test Source/modules/privacy-mask/engine.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function loadEngine() {
    const bundlePath = path.join(__dirname, 'privacy-mask-bundle.js');
    const source = fs.readFileSync(bundlePath, 'utf8');
    const startMarker = '// === § PMEngine START ===';
    const endMarker = '// === § PMEngine END ===';
    const startIdx = source.indexOf(startMarker);
    const endIdx = source.indexOf(endMarker);
    assert(startIdx !== -1, '§ PMEngine START marker not found');
    assert(endIdx !== -1, '§ PMEngine END marker not found');
    const engineSource = source.slice(startIdx + startMarker.length, endIdx);
    // Evaluate in a function scope, return PMEngine.
    const factory = new Function(engineSource + '\nreturn PMEngine;');
    return factory();
}

const PMEngine = loadEngine();

function freshTokenMap() {
    return { entries: new Map(), counters: {} };
}

test('PMEngine exposes TYPES', () => {
    assert.deepStrictEqual(PMEngine.TYPES, ['email', 'phone', 'card', 'iban', 'ipv4', 'ipv6', 'secret', 'nationalId']);
});

test('validateLuhn accepts valid Visa test card', () => {
    assert.strictEqual(PMEngine.validateLuhn('4111111111111111'), true);
});

test('validateLuhn rejects invalid card', () => {
    assert.strictEqual(PMEngine.validateLuhn('4111111111111112'), false);
});

test('validateLuhn accepts Amex (15 digits)', () => {
    assert.strictEqual(PMEngine.validateLuhn('378282246310005'), true);
});

test('validateLuhn rejects short input', () => {
    assert.strictEqual(PMEngine.validateLuhn('123'), false);
});

test('validateIBAN accepts valid Turkish IBAN (space-grouped, normalized)', () => {
    assert.strictEqual(PMEngine.validateIBAN('TR330006100519786457841326'), true);
});

test('validateIBAN accepts space-grouped input', () => {
    assert.strictEqual(PMEngine.validateIBAN('TR33 0006 1005 1978 6457 8413 26'), true);
});

test('validateIBAN rejects invalid checksum', () => {
    assert.strictEqual(PMEngine.validateIBAN('TR330006100519786457841327'), false);
});

test('validateIBAN accepts valid German IBAN', () => {
    assert.strictEqual(PMEngine.validateIBAN('DE89370400440532013000'), true);
});

test('validateTCKN accepts valid TCKN', () => {
    // Known-valid TCKN: 10000000146
    assert.strictEqual(PMEngine.validateTCKN('10000000146'), true);
});

test('validateTCKN rejects leading zero (mobile-number collision guard)', () => {
    assert.strictEqual(PMEngine.validateTCKN('05000000000'), false);
});

test('validateTCKN rejects wrong check digit', () => {
    assert.strictEqual(PMEngine.validateTCKN('10000000144'), false);
});

test('validateSSN accepts valid SSN', () => {
    assert.strictEqual(PMEngine.validateSSN('123-45-6789'), true);
});

test('validateSSN rejects area 666', () => {
    assert.strictEqual(PMEngine.validateSSN('666-12-3456'), false);
});

test('validateSSN rejects area 000', () => {
    assert.strictEqual(PMEngine.validateSSN('000-12-3456'), false);
});

test('validateSSN rejects group 00', () => {
    assert.strictEqual(PMEngine.validateSSN('123-00-6789'), false);
});

test('validateSSN rejects serial 0000', () => {
    assert.strictEqual(PMEngine.validateSSN('123-45-0000'), false);
});

test('validateSSN rejects area 900 (invalid range)', () => {
    assert.strictEqual(PMEngine.validateSSN('900-12-3456'), false);
});

test('validateIPv4 accepts valid address', () => {
    assert.strictEqual(PMEngine.validateIPv4('192.168.1.1'), true);
});

test('validateIPv4 rejects octet > 255', () => {
    assert.strictEqual(PMEngine.validateIPv4('256.1.1.1'), false);
});

test('validateIPv4 rejects 3-part (version number)', () => {
    assert.strictEqual(PMEngine.validateIPv4('1.2.3'), false);
});

test('validateIPv6 accepts full address', () => {
    assert.strictEqual(PMEngine.validateIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), true);
});

test('validateIPv6 accepts compressed ::', () => {
    assert.strictEqual(PMEngine.validateIPv6('2001:db8::8a2e:370:7334'), true);
});

test('validateIPv6 accepts loopback', () => {
    assert.strictEqual(PMEngine.validateIPv6('::1'), true);
});

test('validateIPv6 rejects time format (3 hextets, no ::)', () => {
    assert.strictEqual(PMEngine.validateIPv6('12:34:56'), false);
});

test('validateIPv6 rejects 5 hextets no compression', () => {
    assert.strictEqual(PMEngine.validateIPv6('1:2:3:4:5'), false);
});

test('validateIPv6 rejects hextet > 4 digits', () => {
    assert.strictEqual(PMEngine.validateIPv6('2001:0db8:12345::'), false);
});

test('computeNoMatchZones detects fenced code blocks', () => {
    const text = 'my email is a@b.com\n```\n4111 1111 1111 1111\n```\ndone';
    const zones = PMEngine.computeNoMatchZones(text);
    // The fenced region is between the backtick markers.
    assert.ok(zones.length >= 1, 'should detect at least one zone');
    const fencedZone = zones.find(z => z.source === 'fence');
    assert.ok(fencedZone, 'should have a fence-sourced zone');
    // The card number should be inside the fenced zone.
    const cardIdx = text.indexOf('4111');
    assert.ok(cardIdx >= fencedZone.start && cardIdx < fencedZone.end, 'card should be in fenced zone');
});

test('computeNoMatchZones detects URLs', () => {
    const text = 'visit https://192.168.1.1/admin now';
    const zones = PMEngine.computeNoMatchZones(text);
    const urlZone = zones.find(z => z.source === 'url');
    assert.ok(urlZone, 'should have a url-sourced zone');
    const ipIdx = text.indexOf('192.168.1.1');
    assert.ok(ipIdx >= urlZone.start && ipIdx < urlZone.end, 'IP should be in URL zone');
});

test('computeNoMatchZones returns empty for plain text', () => {
    const zones = PMEngine.computeNoMatchZones('just a normal message with a@b.com');
    assert.strictEqual(zones.length, 0);
});

test('detect finds email', () => {
    const matches = PMEngine.detect('contact jane@x.com please', new Set(['email']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].type, 'email');
    assert.strictEqual(matches[0].value, 'jane@x.com');
});

test('detect skips disabled types', () => {
    const matches = PMEngine.detect('jane@x.com 4111111111111111', new Set(['email']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].type, 'email');
});

test('detect finds valid card, rejects invalid', () => {
    // 4111111111111111 is Luhn-valid; 4111111111111112 is not.
    const matches = PMEngine.detect('card1: 4111111111111111 card2: 4111111111111112', new Set(['card']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].value.replace(/\s/g, ''), '4111111111111111');
});

test('detect excludes values inside code fences', () => {
    const text = '```\n4111111111111111\n```';
    const matches = PMEngine.detect(text, new Set(['card']));
    assert.strictEqual(matches.length, 0);
});

test('detect excludes values inside URLs', () => {
    const matches = PMEngine.detect('visit https://192.168.1.1/admin', new Set(['ipv4']));
    assert.strictEqual(matches.length, 0);
});

test('detect resolves overlap: card wins over phone', () => {
    // 16-digit card is also a valid phone digit-count. Card (longer) wins.
    const matches = PMEngine.detect('4111111111111111', new Set(['card', 'phone']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].type, 'card');
});

test('detect allows phone when card fails Luhn', () => {
    // 1234567890123 → 13 digits, fails Luhn. Phone digit count 13 → valid.
    const matches = PMEngine.detect('call 1234567890123', new Set(['card', 'phone']));
    const phoneMatch = matches.find(m => m.type === 'phone');
    assert.ok(phoneMatch, 'phone should claim the Luhn-failing number');
});

test('detect finds JWT via secret type', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const matches = PMEngine.detect(jwt, new Set(['secret']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].type, 'secret');
    // Must capture the FULL JWT, not just the header.
    assert.strictEqual(matches[0].value, jwt);
});

test('detect finds TCKN via nationalId subtype', () => {
    const matches = PMEngine.detect('tckn: 10000000146', new Set(['nationalId']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].type, 'nationalId');
    assert.strictEqual(matches[0].subtype, 'tr_tckn');
});

test('detect returns matches sorted by start position', () => {
    const text = 'a@b.com then 192.168.1.1';
    const matches = PMEngine.detect(text, new Set(['email', 'ipv4']));
    assert.ok(matches[0].start < matches[1].start);
});

test('mask replaces email with token', () => {
    const map = freshTokenMap();
    const { maskedText } = PMEngine.mask('contact jane@x.com', map, new Set(['email']));
    assert.strictEqual(maskedText, 'contact [EMAIL_1]');
});

test('mask mutates tokenMap in place', () => {
    const map = freshTokenMap();
    PMEngine.mask('contact jane@x.com', map, new Set(['email']));
    assert.strictEqual(map.entries.size, 1);
    assert.strictEqual(map.counters.email, 1);
});

test('mask reuses token for repeated value (same message)', () => {
    const map = freshTokenMap();
    const { maskedText, counts } = PMEngine.mask('jane@x.com and jane@x.com', map, new Set(['email']));
    assert.strictEqual(maskedText, '[EMAIL_1] and [EMAIL_1]');
    // counts = replacements made = 2 (both occurrences replaced), even though 1 distinct token.
    assert.strictEqual(counts.email, 2);
    assert.strictEqual(map.counters.email, 1); // distinct tokens = 1
});

test('mask assigns new token for different value', () => {
    const map = freshTokenMap();
    const { maskedText } = PMEngine.mask('jane@x.com bob@y.com', map, new Set(['email']));
    assert.strictEqual(maskedText, '[EMAIL_1] [EMAIL_2]');
});

test('mask reuses token across calls (stable mapping)', () => {
    const map = freshTokenMap();
    PMEngine.mask('jane@x.com', map, new Set(['email']));
    const { maskedText } = PMEngine.mask('reply to jane@x.com', map, new Set(['email']));
    assert.strictEqual(maskedText, 'reply to [EMAIL_1]');
});

test('mask dedups formatting variants (card with/without spaces)', () => {
    const map = freshTokenMap();
    PMEngine.mask('card: 4111 1111 1111 1111', map, new Set(['card']));
    const { maskedText } = PMEngine.mask('again: 4111111111111111', map, new Set(['card']));
    assert.strictEqual(maskedText, 'again: [CARD_1]');
});

test('mask returns newMappings for distinct new tokens only', () => {
    const map = freshTokenMap();
    const { newMappings } = PMEngine.mask('jane@x.com jane@x.com bob@y.com', map, new Set(['email']));
    assert.strictEqual(newMappings.length, 2); // jane + bob, not 3
});

test('mask counts = 0 when nothing matches', () => {
    const map = freshTokenMap();
    const { maskedText, counts } = PMEngine.mask('just plain text', map, new Set(['email']));
    assert.strictEqual(maskedText, 'just plain text');
    assert.strictEqual(counts.email, 0);
});

test('mask handles multiple types in one message', () => {
    const map = freshTokenMap();
    const text = 'email jane@x.com or call +905551234567';
    const { maskedText, counts } = PMEngine.mask(text, map, new Set(['email', 'phone']));
    assert.ok(maskedText.includes('[EMAIL_1]'));
    assert.ok(maskedText.includes('[PHONE_1]'));
    assert.strictEqual(counts.email, 1);
    assert.strictEqual(counts.phone, 1);
});

// === Custom-rule compiler tests ===

test('compileTemplate: literal-only pattern matches exact string', () => {
    const re = PMEngine.compileTemplate('Jane Doe');
    assert.strictEqual(re.test('Jane Doe'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('jane doe'), true);   // case-insensitive
    re.lastIndex = 0;
    assert.strictEqual(re.test('Jane Smith'), false);
});

test('compileTemplate: digit token # matches any digit', () => {
    const re = PMEngine.compileTemplate('ACME-######');
    assert.strictEqual(re.test('ACME-123456'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('ACME-987654'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('ACME-000001'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('ACME-12345'), false);  // too few digits
    re.lastIndex = 0;
    assert.strictEqual(re.test('ACME-1234567'), false); // too many
});

test('compileTemplate: letter token ? matches any letter', () => {
    const re = PMEngine.compileTemplate('EMP-???###');
    assert.strictEqual(re.test('EMP-ABC123'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('EMP-xyz789'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('EMP-123ABC'), false);  // digits where letters expected
});

test('compileTemplate: regex metacharacters are escaped, not live', () => {
    const re = PMEngine.compileTemplate('a.b*c');
    // Literal dots/stars must not act as wildcards.
    assert.strictEqual(re.test('a.b*c'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('aXbYc'), false);
    re.lastIndex = 0;
    assert.strictEqual(re.test('a.bbc'), false);
});

test('compileTemplate: returns global regex', () => {
    const re = PMEngine.compileTemplate('ABC###');
    assert.strictEqual(re.global, true);
    assert.strictEqual(re.ignoreCase, true);
});

test('compileTemplate: handles parentheses and brackets as literals', () => {
    const re = PMEngine.compileTemplate('ID-[###]');
    assert.strictEqual(re.test('ID-[123]'), true);
    re.lastIndex = 0;
    assert.strictEqual(re.test('ID-[123'), false);
    re.lastIndex = 0;
    assert.strictEqual(re.test('ID-123'), false);
});

// === Custom-rule validation tests ===

test('validateCustomRule: accepts literal-only pattern', () => {
    const r = PMEngine.validateCustomRule('Jane Doe');
    assert.strictEqual(r.ok, true);
});

test('validateCustomRule: accepts mixed literal+token pattern', () => {
    const r = PMEngine.validateCustomRule('ACME-######');
    assert.strictEqual(r.ok, true);
});

test('validateCustomRule: rejects empty pattern', () => {
    const r = PMEngine.validateCustomRule('');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /empty/i);
});

test('validateCustomRule: rejects whitespace-only pattern', () => {
    const r = PMEngine.validateCustomRule('   ');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /empty/i);
});

test('validateCustomRule: rejects tokens-only pattern (digits)', () => {
    const r = PMEngine.validateCustomRule('######');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /literal/i);
});

test('validateCustomRule: rejects tokens-only pattern (letters)', () => {
    const r = PMEngine.validateCustomRule('???');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /literal/i);
});

test('validateCustomRule: rejects tokens-only mixed pattern', () => {
    const r = PMEngine.validateCustomRule('#?#?');
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /literal/i);
});

test('validateCustomRule: rejects over-length pattern', () => {
    const r = PMEngine.validateCustomRule('A'.repeat(101));
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /100/i);
});

test('validateCustomRule: accepts pattern of exactly 100 chars', () => {
    const r = PMEngine.validateCustomRule('A'.repeat(100));
    assert.strictEqual(r.ok, true);
});

// === Custom-rule detection tests ===

const CUSTOM_RULES = [
    { id: 'r1', pattern: 'Jane Doe', label: 'NAME', enabled: true },
    { id: 'r2', pattern: 'ACME-######', label: 'TICKET', enabled: true },
];

test('detect: custom literal rule matches', () => {
    const matches = PMEngine.detect('Tell Jane Doe the plan', new Set(['custom']), CUSTOM_RULES);
    const m = matches.find(x => x.type === 'custom');
    assert.ok(m, 'expected a custom match');
    assert.strictEqual(m.value, 'Jane Doe');
    assert.strictEqual(m.subtype, 'r1');
    assert.strictEqual(m.label, 'NAME');
});

test('detect: custom literal rule is case-insensitive', () => {
    const matches = PMEngine.detect('tell jane doe the plan', new Set(['custom']), CUSTOM_RULES);
    const m = matches.find(x => x.type === 'custom');
    assert.ok(m);
    assert.strictEqual(m.value.toLowerCase(), 'jane doe');
});

test('detect: custom format rule matches variations', () => {
    const matches = PMEngine.detect('see ACME-123456 and ACME-987654', new Set(['custom']), CUSTOM_RULES);
    const customs = matches.filter(x => x.type === 'custom' && x.subtype === 'r2');
    assert.strictEqual(customs.length, 2);
});

test('detect: custom rule does not match inside code fence', () => {
    const text = '```Jane Doe```';
    const matches = PMEngine.detect(text, new Set(['custom']), CUSTOM_RULES);
    assert.strictEqual(matches.length, 0);
});

test('detect: custom rule boundary check rejects mid-token match', () => {
    // "XJane DoeY" — alnum chars touch both sides, must not match.
    const matches = PMEngine.detect('XJane DoeY', new Set(['custom']), CUSTOM_RULES);
    assert.strictEqual(matches.length, 0);
});

test('detect: custom at tier 4 beats nationalId at tier 3 on overlap', () => {
    // A 6-digit run could look like part of a national ID; custom must win.
    const rules = [{ id: 'rx', pattern: 'ID-######', label: 'X', enabled: true }];
    const matches = PMEngine.detect('ID-123456', new Set(['custom', 'nationalId', 'tr_tckn']), rules);
    const custom = matches.find(x => x.type === 'custom');
    assert.ok(custom, 'custom must survive overlap resolution');
    const national = matches.find(x => x.type === 'nationalId');
    assert.strictEqual(national, undefined, 'nationalId must be dropped on overlap');
});

test('detect: disabled custom rule produces no matches', () => {
    const rules = [{ id: 'r1', pattern: 'Jane Doe', label: 'NAME', enabled: false }];
    const matches = PMEngine.detect('Tell Jane Doe the plan', new Set(['custom']), rules);
    assert.strictEqual(matches.length, 0);
});

test('detect: backward-compatible without customRules arg (no custom matches)', () => {
    // Existing signature: detect(text, enabledTypes) still works.
    const matches = PMEngine.detect('contact jane@x.com', new Set(['email']));
    assert.ok(matches.length > 0);
    assert.strictEqual(matches.every(x => x.type !== 'custom'), true);
});

test('detect: custom match cap limits to 200 matches per scan', () => {
    // 201 occurrences of a 1-char-literal pattern; only 200 should match.
    const text = 'x '.repeat(201).trim(); // "x x x ... x" (201 x's separated by spaces)
    const rules = [{ id: 'r1', pattern: 'x', label: 'X', enabled: true }];
    const matches = PMEngine.detect(text, new Set(['custom']), rules);
    assert.strictEqual(matches.length, 200);
});

// === Custom-rule token/mask tests ===

test('mask: custom rule produces labeled token', () => {
    const rules = [{ id: 'r1', pattern: 'Jane Doe', label: 'NAME', enabled: true }];
    const map = freshTokenMap();
    const { maskedText, newMappings } = PMEngine.mask('Hi Jane Doe', map, new Set(['custom']), rules);
    assert.strictEqual(maskedText, 'Hi [NAME_1]');
    assert.strictEqual(newMappings[0].token, '[NAME_1]');
    assert.strictEqual(newMappings[0].value, 'Jane Doe');
    assert.strictEqual(newMappings[0].type, 'custom');
});

test('mask: custom rule with format pattern numbers independently', () => {
    const rules = [
        { id: 'r1', pattern: 'Jane Doe', label: 'NAME', enabled: true },
        { id: 'r2', pattern: 'ACME-######', label: 'TICKET', enabled: true },
    ];
    const map = freshTokenMap();
    const { maskedText } = PMEngine.mask('Jane Doe filed ACME-123456 and ACME-987654', map, new Set(['custom']), rules);
    assert.strictEqual(maskedText, '[NAME_1] filed [TICKET_1] and [TICKET_2]');
});

test('mask: custom label is sanitized (lowercase + symbols stripped)', () => {
    const rules = [{ id: 'r1', pattern: 'Jane Doe', label: 'my-name!', enabled: true }];
    const map = freshTokenMap();
    const { maskedText } = PMEngine.mask('Hi Jane Doe', map, new Set(['custom']), rules);
    assert.strictEqual(maskedText, 'Hi [MYNAME_1]');
});

test('mask: same custom value reuses token (dedup)', () => {
    const rules = [{ id: 'r1', pattern: 'Jane Doe', label: 'NAME', enabled: true }];
    const map = freshTokenMap();
    const { maskedText } = PMEngine.mask('Jane Doe and Jane Doe', map, new Set(['custom']), rules);
    assert.strictEqual(maskedText, '[NAME_1] and [NAME_1]');
});

test('mask: counts include custom type at 0 when enabled but no match', () => {
    const rules = [{ id: 'r1', pattern: 'Jane Doe', label: 'NAME', enabled: true }];
    const map = freshTokenMap();
    const { counts } = PMEngine.mask('nothing here', map, new Set(['custom']), rules);
    assert.strictEqual(counts['custom'], 0);
});

test('mask: backward-compatible without customRules arg', () => {
    // Existing 3-arg call still works.
    const map = freshTokenMap();
    const { maskedText } = PMEngine.mask('contact jane@x.com', map, new Set(['email']));
    assert.strictEqual(maskedText, 'contact [EMAIL_1]');
});
