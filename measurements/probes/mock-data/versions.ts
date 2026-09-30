import { memoryDbAdapter } from '../../../api/db-memory.ts';
import { postMockDataLoad } from '../../../api/mock-data.ts';
import { testHashPassword } from '../../../tests/mock-seed.ts';

const db = memoryDbAdapter();
await postMockDataLoad(db, { hashPassword: testHashPassword });
const pairs = await db.messagePairs.getAll() as unknown as
    { path: string; name: string; method: string }[];
const versions = new Map<string, number>();
for (const pair of pairs) {
    if (pair.method !== 'PUT' && pair.method !== 'DELETE') continue;
    const key = pair.path + pair.name;
    versions.set(key, (versions.get(key) ?? 0) + 1);
}
const counts = [...versions.values()].sort((a, b) => a - b);
const at = (q: number) => counts[Math.min(counts.length - 1,
    Math.floor(q * counts.length))];
const histogram = new Map<number, number>();
for (const c of counts) histogram.set(c, (histogram.get(c) ?? 0) + 1);
console.log(JSON.stringify({
    pairs: pairs.length,
    putOrDeletePairs: counts.reduce((a, b) => a + b, 0),
    documents: counts.length,
    mean: +(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2),
    median: at(0.5), p95: at(0.95), p99: at(0.99),
    max: counts[counts.length - 1],
    histogram: Object.fromEntries([...histogram].sort((a, b) => a[0] - b[0])),
    top: [...versions].sort((a, b) => b[1] - a[1]).slice(0, 5),
}, null, 1));
