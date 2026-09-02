import { assertEquals, assertStrictEquals } from '@std/assert';
import { parseDialogClick } from '../web-app/app/dialog.ts';

const elementWith = (
    attrs: Record<string, string>,
): Element => ({
    getAttribute: (a: string) => attrs[a] ?? null,
    closest: (sel: string) => {
        const key = sel.slice(1, -1);
        return attrs[key] !== undefined
            ? elementWith(attrs)
            : null;
    },
}) as unknown as Element;

Deno.test('parseDialogClick reads data-dialog-open as an open', () => {
    const t = elementWith({ 'data-dialog-open': 'y' });
    assertEquals(parseDialogClick(t), {
        kind: 'open', id: 'y',
    });
});

Deno.test('parseDialogClick reads data-dialog-cancel as a close',
    () => {
        const t = elementWith({
            'data-dialog-cancel': 'z',
        });
        assertEquals(parseDialogClick(t), {
            kind: 'close', id: 'z',
        });
    });

Deno.test('parseDialogClick returns null for a plain click', () => {
    assertStrictEquals(parseDialogClick(elementWith({})), null);
});
