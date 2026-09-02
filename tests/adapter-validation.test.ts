import { assertStrictEquals } from '@std/assert';
import type { ValidationResult } from
    '../web-app/app/adapters/validation.ts';

Deno.test('ValidationResult shape compiles', () => {
    type P = { kind: 'x'; id: string };
    const v: ValidationResult<P> = {
        ready: false,
        problems: [{ kind: 'x', id: 'AjdvjuECVZEgZoFajaIEkg' }],
    };
    assertStrictEquals(v.ready, false);
    assertStrictEquals(v.problems.length, 1);
});
