import type { Route } from './routes.ts';

export const HTTP_VERBS = [
    'get', 'query', 'put', 'post', 'patch', 'delete',
] as const;

export type HttpVerb = (typeof HTTP_VERBS)[number];

// A row's `query` key is the GET's query-string judge, not
// the QUERY method: a QUERY is offered by `selectMatching`.
export function offeredVerbs(
    row: Route,
): readonly HttpVerb[] {
    const extra = Object.keys(row).filter(
        (key) =>
            key !== 'segments'
            && key !== 'select'
            && key !== 'selectMatching'
            && key !== 'query'
            && !(HTTP_VERBS as readonly string[])
                .includes(key)
            && typeof (row as unknown as
                Record<string, unknown>)[key]
                === 'function',
    );
    if (extra.length > 0) {
        throw new Error(
            'seventh verb without a seventh column: '
            + extra.join(','),
        );
    }
    return HTTP_VERBS.filter((verb) =>
        verb === 'get'
            ? row.select !== undefined
            : verb === 'query'
                ? row.selectMatching !== undefined
                : row[verb] !== undefined);
}

export function routePatternOf(row: Route): string {
    return row.segments.join('/');
}

export function uriOf(row: Route): string {
    const joined = '/' + row.segments.join('/');
    return joined === '/' ? '/' : joined;
}
