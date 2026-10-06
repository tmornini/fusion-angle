import { assertEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { testHashPassword } from './mock-seed.ts';
import {
    workOrderClaimEventId,
} from '../api/mock-data/seed-message-pairs.ts';
import { getWorkOrderEvents } from
    './fixtures/work-order-events.ts';
import { organizationToken } from './token-fixtures.ts';
import { now as seedNow } from '../api/mock-data/seed-kit.ts';
import { microsOf, stampOfMicros } from '../shared/pair-root.ts';
import { MS_PER_DAY } from '../shared/types.ts';
import type {
    Id, WorkOrderEventEntity,
} from '../shared/types.ts';

// The fixture's row shape: the server's retired newest-first
// history carried the work order's id on every row.
type WorkOrderHistoryRow = WorkOrderEventEntity & {
    readonly entity_id: Id,
};

// The fixture was captured on captured_on's UTC day; the seed's
// clock (seedNow) is always today's UTC day start. Both are whole
// UTC day boundaries, so the gap between them is a whole number
// of days — no DST, no local time.
const fixture = JSON.parse(Deno.readTextFileSync(
    'tests/fixtures/work-order-histories.json',
)) as {
    captured_on: string,
    histories: Record<
        string,
        ReadonlyArray<WorkOrderHistoryRow>
    >,
};

const capturedDayMs = Date.parse(fixture.captured_on + 'T00:00:00Z');
const shiftDays = Math.round(
    (seedNow.getTime() - capturedDayMs) / MS_PER_DAY,
);
const shiftMicros = BigInt(shiftDays) * BigInt(MS_PER_DAY) * 1000n;

function shiftedRow(
    row: WorkOrderHistoryRow,
): WorkOrderHistoryRow {
    return {
        ...row,
        at: stampOfMicros(microsOf(row.at) + shiftMicros),
    };
}

// The fixture's rows, newest first, as chain-order events:
// oldest first, the path naming the work order, and the
// create's claim birth at the second event's moment (spec §2).
function expectedEvents(
    rows: ReadonlyArray<WorkOrderHistoryRow>,
): WorkOrderEventEntity[] {
    const events = rows.toReversed().map(
        ({ entity_id: _path, ...event }) => event,
    );
    const [start, node, ...moves] = events;
    return [
        start!,
        node!,
        {
            id: workOrderClaimEventId(rows[0]!.entity_id),
            state: 'claimed',
            member_id: start!.member_id,
            at: node!.at,
            field_values: [],
        },
        ...moves,
    ];
}

const shifted = Object.fromEntries(
    Object.entries(fixture.histories).map(
        ([key, rows]) => [key, rows.map(shiftedRow)],
    ),
);

Deno.test('every seeded work order keeps its history,'
+ ' born with its claim', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    for (const [key, rows] of Object.entries(shifted)) {
        const [organization, workOrder] = key.split('/');
        const actual = await getWorkOrderEvents(
            db, await organizationToken(undefined, organization),
            organization!, workOrder!,
        );
        assertEquals(actual, expectedEvents(rows), key);
    }
});

Deno.test('every seeded history holds exactly one claimed'
+ ' birth, at its second event', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    for (const [key, rows] of Object.entries(shifted)) {
        const [organization, workOrder] = key.split('/');
        const actual = await getWorkOrderEvents(
            db, await organizationToken(undefined, organization),
            organization!, workOrder!,
        );
        const births = actual.filter(
            (row) => row.state === 'claimed',
        );
        assertEquals(births.length, 1, key);
        assertEquals(births[0]!.at, rows.at(-2)!.at, key);
    }
});
