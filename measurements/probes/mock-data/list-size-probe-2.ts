// Throwaway probe 2: three shapes of a list response on mock data.
//   bodies    — today's JSON array of bare document bodies
//   multipart — item 1's bundle of whole responses
//   jsonResp  — a JSON array of whole responses, each in the
//               http-message library's own JSON form
import { seededMockDb } from
    '../../../tests/mock-seed.ts';
import { HttpMessage } from
    '../../../shared/http-message/http-message.ts';

const IDENTIFIER = /^[A-Za-z0-9_-]{22}$/;
const encoder = new TextEncoder();
const CRLF = '\r\n';
const PART_FRAME = '--0123456789abcdefghijkl' + CRLF
    + 'Content-Type: application/http; msgtype=response' + CRLF
    + CRLF;

interface Row {
    path: string;
    name: string;
    method: string;
    response: string;
    response_at: string;
}

function servedWire(bodyRegion: string): string {
    return 'HTTP/1.1 200 ' + CRLF
        + 'content-length: ' + bodyRegion.length + CRLF
        + 'content-type: application/json' + CRLF
        + 'date: Sat, 19 Sep 2026 12:00:00 GMT' + CRLF
        + 'etag: "0123456789abcdefghijkl"' + CRLF
        + 'operation-id: 0123456789abcdefghijkl' + CRLF
        + 'request-id: 0123456789abcdefghijkl' + CRLF
        + CRLF + bodyRegion;
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

interface Tally {
    docs: number;
    bodies: number;
    multipart: number;
    jsonResp: number;
}
const byPattern = new Map<string, Tally>();
for (const head of heads.values()) {
    if (head.method !== 'PUT') continue;
    const boundary = head.response.indexOf(CRLF + CRLF);
    const bodyRegion = head.response.slice(boundary + 4);
    if (bodyRegion.length === 0) continue;
    const wire = servedWire(bodyRegion);
    const json = HttpMessage.fromWire(wire).toJson();
    const pattern = head.path.split('/')
        .map((s) => IDENTIFIER.test(s) ? ':id' : s).join('/');
    const tally = byPattern.get(pattern)
        ?? { docs: 0, bodies: 0, multipart: 0, jsonResp: 0 };
    tally.docs += 1;
    // +1 per item for the comma between array items
    tally.bodies += bodyRegion.length + 1;
    tally.multipart += PART_FRAME.length + wire.length + 2;
    tally.jsonResp += encoder.encode(json).length + 1;
    byPattern.set(pattern, tally);
}

const total: Tally = { docs: 0, bodies: 0, multipart: 0, jsonResp: 0 };
function pct(grown: number, base: number): string {
    return ('+' + Math.round(100 * (grown - base) / base) + '%')
        .padStart(8);
}
console.log('pattern'.padEnd(48),
    ' docs  meanB  multipart  jsonResp');
for (const [pattern, t] of [...byPattern].sort(
    (a, b) => b[1].bodies - a[1].bodies,
)) {
    total.docs += t.docs;
    total.bodies += t.bodies;
    total.multipart += t.multipart;
    total.jsonResp += t.jsonResp;
    console.log(pattern.padEnd(48),
        String(t.docs).padStart(5),
        String(Math.round(t.bodies / t.docs)).padStart(6),
        pct(t.multipart, t.bodies), ' ',
        pct(t.jsonResp, t.bodies));
}
console.log('ALL'.padEnd(48),
    String(total.docs).padStart(5),
    String(Math.round(total.bodies / total.docs)).padStart(6),
    pct(total.multipart, total.bodies), ' ',
    pct(total.jsonResp, total.bodies));
const sample = [...heads.values()].find((h) =>
    h.method === 'PUT' && h.path.endsWith('/members/'));
if (sample !== undefined) {
    const region = sample.response.slice(
        sample.response.indexOf(CRLF + CRLF) + 4);
    console.log('\none member as a JSON-form response:');
    console.log(HttpMessage.fromWire(servedWire(region)).toJson());
}
