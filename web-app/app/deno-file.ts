// File presence and the asset-manifest object, shared
// by the Deno scripts. A browser bundle must not
// import this module: exists calls Deno.statSync.

export function exists(path: string): boolean {
    try {
        Deno.statSync(path);
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }
        throw error;
    }
}

export function manifestOf(
    value: unknown,
): Record<string, string> {
    if (value === null
        || typeof value !== 'object'
        || Array.isArray(value)) {
        throw new Error(
            'asset-manifest.json is not an object',
        );
    }
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(value)) {
        if (typeof val !== 'string') {
            throw new Error(
                'asset-manifest.json values must be'
                    + ' strings',
            );
        }
        out[key] = val;
    }
    return out;
}
