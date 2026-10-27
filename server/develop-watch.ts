// Prints "rebuild" when a directory from argv changes.
// ./bin/develop recomposes the site on each line.
// Access events are ignored so a bundle's own reads
// do not schedule another bundle.

const enc = new TextEncoder();
const USAGE = 'Usage: develop-watch.ts dir/\n';
const QUIET_MS = 200;
const STARTUP_MS = 300;

function reject(): never {
    Deno.stderr.writeSync(enc.encode(USAGE));
    Deno.exit(1);
}

if (Deno.args.length === 0) reject();

const roots: string[] = [];
for (const root of Deno.args) {
    if (!root.startsWith('/')) reject();
    roots.push(root);
}

const watcher = Deno.watchFs(roots);
const readyAt = Date.now() + STARTUP_MS;
let pending: ReturnType<typeof setTimeout> | undefined;

function schedule(): void {
    if (pending !== undefined) clearTimeout(pending);
    pending = setTimeout(() => {
        pending = undefined;
        Deno.stdout.writeSync(enc.encode('rebuild\n'));
    }, QUIET_MS);
}

for await (const event of watcher) {
    if (event.kind === 'access') continue;
    if (Date.now() < readyAt) continue;
    schedule();
}
