// Host entry for ./bin/develop. deno run only.
// The compiled binary embeds its site and does
// not take this path.

import { toFileUrl } from '@std/path';
import { dispatch } from './main.ts';

const enc = new TextEncoder();
const USAGE = 'Usage: develop-main.ts dir/\n';

function reject(): never {
    Deno.stderr.writeSync(enc.encode(USAGE));
    Deno.exit(1);
}

const dir = Deno.args[0];
if (Deno.args.length !== 1
    || dir === undefined
    || !dir.startsWith('/')
    || !dir.endsWith('/')) {
    reject();
}

Deno.exit(await dispatch(
    toFileUrl(dir),
    ['serve'],
));
