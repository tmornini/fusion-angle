import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FieldValue } from '../../shared/http-message/field-value.ts';
import { parseHttpDate } from '../../shared/http-message/http-date.ts';
import { HttpMessageError } from '../../shared/http-message/types.ts';

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

test('parses an RFC 850 date with the 50-year window', () => {
    const reference = new Date(Date.UTC(2026, 0, 1));
    const date = parseHttpDate(
        'Sunday, 06-Nov-94 08:49:37 GMT', reference,
    );
    assert.equal(
        date.getTime(), Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

test('RFC 850 two-digit year resolves into this century', () => {
    const reference = new Date(Date.UTC(2026, 0, 1));
    const date = parseHttpDate(
        'Tuesday, 06-Nov-29 00:00:00 GMT', reference,
    );
    assert.equal(date.getUTCFullYear(), 2029);
});

test('parses an asctime date with a space-padded day', () => {
    const date = parseHttpDate('Sun Nov  6 08:49:37 1994');
    assert.equal(
        date.getTime(), Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

test('rejects a non-HTTP-date', () => {
    assert.throws(
        () => parseHttpDate('not a date'),
        HttpMessageError,
    );
});
