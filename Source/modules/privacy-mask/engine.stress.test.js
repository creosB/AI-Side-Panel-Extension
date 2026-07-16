// Stress test: hardens PMEngine against messy real-world input.
// Pure-engine, node:test, no browser.
// Run with: node --test Source/modules/privacy-mask/engine.stress.test.js
//
// Scope: volume, adversarial validator input, overlap/boundaries, skip zones,
// stability (counts vs newMappings vs counters), unicode/i18n, idempotency.
//
// NOTE: a few tests are explicitly marked "[KNOWN BUG]" and assert the CORRECT
// behavior. They are expected to FAIL against the current engine — their
// failure documents a real defect, not a test error. Do not weaken them to
// force green; flag the engine bug instead. See the stress report.

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
    const factory = new Function(engineSource + '\nreturn PMEngine;');
    return factory();
}

const PMEngine = loadEngine();
const ALL = new Set(['email', 'phone', 'card', 'iban', 'ipv4', 'ipv6', 'secret', 'nationalId']);
const fresh = () => ({ entries: new Map(), counters: {} });

// ---- helpers ---------------------------------------------------------------

function maskOnce(text, types = ALL) {
    return PMEngine.mask(text, fresh(), types);
}

// Build a >50k-char corpus with hundreds of mixed, cleanly-separated PII values.
// Each PII sits on its own "label: value" line so values never abut each other.
function buildVolumeCorpus(targetLen) {
    const emails = ['a@b.com', 'jane@x.com', 'bob@y.com', 'ceo@corp.io', 'dev@team.co'];
    const cards = ['4111111111111111', '5555555555554444', '4012888888881881', '5105105105105100'];
    const phones = ['+905551234567', '+12125550123', '+442071838750', '+61396520000'];
    const ibans = ['TR330006100519786457841326', 'DE89370400440532013000'];
    const tckns = ['10000000146', '34175629018']; // both genuinely valid TCKN
    const lines = [];
    let i = 0;
    while (lines.join('\n').length < targetLen) {
        lines.push('email ' + emails[i % emails.length]);
        lines.push('card ' + cards[i % cards.length]);
        lines.push('call ' + phones[i % phones.length]);
        lines.push('iban ' + ibans[i % ibans.length]);
        lines.push('tckn ' + tckns[i % tckns.length]);
        i++;
    }
    return lines.join('\n');
}

// ============================================================================
// 1. VOLUME — 50k+ chars, hundreds of mixed PII, fast, no leak, no backtracking
// ============================================================================

test('VOLUME: 50k+ chars masks all PII, stays correct, completes fast', () => {
    const corpus = buildVolumeCorpus(52000);
    assert.ok(corpus.length > 50000, 'corpus must exceed 50k chars (got ' + corpus.length + ')');

    const map = fresh();
    const t0 = process.hrtime.bigint();
    const res = PMEngine.mask(corpus, map, ALL);
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

    // Rough time guard: ~100x the observed ~16ms. Catches catastrophic backtracking.
    assert.ok(elapsedMs < 2000, 'masking 50k chars took ' + elapsedMs.toFixed(1) + 'ms (expected <2000)');

    // Nothing leaked: no raw email/card/phone/iban/tckn may remain in output.
    const leaked = [];
    for (const v of ['a@b.com', 'jane@x.com', 'bob@y.com', 'ceo@corp.io', 'dev@team.co']) {
        if (res.maskedText.toLowerCase().includes(v)) { leaked.push('email:' + v); }
    }
    for (const v of ['4111111111111111', '5555555555554444', '4012888888881881', '5105105105105100']) {
        if (res.maskedText.includes(v)) { leaked.push('card:' + v); }
    }
    for (const v of ['+905551234567', '+12125550123', '+442071838750', '+61396520000']) {
        if (res.maskedText.includes(v)) { leaked.push('phone:' + v); }
    }
    for (const v of ['TR330006100519786457841326', 'DE89370400440532013000']) {
        if (res.maskedText.includes(v)) { leaked.push('iban:' + v); }
    }
    for (const v of ['10000000146', '34175629018']) {
        if (res.maskedText.includes(v)) { leaked.push('tckn:' + v); }
    }
    assert.deepStrictEqual(leaked, [], 'raw PII leaked into masked output');

    // Masking actually fired (counts > 0 across the active types).
    assert.ok(res.counts.email > 0 && res.counts.card > 0 && res.counts.iban > 0,
        'volume corpus must trigger masking; counts=' + JSON.stringify(res.counts));
});

test('VOLUME: no catastrophic backtracking on long digit runs', () => {
    // A pathological string: a 40k-char digit run. Must return quickly, not hang.
    const digits = 'x ' + '1'.repeat(40000) + ' y';
    const t0 = process.hrtime.bigint();
    const res = PMEngine.mask(digits, fresh(), ALL);
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(elapsedMs < 2000, 'long digit run took ' + elapsedMs.toFixed(1) + 'ms (expected <2000)');
    // 40k digits is not a valid card (Luhn) / phone (>15 digits) / iban / nationalId → left intact.
    assert.ok(res.maskedText.includes('1'.repeat(40000)), 'long digit run should be left intact');
});

// ============================================================================
// 2. ADVERSARIAL — validators must reject near-misses, accept true positives
// ============================================================================

test('ADVERSARIAL: near-miss card (fail Luhn) is not masked', () => {
    // 4111111111111112 — one digit off, fails Luhn.
    const { maskedText, counts } = maskOnce('card 4111111111111112');
    assert.strictEqual(maskedText, 'card 4111111111111112');
    assert.strictEqual(counts.card, 0);
});

test('ADVERSARIAL: valid card IS masked', () => {
    const { maskedText, counts } = maskOnce('card 4111111111111111');
    assert.ok(maskedText.includes('[CARD_1]'));
    assert.strictEqual(counts.card, 1);
});

test('ADVERSARIAL: near-miss IBAN (fail mod-97) leaves full IBAN intact [KNOWN BUG]', () => {
    // TR330006100519786457841327 fails mod-97. Correct behavior: the whole
    // token is left untouched (no IBAN mask). What the engine ACTUALLY does:
    // the card regex scavenges 13 trailing digits, producing the corrupt
    // "TR[CARD_1]41327". This test asserts the correct behavior and FAILS.
    const { maskedText } = maskOnce('iban TR330006100519786457841327');
    assert.strictEqual(maskedText, 'iban TR330006100519786457841327');
});

test('ADVERSARIAL: valid IBAN IS masked as IBAN (not scavenged by card)', () => {
    const { maskedText, counts } = maskOnce('iban TR330006100519786457841326');
    assert.ok(maskedText.includes('[IBAN_1]'));
    assert.strictEqual(counts.iban, 1);
    assert.strictEqual(counts.card, 0);
});

test('ADVERSARIAL: 11-digit number that is NOT a valid TCKN is not reported as nationalId', () => {
    // 12345678901 — 11 digits but fails TCKN check-digit. TCKN validator rejects.
    const matches = PMEngine.detect('id 12345678901', ALL);
    const asTckn = matches.filter(m => m.type === 'nationalId' && m.subtype === 'tr_tckn');
    assert.strictEqual(asTckn.length, 0, 'invalid TCKN must not be detected as nationalId');
});

test('ADVERSARIAL: 11-digit number that IS a valid TCKN is detected as nationalId, not phone [KNOWN BUG]', () => {
    // 10000000146 — valid TCKN (leading digit non-zero, check digits pass).
    // Correct: with both phone and nationalId enabled, TCKN should win.
    // What the engine ACTUALLY does: phone claims the 11-digit run first,
    // so nationalId is shadowed whenever phone is enabled. This test asserts
    // the correct behavior and FAILS.
    const matches = PMEngine.detect('id 10000000146', new Set(['phone', 'nationalId']));
    const tckn = matches.find(m => m.type === 'nationalId');
    assert.ok(tckn, 'valid TCKN must be detected as nationalId even when phone is enabled');
});

test('ADVERSARIAL: TR mobile (leading 0) masked as phone, not TCKN', () => {
    // +90 555 123 45 67 — a real formatted Turkish mobile. TCKN validator would
    // reject it anyway (leading-zero rule is the load-bearing disambiguator), but
    // with a phone signal present it must be masked as phone, never nationalId.
    const { maskedText, counts } = maskOnce('call +90 555 123 45 67');
    assert.ok(maskedText.includes('[PHONE_1]'));
    assert.strictEqual(counts.phone, 1);
    assert.strictEqual(counts.nationalId, 0);
});

test('ADVERSARIAL: bare 11-digit run (order number) is NOT masked as phone', () => {
    // 10000000147 — plain 11 digits, no +, no separators. Not a phone; not a
    // valid TCKN either. Must be left untouched (phone matcher no longer greedy).
    const { maskedText, counts } = maskOnce('order 10000000147 shipped');
    assert.strictEqual(maskedText, 'order 10000000147 shipped');
    assert.strictEqual(counts.phone, 0);
});

test('ADVERSARIAL: whitespace-spanned number groups are NOT one phone', () => {
    // "2024 2025 2026" — three separate years. The old phone regex spanned the
    // spaces ([\d\s\-()]) and treated them as one 12-digit phone. Must stay raw.
    const { maskedText, counts } = maskOnce('years 2024 2025 2026 data');
    assert.strictEqual(maskedText, 'years 2024 2025 2026 data');
    assert.strictEqual(counts.phone, 0);
});

test('ADVERSARIAL: long digit runs (25, 30 digits) are not masked as anything', () => {
    for (const n of [25, 30]) {
        const run = '7'.repeat(n);
        const { maskedText } = maskOnce('x ' + run + ' y');
        assert.ok(maskedText.includes(run), n + '-digit run should be left intact');
    }
});

// ============================================================================
// 3. OVERLAP & BOUNDARIES
// ============================================================================

test('BOUNDARY: back-to-back card + email both masked', () => {
    const { maskedText, counts } = maskOnce('4111111111111111 jane@x.com');
    assert.strictEqual(maskedText, '[CARD_1] [EMAIL_1]');
    assert.strictEqual(counts.card, 1);
    assert.strictEqual(counts.email, 1);
});

test('BOUNDARY: PII glued to punctuation is masked', () => {
    const { maskedText } = maskOnce('contact(jane@x.com)!');
    assert.strictEqual(maskedText, 'contact([EMAIL_1])!');
});

test('BOUNDARY: value at very start of string', () => {
    const { maskedText } = maskOnce('4111111111111111 done');
    assert.strictEqual(maskedText, '[CARD_1] done');
});

test('BOUNDARY: value at very end of string', () => {
    const { maskedText } = maskOnce('done 4111111111111111');
    assert.strictEqual(maskedText, 'done [CARD_1]');
});

test('BOUNDARY: two emails touching (comma-separated) both masked', () => {
    const { maskedText, counts } = maskOnce('a@b.com,c@d.com');
    assert.strictEqual(maskedText, '[EMAIL_1],[EMAIL_2]');
    assert.strictEqual(counts.email, 2);
});

test('OVERLAP: 16-digit card wins over phone (longest valid wins)', () => {
    const matches = PMEngine.detect('4111111111111111', new Set(['card', 'phone']));
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].type, 'card');
});

test('OVERLAP: bare Luhn-failing 13-digit run is not masked (no phone signal)', () => {
    // 1234567890123 — 13 digits, fails Luhn AND has no phone signal. Previously
    // the over-greedy phone matcher claimed it; now correctly left alone.
    const matches = PMEngine.detect('call 1234567890123', new Set(['card', 'phone']));
    assert.strictEqual(matches.length, 0);
});

// ============================================================================
// 4. SKIP ZONES — PII inside code fences / URLs stays unmasked
// ============================================================================

test('SKIP: PII inside triple-backtick code fence stays unmasked', () => {
    const text = 'hi\n```\n4111111111111111\n```\nbye';
    const { maskedText, counts } = maskOnce(text);
    assert.strictEqual(maskedText, text);
    assert.strictEqual(counts.card, 0);
});

test('SKIP: PII inside http(s):// URL stays unmasked', () => {
    const text = 'see https://192.168.1.1/admin and jane@x.com';
    const { maskedText, counts } = maskOnce(text);
    // IP inside URL untouched; email outside URL masked.
    assert.ok(maskedText.includes('https://192.168.1.1/admin'));
    assert.ok(maskedText.includes('[EMAIL_1]'));
    assert.strictEqual(counts.ipv4, 0);
    assert.strictEqual(counts.email, 1);
});

test('SKIP: email embedded in a URL path stays unmasked', () => {
    const text = 'see https://example.com/jane@x.com/path';
    const { maskedText, counts } = maskOnce(text);
    assert.strictEqual(maskedText, text);
    assert.strictEqual(counts.email, 0);
});

test('SKIP: unbalanced fence (single ```) does not crash — outside PII still masked', () => {
    // One ``` is not a closed fence → no skip zone. Card after it gets masked.
    // The pass must not break.
    const text = 'hi\n```\n4111111111111111\nbye';
    const { maskedText, counts } = maskOnce(text);
    assert.doesNotThrow(() => maskOnce(text));
    assert.strictEqual(counts.card, 1);
    assert.ok(maskedText.includes('[CARD_1]'));
});

test('SKIP: multiple sequential fenced blocks all skipped', () => {
    const text = 'a\n```\nx\n```\nb\n```\n4111111111111111\n```\nc';
    const { maskedText, counts } = maskOnce(text);
    assert.strictEqual(maskedText, text);
    assert.strictEqual(counts.card, 0);
});

test('SKIP: PII outside a fence is still masked', () => {
    const text = '4111111111111111\n```\ncode\n```';
    const { maskedText, counts } = maskOnce(text);
    assert.ok(maskedText.startsWith('[CARD_1]'));
    assert.strictEqual(counts.card, 1);
});

// ============================================================================
// 5. STABILITY — token reuse, counts vs newMappings vs counters
// ============================================================================

test('STABILITY: same value repeated many times reuses ONE token', () => {
    const map = fresh();
    const text = Array(50).fill('jane@x.com').join(' and ');
    const { maskedText, counts, newMappings } = PMEngine.mask(text, map, ALL);
    // All 50 occurrences → same token.
    const occurrences = (maskedText.match(/\[EMAIL_1\]/g) || []).length;
    assert.strictEqual(occurrences, 50);
    assert.strictEqual(counts.email, 50);          // replacements made = 50
    assert.strictEqual(newMappings.length, 1);      // distinct new tokens = 1
    assert.strictEqual(map.counters.email, 1);      // distinct tokens total = 1
    assert.strictEqual(map.entries.size, 1);
});

test('STABILITY: counts (replacements) vs newMappings (distinct) vs counters (total) diverge correctly', () => {
    const map = fresh();
    // msg1: jane x2 + bob x1 → counts.email=3, newMappings=2, counters.email=2
    const r1 = PMEngine.mask('jane@x.com jane@x.com bob@y.com', map, ALL);
    assert.strictEqual(r1.counts.email, 3);
    assert.strictEqual(r1.newMappings.length, 2);
    assert.strictEqual(map.counters.email, 2);
    // msg2: jane x1 (reuse) + cara x1 (new) → counts.email=2, newMappings=1, counters.email=3
    const r2 = PMEngine.mask('jane@x.com cara@z.com', map, ALL);
    assert.strictEqual(r2.counts.email, 2);
    assert.strictEqual(r2.newMappings.length, 1);
    assert.strictEqual(map.counters.email, 3);
});

test('STABILITY: counters never drift across repeated calls with same values', () => {
    const map = fresh();
    for (let i = 0; i < 10; i++) {
        PMEngine.mask('jane@x.com 4111111111111111', map, ALL);
    }
    // Same two values, 10 calls → still exactly 2 distinct tokens.
    assert.strictEqual(map.counters.email, 1);
    assert.strictEqual(map.counters.card, 1);
    assert.strictEqual(map.entries.size, 2);
});

test('STABILITY: card formatting variants dedup to one token', () => {
    const map = fresh();
    PMEngine.mask('card: 4111 1111 1111 1111', map, ALL);
    const { maskedText } = PMEngine.mask('again: 4111111111111111', map, ALL);
    assert.strictEqual(maskedText, 'again: [CARD_1]');
    assert.strictEqual(map.counters.card, 1);
});

// ============================================================================
// 6. UNICODE / I18N — CJK, Turkish, emoji don't corrupt offsets or write-back
// ============================================================================

test('I18N: CJK characters around email do not corrupt masking', () => {
    const { maskedText } = maskOnce('邮箱 jane@x.com 谢谢');
    assert.strictEqual(maskedText, '邮箱 [EMAIL_1] 谢谢');
});

test('I18N: Turkish characters around email do not corrupt masking', () => {
    const { maskedText } = maskOnce('e-posta jane@x.com İstanbul');
    assert.strictEqual(maskedText, 'e-posta [EMAIL_1] İstanbul');
});

test('I18N: emoji around card do not corrupt offsets', () => {
    const { maskedText } = maskOnce('🚀 4111111111111111 🎉');
    assert.strictEqual(maskedText, '🚀 [CARD_1] 🎉');
});

test('I18N: mixed multibyte + ASCII boundary, multiple values, correct splice', () => {
    const text = '名前 Jane <jane@x.com> 電話 +905551234567';
    const { maskedText, counts } = maskOnce(text);
    assert.ok(maskedText.includes('[EMAIL_1]'), 'email masked: ' + maskedText);
    assert.ok(maskedText.includes('[PHONE_1]'), 'phone masked: ' + maskedText);
    assert.strictEqual(counts.email, 1);
    assert.strictEqual(counts.phone, 1);
    // No leftover raw PII.
    assert.ok(!maskedText.includes('jane@x.com'));
    assert.ok(!maskedText.includes('+905551234567'));
});

// ============================================================================
// 7. IDEMPOTENCY — running mask twice does not double-tokenize
// ============================================================================

test('IDEMPOTENCY: masking the masked output adds no new tokens', () => {
    const map = fresh();
    const r1 = PMEngine.mask('jane@x.com and card 4111111111111111', map, ALL);
    const beforeSize = map.entries.size;
    const r2 = PMEngine.mask(r1.maskedText, map, ALL);
    assert.strictEqual(r2.maskedText, r1.maskedText, 'second mask must not alter already-masked text');
    assert.strictEqual(r2.newMappings.length, 0, 'second mask must add zero new mappings');
    assert.strictEqual(map.entries.size, beforeSize, 'token map must not grow');
    // All per-type counts zero on the second pass.
    const sum2 = Object.values(r2.counts).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum2, 0);
});

test('IDEMPOTENCY: tokens like [EMAIL_1] are not re-scanned as PII', () => {
    const map = fresh();
    const text = '[EMAIL_1] literal text';
    const r = PMEngine.mask(text, map, ALL);
    assert.strictEqual(r.maskedText, text);
    assert.strictEqual(r.newMappings.length, 0);
});

// ============================================================================
// 8. ADVERSARIAL — NEW NATIONAL IDS (VALID + NEAR-MISS)
// ============================================================================

test('ADVERSARIAL: UK NINO validation and masking', () => {
    // Valid NINO
    const { maskedText: validMasked, counts: validCounts } = PMEngine.mask('nino AB123456A', fresh(), new Set(['nationalId', 'uk_nino']));
    assert.ok(validMasked.includes('[NATIONALID_1]'), 'valid UK NINO must be masked');
    assert.strictEqual(validCounts.nationalId, 1);

    // Near-miss NINO (invalid prefixes)
    const { maskedText: missMasked1 } = PMEngine.mask('nino DF123456A', fresh(), new Set(['nationalId', 'uk_nino']));
    assert.strictEqual(missMasked1, 'nino DF123456A', 'invalid prefix NINO must not be masked');

    const { maskedText: missMasked2 } = PMEngine.mask('nino BG123456A', fresh(), new Set(['nationalId', 'uk_nino']));
    assert.strictEqual(missMasked2, 'nino BG123456A', 'invalid prefix NINO must not be masked');
});

test('ADVERSARIAL: Germany Steuer-ID validation and masking', () => {
    // Valid Steuer-ID
    const { maskedText: validMasked, counts: validCounts } = PMEngine.mask('tax 86095742719', fresh(), new Set(['nationalId', 'de_steuerid']));
    assert.ok(validMasked.includes('[NATIONALID_1]'), 'valid Germany Steuer-ID must be masked');
    assert.strictEqual(validCounts.nationalId, 1);

    // Near-miss: wrong check digit
    const { maskedText: missMasked1 } = PMEngine.mask('tax 86095742718', fresh(), new Set(['nationalId', 'de_steuerid']));
    assert.strictEqual(missMasked1, 'tax 86095742718', 'Steuer-ID with invalid checksum must not be masked');

    // Near-miss: invalid digit repetition
    const { maskedText: missMasked2 } = PMEngine.mask('tax 86095742779', fresh(), new Set(['nationalId', 'de_steuerid']));
    assert.strictEqual(missMasked2, 'tax 86095742779', 'Steuer-ID with invalid digit repetition must not be masked');
});

test('ADVERSARIAL: France INSEE/NIR validation and masking', () => {
    // Valid INSEE NIR
    const { maskedText: validMasked1, counts: validCounts1 } = PMEngine.mask('insee 288057500000045', fresh(), new Set(['nationalId', 'fr_insee']));
    assert.ok(validMasked1.includes('[NATIONALID_1]'), 'valid INSEE must be masked');
    assert.strictEqual(validCounts1.nationalId, 1);

    // Valid INSEE NIR with Corsica prefix
    const { maskedText: validMasked2, counts: validCounts2 } = PMEngine.mask('insee 185012A00000041', fresh(), new Set(['nationalId', 'fr_insee']));
    assert.ok(validMasked2.includes('[NATIONALID_1]'), 'valid Corsican INSEE must be masked');
    assert.strictEqual(validCounts2.nationalId, 1);

    // Near-miss: wrong key check
    const { maskedText: missMasked } = PMEngine.mask('insee 288057500000043', fresh(), new Set(['nationalId', 'fr_insee']));
    assert.strictEqual(missMasked, 'insee 288057500000043', 'INSEE with invalid checksum must not be masked');
});

test('ADVERSARIAL: Spain DNI/NIE validation and masking', () => {
    // Valid DNI
    const { maskedText: validMasked1, counts: validCounts1 } = PMEngine.mask('dni 12345678Z', fresh(), new Set(['nationalId', 'es_dni']));
    assert.ok(validMasked1.includes('[NATIONALID_1]'), 'valid Spain DNI must be masked');
    assert.strictEqual(validCounts1.nationalId, 1);

    // Valid NIE
    const { maskedText: validMasked2, counts: validCounts2 } = PMEngine.mask('nie X1234567L', fresh(), new Set(['nationalId', 'es_dni']));
    assert.ok(validMasked2.includes('[NATIONALID_1]'), 'valid Spain NIE must be masked');
    assert.strictEqual(validCounts2.nationalId, 1);

    // Near-miss: wrong letter
    const { maskedText: missMasked } = PMEngine.mask('dni 12345678A', fresh(), new Set(['nationalId', 'es_dni']));
    assert.strictEqual(missMasked, 'dni 12345678A', 'Spain DNI with invalid letter must not be masked');
});

test('ADVERSARIAL: Italy Codice Fiscale validation and masking', () => {
    // Valid CF
    const { maskedText: validMasked, counts: validCounts } = PMEngine.mask('cf RSSMRA80A01F205X', fresh(), new Set(['nationalId', 'it_cf']));
    assert.ok(validMasked.includes('[NATIONALID_1]'), 'valid Italy Codice Fiscale must be masked');
    assert.strictEqual(validCounts.nationalId, 1);

    // Near-miss: wrong check letter
    const { maskedText: missMasked } = PMEngine.mask('cf RSSMRA80A01F205Y', fresh(), new Set(['nationalId', 'it_cf']));
    assert.strictEqual(missMasked, 'cf RSSMRA80A01F205Y', 'Italy Codice Fiscale with invalid checksum must not be masked');
});

test('ADVERSARIAL: EU Passport validation and masking', () => {
    // Valid EU Passport
    const { maskedText: validMasked, counts: validCounts } = PMEngine.mask('passport AA1234567', fresh(), new Set(['nationalId', 'eu_passport']));
    assert.ok(validMasked.includes('[NATIONALID_1]'), 'valid EU Passport must be masked');
    assert.strictEqual(validCounts.nationalId, 1);

    // Near-miss: too short
    const { maskedText: missMasked } = PMEngine.mask('passport 12345678', fresh(), new Set(['nationalId', 'eu_passport']));
    assert.strictEqual(missMasked, 'passport 12345678', 'short EU passport must not be masked');
});

// ============================================================================
// 9. REGRESSION — exact live-test inputs that surfaced the 5 reported bugs
//    (phone over-greedy, SSN-vs-phone, IPv6 false-negative, token name).
//    These lock in the fixes; if any regresses, the user's live test breaks again.
// ============================================================================

test('REGRESSION A1: bare 11-digit order number is NOT masked', () => {
    // Reported: "order 10000000147" → [PHONE_3]. Phone was over-greedy on bare runs.
    const { maskedText, counts } = maskOnce('order 10000000147');
    assert.strictEqual(maskedText, 'order 10000000147');
    assert.strictEqual(counts.phone, 0);
});

test('REGRESSION A2: years joined by spaces are NOT one phone', () => {
    // Reported: "2024 2025 2026" → [PHONE_4]. Phone spanned whitespace between groups.
    const { maskedText, counts } = maskOnce('years 2024 2025 2026 data');
    assert.strictEqual(maskedText, 'years 2024 2025 2026 data');
    assert.strictEqual(counts.phone, 0);
});

test('REGRESSION A3: valid formatted phones still mask after the phone fix', () => {
    // Both must still mask — the fix tightens false positives, not real phones.
    const r1 = maskOnce('call +90 532 123 45 67');
    assert.ok(r1.maskedText.includes('[PHONE_1]'), '+90 spaced must mask: ' + r1.maskedText);
    const r2 = maskOnce('call +1 (415) 555-0123');
    assert.ok(r2.maskedText.includes('[PHONE_1]'), '+1 parens must mask: ' + r2.maskedText);
});

test('REGRESSION B: US SSN masks as nationalId, never phone', () => {
    // Reported: "123-45-6789" → [PHONE_2]. Must be nationalId, higher priority.
    const { maskedText, counts } = maskOnce('ssn 123-45-6789');
    assert.ok(maskedText.includes('[NATIONALID_1]'), 'SSN must mask as nationalId: ' + maskedText);
    assert.strictEqual(counts.phone, 0);
    assert.strictEqual(counts.nationalId, 1);
});

test('REGRESSION C: valid 8-hextet IPv6 masks', () => {
    // Reported: 2001:0db8:85a3:0000:0000:8a2e:0370:7334 stayed raw (false negative).
    const v6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const { maskedText, counts } = maskOnce('server at ' + v6 + ' online');
    assert.ok(maskedText.includes('[IPV6_1]'), 'valid IPv6 must mask: ' + maskedText);
    assert.strictEqual(counts.ipv6, 1);
    assert.ok(!maskedText.includes(v6), 'no raw IPv6 may remain');
});

test('REGRESSION D: nationalId token is [NATIONALID_N], country not encoded', () => {
    // Reported: TCKN → [TRTCKN_1]. Spec §4.1: shared nationalId counter, no country
    // in the token. Verify across two countries in one message → one shared counter.
    const { maskedText, counts } = maskOnce('tckn 10000000146 and ssn 123-45-6789');
    assert.ok(maskedText.includes('[NATIONALID_1]'), 'first nationalId token: ' + maskedText);
    assert.ok(maskedText.includes('[NATIONALID_2]'), 'second nationalId token: ' + maskedText);
    assert.ok(!/TRTCKN|USSSN/.test(maskedText), 'no country in token: ' + maskedText);
    assert.strictEqual(counts.nationalId, 2);
});
