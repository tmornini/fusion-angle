// state.ts (transitively imported via the adapters ->
// presenters) reads localStorage and window / document
// at module-eval time, which Node lacks. Stub before
// any import, then load the page-module reducer with
// dynamic import() so the stubs are in place. Same
// pattern as members-detail-reduce.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
// @ts-expect-error — Node global stub
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
};
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
    DesignerShortcutInput,
} from '../web-app/flows/detail.ts';

const { reduceDesignerShortcut } = await import(
    '../web-app/flows/detail.ts'
);

function chord(
    overrides: Partial<DesignerShortcutInput>,
): DesignerShortcutInput {
    return {
        key: '',
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        isEditableFocused: false,
        isPanelOpen: false,
        ...overrides,
    };
}

test('Cmd+Shift+Z arrives as key Z and is redo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Z', metaKey: true, shiftKey: true,
        })),
        'redo',
    );
});

test('Cmd+z is undo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'z', metaKey: true,
        })),
        'undo',
    );
});

test('Caps-Lock Cmd+Z (no shift) is still undo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Z', metaKey: true,
        })),
        'undo',
    );
});

test('Ctrl+Shift+z is redo', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'z', ctrlKey: true, shiftKey: true,
        })),
        'redo',
    );
});

test('the chord honors an editable target', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'z', metaKey: true,
            isEditableFocused: true,
        })),
        null,
    );
});

test('Delete in an editable target is null', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Delete', isEditableFocused: true,
        })),
        null,
    );
});

test('Delete with canvas focus deletes', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Delete',
        })),
        'delete',
    );
});

test('Escape closes only an open panel', () => {
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Escape', isPanelOpen: true,
        })),
        'escape',
    );
    assert.equal(
        reduceDesignerShortcut(chord({
            key: 'Escape',
        })),
        null,
    );
});
