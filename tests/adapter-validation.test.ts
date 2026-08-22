import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ValidationResult } from
    '../web-app/app/adapters/validation.ts';

test('ValidationResult shape compiles', () => {
    type P = { kind: 'x'; id: string };
    const v: ValidationResult<P> = {
        ready: false,
        problems: [{ kind: 'x', id: 'AjdvjuECVZEgZoFajaIEkg' }],
    };
    assert.equal(v.ready, false);
    assert.equal(v.problems.length, 1);
});
