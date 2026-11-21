// The human-readable message of a thrown value: an Error's
// `message`, else the optional `fallback`, else String(value).
export function extractErrorMessage(
    err: unknown,
    fallback?: string,
): string {
    if (err instanceof Error) return err.message;
    return fallback ?? String(err);
}
