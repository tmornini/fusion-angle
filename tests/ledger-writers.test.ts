import { assertEquals } from '@std/assert';
import { walkSync } from '@std/fs';
import { fromFileUrl, join, relative } from '@std/path';

// The roster's organization take lives in executeLedger, so
// a product write that reached the table any other way would
// land a roster row no flow write waits on. Two checks hold
// that door. Every member access named `append` in product
// code is one of the sites named below; the one on a Tx is
// the store's own append, which every store append funnels
// through, so an aliased store (`const pairs =
// db.messagePairs`), a bracketed one, or a raw Tx inside a
// transaction body is a new site and fails. And the table's
// INSERT text, schema-qualified or quoted, lives only in the
// ledger statement and in insertPair, the Postgres append.
// The files are read from the product trees, never listed,
// so one added tomorrow is covered the day it lands; tests/
// seed rows directly and are outside the walk.
const ROOT = fromFileUrl(new URL('..', import.meta.url));
const PRODUCT_TREES = ['api', 'server', 'shared'];
const APPEND_ACCESS =
    /\??\.append\b|\[\s*(['"`])append\1\s*\]/g;
const RECEIVER = /([A-Za-z_$][\w$]*)\s*$/;
const TABLE_INSERT =
    /\bINSERT\s+INTO\s+(?:"?\w+"?\s*\.\s*)?"?fa_message_pairs"?(?!\w)/gi;
const STATEMENT_TEXT = 'api/ledger-statement-sql.ts';
const BACKEND = 'api/backend-postgres.ts';
const BACKEND_APPEND = 'async function insertPair(';

// Each sanctioned `append` site: its file, the receiver the
// access reads from, and why it writes no ledger row.
const APPEND_SITES: readonly {
    readonly file: string;
    readonly receiver: string;
    readonly why: string;
}[] = [
    {
        file: 'api/store-history-entity.ts',
        receiver: 'tx',
        why: "the store's append, after its validator",
    },
    {
        file: 'api/message-pair.ts',
        receiver: 'headers',
        why: 'a Headers of a stored response',
    },
    {
        file: 'api/served-response.ts',
        receiver: 'headers',
        why: 'a Headers of a served response',
    },
    {
        file: 'shared/http-message/media-registry.ts',
        receiver: 'params',
        why: 'a URLSearchParams of a form body',
    },
];

function productSources(): Map<string, string> {
    const sources = new Map<string, string>();
    for (const tree of PRODUCT_TREES) {
        for (const entry of walkSync(join(ROOT, tree), {
            includeDirs: false,
            exts: ['.ts'],
        })) {
            sources.set(
                relative(ROOT, entry.path),
                Deno.readTextFileSync(entry.path),
            );
        }
    }
    return sources;
}

function lineOf(source: string, index: number): number {
    return source.slice(0, index).split('\n').length;
}

// The identifier the access at `index` reads from; none
// when a bracket, call, or literal precedes it.
function receiverAt(
    source: string,
    index: number,
): string | undefined {
    return RECEIVER.exec(source.slice(0, index))?.[1];
}

// The span of insertPair's body: from its signature to the
// first closing brace at the start of a line.
function backendAppendSpan(source: string): [number, number] {
    const start = source.indexOf(BACKEND_APPEND);
    if (start === -1) {
        throw new Error(
            BACKEND + ' has no ' + BACKEND_APPEND
            + ' — the pin cannot tell its append from a bypass',
        );
    }
    return [start, source.indexOf('\n}\n', start)];
}

Deno.test('every product append is a named site', () => {
    const offenders: string[] = [];
    const found = new Set<string>();
    for (const [file, source] of productSources()) {
        for (const match of source.matchAll(APPEND_ACCESS)) {
            const receiver = receiverAt(source, match.index);
            const site = APPEND_SITES.find((candidate) =>
                candidate.file === file
                && candidate.receiver === receiver,
            );
            if (site === undefined) {
                offenders.push(
                    file + ':'
                    + String(lineOf(source, match.index)),
                );
                continue;
            }
            found.add(file + ' ' + receiver);
        }
    }
    assertEquals(offenders, []);
    assertEquals(
        APPEND_SITES.filter((site) =>
            !found.has(site.file + ' ' + site.receiver),
        ),
        [],
        'every named site is still in the walk',
    );
});

Deno.test('only the ledger statement and the backend append'
+ ' insert into the table', () => {
    const sources = productSources();
    const backend = sources.get(BACKEND);
    if (backend === undefined) {
        throw new Error(BACKEND + ' is not in the walk');
    }
    const [start, end] = backendAppendSpan(backend);
    const offenders: string[] = [];
    let statementTexts = 0;
    let backendAppends = 0;
    for (const [file, source] of sources) {
        for (const match of source.matchAll(TABLE_INSERT)) {
            if (file === STATEMENT_TEXT) {
                statementTexts += 1;
                continue;
            }
            if (
                file === BACKEND
                && match.index > start
                && match.index < end
            ) {
                backendAppends += 1;
                continue;
            }
            offenders.push(
                file + ':' + String(lineOf(source, match.index)),
            );
        }
    }
    assertEquals(offenders, []);
    assertEquals(
        statementTexts > 0 && backendAppends > 0,
        true,
        'both sanctioned inserts are in the walk',
    );
});
