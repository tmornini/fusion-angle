import { assertEquals, assertStrictEquals } from
    '@std/assert';
import {
    membershipNameOf,
    parsedMembershipName,
} from '../shared/membership-name.ts';

const O = 'AjdvjuECVZEgZoFajaIEkg';
const I = 'XXZruirZyAOoRpNxaDnpSA';

Deno.test('a membership name joins organization and'
    + ' identity with one colon', () => {
    assertStrictEquals(
        membershipNameOf(O, I), O + ':' + I,
    );
});

Deno.test('a membership name parses back to its two'
    + ' identities', () => {
    assertEquals(parsedMembershipName(O + ':' + I), {
        organizationId: O, identityId: I,
    });
});

Deno.test('a membership name refuses anything but two'
    + ' identifiers and one colon', () => {
    for (const value of [
        O, O + ':', ':' + I, O + '::' + I,
        O + ':' + I + ':' + I, O + ':' + 'short',
        'short:' + I, O + '%3A' + I, '',
    ]) {
        assertStrictEquals(
            parsedMembershipName(value), undefined, value,
        );
    }
});
