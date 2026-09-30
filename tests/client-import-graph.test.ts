import { assertEquals } from '@std/assert';
import { dirname, fromFileUrl, join, relative } from '@std/path';

// The client's boundary is this walk (spec Axiom): from
// its entry point, every static import, export-from, and
// dynamic import resolves inside client/ or shared/, and
// none names a registry — a bare specifier resolves
// through deno.json to one.
const ROOT = fromFileUrl(new URL('..', import.meta.url));
const ENTRY = 'client/index.ts';
const SPECIFIER = new RegExp(
    String.raw`(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)`
        + String.raw`(['"])([^'"\n]+)\1`,
    'g',
);
const INSIDE = ['client/', 'shared/'];

function isComment(source: string, index: number): boolean {
    const lineStart = source.lastIndexOf('\n', index) + 1;
    const lead = source.slice(lineStart, index).trimStart();
    return lead.startsWith('//') || lead.startsWith('*');
}

function walk(): string[] {
    const outside: string[] = [];
    const seen = new Set<string>();
    const queue = [ENTRY];
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = Deno.readTextFileSync(join(ROOT, file));
        for (const match of source.matchAll(SPECIFIER)) {
            if (isComment(source, match.index!)) continue;
            const specifier = match[2]!;
            if (!specifier.startsWith('.')) {
                outside.push(file + ' → ' + specifier);
                continue;
            }
            const target = relative(
                ROOT, join(ROOT, dirname(file), specifier),
            );
            if (!INSIDE.some((dir) => target.startsWith(dir))) {
                outside.push(file + ' → ' + target);
                continue;
            }
            queue.push(target);
        }
    }
    return outside.sort();
}

Deno.test('the client imports only itself and shared/', () => {
    assertEquals(walk(), []);
});
