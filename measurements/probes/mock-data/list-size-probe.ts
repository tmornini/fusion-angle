// Throwaway probe: how much bigger is a bundled list than today's
// JSON array, per collection, on the mock data?
import { seededMockDb } from
    '../../../tests/mock-seed.ts';
import { parseWire } from
    '../../../shared/http-message/wire-codec.ts';
import { HttpMessage } from
    '../../../shared/http-message/http-message.ts';

const IDENTIFIER = /^[A-Za-z0-9_-]{22}$/;
const encoder = new TextEncoder();

// One bundled part, per item 0's canonical form and item 1's
// multipart/mixed of application/http parts.
function partOverhead(bodyBytes: number): number {
    const lines = [
        '--0123456789abcdefghijkl',
        'Content-Type: application/http; msgtype=response',
        '',
        'HTTP/1.1 200 ',
        'content-length: ' + bodyBytes,
        'content-type: application/json',
        'date: Sat, 19 Sep 2026 12:00:00 GMT',
        'etag: "0123456789abcdefghijkl"',
        'operation-id: 0123456789abcdefghijkl',
        'request-id: 0123456789abcdefghijkl',
        '',
    ];
    // every line ends CRLF; the body is followed by one CRLF
    return lines.reduce((sum, l) => sum + l.length + 2, 0) + 2;
}

interface Row {
    path: string;
    name: string;
    method: string;
    response: string;
    response_at: string;
}

const db = await seededMockDb();
const all = await db.messagePairs.getAll() as unknown as Row[];
const heads = new Map<string, Row>();
for (const pair of all) {
    if (pair.method !== 'PUT' && pair.method !== 'DELETE') continue;
    const key = pair.path + ' :: ' + pair.name;
    const prior = heads.get(key);
    if (prior === undefined
        || prior.response_at <= pair.response_at) {
        heads.set(key, pair);
    }
}

interface Tally { docs: number; body: number; lists: Set<string> }
const byPattern = new Map<string, Tally>();
for (const head of heads.values()) {
    if (head.method !== 'PUT') continue;
    const body = HttpMessage.fromModel(parseWire(head.response))
        .body();
    if (!body.exists()) continue;
    const bytes = encoder.encode(body.toText()).length;
    const pattern = head.path.split('/')
        .map((s) => IDENTIFIER.test(s) ? ':id' : s).join('/');
    const tally = byPattern.get(pattern)
        ?? { docs: 0, body: 0, lists: new Set<string>() };
    tally.docs += 1;
    tally.body += bytes;
    tally.lists.add(head.path);
    byPattern.set(pattern, tally);
}

let totalDocs = 0;
let totalBody = 0;
let totalOver = 0;
console.log(
    'pattern'.padEnd(50), ' docs lists  bytes  over  growth',
);
for (const [pattern, t] of [...byPattern].sort(
    (a, b) => b[1].docs - a[1].docs,
)) {
    const mean = t.body / t.docs;
    const over = partOverhead(Math.round(mean));
    totalDocs += t.docs;
    totalBody += t.body;
    totalOver += over * t.docs;
    console.log([
        pattern.padEnd(50),
        String(t.docs).padStart(5),
        String(t.lists.size).padStart(5),
        String(Math.round(mean)).padStart(6),
        String(over).padStart(5),
        ('+' + Math.round(100 * over / mean) + '%').padStart(7),
    ].join(' '));
}
console.log(
    'ALL'.padEnd(50),
    String(totalDocs).padStart(5),
    '     ',
    String(Math.round(totalBody / totalDocs)).padStart(6),
    '     ',
    ('+' + Math.round(100 * totalOver / totalBody) + '%')
        .padStart(7),
);
console.log('pairs in the mock ledger:', all.length);
