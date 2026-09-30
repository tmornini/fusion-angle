import { assertEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { testHashPassword } from './mock-seed.ts';
import { workOrderHistoryFor } from '../api/derive-states.ts';
import { now as seedNow } from '../api/mock-data/seed-kit.ts';
import { microsOf, stampOfMicros } from '../shared/pair-root.ts';
import { MS_PER_DAY } from '../shared/types.ts';
import type { WorkOrderHistoryEventEntity } from '../shared/types.ts';

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
        ReadonlyArray<WorkOrderHistoryEventEntity>
    >,
};

const capturedDayMs = Date.parse(fixture.captured_on + 'T00:00:00Z');
const shiftDays = Math.round(
    (seedNow.getTime() - capturedDayMs) / MS_PER_DAY,
);
const shiftMicros = BigInt(shiftDays) * BigInt(MS_PER_DAY) * 1000n;

function shiftedRow(
    row: WorkOrderHistoryEventEntity,
): WorkOrderHistoryEventEntity {
    return {
        ...row,
        at: stampOfMicros(microsOf(row.at) + shiftMicros),
    };
}

const expected = Object.fromEntries(
    Object.entries(fixture.histories).map(
        ([key, rows]) => [key, rows.map(shiftedRow)],
    ),
);

Deno.test('every seeded work order keeps its history', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    for (const [key, rows] of Object.entries(expected)) {
        const [organization, workOrder] = key.split('/');
        const actual = await workOrderHistoryFor(
            db, organization!, workOrder!,
        ).catch((error: unknown) => {
            throw new Error(
                'the history of ' + key + ' did not derive',
                { cause: error },
            );
        });
        assertEquals(actual, rows, key);
    }
});
