import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { withTimeout } from './browser/fixtures.ts';

test('withTimeout rejects when the body outruns the bound',
    async () => {
        await assert.rejects(
            () => withTimeout(
                new Promise(() => {}),
                'never',
                50,
            ),
            /timed out/,
        );
    });
