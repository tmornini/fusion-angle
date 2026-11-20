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
    assertStrictEquals(rendered.length, 56168);
    assertStrictEquals(
        digest,
        'ad838039a7f0bcc2b0ba3ef115bc5851a83089ec'
        + '063f1f2f54dc72cd587afd20',
    );
});
