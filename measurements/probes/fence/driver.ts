import postgres from 'postgres';

const url = Deno.env.get('FA_PROBE_POSTGRES_URL');
if (url === undefined) {
    throw new Error('FA_PROBE_POSTGRES_URL is required');
}
const off = Deno.args[0] === 'off';
const label = off ? 'type lookup switched off' : 'driver defaults';
const sql = postgres(url, {
    max: 1, connect_timeout: 5,
    ...(off ? { fetch_types: false } : {}),
});
try {
    const id = crypto.randomUUID();
    const landed = await sql`
        INSERT INTO api_pairs
        VALUES (${id}, ${'/t/'}, ${new TextEncoder().encode('req')},
                clock_timestamp(), ${new TextEncoder().encode('res')})
        RETURNING id, response_at`;
    const head = await sql`
        SELECT id, response FROM api_pairs
        WHERE path = ${'/t/'}
        ORDER BY response_at DESC, id DESC LIMIT 1`;
    console.log(label + ': insert and head read work;',
        'stamp is a', landed[0]?.response_at?.constructor?.name + ',',
        'response is a', head[0]?.response?.constructor?.name + ',',
        'same id back:', landed[0]?.id === id && head[0]?.id === id);
} catch (error) {
    console.log(label + ': FAILED:', (error as Error).message);
}
await sql.end({ timeout: 2 }).catch(() => {});
