import postgres from 'postgres';

const url = Deno.env.get('FA_PROBE_POSTGRES_URL');
if (url === undefined) {
    throw new Error('FA_PROBE_POSTGRES_URL is required');
}
const BATCH_PAIRS = 500;
const TOTAL_PAIRS = 5000;
const fail = Deno.args[0] === 'fail';
const sql = postgres(url, { max: 1, connect_timeout: 5, fetch_types: false });
const encode = (text: string) => new TextEncoder().encode(text);
const rows = Array.from({ length: TOTAL_PAIRS }, (_, index) => ({
    id: crypto.randomUUID(),
    path: '/seed/',
    request: encode('request ' + index),
    response_at: new Date(Date.UTC(2026, 0, 1) + index),
    response: encode('response ' + index),
}));
if (fail) rows[TOTAL_PAIRS - 1]!.id = rows[0]!.id;   // last batch collides
const started = performance.now();
let statements = 0;
try {
    await sql.begin(async (tx) => {
        await tx`SET ROLE fa_owner`;
        await tx.unsafe(`CREATE TABLE driver_pairs (
            id uuid PRIMARY KEY, path text NOT NULL,
            request bytea NOT NULL, response_at timestamptz NOT NULL,
            response bytea NOT NULL)`);
        for (let at = 0; at < rows.length; at += BATCH_PAIRS) {
            await tx`INSERT INTO driver_pairs ${
                tx(rows.slice(at, at + BATCH_PAIRS))}`;
            statements += 1;
        }
    });
    console.log('seed committed:', statements, 'insert statements,',
        Math.round(performance.now() - started), 'ms');
} catch (error) {
    console.log('seed failed and rolled back:', (error as Error).message);
}
const left = await sql`
    SELECT to_regclass('public.driver_pairs') IS NOT NULL AS table_exists`;
console.log('table exists afterwards:', left[0]?.table_exists);
if (left[0]?.table_exists) {
    const counted = await sql`
        SELECT count(*)::int AS pairs,
               min(length(request)) AS shortest_request FROM driver_pairs`;
    console.log('pairs landed:', counted[0]?.pairs,
        '; bytes survived:', counted[0]?.shortest_request > 0);
}
await sql.end({ timeout: 2 });
