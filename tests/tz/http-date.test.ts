import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FieldValue } from '../../api/http-message/field-value.ts';

// Runs under TZ=Pacific/Honolulu. An HTTP-date carries an
// explicit GMT zone, so toDate must resolve to the same absolute
// instant it does under UTC — never the host's local time.
test('toDate of an HTTP-date is timezone-independent', () => {
    const date = FieldValue.present(
        'Sun, 06 Nov 1994 08:49:37 GMT',
    ).toDate();
    assert.equal(
        date.getTime(),
        Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});
