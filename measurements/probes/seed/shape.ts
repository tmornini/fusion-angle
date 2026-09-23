// The seed's shape on the memory backend: pairs, chain
// depth, re-creations after a DELETE, operation ids, bytes,
// and the rows a depth batch would classify as matched.
import { memoryDbAdapter } from '../../../api/db-memory.ts';
import {
    postBootstrap,
    postMockDataLoad,
} from '../../../api/mock-data.ts';
import { testHashPassword } from '../../../tests/mock-seed.ts';

type Row = {
    id: string; operation_id: string; path: string; name: string;
    method: string; response_at: string; request: string;
    secret: string; response: string;
};

const ROOT = '/migrations/' + '\u0000' + '0000-root';
const MAX_PARAMETERS = 65535;
const PARAMETERS_PER_ROW = 14;
const LEADING_PARAMETERS = 1;

const body = (wire: string) => {
    const at = wire.indexOf('\r\n\r\n');
    return at < 0 ? '' : wire.slice(at + 4);
};
const header = (wire: string, name: string) => {
    const head = wire.slice(0, Math.max(0, wire.indexOf('\r\n\r\n')));
    const line = head.split('\r\n')
        .find((l) => l.toLowerCase().startsWith(name + ':'));
    return line === undefined ? undefined : line.slice(name.length + 1)
        .trim();
};
const histogram = (values: number[]) => {
    const h = new Map<number, number>();
    for (const v of values) h.set(v, (h.get(v) ?? 0) + 1);
    return Object.fromEntries([...h].sort((a, b) => a[0] - b[0]));
};

async function shape(label: string, seed: 'mock-data' | 'bootstrap') {
    const db = memoryDbAdapter();
    if (seed === 'mock-data') {
        await postMockDataLoad(db, { hashPassword: testHashPassword });
    } else {
        await postBootstrap(db, { hashPassword: testHashPassword });
    }
    const all = await db.messagePairs.getAll() as unknown as Row[];
    const rows = all.filter((r) => r.path + '\u0000' + r.name !== ROOT);
    const documents = new Map<string, Row[]>();
    const others: Row[] = [];
    for (const r of rows) {
        const key = r.path + '\u0000' + r.name;
        if (r.method === 'PUT' || r.method === 'DELETE') {
            documents.set(key, [...(documents.get(key) ?? []), r]);
        } else {
            others.push(r);
        }
    }
    const order = (a: Row, b: Row) => a.response_at < b.response_at
        ? -1 : a.response_at > b.response_at ? 1
        : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    const depths: number[] = [];
    const recreated: string[] = [];
    const deletes: string[] = [];
    const matchedSuccessors: string[] = [];
    const deep: [string, string[]][] = [];
    for (const [key, chain] of documents) {
        chain.sort(order);
        depths.push(chain.length);
        if (chain.length > 1) {
            deep.push([key.replace('\u0000', ''),
                chain.map((r) => r.method)]);
        }
        chain.forEach((r, i) => {
            if (r.method === 'DELETE') deletes.push(key);
            const previous = chain[i - 1];
            if (previous === undefined) return;
            if (previous.method === 'DELETE' && r.method === 'PUT') {
                recreated.push(key);
            }
            if (body(previous.response) === body(r.response)) {
                matchedSuccessors.push(key);
            }
        });
    }
    const othersOnDocuments = others.filter((r) =>
        documents.has(r.path + '\u0000' + r.name));
    const othersMatchingTheirDocument = othersOnDocuments.filter((r) =>
        documents.get(r.path + '\u0000' + r.name)!.some((d) =>
            body(d.response) === body(r.response)));
    const latched = rows.filter((r) =>
        header(r.request, 'if-match') !== undefined).length;
    const byOperation = new Map<string, number>();
    for (const r of rows) {
        byOperation.set(r.operation_id,
            (byOperation.get(r.operation_id) ?? 0) + 1);
    }
    const bytes = rows.map((r) =>
        r.request.length + r.secret.length + r.response.length);
    const maxDepth = Math.max(...depths);
    const atDepth: number[] = [];
    for (let d = 1; d <= maxDepth; d++) {
        atDepth.push(depths.filter((n) => n >= d).length
            + (d === 1 ? others.length : 0));
    }
    const rowsPerStatement = Math.floor(
        MAX_PARAMETERS / 2 / PARAMETERS_PER_ROW);
    const ceilingRows = Math.floor(
        (MAX_PARAMETERS - LEADING_PARAMETERS) / PARAMETERS_PER_ROW);
    const statements = (perStatement: number) => atDepth
        .map((n) => Math.ceil(n / perStatement))
        .reduce((a, b) => a + b, 0);
    console.log(JSON.stringify({
        label,
        pairs: rows.length,
        methods: Object.fromEntries([...new Set(rows.map((r) => r.method))]
            .map((m) => [m, rows.filter((r) => r.method === m).length])),
        documents: documents.size,
        depthHistogram: histogram(depths),
        maxDepth,
        rowsAtDepth: atDepth,
        deepChains: deep,
        deletes: deletes.length,
        recreatedAfterDelete: recreated.length,
        matchedSuccessors: matchedSuccessors.length,
        othersOnADocument: othersOnDocuments.length,
        othersMatchingTheirDocument: othersMatchingTheirDocument
            .map((r) => r.method + ' ' + r.path.replace(
                /[A-Za-z0-9_-]{22}/g, ':id')),
        latchedRows: latched,
        operationIds: byOperation.size,
        pairsPerOperation: histogram([...byOperation.values()]),
        bytes: {
            total: bytes.reduce((a, b) => a + b, 0),
            maxRow: Math.max(...bytes),
        },
        batching: {
            rowsPerStatementHalf: rowsPerStatement,
            parametersAtHalf: LEADING_PARAMETERS
                + rowsPerStatement * PARAMETERS_PER_ROW,
            ceilingRows,
            statementsAtHalf: statements(rowsPerStatement),
            statementsAtCeiling: statements(ceilingRows),
        },
    }, null, 1));
}

await shape('mock-data', 'mock-data');
await shape('bootstrap', 'bootstrap');
