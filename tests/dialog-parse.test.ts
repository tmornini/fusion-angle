import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDialogClick } from '../web-app/app/dialog.ts';

const elementWith = (
    backdrop: boolean,
    attrs: Record<string, string>,
): Element => ({
    classList: {
        contains: (c: string) =>
            backdrop && c === 'dialog-backdrop',
    },
    getAttribute: (a: string) => attrs[a] ?? null,
    closest: (sel: string) => {
        const key = sel.slice(1, -1);
        return attrs[key] !== undefined
            ? elementWith(false, attrs)
            : null;
    },
}) as unknown as Element;

test('parseDialogClick reads a backdrop as a close', () => {
    const t = elementWith(true, { 'data-dialog-id': 'x' });
    assert.deepEqual(parseDialogClick(t), {
        kind: 'close', id: 'x',
    });
});

test('parseDialogClick reads data-dialog-open as an open', () => {
    const t = elementWith(false, { 'data-dialog-open': 'y' });
    assert.deepEqual(parseDialogClick(t), {
        kind: 'open', id: 'y',
    });
});

test('parseDialogClick reads data-dialog-cancel as a close',
    () => {
        const t = elementWith(false, {
            'data-dialog-cancel': 'z',
        });
        assert.deepEqual(parseDialogClick(t), {
            kind: 'close', id: 'z',
        });
    });

test('parseDialogClick returns null for a plain click', () => {
    assert.equal(parseDialogClick(elementWith(false, {})), null);
});
