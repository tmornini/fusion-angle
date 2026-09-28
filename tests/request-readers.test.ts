import { assertEquals } from '@std/assert';

// Nothing derives from a pair's request (§7): only the
// formers, the backends, the statement, and the storage
// edge touch it (Interpretation P).
const READER = new RegExp([
    String.raw`\.request\b`,
    String.raw`\.requestMessage\b`,
    String.raw`\brequestBodyOf\b`,
    String.raw`\bdecodeRequestOperation\b`,
    String.raw`\[\s*['"]request['"]\s*\]`,
].join('|'));
const EXCLUDED: ReadonlySet<string> = new Set([
    'api/message-pair.ts',
    'api/message-form.ts',
    'api/backend-memory.ts',
    'api/backend-postgres.ts',
    'api/ledger-statement-sql.ts',
    'api/schema-postgres.ts',
    'api/validators.ts',
    'shared/ledger-statement.ts',
    'shared/http-message/credentials.ts',
    'shared/types.ts',
]);

function walkTs(root: string): string[] {
    const files: string[] = [];
    for (const entry of Deno.readDirSync(root)) {
        const path = root + '/' + entry.name;
        if (entry.isDirectory) {
            files.push(...walkTs(path));
        } else if (entry.name.endsWith('.ts')) {
            files.push(path);
        }
    }
    return files;
}

Deno.test('nothing derives from a pair\'s request', () => {
    const readers: string[] = [];
    for (const file of [...walkTs('api'), ...walkTs('shared')]) {
        if (EXCLUDED.has(file)) continue;
        const lines = Deno.readTextFileSync(file).split('\n');
        lines.forEach((line, index) => {
            const code = line.replace(/\/\/.*$/, '');
            if (READER.test(code)) {
                readers.push(file + ':' + (index + 1));
            }
        });
    }
    assertEquals(readers, []);
});
