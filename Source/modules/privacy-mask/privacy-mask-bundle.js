(function () {
    'use strict';

    if (window.__PrivacyMaskLoaded) { return; }
    window.__PrivacyMaskLoaded = true;

    // === § PMEngine START ===
    // Pure detection/masking engine. Zero DOM, zero chrome APIs.
    // This section is extracted by engine.test.js for unit testing.

    const PMEngine = (() => {
        const TYPES = ['email', 'phone', 'card', 'iban', 'ipv4', 'ipv6', 'secret', 'nationalId'];

        const NATIONAL_IDS = {
            tr_tckn: { label: 'Turkish TCKN', regex: null, validate: null },
            us_ssn:  { label: 'US SSN',        regex: null, validate: null },
        };

        function validateLuhn(digitsStr) {
            const digits = digitsStr.replace(/\D/g, '');
            if (digits.length < 13) { return false; }
            let sum = 0;
            let dbl = false;
            for (let i = digits.length - 1; i >= 0; i--) {
                let d = digits.charCodeAt(i) - 48;
                if (dbl) { d *= 2; if (d > 9) { d -= 9; } }
                sum += d;
                dbl = !dbl;
            }
            return sum % 10 === 0;
        }

        function validateIBAN(rawStr) {
            const s = rawStr.replace(/\s/g, '').toUpperCase();
            if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) || s.length < 15) { return false; }
            const rearranged = s.slice(4) + s.slice(0, 4);
            let numStr = '';
            for (const ch of rearranged) {
                const code = ch.charCodeAt(0);
                if (code >= 65 && code <= 90) { numStr += (code - 55).toString(); }
                else { numStr += ch; }
            }
            // BigInt mod 97 — IBAN valid if remainder is 1.
            let remainder = 0n;
            for (const ch of numStr) {
                remainder = (remainder * 10n + BigInt(ch.charCodeAt(0) - 48)) % 97n;
            }
            return remainder === 1n;
        }

        function validateTCKN(digitsStr) {
            if (!/^\d{11}$/.test(digitsStr)) { return false; }
            const d = digitsStr.split('').map(Number);
            if (d[0] === 0) { return false; } // Load-bearing: disambiguates from TR mobile numbers (05...).
            // 10th digit (d[9]): odd-even weighted formula.
            // sum_odd = 1st+3rd+5th+7th+9th = d[0]+d[2]+d[4]+d[6]+d[8]
            // sum_even = 2nd+4th+6th+8th = d[1]+d[3]+d[5]+d[7]
            // d[9] = (sum_odd * 7 - sum_even) mod 10
            const sumOdd = d[0] + d[2] + d[4] + d[6] + d[8];
            const sumEven = d[1] + d[3] + d[5] + d[7];
            if (((sumOdd * 7 - sumEven) % 10 + 10) % 10 !== d[9]) { return false; }
            // 11th digit (d[10]): sum of first 10 digits mod 10.
            const sum10 = d[0] + d[1] + d[2] + d[3] + d[4] + d[5] + d[6] + d[7] + d[8] + d[9];
            if (sum10 % 10 !== d[10]) { return false; }
            return true;
        }

        function validateSSN(ssnStr) {
            const m = /^(\d{3})-(\d{2})-(\d{4})$/.exec(ssnStr);
            if (!m) { return false; }
            const area = parseInt(m[1], 10);
            const group = parseInt(m[2], 10);
            const serial = parseInt(m[3], 10);
            if (area === 0 || area === 666 || area >= 900) { return false; }
            if (area > 899) { return false; }
            if (group === 0) { return false; }
            if (serial === 0) { return false; }
            return true;
        }

        function validateIPv4(str) {
            const parts = str.split('.');
            if (parts.length !== 4) { return false; }
            for (const p of parts) {
                if (!/^\d{1,3}$/.test(p)) { return false; }
                const n = parseInt(p, 10);
                if (n < 0 || n > 255) { return false; }
            }
            return true;
        }

        function validateIPv6(str) {
            // Reject if contains non-hex/colon chars or leading/trailing single colon.
            if (!/^[0-9a-fA-F:]+$/.test(str)) { return false; }
            if (str.startsWith(':') && !str.startsWith('::')) { return false; }
            if (str.endsWith(':') && !str.endsWith('::')) { return false; }
            const hasDoubleColon = str.includes('::');
            if (hasDoubleColon) {
                // Only one :: allowed.
                if (str.indexOf('::') !== str.lastIndexOf('::')) { return false; }
            }
            const groups = str.split(':');
            // Filter empty strings from split around ::
            const hextets = groups.filter(g => g !== '');
            // Each hextet must be 1-4 hex digits.
            for (const h of hextets) {
                if (!/^[0-9a-fA-F]{1,4}$/.test(h)) { return false; }
            }
            if (hasDoubleColon) {
                // With ::, hextet count must be < 8 (at least one group omitted).
                if (hextets.length > 7) { return false; }
                // Special case: "::" alone → 0 hextets, valid (all-zeros address).
                return true;
            } else {
                // Without ::, must be exactly 8 hextets.
                return hextets.length === 8;
            }
        }

        // Populate NATIONAL_IDS with regex + validator.
        NATIONAL_IDS.tr_tckn.regex = /\b\d{11}\b/g;
        NATIONAL_IDS.tr_tckn.validate = validateTCKN;
        NATIONAL_IDS.us_ssn.regex = /\b\d{3}-\d{2}-\d{4}\b/g;
        NATIONAL_IDS.us_ssn.validate = validateSSN;

        const PATTERNS = {
            email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
            phone: /\+?\d[\d\s\-()]{7,}\d/g,
            card: /\d[\d\s\-]{11,17}\d/g,
            iban: /[A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]){5,29}/g,
            ipv4: /\b(\d{1,3}\.){3}\d{1,3}\b/g,
            ipv6: /[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4}){2,7}/g,
            secret_jwt: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
            secret_opaque: /(?:sk|pk|api|bearer|token)[_-]?(?:live|test|key|secret)?[_-]?[A-Za-z0-9._-]{20,}/gi,
        };

        function computeNoMatchZones(text) {
            const zones = [];
            // Code fences: ``` ... ```
            const fenceRe = /```[\s\S]*?```/g;
            let m;
            while ((m = fenceRe.exec(text)) !== null) {
                zones.push({ start: m.index, end: m.index + m[0].length, source: 'fence' });
            }
            // URLs: https?://...  (whitespace-delimited end)
            const urlRe = /https?:\/\/[^\s]+/g;
            while ((m = urlRe.exec(text)) !== null) {
                zones.push({ start: m.index, end: m.index + m[0].length, source: 'url' });
            }
            return zones;
        }

        function isInNoMatchZone(start, end, zones) {
            for (const z of zones) {
                if (start < z.end && end > z.start) { return true; }
            }
            return false;
        }

        function validateMatch(type, value) {
            switch (type) {
                case 'email': return true;
                case 'phone': {
                    const digits = value.replace(/\D/g, '');
                    return digits.length >= 7 && digits.length <= 15;
                }
                case 'card': return validateLuhn(value);
                case 'iban': return validateIBAN(value);
                case 'ipv4': return validateIPv4(value);
                case 'ipv6': return validateIPv6(value);
                case 'secret': return true; // JWT/Opaque validated structurally by pattern.
                default: return true;
            }
        }

        function normalizeValue(type, value) {
            switch (type) {
                case 'email': return value.trim().toLowerCase();
                case 'card': return value.replace(/\D/g, '');
                case 'iban': return value.replace(/\s/g, '').toUpperCase();
                default: return value.trim();
            }
        }

        function tokenTypeLabel(type) {
            return type.toUpperCase().replace(/_/g, '');
        }

        // Custom-rule template compiler.
        // Grammar:  # = any digit [0-9],  ? = any letter [A-Za-z],  else literal.
        // Hand-rolled escape (RegExp.escape is not reliably available; if undefined,
        // metachars become live wildcards — the exact injection this prevents).
        function escapeLiteralChar(char) {
            return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        function compileTemplate(template) {
            let body = '';
            for (const ch of template) {
                if (ch === '#') {
                    body += '[0-9]';
                } else if (ch === '?') {
                    body += '[A-Za-z]';
                } else {
                    body += escapeLiteralChar(ch);
                }
            }
            return new RegExp('^' + body + '$', 'gi');
        }

        const CUSTOM_RULE_MAX_LEN = 100;

        // Save-time validation. Returns { ok: true } or { ok: false, error: 'message' }.
        function validateCustomRule(pattern) {
            if (typeof pattern !== 'string' || pattern.trim() === '') {
                return { ok: false, error: 'Pattern cannot be empty.' };
            }
            if (pattern.length > CUSTOM_RULE_MAX_LEN) {
                return { ok: false, error: 'Pattern must be 100 characters or fewer.' };
            }
            // Minimum specificity: at least one literal char (not # or ?).
            const hasLiteral = [...pattern].some(ch => ch !== '#' && ch !== '?');
            if (!hasLiteral) {
                return { ok: false, error: 'Pattern must contain at least one literal character (a letter or symbol that isn\'t # or ?).' };
            }
            return { ok: true };
        }

        const CUSTOM_MATCH_CAP = 200;

        // Fixed-window scanner for custom rules. Anchored ^...$ patterns don't
        // scan with exec+lastIndex, so we slide a window and test each.
        function detectCustom(text, customRules, candidates) {
            const enabled = (customRules || []).filter(r => r && r.enabled && r.pattern && r.id);
            for (const rule of enabled) {
                const re = compileTemplate(rule.pattern);
                const winLen = rule.pattern.length;
                if (winLen === 0 || winLen > text.length) { continue; }
                let count = 0;
                for (let i = 0; i + winLen <= text.length; i++) {
                    if (count >= CUSTOM_MATCH_CAP) { break; }
                    const window = text.slice(i, i + winLen);
                    re.lastIndex = 0;
                    if (!re.test(window)) { continue; }
                    const start = i;
                    const end = i + winLen;
                    // Boundary check (mirrors phone/card): reject if alnum adjacent.
                    if (start > 0 && /[a-zA-Z0-9]/.test(text[start - 1])) { continue; }
                    if (end < text.length && /[a-zA-Z0-9]/.test(text[end])) { continue; }
                    candidates.push({ type: 'custom', subtype: rule.id, label: rule.label, value: window, start, end });
                    count++;
                }
            }
        }

        function detect(text, enabledTypes, customRules) {
            const zones = computeNoMatchZones(text);
            let candidates = [];

            // Email
            if (enabledTypes.has('email')) {
                PATTERNS.email.lastIndex = 0;
                let m;
                while ((m = PATTERNS.email.exec(text)) !== null) {
                    candidates.push({ type: 'email', value: m[0], start: m.index, end: m.index + m[0].length });
                }
            }

            // Phone
            if (enabledTypes.has('phone')) {
                PATTERNS.phone.lastIndex = 0;
                let m;
                while ((m = PATTERNS.phone.exec(text)) !== null) {
                    candidates.push({ type: 'phone', value: m[0], start: m.index, end: m.index + m[0].length });
                }
            }

            // Card
            if (enabledTypes.has('card')) {
                PATTERNS.card.lastIndex = 0;
                let m;
                while ((m = PATTERNS.card.exec(text)) !== null) {
                    const digits = m[0].replace(/\D/g, '');
                    if (digits.length >= 13 && digits.length <= 19) {
                        candidates.push({ type: 'card', value: m[0], start: m.index, end: m.index + m[0].length });
                    }
                }
            }

            // IBAN
            if (enabledTypes.has('iban')) {
                PATTERNS.iban.lastIndex = 0;
                let m;
                while ((m = PATTERNS.iban.exec(text)) !== null) {
                    candidates.push({ type: 'iban', value: m[0], start: m.index, end: m.index + m[0].length });
                }
            }

            // IPv4
            if (enabledTypes.has('ipv4')) {
                PATTERNS.ipv4.lastIndex = 0;
                let m;
                while ((m = PATTERNS.ipv4.exec(text)) !== null) {
                    candidates.push({ type: 'ipv4', value: m[0], start: m.index, end: m.index + m[0].length });
                }
            }

            // IPv6
            if (enabledTypes.has('ipv6')) {
                PATTERNS.ipv6.lastIndex = 0;
                let m;
                while ((m = PATTERNS.ipv6.exec(text)) !== null) {
                    candidates.push({ type: 'ipv6', value: m[0], start: m.index, end: m.index + m[0].length });
                }
            }

            // Secret (JWT first, then opaque)
            if (enabledTypes.has('secret')) {
                const jwtRanges = []; // Track JWT spans to exclude from opaque scan.
                PATTERNS.secret_jwt.lastIndex = 0;
                let m;
                while ((m = PATTERNS.secret_jwt.exec(text)) !== null) {
                    candidates.push({ type: 'secret', value: m[0], start: m.index, end: m.index + m[0].length });
                    jwtRanges.push([m.index, m.index + m[0].length]);
                }
                PATTERNS.secret_opaque.lastIndex = 0;
                while ((m = PATTERNS.secret_opaque.exec(text)) !== null) {
                    const start = m.index, end = m.index + m[0].length;
                    const overlapsJwt = jwtRanges.some(([s, e]) => start < e && end > s);
                    if (!overlapsJwt) {
                        candidates.push({ type: 'secret', value: m[0], start, end });
                    }
                }
            }

            // National ID (per subtype)
            if (enabledTypes.has('nationalId')) {
                for (const [subId, sub] of Object.entries(NATIONAL_IDS)) {
                    if (!sub.regex || !sub.validate) { continue; }
                    sub.regex.lastIndex = 0;
                    let m;
                    while ((m = sub.regex.exec(text)) !== null) {
                        if (sub.validate(m[0])) {
                            candidates.push({ type: 'nationalId', subtype: subId, value: m[0], start: m.index, end: m.index + m[0].length });
                        }
                    }
                }
            }

            // Custom rules (highest priority, tier 4)
            if (enabledTypes.has('custom')) {
                detectCustom(text, customRules, candidates);
            }

            // Filter: drop no-match-zone candidates.
            candidates = candidates.filter(c => !isInNoMatchZone(c.start, c.end, zones));

            // Validate: drop failures.
            candidates = candidates.filter(c => {
                if (c.type === 'nationalId') {
                    const sub = NATIONAL_IDS[c.subtype];
                    return sub && sub.validate ? sub.validate(c.value) : false;
                }
                return validateMatch(c.type, c.value);
            });

            // Overlap resolution stage 1: priority deletion.
            // Custom (tier 4) beats nationalId/card/iban (tier 3) beats email/ipv/secret
            // (tier 2) beats phone (tier 1). Lower-tier candidate overlapping a
            // higher-tier one is dropped before the sort+greedy walk.
            const TYPE_PRIORITIES = {
                custom: 4,
                nationalId: 3,
                card: 3,
                iban: 3,
                email: 2,
                ipv4: 2,
                ipv6: 2,
                secret: 2,
                phone: 1,
            };
            {
                let toKeep = new Set(candidates);
                for (let i = 0; i < candidates.length; i++) {
                    for (let j = i + 1; j < candidates.length; j++) {
                        const a = candidates[i], b = candidates[j];
                        if (a.start < b.end && b.start < a.end) {
                            const prioA = TYPE_PRIORITIES[a.type] || 0;
                            const prioB = TYPE_PRIORITIES[b.type] || 0;
                            if (prioA < prioB) { toKeep.delete(a); }
                            else if (prioB < prioA) { toKeep.delete(b); }
                        }
                    }
                }
                candidates = Array.from(toKeep);
            }

            // Overlap resolution stage 2: sort by start, then longest-first; greedy non-overlapping.
            candidates.sort((a, b) => {
                if (a.start !== b.start) { return a.start - b.start; }
                return (b.end - b.start) - (a.end - a.start); // longer first at same start
            });

            const result = [];
            let lastEnd = 0;
            for (const c of candidates) {
                if (c.start >= lastEnd) {
                    result.push(c);
                    lastEnd = c.end;
                }
                // If overlap: the one already in result was either earlier-starting or same-start-longer.
                // We skip the overlapping candidate (longest-match-wins already applied via sort).
            }
            return result;
        }

        function getOrCreateToken(type, subtype, normalizedValue, tokenMap, labelOverride) {
            if (tokenMap.entries.has(normalizedValue)) {
                return tokenMap.entries.get(normalizedValue);
            }
            // Initialize counter for this type if needed.
            const counterKey = subtype || type;
            if (typeof tokenMap.counters[counterKey] !== 'number') {
                tokenMap.counters[counterKey] = 0;
            }
            tokenMap.counters[counterKey] += 1;
            const label = labelOverride
                ? String(labelOverride).toUpperCase().replace(/[^A-Z0-9_]/g, '')
                : tokenTypeLabel(subtype || type);
            const token = '[' + label + '_' + tokenMap.counters[counterKey] + ']';
            tokenMap.entries.set(normalizedValue, token);
            return token;
        }

        function mask(text, tokenMap, enabledTypes, customRules) {
            const matches = detect(text, enabledTypes, customRules);
            const counts = {};
            // Initialize counts for every enabled type so callers see 0 (not undefined)
            // when nothing matched. Subtype keys (e.g. tr_tckn) are added on first match.
            for (const t of enabledTypes) {
                counts[t] = 0;
            }
            const newMappings = [];

            // First pass (left-to-right): assign tokens in reading order so the
            // first-encountered value gets the lowest token number.
            const spans = [];
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                // Counts key by top-level type (custom rules collapse to 'custom').
                const typeKey = match.type === 'custom' ? 'custom' : (match.subtype || match.type);
                const normalized = normalizeValue(match.type, match.value);
                const isNew = !tokenMap.entries.has(normalized);
                const token = getOrCreateToken(match.type, match.subtype, normalized, tokenMap, match.label);
                if (isNew) {
                    newMappings.push({ token, value: match.value, type: typeKey });
                }
                spans.push({ start: match.start, end: match.end, token });
                counts[typeKey] = (counts[typeKey] || 0) + 1;
            }

            // Second pass (right-to-left): splice tokens into the text so earlier
            // offsets remain valid as we mutate the string.
            let result = text;
            for (let i = spans.length - 1; i >= 0; i--) {
                const s = spans[i];
                result = result.slice(0, s.start) + s.token + result.slice(s.end);
            }

            return { maskedText: result, newMappings, counts };
        }

        return {
            TYPES, NATIONAL_IDS, PATTERNS,
            validateLuhn, validateIBAN, validateTCKN, validateSSN, validateIPv4, validateIPv6,
            validateMatch, normalizeValue, tokenTypeLabel,
            compileTemplate, escapeLiteralChar, validateCustomRule, detectCustom,
            computeNoMatchZones, isInNoMatchZone,
            detect, mask, getOrCreateToken,
        };
    })();

    // === § PMEngine END ===

    // === § PROVIDER_SELECTORS ===
    const PM_PROVIDER = {
        chatgpt: {
            detect: () => {
                const h = window.location.hostname;
                return h.includes('chatgpt.com') || h.includes('chat.openai.com');
            },
            composer: () => document.querySelector('#prompt-textarea')
                || document.querySelector('div[contenteditable="true"][role="textbox"]')
                || document.querySelector('textarea[data-id]'),
        },
        gemini: {
            detect: () => window.location.hostname.includes('gemini.google.com'),
            composer: () => {
                // Gemini uses a custom <rich-textarea> with shadow DOM.
                const richTextarea = document.querySelector('rich-textarea');
                if (richTextarea && richTextarea.shadowRoot) {
                    const editor = richTextarea.shadowRoot.querySelector('.ql-editor[contenteditable="true"]');
                    if (editor) { return editor; }
                }
                return document.querySelector('.ql-editor[contenteditable="true"]')
                    || document.querySelector('div[contenteditable="true"][role="textbox"]');
            },
        },
        claude: {
            detect: () => window.location.hostname.includes('claude.ai'),
            composer: () => document.querySelector('.ProseMirror[contenteditable="true"]')
                || document.querySelector('div[contenteditable="true"][role="textbox"]'),
        },
        qwen: {
            detect: () => window.location.hostname.includes('qwen.ai') || window.location.hostname.includes('chat.qwen.ai'),
            composer: () => document.querySelector('#chat-input')
                || document.querySelector('textarea[placeholder]')
                || document.querySelector('div[contenteditable="true"]'),
        },
        copilot: {
            detect: () => window.location.hostname.includes('copilot.microsoft.com') || window.location.hostname.includes('bing.com/chat'),
            composer: () => document.querySelector('#userInput')
                || document.querySelector('textarea[placeholder]')
                || document.querySelector('div[contenteditable="true"]'),
        },
        kimi: {
            detect: () => window.location.hostname.includes('kimi.com'),
            composer: () => document.querySelector('.chat-input-editor textarea')
                || document.querySelector('textarea[placeholder]')
                || document.querySelector('div[contenteditable="true"]'),
        },
        zai: {
            detect: () => window.location.hostname.includes('z.ai'),
            composer: () => document.querySelector('div[contenteditable="true"]')
                || document.querySelector('textarea[placeholder]'),
        },
        deepseek: {
            detect: () => window.location.hostname.includes('deepseek.com') || window.location.hostname.includes('chat.deepseek.com'),
            composer: () => document.querySelector('textarea[placeholder]')
                || document.querySelector('div[contenteditable="true"]'),
        },
    };

    function detectProvider() {
        for (const p of Object.values(PM_PROVIDER)) {
            try { if (p.detect()) { return p; } } catch (_) { /* ignore */ }
        }
        return null;
    }

    // === § adapter: DOM read/write ===

    function readComposer(el) {
        if (!el) { return ''; }
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') { return el.value; }
        if (el.isContentEditable) { return el.innerText; }
        return '';
    }

    function writeToComposer(el, text) {
        if (!el) { return; }
        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (setter && setter.set) { setter.set.call(el, text); }
            else { el.value = text; }
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        } else if (el.isContentEditable) {
            el.focus();
            el.innerText = text;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        }
    }

    // === § adapter: state ===

    let provider = null;
    let tokenMap = { entries: new Map(), counters: {} };
    let config = { enabled: false, types: {}, customRules: [] };

    const DEFAULT_TYPES = {
        email: true, phone: true, card: true, iban: true,
        ipv4: true, ipv6: false, secret: true,
        nationalId: { tr_tckn: true, us_ssn: false },
    };

    function computeEnabledTypes() {
        if (!config.enabled) { return new Set(); }
        const result = new Set();
        const t = config.types;
        if (t.email) { result.add('email'); }
        if (t.phone) { result.add('phone'); }
        if (t.card) { result.add('card'); }
        if (t.iban) { result.add('iban'); }
        if (t.ipv4) { result.add('ipv4'); }
        if (t.ipv6) { result.add('ipv6'); }
        if (t.secret) { result.add('secret'); }
        if (t.nationalId && Object.values(t.nationalId).some(Boolean)) { result.add('nationalId'); }
        return result;
    }

    function loadConfig() {
        chrome.storage.local.get(
            ['privacyMaskEnabled', 'privacyMaskTypes', 'privacyMaskCustomRules'],
            (res) => {
                config.enabled = res.privacyMaskEnabled === true;
                config.types = res.privacyMaskTypes || DEFAULT_TYPES;
                config.customRules = Array.isArray(res.privacyMaskCustomRules) ? res.privacyMaskCustomRules : [];
            }
        );
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') { return; }
        if (changes.privacyMaskEnabled) {
            config.enabled = changes.privacyMaskEnabled.newValue === true;
        }
        if (changes.privacyMaskTypes) {
            config.types = changes.privacyMaskTypes.newValue || DEFAULT_TYPES;
        }
        if (changes.privacyMaskCustomRules) {
            const val = changes.privacyMaskCustomRules.newValue;
            config.customRules = Array.isArray(val) ? val : [];
        }
    });

    // === § adapter: redact ===

    // Free-tier gate (v1.6): non-premium users get ONE successful
    // redact-and-send, then the feature is gated. Premium is unlimited.
    const PM_FREE_USES_KEY = 'privacyMaskFreeUses';
    const PM_FREE_USES_LIMIT = 1;

    function pmGetFreeUses() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([PM_FREE_USES_KEY], (res) => {
                    resolve(Number(res?.[PM_FREE_USES_KEY]) || 0);
                });
            } catch (_) { resolve(0); }
        });
    }

    function pmIncrementFreeUses() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([PM_FREE_USES_KEY], (res) => {
                    const next = (Number(res?.[PM_FREE_USES_KEY]) || 0) + 1;
                    chrome.storage.local.set({ [PM_FREE_USES_KEY]: next }, () => resolve(next));
                });
            } catch (_) { resolve(0); }
        });
    }

    // Forward an analytics event to the background bridge (content scripts
    // can't import the ES analytics module). Best-effort, never throws.
    function pmTrack(name, props) {
        try {
            chrome.runtime.sendMessage({ type: 'TRACK_EVENT', name, props: props || {} }, () => {
                // consume lastError so the console stays clean
                void chrome.runtime.lastError;
            });
        } catch (_) { }
    }

    function redact() {
        if (!provider) { return { masked: false, reason: 'no-provider' }; }
        if (!isPremium) {
            // Defer the gate check: the first redact is allowed, the second
            // is blocked. We resolve the async count and then proceed or gate.
            return (async () => {
                const uses = await pmGetFreeUses();
                if (uses >= PM_FREE_USES_LIMIT) {
                    pmTrack('privacy_mask_limit_hit', { uses, limit: PM_FREE_USES_LIMIT });
                    // Suppress the rating prompt for this session (paywall-adjacent).
                    try {
                        chrome.runtime.sendMessage({ type: 'SUPPRESS_RATING', reason: 'privacy_block' }, () => {
                            void chrome.runtime.lastError;
                        });
                    } catch (_) { }
                    openUpgrade();
                    return { masked: false, reason: 'free-limit' };
                }
                // Allowed this once — perform the redact, then persist the use.
                const result = performRedact();
                if (result && result.masked) {
                    await pmIncrementFreeUses();
                    pmTrack('privacy_mask_used', { uses: uses + 1 });
                }
                return result;
            })();
        }
        return performRedact();
    }

    function performRedact() {
        const composer = provider.composer();
        if (!composer) { return { masked: false, reason: 'no-composer' }; }

        let enabledTypes = computeEnabledTypes();
        const hasEnabledCustomRules = Array.isArray(config.customRules) && config.customRules.some(r => r && r.enabled);
        if (hasEnabledCustomRules) {
            enabledTypes = new Set(enabledTypes);
            enabledTypes.add('custom');
        }
        if (enabledTypes.size === 0) {
            showToast('Privacy Mask is disabled. Enable it in settings.');
            return { masked: false, reason: 'disabled' };
        }

        const text = readComposer(composer);
        if (!text.trim()) {
            showToast('Nothing to redact — composer is empty.');
            return { masked: false, reason: 'empty' };
        }

        const result = PMEngine.mask(text, tokenMap, enabledTypes, config.customRules);
        const totalMasked = Object.values(result.counts).reduce((a, b) => a + b, 0);

        if (totalMasked === 0) {
            showToast('Nothing to redact — no sensitive data detected.');
            return { masked: false, reason: 'no-matches', counts: result.counts };
        }

        writeToComposer(composer, result.maskedText);
        return { masked: true, counts: result.counts, total: totalMasked };
    }

    window.__privacyMask = {
        redact,
        validateCustomRule: PMEngine.validateCustomRule,
    };

    // === § adapter: logo-button hijack + dropdown ===
    //
    // Strategy: attach a CAPTURE-phase click listener to the neural-nav logo button.
    // Capture fires before neural-nav's own bubble-phase handler. We stopImmediatePropagation
    // to block neural-nav from opening its panel directly. Instead we show a dropdown menu
    // with [Prompt History, Redact]. If user picks Prompt History, we temporarily remove our
    // hijack and synthetically click the button so neural-nav opens normally.

    let nnBtn = null;
    let dropdown = null;
    let bypassing = false; // true while we synthetically re-trigger neural-nav

    const SHIELD_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/></svg>';
    const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

    // Premium status (feature is premium-only). Cached and live-updated.
    let isPremium = false;
    function refreshPremiumStatus() {
        try {
            chrome.runtime.sendMessage({ type: 'GET_PREMIUM_STATUS' }, (bg) => {
                if (chrome.runtime.lastError) { return; }
                isPremium = bg?.isPremium === true;
            });
        } catch (_) { }
    }
    function openUpgrade() {
        showToast('Privacy Mask is a Premium feature. Open the side panel to upgrade.');
        // Best-effort: surface the side panel so the Go-Pro modal is reachable.
        // This runs in the AI site content script; opening the panel is only
        // possible when the extension icon maps to the side panel.
        try {
            chrome.runtime.sendMessage({ type: 'OPEN_PREMIUM_FROM_CONTENT' }, () => {
                void chrome.runtime.lastError;
            });
        } catch (_) { }
    }

    function findNnBtn() {
        return document.querySelector('.nn-toggle-inline, .nn-toggle-fixed');
    }

    function hijackNnBtn() {
        const btn = findNnBtn();
        if (!btn || btn === nnBtn) { return !!nnBtn; }
        nnBtn = btn;
        nnBtn.addEventListener('click', (e) => {
            if (bypassing) { return; } // synthetic re-trigger — let neural-nav handle it
            e.stopImmediatePropagation();
            e.stopPropagation();
            e.preventDefault();
            toggleDropdown();
        }, { capture: true });
        return true;
    }

    function toggleDropdown() {
        if (dropdown && document.contains(dropdown)) {
            closeDropdown();
        } else {
            openDropdown();
        }
    }

    function openDropdown() {
        const btn = nnBtn || findNnBtn();
        if (!btn) { return; }
        closeDropdown();

        dropdown = document.createElement('div');
        dropdown.className = 'pm-dropdown';

        // Prompt History item — re-trigger neural-nav.
        const historyItem = document.createElement('button');
        historyItem.className = 'pm-dropdown-item';
        historyItem.innerHTML = '<span class="pm-item-icon">💬</span> Prompt History';
        historyItem.addEventListener('click', (event) => {
            // Keep the original menu click from reaching NeuralNav's
            // document-level click-away handler after the synthetic toggle click.
            event.stopPropagation();
            closeDropdown();
            // Bypass our hijack and let neural-nav's handler run.
            bypassing = true;
            btn.click();
            setTimeout(() => { bypassing = false; }, 100);
        });

        // Redact item (Premium). Shows locked state when not premium.
        const redactItem = document.createElement('button');
        redactItem.className = 'pm-dropdown-item' + (isPremium ? '' : ' locked');
        redactItem.innerHTML = '<span class="pm-item-icon">' + (isPremium ? SHIELD_SVG : LOCK_SVG) + '</span> Redact'
            + (isPremium ? '' : ' <span class="pm-item-badge">Premium</span>');
        redactItem.addEventListener('click', () => {
            closeDropdown();
            if (isPremium) {
                redact();
            } else {
                openUpgrade();
            }
        });

        dropdown.appendChild(historyItem);
        dropdown.appendChild(redactItem);
        document.body.appendChild(dropdown);

        // Position relative to the logo button, flipping up / clamping as needed.
        positionDropdown(dropdown, btn);

        setTimeout(() => {
            document.addEventListener('click', outsideClickHandler);
        }, 0);
        document.addEventListener('keydown', escHandler);
    }

    /**
     * Place the dropdown below the anchor by default; flip up when there is no
     * room beneath, and clamp + scroll internally when neither fits (short viewport).
     * Also keeps the menu inside the left/right edges (narrow side-panel widths).
     */
    function positionDropdown(menu, anchor) {
        const GAP = 4;
        const VP_MARGIN = 8; // breathing room from the viewport edges
        const aRect = anchor.getBoundingClientRect();
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const vh = document.documentElement.clientHeight || window.innerHeight;

        // Measure after append (menu is in the DOM now). Force a layout so we
        // get the real height before deciding direction.
        const mRect = menu.getBoundingClientRect();
        const menuH = mRect.height;
        const menuW = mRect.width;

        const spaceBelow = vh - aRect.bottom - VP_MARGIN;
        const spaceAbove = aRect.top - VP_MARGIN;
        let top;
        if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
            // Open downward (default). If it would overflow, clamp to viewport.
            top = aRect.bottom + GAP;
            if (top + menuH > vh - VP_MARGIN) {
                top = vh - VP_MARGIN - menuH;
            }
        } else {
            // Flip up.
            top = aRect.top - GAP - menuH;
            if (top < VP_MARGIN) {
                top = VP_MARGIN;
            }
        }

        // Horizontal: prefer anchor's left edge, clamp into view.
        let left = aRect.left;
        if (left + menuW > vw - VP_MARGIN) {
            left = vw - VP_MARGIN - menuW;
        }
        if (left < VP_MARGIN) {
            left = VP_MARGIN;
        }

        menu.style.top = top + 'px';
        menu.style.left = left + 'px';
    }

    function closeDropdown() {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        document.removeEventListener('click', outsideClickHandler);
        document.removeEventListener('keydown', escHandler);
    }

    function outsideClickHandler(e) {
        if (dropdown && !dropdown.contains(e.target) && nnBtn && !nnBtn.contains(e.target)) {
            closeDropdown();
        }
    }

    function escHandler(e) {
        if (e.key === 'Escape') { closeDropdown(); }
    }

    // === § adapter: toast ===

    let toastEl = null;

    function showToast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'pm-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.setAttribute('data-pm-visible', 'true');
        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(() => {
            toastEl.setAttribute('data-pm-visible', 'false');
        }, 3000);
    }

    // === § init ===

    function init() {
        provider = detectProvider();
        if (!provider) { return; }

        loadConfig();
        refreshPremiumStatus();

        // Live-update premium status (background posts a signal-only message;
        // we re-fetch on receipt, matching how settings.js handles it).
        try {
            const port = chrome.runtime.connect({ name: 'premium-status' });
            port.onMessage.addListener((msg) => {
                if (msg?.type === 'PREMIUM_STATUS_UPDATED') {
                    refreshPremiumStatus();
                }
            });
        } catch (_) { }

        // Hijack the neural-nav logo button (it loads after us).
        let attempts = 0;
        const maxAttempts = 20;
        const tryHijack = () => {
            attempts++;
            const ok = hijackNnBtn();
            if (!ok && attempts < maxAttempts) {
                setTimeout(tryHijack, 500);
            }
        };
        tryHijack();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
