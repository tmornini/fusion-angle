// Scratch schema for one live Postgres file. The
// suffix is that file's own, so two files never share
// a schema.

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function schemaName(suffix: string): string {
    const base = Deno.env.get('SCHEMA_NAME')
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(Deno.pid)
        );
    const name = base + suffix;
    if (!IDENT.test(name)) {
        throw new Error('invalid SCHEMA_NAME');
    }
    return name;
}

export function quoteIdent(name: string): string {
    return '"' + name + '"';
}

export function urlWithSearchPath(
    url: string,
    schema: string,
): string {
    const parsed = new URL(url);
    parsed.searchParams.set('search_path', schema);
    return parsed.href;
}
