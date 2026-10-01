import { assertEquals, assertStrictEquals } from
    '@std/assert';
import {
    memberSeesState,
    memberViewRefusal,
    membershipNameRefusal,
    viewQueryOf,
} from '../api/membership-gate.ts';

const O = 'AjdvjuECVZEgZoFajaIEkg';
const I = 'XXZruirZyAOoRpNxaDnpSA';
const OTHER = 'zyGBRshxOnKHUfcyFRqowg';

Deno.test('a view with no query selects every state', () => {
    assertEquals(viewQueryOf(''), { kind: 'every' });
    assertEquals(viewQueryOf('?'), { kind: 'every' });
});

Deno.test('a view takes exactly one state of the five',
() => {
    for (const state of [
        'pending', 'accepted', 'declined', 'revoked',
        'removed',
    ] as const) {
        assertEquals(
            viewQueryOf('?state=' + state),
            { kind: 'state', state },
        );
    }
});

Deno.test('a repeated, unknown, or empty state, or any'
    + ' other parameter, is refused', () => {
    for (const search of [
        '?state=pending&state=accepted', '?state=deleted',
        '?state=', '?state', '?STATE=pending',
        '?state=pending&page=2', '?page=2',
    ]) {
        assertStrictEquals(
            viewQueryOf(search).kind, 'refused', search,
        );
    }
});

Deno.test('an admin reads every state of the'
    + ' organization view', () => {
    assertStrictEquals(
        memberViewRefusal(['admin'], { kind: 'every' }),
        undefined,
    );
    assertStrictEquals(
        memberViewRefusal(
            ['admin'], { kind: 'state', state: 'pending' },
        ),
        undefined,
    );
});

Deno.test('a member reads accepted and removed only',
() => {
    for (const state of ['accepted', 'removed'] as const) {
        assertStrictEquals(
            memberViewRefusal(
                ['member'], { kind: 'state', state },
            ),
            undefined,
        );
        assertStrictEquals(
            memberSeesState(['member'], state), true,
        );
    }
    for (const state of [
        'pending', 'declined', 'revoked',
    ] as const) {
        assertStrictEquals(
            typeof memberViewRefusal(
                ['member'], { kind: 'state', state },
            ),
            'string',
        );
        assertStrictEquals(
            memberSeesState(['member'], state), false,
        );
    }
    assertStrictEquals(
        typeof memberViewRefusal(
            ['member'], { kind: 'every' },
        ),
        'string',
    );
});

Deno.test('a membership name is the path\'s, foreign, or'
    + ' absent by nest', () => {
    const name = { organizationId: O, identityId: I };
    assertStrictEquals(
        membershipNameRefusal('organization', O, name),
        undefined,
    );
    assertStrictEquals(
        membershipNameRefusal('organization', OTHER, name),
        'foreign',
    );
    assertStrictEquals(
        membershipNameRefusal('identity', I, name),
        undefined,
    );
    assertStrictEquals(
        membershipNameRefusal('identity', OTHER, name),
        'absent',
    );
});
