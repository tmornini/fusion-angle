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
    assert.equal(rendered.length, 56274);
    assert.equal(
        digest,
        'a87b1d5782e4d3bb39a632134d0df72fe93d6498'
        + '8b1ca0a32ba6ad4250206259',
    );
});
