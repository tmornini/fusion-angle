import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    resolveBootOrganizationBranch,
    resolveOrganizationGate,
} from '../web-app/app/credential-resolution.ts';

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
    'a reachable token organization is scoped',
    () => {
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], 'b',
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
