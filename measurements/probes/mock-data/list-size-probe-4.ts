// Throwaway probe 3: the three list shapes, raw and gzipped, with
// realistic per-item ids (constant placeholders would flatter gzip).
import { seededMockDb } from
    '../../../tests/mock-seed.ts';
import { HttpMessage } from
    '../../../shared/http-message/http-message.ts';

const IDENTIFIER = /^[A-Za-z0-9_-]{22}$/;
const CRLF = '\r\n';
const BOUNDARY = '--0123456789abcdefghijkl';
const ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

interface Row {
    id: string;
    path: string;
    name: string;
    method: string;
    response: string;
    response_at: string;
    operation_id: string;
}

function randomId(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(22));
    let out = '';
    for (const b of bytes) out += ALPHABET[b % 64];
    return out;
}

function servedWire(row: Row, bodyRegion: string): string {
    return 'HTTP/1.1 200 ' + CRLF
        + 'content-length: ' + bodyRegion.length + CRLF
        + 'content-type: application/json' + CRLF
        + 'date: Sat, 19 Sep 2026 12:00:00 GMT' + CRLF
        + 'etag: "' + row.id + '"' + CRLF
        + 'operation-id: ' + row.operation_id + CRLF
        + 'request-id: ' + randomId() + CRLF
        + CRLF + bodyRegion;
}

async function gzipBytes(text: string): Promise<number> {
    const stream = new Blob([text]).stream()
        .pipeThrough(new CompressionStream('gzip'));
    return (await new Response(stream).arrayBuffer()).byteLength;
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

interface Shapes { bodies: string[]; json: string[]; parts: string[]; wires: string[] }
const byPattern = new Map<string, Shapes>();
for (const head of heads.values()) {
    if (head.method !== 'PUT') continue;
    const boundary = head.response.indexOf(CRLF + CRLF);
    const bodyRegion = head.response.slice(boundary + 4);
    if (bodyRegion.length < 10) continue;
    const wire = servedWire(head, bodyRegion);
    const pattern = head.path.split('/')
        .map((s) => IDENTIFIER.test(s) ? ':id' : s).join('/');
    const shapes = byPattern.get(pattern)
        ?? { bodies: [], json: [], parts: [], wires: [] };
    shapes.bodies.push(bodyRegion);
    shapes.wires.push(JSON.stringify(wire));
    shapes.json.push(HttpMessage.fromWire(wire).toJson());
    shapes.parts.push(BOUNDARY + CRLF
        + 'Content-Type: application/http; msgtype=response'
        + CRLF + CRLF + wire + CRLF);
    byPattern.set(pattern, shapes);
}

function pct(grown: number, base: number): string {
    return ('+' + Math.round(100 * (grown - base) / base) + '%')
        .padStart(7);
}
const sum = { b: 0, j: 0, m: 0, bz: 0, jz: 0, mz: 0 };
console.log('pattern'.padEnd(40),
    ' docs   raw:bodies  +json  +multi |  gzip:bodies  +json  +multi');
for (const [pattern, s] of [...byPattern].sort(
    (a, b) => b[1].bodies.join().length - a[1].bodies.join().length,
)) {
    const bodies = '[' + s.bodies.join(',') + ']';
    const json = '[' + s.json.join(',') + ']';
    const multi = s.parts.join('') + BOUNDARY + '--' + CRLF;
    const [bz, jz, mz] = await Promise.all(
        [bodies, json, multi].map(gzipBytes));
    sum.b += bodies.length; sum.j += json.length;
    sum.m += multi.length;
    sum.bz += bz!; sum.jz += jz!; sum.mz += mz!;
    if (s.bodies.length < 5) continue;
    console.log(pattern.slice(0, 40).padEnd(40),
        String(s.bodies.length).padStart(5),
        String(bodies.length).padStart(12),
        pct(json.length, bodies.length),
        pct(multi.length, bodies.length), ' |',
        String(bz).padStart(12), pct(jz!, bz!), pct(mz!, bz!));
}
console.log('ALL (every collection)'.padEnd(40), '     ',
    String(sum.b).padStart(12), pct(sum.j, sum.b), pct(sum.m, sum.b),
    ' |', String(sum.bz).padStart(12),
    pct(sum.jz, sum.bz), pct(sum.mz, sum.bz));

// Shape D: a JSON array whose items are the stored response bytes
// (after the two header substitutions), each as a JSON string.
const d = { raw: 0, gz: 0, b: 0, bz: 0 };
console.log('\nshape D — JSON array of stored-response strings');
console.log('pattern'.padEnd(40), ' docs   raw:bodies     +D |  gzip:bodies     +D');
for (const [pattern, s] of [...byPattern].sort(
    (a, b) => b[1].bodies.join().length - a[1].bodies.join().length,
)) {
    const bodies = '[' + s.bodies.join(',') + ']';
    const wires = '[' + s.wires.join(',') + ']';
    const [bz, wz] = await Promise.all([bodies, wires].map(gzipBytes));
    d.b += bodies.length; d.raw += wires.length;
    d.bz += bz!; d.gz += wz!;
    if (s.bodies.length < 11) continue;
    console.log(pattern.slice(0, 40).padEnd(40),
        String(s.bodies.length).padStart(5),
        String(bodies.length).padStart(12), pct(wires.length, bodies.length),
        ' |', String(bz).padStart(12), pct(wz!, bz!));
}
console.log('ALL (every collection)'.padEnd(40), '     ',
    String(d.b).padStart(12), pct(d.raw, d.b), ' |',
    String(d.bz).padStart(12), pct(d.gz, d.bz));
console.log('totals KB — raw D:', Math.round(d.raw / 1000),
    ' gzip D:', Math.round(d.gz / 1000));
