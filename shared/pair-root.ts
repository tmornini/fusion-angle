// The TypeScript twin of the ledger hash functions.
// Weekday and month are fixed English so a locale
// cannot change the IMF-fixdate. Microseconds stay
// in bigint because Date drops them.

import {
    sha256Hex,
    sha256HexOfBytes,
} from './digest.ts';

const WEEKDAYS = [
    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
];

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const STAMP = new RegExp(
    '^(\\d{4})-(\\d{2})-(\\d{2})'
    + 'T(\\d{2}):(\\d{2}):(\\d{2})'
    + '\\.(\\d{6})Z$',
);

const MICROS_PER_MILLISECOND = 1000n;

type Stamp = {
    year: number,
    month: number,
    day: number,
    hour: string,
    minute: string,
    second: string,
    micros: number,
    yearText: string,
    dayText: string,
};

type PairRootTexts = {
    id: string,
    operationId: string,
    path: string,
    name: string,
    supersedes: string,
    requesterIdentityId: string,
    method: string,
    responseAt: string,
    requestHashHex: string,
    secretHashHex: string,
    responseHashHex: string,
};

function readStamp(stamp: string): Stamp {
    const match = STAMP.exec(stamp);
    if (match === null) {
        throw new Error('stamp is not six-digit zulu');
    }
    const yearText = match[1]!;
    const monthText = match[2]!;
    const dayText = match[3]!;
    return {
        year: Number(yearText),
        month: Number(monthText),
        day: Number(dayText),
        hour: match[4]!,
        minute: match[5]!,
        second: match[6]!,
        micros: Number(match[7]),
        yearText,
        dayText,
    };
}

export function imfFixdate(stamp: string): string {
    const parsed = readStamp(stamp);
    const weekday = new Date(Date.UTC(
        parsed.year,
        parsed.month - 1,
        parsed.day,
    )).getUTCDay();
    const week = WEEKDAYS[weekday];
    const month = MONTHS[parsed.month - 1];
    if (week === undefined || month === undefined) {
        throw new Error(
            'stamp is not a real calendar day',
        );
    }
    return week + ', ' + parsed.dayText + ' ' + month
        + ' ' + parsed.yearText + ' '
        + parsed.hour + ':' + parsed.minute + ':'
        + parsed.second + ' GMT';
}

export function microsOf(stamp: string): bigint {
    const parsed = readStamp(stamp);
    const millis = BigInt(Date.UTC(
        parsed.year,
        parsed.month - 1,
        parsed.day,
        Number(parsed.hour),
        Number(parsed.minute),
        Number(parsed.second),
    ));
    return millis * MICROS_PER_MILLISECOND
        + BigInt(parsed.micros);
}

function pad(value: number, width: number): string {
    return String(value).padStart(width, '0');
}

export function stampOfMicros(micros: bigint): string {
    const millis = micros / MICROS_PER_MILLISECOND;
    const subMilli = micros % MICROS_PER_MILLISECOND;
    const date = new Date(Number(millis));
    const fraction = date.getUTCMilliseconds() * 1000
        + Number(subMilli);
    return pad(date.getUTCFullYear(), 4)
        + '-' + pad(date.getUTCMonth() + 1, 2)
        + '-' + pad(date.getUTCDate(), 2)
        + 'T' + pad(date.getUTCHours(), 2)
        + ':' + pad(date.getUTCMinutes(), 2)
        + ':' + pad(date.getUTCSeconds(), 2)
        + '.' + pad(fraction, 6)
        + 'Z';
}

export function laterStamp(
    now: string,
    head: string | null,
): string {
    if (head === null) {
        return now;
    }
    const successor = microsOf(head) + 1n;
    const clock = microsOf(now);
    if (clock >= successor) {
        return now;
    }
    return stampOfMicros(successor);
}

export async function leafHashHex(
    salt: Uint8Array,
    bytes: Uint8Array,
): Promise<string> {
    const joined = new Uint8Array(
        salt.length + bytes.length,
    );
    joined.set(salt, 0);
    joined.set(bytes, salt.length);
    return sha256HexOfBytes(joined);
}

export async function secretHashHex(
    secret: Uint8Array,
): Promise<string> {
    return sha256HexOfBytes(secret);
}

function netstring(text: string): string {
    const length = new TextEncoder().encode(text).length;
    return String(length) + ':' + text + ',';
}

export async function pairRootHex(
    texts: PairRootTexts,
): Promise<string> {
    const parts = [
        texts.id,
        texts.operationId,
        texts.path,
        texts.name,
        texts.supersedes,
        texts.requesterIdentityId,
        texts.method,
        texts.responseAt,
        texts.requestHashHex,
        texts.secretHashHex,
        texts.responseHashHex,
    ];
    let joined = '';
    for (const text of parts) {
        joined += netstring(text);
    }
    return sha256Hex(joined);
}
