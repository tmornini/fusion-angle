import { assertStrictEquals } from '@std/assert';
import { sha256Hex } from '../shared/digest.ts';
import { buildDesignSystemPage }
    from '../web-app/design-system/index.ts';

// Pins the showcase render byte-exact through the F-023
// de-splice. Paint edits move this fingerprint on purpose;
// an accidental splice still fails the pin.
Deno.test('design-system render is byte-stable',
async () => {
    const rendered = buildDesignSystemPage().toString();
    const digest = await sha256Hex(rendered);
    assertStrictEquals(rendered.length, 56174);
    assertStrictEquals(
        digest,
        'c849925d8f513a21cf67bc5d3b94c664559049e0'
        + 'bae551fd5daf278de786bf37',
    );
});
