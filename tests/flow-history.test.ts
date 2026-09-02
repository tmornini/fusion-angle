import {
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    buildFlowHistorySnapshot,
    canUndoFlowEdits,
    canRedoFlowEdits,
    recordFlowMutation,
    recordUndoHistoryMark,
    appendToRedoStack,
    removeFromRedoStack,
} from '../web-app/app/flow-history.ts';
import type {
    FlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import type {
    FlowVersion,
} from '../web-app/app/flow-history.ts';

function buildVersion(
    id: string,
): FlowVersion {
    return {
        id,
        flowId: 'aEsGMmBEFaVdWihhHXwCbw',
        name: 'name-' + id,
        isLocked: false,
        isAutoLayout: false,
        isAutoFit: false,
        lockTimeout: 0,
        nodes: [],
        edges: [],
        createdAt: '2026-01-01T00:00:00.000000Z',
    };
}

Deno.test(
    'buildFlowHistorySnapshot(false) yields'
    + ' clean snapshot with no undo history',
    () => {
        const s = buildFlowHistorySnapshot(false);
        assertStrictEquals(s.hasUndoHistory, false);
        assertEquals(s.redoStack, []);
    },
);

Deno.test(
    'buildFlowHistorySnapshot(true) marks'
    + ' undo history present, empty redo stack',
    () => {
        const s = buildFlowHistorySnapshot(true);
        assertStrictEquals(s.hasUndoHistory, true);
        assertEquals(s.redoStack, []);
    },
);

Deno.test(
    'canUndoFlowEdits returns hasUndoHistory'
    + ' verbatim',
    () => {
        const yes = buildFlowHistorySnapshot(true);
        const no = buildFlowHistorySnapshot(false);
        assertStrictEquals(canUndoFlowEdits(yes), true);
        assertStrictEquals(canUndoFlowEdits(no), false);
    },
);

Deno.test(
    'canRedoFlowEdits is true iff redo stack'
    + ' is non-empty',
    () => {
        const empty = buildFlowHistorySnapshot(true);
        assertStrictEquals(canRedoFlowEdits(empty), false);
        const filled = appendToRedoStack(
            empty, buildVersion('xDyDkxEPwtcNmJVknUHDsg'),
        );
        assertStrictEquals(
            canRedoFlowEdits(filled), true,
        );
    },
);

Deno.test(
    'recordFlowMutation sets hasUndoHistory'
    + ' and leaves redo stack empty (F37)',
    () => {
        const result = recordFlowMutation();
        assertStrictEquals(result.hasUndoHistory, true);
        assertEquals(result.redoStack, []);
    },
);

Deno.test(
    'recordUndoHistoryMark sets the flag'
    + ' and preserves redo stack',
    () => {
        const seeded = appendToRedoStack(
            buildFlowHistorySnapshot(true),
            buildVersion('xDyDkxEPwtcNmJVknUHDsg'),
        );
        const off = recordUndoHistoryMark(
            seeded, false,
        );
        assertNotStrictEquals(off, seeded);
        assertStrictEquals(off.hasUndoHistory, false);
        assertStrictEquals(off.redoStack.length, 1);
        assertStrictEquals(off.redoStack[0]?.id, 'xDyDkxEPwtcNmJVknUHDsg');
        // Input unchanged.
        assertStrictEquals(seeded.hasUndoHistory, true);
    },
);

Deno.test(
    'appendToRedoStack pushes version'
    + ' without mutating original',
    () => {
        const s = buildFlowHistorySnapshot(true);
        const v = buildVersion('xDyDkxEPwtcNmJVknUHDsg');
        const next = appendToRedoStack(s, v);
        assertNotStrictEquals(next, s);
        assertStrictEquals(next.redoStack.length, 1);
        assertStrictEquals(next.redoStack[0]?.id, 'xDyDkxEPwtcNmJVknUHDsg');
        assertStrictEquals(next.hasUndoHistory, true);
        // Original snapshot unchanged.
        assertStrictEquals(s.redoStack.length, 0);
    },
);

Deno.test(
    'removeFromRedoStack on empty stack'
    + ' returns same snapshot and undefined version',
    () => {
        const s = buildFlowHistorySnapshot(true);
        const r = removeFromRedoStack(s);
        assertStrictEquals(r.version, undefined);
        assertEquals(r.snapshot, s);
    },
);

Deno.test(
    'removeFromRedoStack pops the last version'
    + ' and shortens the stack',
    () => {
        const xDyDkxEPwtcNmJVknUHDsg = buildVersion('xDyDkxEPwtcNmJVknUHDsg');
        const v2 = buildVersion('v2');
        const seeded = appendToRedoStack(
            appendToRedoStack(
                buildFlowHistorySnapshot(true), xDyDkxEPwtcNmJVknUHDsg,
            ),
            v2,
        );
        const r = removeFromRedoStack(seeded);
        assertNotStrictEquals(r.snapshot, seeded);
        assertStrictEquals(r.version?.id, 'v2');
        assertStrictEquals(r.snapshot.redoStack.length, 1);
        assertStrictEquals(
            r.snapshot.redoStack[0]?.id, 'xDyDkxEPwtcNmJVknUHDsg',
        );
        // Input snapshot unchanged.
        assertStrictEquals(seeded.redoStack.length, 2);
    },
);

Deno.test(
    'F35 round-trip: pushing a version onto'
    + ' the redo stack then popping returns it',
    () => {
        // Algorithmic core only. F35 in TEST-PLAN.md
        // covers the full performUndo/performRedo
        // user-visible round-trip in the manual
        // browser regression protocol.
        const v = buildVersion('snapshot-pre-delete');
        const initial: FlowHistorySnapshot =
            buildFlowHistorySnapshot(true);
        const pushed = appendToRedoStack(initial, v);
        const popped = removeFromRedoStack(pushed);
        assertEquals(popped.version, v);
        assertEquals(
            popped.snapshot.redoStack, [],
        );
    },
);
