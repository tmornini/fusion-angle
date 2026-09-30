import { assert, assertEquals } from '@std/assert';
import { seededMockDb } from './mock-seed.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';

// Every head a read serves names itself (spec finding 3):
// its stored etag line is its own pair, and it carries a
// body and a content-type. Two heads are exempt, and no
// GET serves either: a work order's binding, whose
// response answers the parent's state, and the root.
function served(path: string): boolean {
    return path !== '/migrations/'
        && !path.endsWith('/binding/');
}

Deno.test('every head a read serves names itself',
async () => {
    const db = await seededMockDb();
    const heads = new Map<string, {
        id: string, path: string, name: string,
        method: string, response: string,
        response_at: string,
    }>();
    for (const pair of await db.messagePairs.getAll()) {
        if (pair.method !== 'PUT' && pair.method !== 'DELETE') {
            continue;
        }
        const key = pair.path + '\u0000' + pair.name;
        const prior = heads.get(key);
        if (
            prior === undefined
            || prior.response_at < pair.response_at
            || (prior.response_at === pair.response_at
                && prior.id < pair.id)
        ) {
            heads.set(key, pair);
        }
    }
    const wrong: string[] = [];
    let checked = 0;
    for (const head of heads.values()) {
        if (head.method !== 'PUT' || !served(head.path)) continue;
        checked++;
        const model = parseWire(head.response);
        const lines = new Map(model.fields.map(
            (field) => [field.name, field.value],
        ));
        if (
            lines.get('etag') !== '"' + head.id + '"'
            || model.body === undefined
            || !lines.has('content-type')
        ) {
            wrong.push(head.path + head.name);
        }
    }
    assert(checked > 500, 'the seed holds its heads');
    assertEquals(wrong, []);
});
