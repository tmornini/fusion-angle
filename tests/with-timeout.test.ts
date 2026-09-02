import { assertRejects } from '@std/assert';
import { withTimeout } from './browser/fixtures.ts';

Deno.test('withTimeout rejects when the body outruns the bound',
    async () => {
        await assertRejects(
            () => withTimeout(
                new Promise(() => {}),
                'never',
                50,
            ),
            Error, 'timed out',
        );
    });
