export interface ZipEntry {
    name: string;
    data: Uint8Array;
}

// PKZIP CRC-32 polynomial in reflected form
// (RFC 1952 §2.3, Appendix B). The standard
// CRC-32 generator polynomial 0x04C11DB7
// reversed bit-for-bit gives 0xEDB88320 —
// the form used when shifting LSB-first
// across the input stream.
const PKZIP_CRC32_REVERSED = 0xEDB88320;

// Precomputed lookup table: for each byte
// value 0-255, store the CRC of that byte
// passed through 8 polynomial divisions.
// Table-driven CRC turns the inner loop
// into one xor + one shift per input byte.
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1)
            ? (PKZIP_CRC32_REVERSED ^ (c >>> 1))
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
const DEFLATE = 8;

export function buildZip(
    files: ZipEntry[],
): Uint8Array {
    const encoder = new TextEncoder();
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

function locateEocd(
    view: DataView,
    length: number,
): number {
    const minOff = Math.max(
        0, length - 65557,
    );
    for (
        let i = length - END_RECORD;
        i >= minOff;
        i--
    ) {
        if (
            view.getUint32(i, true)
                === END_SIG
        ) {
            return i;
        }
    }
    return -1;
}

async function inflate(
    raw: Uint8Array,
): Promise<Uint8Array> {
    const ds = new DecompressionStream(
        'deflate-raw',
    );
    const stream =
        new Blob(
            [raw as unknown as ArrayBuffer],
        )
            .stream()
            .pipeThrough(ds);
    const buf = await new Response(stream)
        .arrayBuffer();
    return new Uint8Array(buf);
}

function getLocalData(
    view: DataView,
    data: Uint8Array,
    localOff: number,
    compSz: number,
): Uint8Array | null {
    if (
        localOff + LOCAL_HEADER
            > data.byteLength
    ) return null;

    const lNameLen = view.getUint16(
        localOff + 26, true,
    );
    const lExtraLen = view.getUint16(
        localOff + 28, true,
    );
    const start =
        localOff + LOCAL_HEADER
        + lNameLen + lExtraLen;
    return data.slice(
        start, start + compSz,
    );
}

export async function getZipEntries(
    data: Uint8Array,
): Promise<ZipEntry[]> {
    const decoder = new TextDecoder();
    const view = new DataView(
        data.buffer,
        data.byteOffset,
        data.byteLength,
    );

    const eocd = locateEocd(
        view, data.byteLength,
    );
    if (eocd < 0) return [];

    const count = view.getUint16(
        eocd + 10, true,
    );
    const cdStart = view.getUint32(
        eocd + 16, true,
    );

    const entries: ZipEntry[] = [];
    let off = cdStart;

    for (let i = 0; i < count; i++) {
        if (
            off + CENTRAL_HEADER
                > data.byteLength
        ) break;
        if (
            view.getUint32(off, true)
                !== CENTRAL_SIG
        ) break;

        const method = view.getUint16(
            off + 10, true,
        );
        const compSz = view.getUint32(
            off + 20, true,
        );
        const nameLen = view.getUint16(
            off + 28, true,
        );
        const extraLen = view.getUint16(
            off + 30, true,
        );
        const commentLen = view.getUint16(
            off + 32, true,
        );
        const localOff = view.getUint32(
            off + 42, true,
        );

        off += CENTRAL_HEADER;

        const name = decoder.decode(
            data.slice(
                off, off + nameLen,
            ),
        );
        off +=
            nameLen + extraLen + commentLen;

        const raw = getLocalData(
            view, data, localOff, compSz,
        );
        if (!raw) continue;

        if (method === DEFLATE) {
            entries.push({
                name,
                data: await inflate(raw),
            });
        } else if (method === STORE) {
            entries.push({
                name,
                data: raw,
            });
        }
    }

    return entries;
}
