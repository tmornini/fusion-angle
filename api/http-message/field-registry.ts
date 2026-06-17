// RFC 8941 is not self-describing: a parser must be told whether
// a field is an Item, a List, or a Dictionary. This allowlist
// supplies that type for the well-known fields; every other
// field is 'raw' and is never structurally parsed (mis-parsing
// Date or Set-Cookie as 8941 would corrupt it). Adding a field
// is one line here.
export type FieldKind = 'item' | 'list' | 'dictionary' | 'raw';

const KINDS: ReadonlyMap<string, FieldKind> = new Map([
    ['cache-control', 'dictionary'],
    ['priority', 'dictionary'],
    ['keep-alive', 'dictionary'],
    ['accept', 'list'],
    ['accept-encoding', 'list'],
    ['accept-language', 'list'],
    ['connection', 'list'],
    ['content-encoding', 'list'],
    ['content-language', 'list'],
    ['te', 'list'],
    ['trailer', 'list'],
    ['vary', 'list'],
    ['via', 'list'],
    ['content-type', 'item'],
    ['age', 'item'],
    ['max-forwards', 'item'],
    ['access-control-max-age', 'item'],
]);

export function kindOf(name: string): FieldKind {
    const kind = KINDS.get(name);
    return kind === undefined ? 'raw' : kind;
}
