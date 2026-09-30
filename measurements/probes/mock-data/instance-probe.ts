import { seededMockDb } from
    '../../../tests/mock-seed.ts';
const db = await seededMockDb();
const all = await db.messagePairs.getAll() as unknown as {
    path: string; name: string; method: string;
    request: string; response: string; response_at: string;
}[];
const rows = all.filter((p) => p.path.endsWith('/instances/'));
for (const row of rows) {
    const cut = (s: string) => s.slice(s.indexOf('\r\n\r\n') + 4);
    console.log(row.method.padEnd(6), row.response_at,
        '| response body:', JSON.stringify(cut(row.response)).slice(0, 60),
        '| request body bytes:', cut(row.request).length);
}
