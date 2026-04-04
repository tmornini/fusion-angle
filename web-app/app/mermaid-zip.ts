export interface ZipEntry {
    name: string;
    data: Uint8Array;
}

/* CRC-32 lookup table */

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1)
            ? (0xEDB88320 ^ (c >>> 1))
            : (c >>> 1);
    }
    CRC_TABLE[i] = c;
}

function crc32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        const idx =
            (crc ^ data[i]!) & 0xFF;
        crc =
            (CRC_TABLE[idx]!)
            ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

const LOCAL_SIG = 0x04034B50;
const CENTRAL_SIG = 0x02014B50;
const END_SIG = 0x06054B50;
const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
const VERSION = 20;
const STORE = 0;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function buildZip(
    files: ZipEntry[],
): Uint8Array {
    let totalSize = END_RECORD;
    for (const f of files) {
        const nameBytes =
            encoder.encode(f.name);
        totalSize +=
            LOCAL_HEADER
            + nameBytes.length
            + f.data.length
            + CENTRAL_HEADER
            + nameBytes.length;
    }

    const buf = new ArrayBuffer(totalSize);
    const view = new DataView(buf);
    const out = new Uint8Array(buf);
    let offset = 0;

    const entries: Array<{
        nameBytes: Uint8Array;
        crc: number;
        size: number;
        localOffset: number;
    }> = [];

    for (const f of files) {
        const nameBytes =
            encoder.encode(f.name);
        const crc = crc32(f.data);
        const localOffset = offset;

        view.setUint32(
            offset, LOCAL_SIG, true,
        );
        view.setUint16(
            offset + 4, VERSION, true,
        );
        view.setUint16(
            offset + 6, 0, true,
        );
        view.setUint16(
            offset + 8, STORE, true,
        );
        view.setUint16(
            offset + 10, 0, true,
        );
        view.setUint16(
            offset + 12, 0, true,
        );
        view.setUint32(
            offset + 14, crc, true,
        );
        view.setUint32(
            offset + 18, f.data.length,
            true,
        );
        view.setUint32(
            offset + 22, f.data.length,
            true,
        );
        view.setUint16(
            offset + 26, nameBytes.length,
            true,
        );
        view.setUint16(
            offset + 28, 0, true,
        );
        offset += LOCAL_HEADER;

        out.set(nameBytes, offset);
        offset += nameBytes.length;

        out.set(f.data, offset);
        offset += f.data.length;

        entries.push({
            nameBytes,
            crc,
            size: f.data.length,
            localOffset,
        });
    }

    const centralStart = offset;

    for (const e of entries) {
        view.setUint32(
            offset, CENTRAL_SIG, true,
        );
        view.setUint16(
            offset + 4, VERSION, true,
        );
        view.setUint16(
            offset + 6, VERSION, true,
        );
        view.setUint16(
            offset + 8, 0, true,
        );
        view.setUint16(
            offset + 10, STORE, true,
        );
        view.setUint16(
            offset + 12, 0, true,
        );
        view.setUint16(
            offset + 14, 0, true,
        );
        view.setUint32(
            offset + 16, e.crc, true,
        );
        view.setUint32(
            offset + 20, e.size, true,
        );
        view.setUint32(
            offset + 24, e.size, true,
        );
        view.setUint16(
            offset + 28,
            e.nameBytes.length, true,
        );
        view.setUint16(
            offset + 30, 0, true,
        );
        view.setUint16(
            offset + 32, 0, true,
        );
        view.setUint16(
            offset + 34, 0, true,
        );
        view.setUint16(
            offset + 36, 0, true,
        );
        view.setUint32(
            offset + 38, 0, true,
        );
        view.setUint32(
            offset + 42,
            e.localOffset, true,
        );
        offset += CENTRAL_HEADER;

        out.set(e.nameBytes, offset);
        offset += e.nameBytes.length;
    }

    const centralSize =
        offset - centralStart;

    view.setUint32(
        offset, END_SIG, true,
    );
    view.setUint16(
        offset + 4, 0, true,
    );
    view.setUint16(
        offset + 6, 0, true,
    );
    view.setUint16(
        offset + 8, entries.length, true,
    );
    view.setUint16(
        offset + 10, entries.length, true,
    );
    view.setUint32(
        offset + 12, centralSize, true,
    );
    view.setUint32(
        offset + 16, centralStart, true,
    );
    view.setUint16(
        offset + 20, 0, true,
    );

    return out;
}

export function readZip(
    data: Uint8Array,
): ZipEntry[] {
    const view = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength,
    );
    const entries: ZipEntry[] = [];
    let offset = 0;

    while (
        offset + LOCAL_HEADER
            <= data.length
    ) {
        const sig = view.getUint32(
            offset, true,
        );
        if (sig !== LOCAL_SIG) break;

        const compSize = view.getUint32(
            offset + 18, true,
        );
        const nameLen = view.getUint16(
            offset + 26, true,
        );
        const extraLen = view.getUint16(
            offset + 28, true,
        );
        offset += LOCAL_HEADER;

        const nameBytes = data.slice(
            offset, offset + nameLen,
        );
        const name =
            decoder.decode(nameBytes);
        offset += nameLen + extraLen;

        const fileData = data.slice(
            offset, offset + compSize,
        );
        offset += compSize;

        entries.push({
            name,
            data: fileData,
        });
    }

    return entries;
}
