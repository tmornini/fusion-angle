// The human-readable message of a thrown value: an Error's
// `message`, else the optional `fallback`, else String(value).
// The lone home of the `instanceof Error` extraction the web-app
// layer repeats. A sibling copy lives in api/ so neither imports
// across the boundary — the api tier stays standalone.
export function extractErrorMessage(
    err: unknown,
    fallback?: string,
): string {
    if (err instanceof Error) return err.message;
    return fallback ?? String(err);
}
