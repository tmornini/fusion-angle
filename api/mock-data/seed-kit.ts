// Shared seed primitives for the mock-data composition: one
// clock, one PRNG, one id alphabet. These are pure and draw-order
// preserving — the per-entity seed modules thread the same rng
// through them so the seeded world stays byte-for-byte stable
// (pinned by tests/mock-data-fingerprint.test.ts).

// A FIXED anchor, never the wall clock: date-derived seed ids
// (objective scores embed scoredAt) must not drift across UTC
// days, or the fingerprint becomes a false prophet. Bump
// deliberately to refresh how current the demo dates look.
export const now = new Date('2026-06-15T00:00:00.000Z');

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

export function daysFromNow(
    days: number,
    hour: number,
    minute: number,
): string {
    const d = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + days,
        hour,
        minute,
    ));
    const year = d.getUTCFullYear();
    const month = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    const hours = pad(d.getUTCHours());
    const minutes = pad(d.getUTCMinutes());
    return `${year}-${month}-${day}`
        + `T${hours}:${minutes}:00.000000Z`;
}

// A calendar DATE (YYYY-MM-DD, no instant) — the grammar
// validateCalendarDateField gates for project start/target
// dates. `days` counts forward from today (negative =
// past), the same convention as daysFromNow.
export function dateOnly(days: number): string {
    const d = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + days,
    ));
    return d.getUTCFullYear() + '-'
        + pad(d.getUTCMonth() + 1) + '-'
        + pad(d.getUTCDate());
}

export function mulberry32(
    seed: number,
): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(
            t ^ (t >>> 15), t | 1,
        );
        t ^= t + Math.imul(
            t ^ (t >>> 7), t | 61,
        );
        return (
            (t ^ (t >>> 14)) >>> 0
        ) / 4294967296;
    };
}

export function sampleUniform(
    rng: () => number,
    lo: number,
    hi: number,
): number {
    return lo + (hi - lo) * rng();
}

function sampleNormal(
    rng: () => number,
    mean: number,
    sigma: number,
): number {
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(u1))
        * Math.cos(2 * Math.PI * u2);
    return mean + sigma * z;
}

export function sampleLogNormal(
    rng: () => number,
    meanHours: number,
    sigma: number,
): number {
    const z = sampleNormal(rng, 0, 1);
    return Math.exp(
        Math.log(meanHours) + sigma * z,
    );
}

export function pickWeighted<T>(
    rng: () => number,
    items: readonly T[],
    weightOf: (t: T) => number,
): T {
    let total = 0;
    for (const it of items) {
        total += weightOf(it);
    }
    const r = rng() * total;
    let cum = 0;
    for (const it of items) {
        cum += weightOf(it);
        if (r <= cum) return it;
    }
    return items[items.length - 1]!;
}

const B62_ALPHABET =
    'abcdefghijklmnopqrstuvwxyz'
    + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    + '0123456789';

export function b62Id(
    rng: () => number,
    len: number,
): string {
    let s = '';
    for (let i = 0; i < len; i++) {
        const idx = Math.floor(
            rng() * B62_ALPHABET.length,
        );
        s += B62_ALPHABET[idx];
    }
    return s;
}

export function isoFromMs(ms: number): string {
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hour = pad(date.getUTCHours());
    const minute = pad(date.getUTCMinutes());
    const second = pad(date.getUTCSeconds());
    return `${year}-${month}-${day}`
        + `T${hour}:${minute}:${second}.000000Z`;
}
