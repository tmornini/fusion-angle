import {
    basename,
    dirname,
    extname,
    join,
} from '@std/path';
import { sha256HexOfBytes } from '../../shared/digest.ts';

const HASHED_NAME = /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;
const HASH_SLICE = /\.[0-9a-f]{8,}(?=\.[a-z0-9]+$)/i;
const JS_SPEC =
    /(from|import\(|import)(['"])(\.\/[^'"]+)\2/g;
const GZIP_EXTS = new Set([
    '.html', '.js', '.css', '.svg',
]);

function isHashedAssetName(name: string): boolean {
    return HASHED_NAME.test(name);
}

function logicalAssetName(name: string): string {
    if (!isHashedAssetName(name)) return name;
    return name.replace(HASH_SLICE, '');
}

function nameWithHash(
    logical: string,
    hex: string,
): string {
    const ext = extname(logical);
    const base = logical.slice(
        0, logical.length - ext.length,
    );
    return base + '.' + hex + ext;
}

async function hashedFileName(
    logical: string,
    bytes: Uint8Array,
): Promise<string> {
    const hex = (await sha256HexOfBytes(bytes))
        .slice(0, 16);
    return nameWithHash(logical, hex);
}

function concatBytes(
    chunks: readonly Uint8Array[],
): Uint8Array {
    let size = 0;
    for (const chunk of chunks) size += chunk.byteLength;
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out;
}

function reachableOf(
    start: string,
    depsOf: ReadonlyMap<string, string[]>,
): string[] {
    const seen = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node === undefined || seen.has(node)) {
            continue;
        }
        seen.add(node);
        for (const dep of depsOf.get(node) ?? []) {
            stack.push(dep);
        }
    }
    return [...seen];
}

async function hashedJsName(
    logical: string,
    unrewritten: Uint8Array,
    h0Of: ReadonlyMap<string, string>,
    depsOf: ReadonlyMap<string, string[]>,
    extraLogicals: readonly string[],
): Promise<string> {
    const names = new Set(reachableOf(logical, depsOf));
    for (const extra of extraLogicals) names.add(extra);
    const h0Sorted: string[] = [];
    for (const name of names) {
        const hex = h0Of.get(name);
        if (hex !== undefined) h0Sorted.push(hex);
    }
    h0Sorted.sort();
    const extra = new TextEncoder().encode(
        '\0' + h0Sorted.join('\0'),
    );
    const finger = concatBytes([unrewritten, extra]);
    const hex = (await sha256HexOfBytes(finger))
        .slice(0, 16);
    return nameWithHash(logical, hex);
}

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

function rewriteJsImports(
    source: string,
    manifest: Readonly<Record<string, string>>,
): string {
    const re = new RegExp(JS_SPEC.source, 'g');
    return source.replace(
        re,
        (whole, kind, quote, spec) => {
            if (typeof kind !== 'string'
                || typeof quote !== 'string'
                || typeof spec !== 'string') {
                return whole;
            }
            const logical = spec.slice(2);
            const hashed = manifest[logical];
            if (hashed === undefined) return whole;
            return kind + quote + './' + hashed + quote;
        },
    );
}

function rewriteAssetPaths(
    source: string,
    manifest: Readonly<Record<string, string>>,
): string {
    let out = source;
    const names = Object.keys(manifest)
        .sort((a, b) => b.length - a.length);
    for (const logical of names) {
        const hashed = manifest[logical];
        if (hashed === undefined) continue;
        out = out.replaceAll(
            '../assets/' + logical,
            '../assets/' + hashed,
        );
        out = out.replaceAll(
            'assets/' + logical,
            'assets/' + hashed,
        );
        out = out.replaceAll(
            'href="' + logical + '"',
            'href="' + hashed + '"',
        );
        out = out.replaceAll(
            "href='" + logical + "'",
            "href='" + hashed + "'",
        );
    }
    return out;
}

function assetRefsOf(
    source: string,
    logicals: readonly string[],
): string[] {
    const out: string[] = [];
    const names = [...logicals]
        .sort((a, b) => b.length - a.length);
    for (const logical of names) {
        if (source.includes('../assets/' + logical)
            || source.includes('assets/' + logical)
            || source.includes('href="' + logical + '"')
            || source.includes("href='" + logical + "'")) {
            out.push(logical);
        }
    }
    return out;
}

function reachableAssetRefs(
    start: string,
    depsOf: ReadonlyMap<string, string[]>,
    byLogical: ReadonlyMap<string, TextAsset>,
    binaryLogicals: readonly string[],
): string[] {
    const refs = new Set<string>();
    for (const name of reachableOf(start, depsOf)) {
        const node = byLogical.get(name);
        if (node === undefined) continue;
        for (const ref of assetRefsOf(
            node.text, binaryLogicals,
        )) {
            refs.add(ref);
        }
    }
    return [...refs];
}

function rewriteCssUrls(
    css: string,
    manifest: Readonly<Record<string, string>>,
): string {
    let out = css;
    const names = Object.keys(manifest)
        .sort((a, b) => b.length - a.length);
    for (const logical of names) {
        if (!logical.endsWith('.woff2')) continue;
        const hashed = manifest[logical];
        if (hashed === undefined) continue;
        out = out.replaceAll(
            "url('" + logical + "')",
            "url('" + hashed + "')",
        );
        out = out.replaceAll(
            'url("' + logical + '")',
            'url("' + hashed + '")',
        );
    }
    return out;
}

async function walkFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    for await (const entry of Deno.readDir(dir)) {
        const path = join(dir, entry.name);
        if (entry.isDirectory) {
            out.push(...await walkFiles(path));
        } else if (entry.isFile) {
            out.push(path);
        }
    }
    return out;
}

function manifestOf(
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

function readManifest(
    dest: string,
): Record<string, string> {
    const path = join(dest, 'asset-manifest.json');
    try {
        return manifestOf(
            JSON.parse(
                Deno.readTextFileSync(path),
            ) as unknown,
        );
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return {};
        }
        throw error;
    }
}

function writeManifest(
    dest: string,
    manifest: Record<string, string>,
): void {
    const keys = Object.keys(manifest).sort();
    const sorted: Record<string, string> = {};
    for (const key of keys) {
        const value = manifest[key];
        if (value === undefined) continue;
        sorted[key] = value;
    }
    Deno.writeTextFileSync(
        join(dest, 'asset-manifest.json'),
        JSON.stringify(sorted, null, 4) + '\n',
    );
}

async function gzipFile(path: string): Promise<void> {
    const bytes = await Deno.readFile(path);
    const source = new Blob([bytes]).stream()
        .pipeThrough(
            new CompressionStream('gzip'),
        );
    const gz = new Uint8Array(
        await new Response(source).arrayBuffer(),
    );
    await Deno.writeFile(path + '.gz', gz);
}

async function gzipDest(dest: string): Promise<void> {
    const files = await walkFiles(dest);
    for (const path of files) {
        const ext = extname(path).toLowerCase();
        if (!GZIP_EXTS.has(ext)) continue;
        await gzipFile(path);
    }
}

type TextAsset = {
    logical: string;
    path: string;
    text: string;
};

type OpaqueAsset = {
    logical: string;
    path: string;
    bytes: Uint8Array;
};

async function hashAssets(dest: string): Promise<void> {
    const assetsDir = join(dest, 'assets');
    const manifest = readManifest(dest);
    const files = await walkFiles(assetsDir);
    const jsPending: TextAsset[] = [];
    const svgPending: TextAsset[] = [];
    const opaque: OpaqueAsset[] = [];
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const h0 = new Map<string, string>();

    for (const path of files) {
        if (path.toLowerCase().endsWith('.gz')) continue;
        const name = basename(path);
        if (isHashedAssetName(name)) {
            manifest[logicalAssetName(name)] = name;
            continue;
        }
        const bytes = await Deno.readFile(path);
        if (name.endsWith('.js')) {
            jsPending.push({
                logical: name,
                path,
                text: decoder.decode(bytes),
            });
            continue;
        }
        if (name.endsWith('.svg')) {
            svgPending.push({
                logical: name,
                path,
                text: decoder.decode(bytes),
            });
            continue;
        }
        opaque.push({ logical: name, path, bytes });
    }

    for (const asset of opaque) {
        const hashed = await hashedFileName(
            asset.logical, asset.bytes,
        );
        h0.set(
            asset.logical,
            await sha256HexOfBytes(asset.bytes),
        );
        manifest[asset.logical] = hashed;
        const hashedPath = join(
            dirname(asset.path), hashed,
        );
        await Deno.writeFile(hashedPath, asset.bytes);
        if (hashedPath !== asset.path) {
            await Deno.remove(asset.path);
        }
    }

    for (const asset of svgPending) {
        const rewritten = rewriteAssetPaths(
            asset.text, manifest,
        );
        const bytes = encoder.encode(rewritten);
        const hashed = await hashedFileName(
            asset.logical, bytes,
        );
        h0.set(
            asset.logical,
            await sha256HexOfBytes(bytes),
        );
        manifest[asset.logical] = hashed;
        const hashedPath = join(
            dirname(asset.path), hashed,
        );
        await Deno.writeFile(hashedPath, bytes);
        if (hashedPath !== asset.path) {
            await Deno.remove(asset.path);
        }
    }

    const byLogical = new Map<string, TextAsset>();
    for (const asset of jsPending) {
        byLogical.set(asset.logical, asset);
    }
    const deps = new Map<string, string[]>();
    const binaryLogicals = [...h0.keys()];
    for (const asset of jsPending) {
        deps.set(
            asset.logical,
            specifiersOf(asset.text).filter((spec) =>
                byLogical.has(spec)
            ),
        );
        h0.set(
            asset.logical,
            await sha256HexOfBytes(
                encoder.encode(asset.text),
            ),
        );
    }
    for (const asset of jsPending) {
        const bytes = encoder.encode(asset.text);
        manifest[asset.logical] = await hashedJsName(
            asset.logical,
            bytes,
            h0,
            deps,
            reachableAssetRefs(
                asset.logical,
                deps,
                byLogical,
                binaryLogicals,
            ),
        );
    }
    for (const asset of jsPending) {
        const hashed = manifest[asset.logical];
        if (hashed === undefined) continue;
        const rewritten = rewriteAssetPaths(
            rewriteJsImports(asset.text, manifest),
            manifest,
        );
        const hashedPath = join(
            dirname(asset.path), hashed,
        );
        await Deno.writeFile(
            hashedPath, encoder.encode(rewritten),
        );
        if (hashedPath !== asset.path) {
            await Deno.remove(asset.path);
        }
    }

    const concatPath = join(dest, 'styles.concat.css');
    try {
        const css = await Deno.readTextFile(concatPath);
        await Deno.writeTextFile(
            concatPath,
            rewriteCssUrls(css, manifest),
        );
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }

    writeManifest(dest, manifest);
}

async function main(): Promise<void> {
    const gzip = Deno.args.includes('--gzip');
    const dest = Deno.args.find((arg) => arg !== '--gzip');
    if (dest === undefined) {
        console.error(
            'usage: hash-static.ts <dest> [--gzip]',
        );
        Deno.exit(1);
    }
    if (gzip) {
        await gzipDest(dest);
        return;
    }
    await hashAssets(dest);
}

if (import.meta.main) {
    await main();
}
