import { assertEquals, assertStrictEquals } from '@std/assert';
import {
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
