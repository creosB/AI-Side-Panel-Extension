// Regression test for the Privacy Mask -> Prompt History handoff.
// Run with: node --test Source/modules/privacy-mask/prompt-history-dropdown.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Prompt History menu click is stopped before the synthetic toggle click', () => {
    const bundlePath = path.join(__dirname, 'privacy-mask-bundle.js');
    const source = fs.readFileSync(bundlePath, 'utf8');
    const handlerStart = source.indexOf("historyItem.addEventListener('click'");
    const handlerEnd = source.indexOf('btn.click()', handlerStart);

    assert.notStrictEqual(handlerStart, -1, 'Prompt History click handler not found');
    assert.notStrictEqual(handlerEnd, -1, 'synthetic NeuralNav toggle click must remain');

    const handler = source.slice(handlerStart, handlerEnd);
    assert.ok(handler.includes('event.stopPropagation()'), 'original dropdown click must stop before the synthetic toggle click');
});
