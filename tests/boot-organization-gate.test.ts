import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    resolveOrganizationGate,
} from '../web-app/app/credential-resolution.ts';

test(
    'invitations page keeps an empty organization'
    + ' list',
    () => {
        const empty: readonly string[] = [];
        assert.equal(
            resolveOrganizationGate(
                empty, 'dashboard',
            ),
            null,
        );
        assert.deepEqual(
            resolveOrganizationGate(
                empty, 'invitations',
            ),
            empty,
        );
        const one = ['org'] as const;
        assert.equal(
            resolveOrganizationGate(
                one, 'invitations',
            ),
            one,
        );
    },
);
