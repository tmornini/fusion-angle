// Resolves a matched route into the message plane's
// (uri_collection, uri_id) address. The route pattern — not
// string inspection — decides whether the last segment is
// an individual id: exactly when the pattern's final
// segment is a :param. The prefix always keeps its trailing
// slash; a collection or operation target stores the empty
// uri_id (a structural key, not an absence sentinel — see
// the spec's two-table key).
export interface MessageAddress {
    readonly uriCollection: string;
    readonly uriId: string;
}

export function messageAddress(
    routeSegments: readonly string[],
    pathSegments: readonly string[],
): MessageAddress {
    if (routeSegments.length !== pathSegments.length) {
        throw new Error(
            'route and path segment counts differ',
        );
    }
    const last = routeSegments[routeSegments.length - 1];
    const idTailed = last !== undefined
        && last.startsWith(':');
    const prefixSegments = idTailed
        ? pathSegments.slice(0, -1)
        : pathSegments;
    const uriId = idTailed
        ? pathSegments[pathSegments.length - 1]!
        : '';
    // A slashed collection is ['family', '']; the empty
    // tail is the collection match, not a prefix segment.
    const prefix = prefixSegments.filter(
        (seg) => seg !== '',
    );
    return {
        uriCollection: '/' + prefix.join('/') + '/',
        uriId,
    };
}
