// The browser run's one mock seed. ./bin/test browser runs
// this once, before any file starts, with the path of a
// file in the run's directory; every file then rebuilds
// its backend from the rows landed there (fixtures.ts).

import { landRunSeed } from './fixtures.ts';

const [path, ...extra] = Deno.args;
if (path === undefined || path === '' || extra.length > 0) {
    throw new Error('usage: land-run-seed.ts PATH');
}
await landRunSeed(path);
