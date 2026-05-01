import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    buildZip,
    getZipEntries,
    DEFAULT_ZIP_LIMITS,
    ZipLimitExceeded,
} from '../web-app/app/zip.ts';

test('default limits accept normal ZIP', async () => {
    const encoder = new TextEncoder();
    const zip = buildZip([
        {
            name: 'a.txt',
            data: encoder.encode('hello'),
        },
        {
            name: 'b.txt',
            data: encoder.encode('world'),
        },
    ]);
    const entries = await getZipEntries(zip);
    assert.equal(entries.length, 2);
    const decoder = new TextDecoder();
    assert.equal(
        decoder.decode(entries[0]!.data),
        'hello',
    );
    assert.equal(
        decoder.decode(entries[1]!.data),
        'world',
    );
});

test('exceeding maxEntries throws', async () => {
    const encoder = new TextEncoder();
    const files = Array.from(
        { length: 5 },
        (_, i) => ({
            name: 'f' + i + '.txt',
            data: encoder.encode('x'),
        }),
    );
    const zip = buildZip(files);
    await assert.rejects(
        () => getZipEntries(zip, {
            ...DEFAULT_ZIP_LIMITS,
            maxEntries: 4,
        }),
        ZipLimitExceeded,
    );
});

test('exceeding maxPerEntry on STORE throws', async () => {
    const data = new Uint8Array(1000);
    const zip = buildZip([
        { name: 'big.bin', data },
    ]);
    await assert.rejects(
        () => getZipEntries(zip, {
            ...DEFAULT_ZIP_LIMITS,
            maxPerEntry: 500,
        }),
        ZipLimitExceeded,
    );
});

test('exceeding maxCompressedTotal throws', async () => {
    const encoder = new TextEncoder();
    const files = Array.from(
        { length: 3 },
        (_, i) => ({
            name: 'f' + i + '.txt',
            data: encoder.encode('a'.repeat(100)),
        }),
    );
    const zip = buildZip(files);
    await assert.rejects(
        () => getZipEntries(zip, {
            ...DEFAULT_ZIP_LIMITS,
            maxCompressedTotal: 150,
        }),
        ZipLimitExceeded,
    );
});

test('exceeding maxDecompressedTotal throws', async () => {
    const encoder = new TextEncoder();
    const files = Array.from(
        { length: 3 },
        (_, i) => ({
            name: 'f' + i + '.txt',
            data: encoder.encode('a'.repeat(100)),
        }),
    );
    const zip = buildZip(files);
    await assert.rejects(
        () => getZipEntries(zip, {
            ...DEFAULT_ZIP_LIMITS,
            maxDecompressedTotal: 150,
        }),
        ZipLimitExceeded,
    );
});
