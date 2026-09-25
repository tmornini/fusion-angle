import { assertThrows } from '@std/assert';
import { getClient } from '../web-app/app/client.ts';

Deno.test('the app reads no client before its root puts one',
() => {
    assertThrows(
        () => getClient(),
        Error,
        'client uninitialized',
    );
});
