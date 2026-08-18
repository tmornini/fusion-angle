import type { Route } from './routes.ts';

export const HTTP_VERBS = [
    'get', 'put', 'post', 'patch', 'delete',
] as const;

export type HttpVerb = (typeof HTTP_VERBS)[number];

export function offeredVerbs(
    row: Route,
): readonly HttpVerb[] {
    const extra = Object.keys(row).filter(
        (key) =>
            key !== 'segments'
            && !(HTTP_VERBS as readonly string[])
                .includes(key)
            && typeof (row as unknown as
                Record<string, unknown>)[key]
                === 'function',
    );
    if (extra.length > 0) {
        throw new Error(
            'sixth verb without a sixth column: '
            + extra.join(','),
        );
    }
    return HTTP_VERBS.filter(
        (verb) => row[verb] !== undefined,
    );
}

export function routePatternOf(row: Route): string {
    return row.segments.join('/');
}

export function uriOf(row: Route): string {
    const joined = '/' + row.segments.join('/');
    return joined === '/' ? '/' : joined;
}
