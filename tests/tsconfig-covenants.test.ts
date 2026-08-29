import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
    mkdtempSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function tsc(args: string[]): {
    status: number | null;
    out: string;
} {
    const result = spawnSync(
        'npx',
        ['--no-install', 'tsc', ...args],
        { encoding: 'utf8', timeout: 60_000 },
    );
    return {
        status: result.status,
        out: String(result.stdout)
            + String(result.stderr),
    };
}

function optionsOf(project: string): {
    types?: string[];
    verbatimModuleSyntax?: boolean;
    erasableSyntaxOnly?: boolean;
} {
    const result = tsc(['--showConfig', '-p', project]);
    assert.equal(result.status, 0, result.out);
    const parsed = JSON.parse(result.out) as {
        compilerOptions: {
            types?: string[];
            verbatimModuleSyntax?: boolean;
            erasableSyntaxOnly?: boolean;
        };
    };
    return parsed.compilerOptions;
}

test('root config is the Node+DOM superset', () => {
    const options = optionsOf('tsconfig.json');
    assert.deepEqual(options.types, ['node']);
    assert.equal(options.verbatimModuleSyntax, true);
    assert.equal(options.erasableSyntaxOnly, true);
});

test('browser config is the pure subset', () => {
    const options = optionsOf(
        'web-app/app/tsconfig.json',
    );
    assert.deepEqual(options.types, []);
    assert.equal(options.verbatimModuleSyntax, true);
    assert.equal(options.erasableSyntaxOnly, true);
});

test('browser project rejects process (TS2591)', () => {
    const dir = mkdtempSync(
        join(tmpdir(), 'tsc-purity-'),
    );
    try {
        writeFileSync(
            join(dir, 'leak.ts'),
            'process.exit(0);\n',
        );
        writeFileSync(
            join(dir, 'tsconfig.json'),
            JSON.stringify({
                extends: join(
                    process.cwd(),
                    'web-app/app/tsconfig.json',
                ),
                include: ['./leak.ts'],
            }),
        );
        const result = tsc([
            '--noEmit', '-p', join(dir, 'tsconfig.json'),
        ]);
        assert.notEqual(result.status, 0);
        assert.match(result.out, /TS2591/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
