import {
    assert,
    assertNotEquals,
    assertStrictEquals,
} from '@std/assert';
import { join } from '@std/path';
import { isHashedAssetName } from
    '../server/http-server.ts';

const JS_SPEC =
    /(from|import\(|import)(['"])(\.\/[^'"]+)\2/g;

function specifiersOf(source: string): string[] {
    const out: string[] = [];
    const re = new RegExp(JS_SPEC.source, 'g');
    for (;;) {
        const match = re.exec(source);
        if (match === null) break;
        const spec = match[3];
        if (spec === undefined) continue;
        out.push(spec.slice(2));
    }
    return out;
}

function jsFiles(assetsDir: string): string[] {
    const names: string[] = [];
    for (const entry of Deno.readDirSync(assetsDir)) {
        if (!entry.isFile) continue;
        if (!entry.name.endsWith('.js')) continue;
        names.push(entry.name);
    }
    return names;
}

function assertGraphResolves(assetsDir: string): void {
    const names = new Set(jsFiles(assetsDir));
    for (const name of names) {
        assert(
            isHashedAssetName(name),
            'unhashed leftover ' + name,
        );
        const text = Deno.readTextFileSync(
            join(assetsDir, name),
        );
        for (const spec of specifiersOf(text)) {
            assert(
                names.has(spec),
                name + ' imports missing ' + spec,
            );
        }
    }
}

async function runHashStatic(
    dest: string,
): Promise<void> {
    const output = await new Deno.Command('deno', {
        args: [
            'run', '--frozen', '--allow-read',
            '--allow-write=' + dest,
            'web-app/app/hash-static.ts',
            dest,
        ],
    }).output();
    assertStrictEquals(
        output.code,
        0,
        new TextDecoder().decode(output.stderr),
    );
}

function manifestOf(
    dest: string,
): Record<string, string> {
    const raw = JSON.parse(
        Deno.readTextFileSync(
            join(dest, 'asset-manifest.json'),
        ),
    ) as unknown;
    if (raw === null
        || typeof raw !== 'object'
        || Array.isArray(raw)) {
        throw new Error('asset-manifest.json is not an object');
    }
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
        if (typeof val !== 'string') {
            throw new Error(
                'asset-manifest.json values must be strings',
            );
        }
        out[key] = val;
    }
    return out;
}

const A_JS = 'import{x}from"./b.js";export const a=1;\n';
const B_JS = 'import"./a.js";export const x=1;\n';
const C_JS = 'import("./a.js");\n';

async function hashCycle(
    bBody: string,
): Promise<{
    dest: string;
    manifest: Record<string, string>;
}> {
    const dest = await Deno.makeTempDir({
        prefix: 'hash-static-cycle-',
    });
    await Deno.mkdir(join(dest, 'assets'));
    await Deno.writeTextFile(
        join(dest, 'assets', 'a.js'), A_JS,
    );
    await Deno.writeTextFile(
        join(dest, 'assets', 'b.js'), bBody,
    );
    await Deno.writeTextFile(
        join(dest, 'assets', 'c.js'), C_JS,
    );
    await runHashStatic(dest);
    return { dest, manifest: manifestOf(dest) };
}

Deno.test(
    'hashed JS specifiers resolve after a cycle',
    async () => {
        const { dest } = await hashCycle(B_JS);
        try {
            assertGraphResolves(join(dest, 'assets'));
        } finally {
            await Deno.remove(dest, { recursive: true });
        }
    },
);

Deno.test(
    'importer hash moves when a reachable file changes',
    async () => {
        const first = await hashCycle(B_JS);
        const second = await hashCycle(
            'import"./a.js";export const x=2;\n',
        );
        try {
            const c1 = first.manifest['c.js'];
            const c2 = second.manifest['c.js'];
            assert(typeof c1 === 'string');
            assert(typeof c2 === 'string');
            assertNotEquals(c1, c2);
        } finally {
            await Deno.remove(first.dest, {
                recursive: true,
            });
            await Deno.remove(second.dest, {
                recursive: true,
            });
        }
    },
);

async function hashMarkGraph(
    png: Uint8Array,
): Promise<{
    dest: string;
    manifest: Record<string, string>;
}> {
    const dest = await Deno.makeTempDir({
        prefix: 'hash-static-mark-',
    });
    const assets = join(dest, 'assets');
    await Deno.mkdir(assets);
    await Deno.writeFile(join(assets, 'mark.png'), png);
    await Deno.writeTextFile(
        join(assets, 'favicon.svg'),
        '<image href="mark.png"/>\n',
    );
    await Deno.writeTextFile(
        join(assets, 'app.js'),
        'export const src="../assets/mark.png";\n',
    );
    await runHashStatic(dest);
    return { dest, manifest: manifestOf(dest) };
}

Deno.test(
    'hashed JS and SVG name hashed mark.png',
    async () => {
        const { dest, manifest } = await hashMarkGraph(
            new Uint8Array([1, 2, 3, 4]),
        );
        try {
            const mark = manifest['mark.png'];
            const app = manifest['app.js'];
            const svg = manifest['favicon.svg'];
            assert(typeof mark === 'string');
            assert(typeof app === 'string');
            assert(typeof svg === 'string');
            const js = Deno.readTextFileSync(
                join(dest, 'assets', app),
            );
            assert(
                js.includes(mark),
                'hashed JS missing hashed mark',
            );
            assert(
                !js.includes('../assets/mark.png'),
                'hashed JS kept logical mark.png',
            );
            const svgText = Deno.readTextFileSync(
                join(dest, 'assets', svg),
            );
            assert(
                svgText.includes(mark),
                'hashed SVG missing hashed mark',
            );
            assert(
                !svgText.includes('href="mark.png"'),
                'hashed SVG kept logical mark.png',
            );
        } finally {
            await Deno.remove(dest, { recursive: true });
        }
    },
);

async function hashImportMarkGraph(
    png: Uint8Array,
): Promise<{
    dest: string;
    manifest: Record<string, string>;
}> {
    const dest = await Deno.makeTempDir({
        prefix: 'hash-static-import-mark-',
    });
    const assets = join(dest, 'assets');
    await Deno.mkdir(assets);
    await Deno.writeFile(join(assets, 'mark.png'), png);
    await Deno.writeTextFile(
        join(assets, 'b.js'),
        'export const src="../assets/mark.png";\n',
    );
    await Deno.writeTextFile(
        join(assets, 'a.js'),
        'import"./b.js";\n',
    );
    await runHashStatic(dest);
    return { dest, manifest: manifestOf(dest) };
}

Deno.test(
    'importer hash moves when a reachable binary changes',
    async () => {
        const first = await hashImportMarkGraph(
            new Uint8Array([1, 2, 3, 4]),
        );
        const second = await hashImportMarkGraph(
            new Uint8Array([9, 8, 7, 6]),
        );
        try {
            const a1 = first.manifest['a.js'];
            const a2 = second.manifest['a.js'];
            assert(typeof a1 === 'string');
            assert(typeof a2 === 'string');
            assertNotEquals(a1, a2);
        } finally {
            await Deno.remove(first.dest, {
                recursive: true,
            });
            await Deno.remove(second.dest, {
                recursive: true,
            });
        }
    },
);

Deno.test(
    'JS hash moves when a named binary changes',
    async () => {
        const first = await hashMarkGraph(
            new Uint8Array([1, 2, 3, 4]),
        );
        const second = await hashMarkGraph(
            new Uint8Array([9, 8, 7, 6]),
        );
        try {
            const a1 = first.manifest['app.js'];
            const a2 = second.manifest['app.js'];
            assert(typeof a1 === 'string');
            assert(typeof a2 === 'string');
            assertNotEquals(a1, a2);
        } finally {
            await Deno.remove(first.dest, {
                recursive: true,
            });
            await Deno.remove(second.dest, {
                recursive: true,
            });
        }
    },
);

Deno.test(
    'hashed server-core graph resolves',
    async () => {
        const dest = await Deno.makeTempDir({
            prefix: 'hash-static-core-',
        });
        try {
            const assets = join(dest, 'assets');
            await Deno.mkdir(assets);
            const bundled = await new Deno.Command(
                'deno',
                {
                    args: [
                        'bundle', '--frozen',
                        '--platform', 'browser',
                        '--format', 'esm',
                        '--code-splitting',
                        '--minify',
                        '--keep-names',
                        '--outdir', assets,
                        'web-app/app/server-core.ts',
                    ],
                },
            ).output();
            assertStrictEquals(
                bundled.code,
                0,
                new TextDecoder().decode(bundled.stderr),
            );
            const entry = join(assets, 'server-core.js');
            try {
                await Deno.stat(entry);
                await Deno.rename(
                    entry, join(assets, 'app.js'),
                );
            } catch (error) {
                if (!(
                    error instanceof Deno.errors.NotFound
                )) {
                    throw error;
                }
            }
            await Deno.copyFile(
                'web-app/assets/mark.png',
                join(assets, 'mark.png'),
            );
            await Deno.copyFile(
                'web-app/assets/favicon.svg',
                join(assets, 'favicon.svg'),
            );
            await runHashStatic(dest);
            assertGraphResolves(assets);
            const manifest = manifestOf(dest);
            const app = manifest['app.js'];
            const mark = manifest['mark.png'];
            const svg = manifest['favicon.svg'];
            assert(typeof app === 'string');
            assert(typeof mark === 'string');
            assert(typeof svg === 'string');
            assert(
                jsFiles(assets).includes(app),
                'hashed app.js missing',
            );
            let namedMark = false;
            for (const name of jsFiles(assets)) {
                const text = Deno.readTextFileSync(
                    join(assets, name),
                );
                assert(
                    !text.includes('../assets/mark.png'),
                    name + ' kept logical mark.png',
                );
                if (text.includes(mark)) namedMark = true;
            }
            assert(
                namedMark,
                'no hashed JS names hashed mark.png',
            );
            const svgText = Deno.readTextFileSync(
                join(assets, svg),
            );
            assert(
                svgText.includes(mark),
                'hashed favicon SVG missing hashed mark',
            );
            assert(
                !svgText.includes('href="mark.png"'),
                'hashed favicon SVG kept logical mark.png',
            );
        } finally {
            await Deno.remove(dest, { recursive: true });
        }
    },
);

async function hashedAppJsForPng(
    png: Uint8Array,
): Promise<string> {
    const dest = await Deno.makeTempDir({
        prefix: 'hash-static-app-png-',
    });
    try {
        const assets = join(dest, 'assets');
        await Deno.mkdir(assets);
        const bundled = await new Deno.Command(
            'deno',
            {
                args: [
                    'bundle', '--frozen',
                    '--platform', 'browser',
                    '--format', 'esm',
                    '--code-splitting',
                    '--minify',
                    '--keep-names',
                    '--outdir', assets,
                    'web-app/app/server-core.ts',
                ],
            },
        ).output();
        assertStrictEquals(
            bundled.code,
            0,
            new TextDecoder().decode(bundled.stderr),
        );
        const entry = join(assets, 'server-core.js');
        try {
            await Deno.stat(entry);
            await Deno.rename(
                entry, join(assets, 'app.js'),
            );
        } catch (error) {
            if (!(
                error instanceof Deno.errors.NotFound
            )) {
                throw error;
            }
        }
        await Deno.writeFile(
            join(assets, 'mark.png'), png,
        );
        await Deno.copyFile(
            'web-app/assets/favicon.svg',
            join(assets, 'favicon.svg'),
        );
        await runHashStatic(dest);
        const app = manifestOf(dest)['app.js'];
        assert(typeof app === 'string');
        return app;
    } finally {
        await Deno.remove(dest, { recursive: true });
    }
}

Deno.test(
    'server-core app.js hash moves when mark.png changes',
    async () => {
        const orig = await Deno.readFile(
            'web-app/assets/mark.png',
        );
        const mutated = new Uint8Array(orig.byteLength + 1);
        mutated.set(orig);
        mutated[orig.byteLength] = 1;
        const first = await hashedAppJsForPng(orig);
        const second = await hashedAppJsForPng(mutated);
        assertNotEquals(first, second);
    },
);
