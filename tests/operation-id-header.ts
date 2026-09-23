import { generateIdentifier } from
    '../shared/identifier.ts';

// Direct in-process writes must carry operation-id.
// The facade does not mint one. An extra list that
// already names it is returned unchanged, so a replay
// keeps the id it supplied.
export function operationIdHeader(
    extra?: readonly (readonly [string, string])[],
): readonly (readonly [string, string])[] {
    const line: readonly [string, string] = [
        'operation-id',
        generateIdentifier(),
    ];
    if (extra === undefined) return [line];
    for (const [name] of extra) {
        if (name.toLowerCase() === 'operation-id') {
            return extra;
        }
    }
    return [line, ...extra];
}
