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
    const entries = await getZipEntries(
        zip, DEFAULT_ZIP_LIMITS,
    );
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

// Craft a single-entry ZIP with method DEFLATE and
// arbitrary compressed payload. buildZip only stores;
// inflate is only reached when method === 8.
function buildDeflateZip(
    name: string,
    compressed: Uint8Array,
): Uint8Array {
    const LOCAL_SIG = 0x04034B50;
    const CENTRAL_SIG = 0x02014B50;
    const END_SIG = 0x06054B50;
    const LOCAL_HEADER = 30;
    const CENTRAL_HEADER = 46;
    const END_RECORD = 22;
    const DEFLATE = 8;
    const nameBytes = new TextEncoder().encode(name);
    const total =
        LOCAL_HEADER + nameBytes.length
        + compressed.length
        + CENTRAL_HEADER + nameBytes.length
        + END_RECORD;
    const buf = new ArrayBuffer(total);
    const view = new DataView(buf);
    const out = new Uint8Array(buf);
    let off = 0;

    view.setUint32(off, LOCAL_SIG, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 8, DEFLATE, true);
    view.setUint32(
        off + 18, compressed.length, true,
    );
    view.setUint32(
        off + 22, compressed.length, true,
    );
    view.setUint16(
        off + 26, nameBytes.length, true,
    );
    off += LOCAL_HEADER;
    out.set(nameBytes, off);
    off += nameBytes.length;
    out.set(compressed, off);
    off += compressed.length;

    const centralStart = off;
    view.setUint32(off, CENTRAL_SIG, true);
    view.setUint16(off + 4, 20, true);
    view.setUint16(off + 6, 20, true);
    view.setUint16(off + 10, DEFLATE, true);
    view.setUint32(
        off + 20, compressed.length, true,
    );
    view.setUint32(
        off + 24, compressed.length, true,
    );
    view.setUint16(
        off + 28, nameBytes.length, true,
    );
    // localOffset = 0
    off += CENTRAL_HEADER;
    out.set(nameBytes, off);
    off += nameBytes.length;

    const centralSize = off - centralStart;
    view.setUint32(off, END_SIG, true);
    view.setUint16(off + 8, 1, true);
    view.setUint16(off + 10, 1, true);
    view.setUint32(off + 12, centralSize, true);
    view.setUint32(off + 16, centralStart, true);
    return out;
}

test(
    'malformed DEFLATE rejects and cancels the reader',
    async () => {
        // Garbage deflate-raw bytes: DecompressionStream
        // rejects on reader.read(). The inflate finally
        // must cancel so the lock never leaks.
        const garbage = new Uint8Array([
            0x00, 0x01, 0x02, 0x03,
            0x04, 0x05, 0xff, 0xfe,
        ]);
        const zip = buildDeflateZip(
            'bad.bin', garbage,
        );

        let cancelCalls = 0;
        const proto =
            ReadableStreamDefaultReader
                .prototype;
        const origCancel = proto.cancel;
        proto.cancel = function (
            this: ReadableStreamDefaultReader,
            reason?: unknown,
        ) {
            cancelCalls += 1;
            return origCancel.call(
                this, reason,
            );
        };

        try {
            await assert.rejects(
                () => getZipEntries(
                    zip, DEFAULT_ZIP_LIMITS,
                ),
            );
            assert.ok(
                cancelCalls >= 1,
                'inflate must cancel the reader '
                + 'on deflate failure; cancel '
                + 'calls=' + cancelCalls,
            );

            // Second call: a well-formed empty
            // deflate stream still inflates after
            // the prior failure — no global lock
            // residue from an abandoned reader.
            const emptyDeflate =
                new Uint8Array([3, 0]);
            const okZip = buildDeflateZip(
                'empty.bin', emptyDeflate,
            );
            const entries = await getZipEntries(
                okZip, DEFAULT_ZIP_LIMITS,
            );
            assert.equal(entries.length, 1);
            assert.equal(
                entries[0]!.data.byteLength, 0,
            );
        } finally {
            proto.cancel = origCancel;
        }
    },
);
