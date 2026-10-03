import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { ValidationError } from '../shared/types.ts';
import {
    validateMembershipDocumentBody,
    validateMembershipEntity,
} from '../api/validators.ts';


// Seat document body is type + at. Privilege type (admin|
// member) bakes into claims at mint. Leftover /memberships
// validators still gate the leftover join shape.

function documentFields() {
    return {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        identity_id: 'toccYYkLEABmlbpHJalgtQ',
        type: 'member',
        at: '2026-01-01T00:00:00.000000Z',
    };
}

// -- 1. validateMembershipDocumentBody -----------------------

Deno.test('validateMembershipDocumentBody accepts the exact'
+ ' four-key body', () => {
    const doc = validateMembershipDocumentBody(documentFields());
    assertEquals(doc.entity, documentFields());
});

Deno.test('validateMembershipDocumentBody rejects a stray key with'
+ ' the byte-identical message validateMembershipEntity'
+ ' produces for the SAME violation (the label mandate)', () => {
    const body = { ...documentFields(), bogus: 'nope' };
    let documentMessage: string | undefined;
    let entityMessage: string | undefined;
    try {
        validateMembershipDocumentBody(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        documentMessage = (e as ValidationError).message;
    }
    try {
        validateMembershipEntity(body);
    } catch (e) {
        assert(e instanceof ValidationError);
        entityMessage = (e as ValidationError).message;
    }
    assertStrictEquals(
        documentMessage,
        'unexpected key "bogus" for SeatEntity',
    );
    assertStrictEquals(documentMessage, entityMessage);
});

Deno.test('validateMembershipDocumentBody rejects each missing key,'
+ ' byte-identical to validateMembershipEntity on both paths',
() => {
    for (const key of [
        'organization_id', 'identity_id', 'type', 'at',
    ]) {
        const body = { ...documentFields() };
        delete (body as Record<string, unknown>)[key];
        let documentMessage: string | undefined;
        let entityMessage: string | undefined;
        try {
            validateMembershipDocumentBody(body);
        } catch (e) {
            assert(e instanceof ValidationError);
            documentMessage = (e as ValidationError).message;
        }
        try {
            validateMembershipEntity(body);
        } catch (e) {
            assert(e instanceof ValidationError);
            entityMessage = (e as ValidationError).message;
        }
        assertStrictEquals(
            documentMessage,
            'missing required key "' + key
                + '" for SeatEntity',
        );
        assertStrictEquals(documentMessage, entityMessage);
    }
});
