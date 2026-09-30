import { assertEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { testHashPassword } from './mock-seed.ts';
import { workOrderHistoryFor } from '../api/derive-states.ts';

const expected = JSON.parse(Deno.readTextFileSync(
    'tests/fixtures/work-order-histories.json',
)) as Record<string, unknown>;

Deno.test('every seeded work order keeps its history', async () => {
    const db = memoryDbAdapter();
    await postMockDataLoad(db, {
        hashPassword: testHashPassword,
    });
    for (const [key, rows] of Object.entries(expected)) {
        const [organization, workOrder] = key.split('/');
        const actual = await workOrderHistoryFor(
            db, organization!, workOrder!,
        ).catch(() => 'missing');
        assertEquals(actual, rows, key);
    }
});
