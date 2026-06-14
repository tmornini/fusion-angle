import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildDesignSystemPage }
    from '../web-app/design-system/index.ts';

// Pins the showcase render byte-exact through the F-023
// de-splice: removing ${''} line-wrap splices is provably
// output-neutral, so this fingerprint must hold until a
// section moves out to index.html.
test('design-system render is byte-stable', () => {
    const rendered = buildDesignSystemPage().toString();
    const digest = createHash('sha256')
        .update(rendered).digest('hex');
    assert.equal(rendered.length, 55926);
    assert.equal(
        digest,
        '5c1bd7feaca36047cdfd9afe15ffb4568069a1ec88'
        + 'f96884e95bfa12f4bc6fee',
    );
});
