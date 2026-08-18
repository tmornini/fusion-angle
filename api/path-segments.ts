// After the leading slash, a trailing / is a
// real last segment. matchRoute compares it to
// route('collection/').segments, which is
// [family, ''].
export function pathSegmentsOf(
    pathname: string,
): string[] {
    const stripped = pathname.replace(/^\/+/, '');
    if (stripped === '') return [];
    return stripped.split('/');
}
