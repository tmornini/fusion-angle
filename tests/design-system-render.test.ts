import { assertStrictEquals } from '@std/assert';
import { sha256Hex } from '../shared/digest.ts';
import { buildDesignSystemPage }
    from '../web-app/design-system/index.ts';

// Pins the showcase render byte-exact through the F-023
// de-splice: removing ${''} line-wrap splices is provably
// output-neutral, so this fingerprint must hold until a
// section moves out to index.html.
Deno.test('design-system render is byte-stable',
async () => {
    const rendered = buildDesignSystemPage().toString();
    const digest = await sha256Hex(rendered);
    assertStrictEquals(rendered.length, 56274);
    assertStrictEquals(
        digest,
        'a87b1d5782e4d3bb39a632134d0df72fe93d6498'
        + '8b1ca0a32ba6ad4250206259',
    );
});
