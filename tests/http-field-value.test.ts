import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FieldValue } from '../api/http-message/field-value.ts';
import { HttpMessageError } from '../api/http-message/types.ts';

test('exists is false for an absent value', () => {
    assert.equal(FieldValue.absent().exists(), false);
});

test('exists is true for a present value', () => {
    assert.equal(FieldValue.present('x').exists(), true);
});

test('toText returns a present string leaf', () => {
    assert.equal(
        FieldValue.present('text/html').toText(),
        'text/html',
    );
});

test('toNumber returns a numeric leaf', () => {
    assert.equal(FieldValue.present(3600).toNumber(), 3600);
});

test('toNumber parses a numeric string leaf', () => {
    assert.equal(FieldValue.present('42').toNumber(), 42);
});

test('toBoolean returns a boolean leaf', () => {
    assert.equal(FieldValue.present(true).toBoolean(), true);
});

test('toDate parses an IMF-fixdate string', () => {
    const date = FieldValue.present(
        'Sun, 06 Nov 1994 08:49:37 GMT',
    ).toDate();
    assert.equal(
        date.getTime(),
        Date.UTC(1994, 10, 6, 8, 49, 37),
    );
});

test('toNumber on an absent value throws', () => {
    assert.throws(
        () => FieldValue.absent().toNumber(),
        HttpMessageError,
    );
});

test('toText on an absent value throws', () => {
    assert.throws(
        () => FieldValue.absent().toText(),
        HttpMessageError,
    );
});

test('toNumber on a non-numeric string throws', () => {
    assert.throws(
        () => FieldValue.present('abc').toNumber(),
        HttpMessageError,
    );
});

test('toBoolean on a numeric leaf throws', () => {
    assert.throws(
        () => FieldValue.present(1).toBoolean(),
        HttpMessageError,
    );
});

test('toDate on a non-date string throws', () => {
    assert.throws(
        () => FieldValue.present('nope').toDate(),
        HttpMessageError,
    );
});
