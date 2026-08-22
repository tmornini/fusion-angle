import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test(
    'buildFlowHistorySnapshot(false) yields'
    + ' clean snapshot with no undo history',
    () => {
        const s = buildFlowHistorySnapshot(false);
        assert.equal(s.hasUndoHistory, false);
        assert.deepEqual(s.redoStack, []);
    },
);

test(
    'buildFlowHistorySnapshot(true) marks'
    + ' undo history present, empty redo stack',
    () => {
        const s = buildFlowHistorySnapshot(true);
        assert.equal(s.hasUndoHistory, true);
        assert.deepEqual(s.redoStack, []);
    },
);

test(
    'canUndoFlowEdits returns hasUndoHistory'
    + ' verbatim',
    () => {
        const yes = buildFlowHistorySnapshot(true);
        const no = buildFlowHistorySnapshot(false);
        assert.equal(canUndoFlowEdits(yes), true);
        assert.equal(canUndoFlowEdits(no), false);
    },
);

test(
    'canRedoFlowEdits is true iff redo stack'
    + ' is non-empty',
    () => {
        const empty = buildFlowHistorySnapshot(true);
        assert.equal(canRedoFlowEdits(empty), false);
        const filled = appendToRedoStack(
            empty, buildVersion('xDyDkxEPwtcNmJVknUHDsg'),
        );
        assert.equal(
            canRedoFlowEdits(filled), true,
        );
    },
);

test(
    'recordFlowMutation sets hasUndoHistory'
    + ' and leaves redo stack empty (F37)',
    () => {
        const result = recordFlowMutation();
        assert.equal(result.hasUndoHistory, true);
        assert.deepEqual(result.redoStack, []);
    },
);

test(
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
        assert.notEqual(off, seeded);
        assert.equal(off.hasUndoHistory, false);
        assert.equal(off.redoStack.length, 1);
        assert.equal(off.redoStack[0]?.id, 'xDyDkxEPwtcNmJVknUHDsg');
        // Input unchanged.
        assert.equal(seeded.hasUndoHistory, true);
    },
);

test(
    'appendToRedoStack pushes version'
    + ' without mutating original',
    () => {
        const s = buildFlowHistorySnapshot(true);
        const v = buildVersion('xDyDkxEPwtcNmJVknUHDsg');
        const next = appendToRedoStack(s, v);
        assert.notEqual(next, s);
        assert.equal(next.redoStack.length, 1);
        assert.equal(next.redoStack[0]?.id, 'xDyDkxEPwtcNmJVknUHDsg');
        assert.equal(next.hasUndoHistory, true);
        // Original snapshot unchanged.
        assert.equal(s.redoStack.length, 0);
    },
);

test(
    'removeFromRedoStack on empty stack'
    + ' returns same snapshot and undefined version',
    () => {
        const s = buildFlowHistorySnapshot(true);
        const r = removeFromRedoStack(s);
        assert.equal(r.version, undefined);
        assert.deepEqual(r.snapshot, s);
    },
);

test(
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
        assert.notEqual(r.snapshot, seeded);
        assert.equal(r.version?.id, 'v2');
        assert.equal(r.snapshot.redoStack.length, 1);
        assert.equal(
            r.snapshot.redoStack[0]?.id, 'xDyDkxEPwtcNmJVknUHDsg',
        );
        // Input snapshot unchanged.
        assert.equal(seeded.redoStack.length, 2);
    },
);

test(
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
        assert.deepEqual(popped.version, v);
        assert.deepEqual(
            popped.snapshot.redoStack, [],
        );
    },
);
