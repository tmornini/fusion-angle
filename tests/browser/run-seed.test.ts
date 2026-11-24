import { assertEquals } from '@std/assert';
import { RUN_SEED_ENV, startOrigin } from './fixtures.ts';

// ./bin/test browser names the run's one seed; a file run
// alone with deno test has none and seeds its own.
const RUN_SEED = Deno.env.get(RUN_SEED_ENV);

// Every seed mints its own ids, times, and passwords, so
// an origin that serves the run seed's rows and sign-ins
// was built from that file, not from a seed of its own.
Deno.test({
    name: 'an origin serves the run seed\'s rows and sign-ins',
    ignore: RUN_SEED === undefined,
    fn: async () => {
        const landed = JSON.parse(
            await Deno.readTextFile(RUN_SEED!),
        ) as {
            readonly rows: unknown;
            readonly credentials: unknown;
        };
        const origin = await startOrigin();
        try {
            assertEquals(
                await origin.db.messagePairs.getAll(),
                landed.rows,
            );
            assertEquals(origin.credentials, landed.credentials);
        } finally {
            await origin.close();
        }
    },
});
