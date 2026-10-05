import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    resolveBootOrganizationBranch,
    resolveOrganizationGate,
} from '../client/credential-resolution.ts';

Deno.test(
    'invitations page keeps an empty organization'
    + ' list',
    () => {
        const empty: readonly string[] = [];
        assertStrictEquals(
            resolveOrganizationGate(
                empty, 'dashboard',
            ),
            null,
        );
        assertEquals(
            resolveOrganizationGate(
                empty, 'invitations',
            ),
            empty,
        );
        const one = ['org'] as const;
        assertStrictEquals(
            resolveOrganizationGate(
                one, 'invitations',
            ),
            one,
        );
    },
);

Deno.test(
    'a reachable token organization is scoped when it is'
    + ' the stored choice or none is stored',
    () => {
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], 'a',
            ),
            { kind: 'scoped', id: 'a' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], null,
            ),
            { kind: 'scoped', id: 'a' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                'x', ['a'], null,
            ),
            { kind: 'walk' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                'a', [], 'a',
            ),
            { kind: 'walk' },
        );
    },
);

Deno.test(
    'a reachable stored choice exchanges a token scoped'
        + ' elsewhere',
    () => {
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], 'b',
            ),
            { kind: 'exchange', id: 'b' },
        );
    },
);

Deno.test(
    'a flat claim containing the persisted id'
        + ' exchanges',
    () => {
        assertEquals(
            resolveBootOrganizationBranch(
                undefined, ['a', 'b'], 'b',
            ),
            { kind: 'exchange', id: 'b' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                undefined, undefined, 'a',
            ),
            { kind: 'walk' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                undefined, [], 'a',
            ),
            { kind: 'walk' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                undefined, ['a'], 'foreign',
            ),
            { kind: 'walk' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                undefined, ['a'], null,
            ),
            { kind: 'walk' },
        );
    },
);
