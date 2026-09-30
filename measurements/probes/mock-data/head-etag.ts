// Throwaway probe: on the seeded memory ledger, does every
// PUT head's stored `etag` line name its own pair, carry a
// body, and carry a `content-type`? A head read serves the
// stored lines, so a head whose `etag` names another pair
// would hand the client a latch for the wrong document.
import { seededMockDb } from
    '../../../tests/mock-seed.ts';
import { parseWire } from
    '../../../shared/http-message/wire-codec.ts';

interface Row {
    id: string;
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
    if (
        prior === undefined
        || prior.response_at <= pair.response_at
    ) {
        heads.set(key, pair);
    }
}

let putHeads = 0;
let deleteHeads = 0;
let stateDeleted = 0;
const foreignEtag: string[] = [];
const noBody: string[] = [];
const noContentType: string[] = [];
for (const head of heads.values()) {
    if (head.method === 'DELETE') {
        deleteHeads++;
        continue;
    }
    putHeads++;
    const document = head.path + head.name;
    const model = parseWire(head.response);
    const etag = model.fields.find(
        (field) => field.name === 'etag',
    );
    if (etag?.value !== '"' + head.id + '"') {
        foreignEtag.push(document);
    }
    if (model.body === undefined) noBody.push(document);
    if (
        !model.fields.some(
            (field) => field.name === 'content-type',
        )
    ) {
        noContentType.push(document);
    }
    if (/"state":"deleted"/.test(head.response)) stateDeleted++;
}

console.log({
    pairs: all.length,
    putHeads,
    deleteHeads,
    stateDeleted,
    foreignEtag,
    noBody,
    noContentType,
});
