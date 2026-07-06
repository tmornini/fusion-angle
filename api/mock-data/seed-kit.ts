// Shared seed primitives for the mock-data composition: one
// clock, one PRNG, one id alphabet. These are pure and draw-order
// preserving — the per-entity seed modules thread the same rng
// through them so the seeded world stays byte-for-byte stable
// (pinned by tests/mock-data-fingerprint.test.ts).

import type { Id } from '../types.ts';
import { SYSTEM_MEMBER_ID } from '../types.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    assignOrganization,
} from './seed-constants.ts';
import type { SeedHumanMember } from './members.ts';

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

// ---- deterministic pick helper ----
//
// Moved verbatim out of postMockDataLoadIn so both this file's
// objective-author pick and mock-data.ts's baseline/actual-score
// picks share one implementation.
export function deterministicScore(
    seed: string,
    min: number,
    max: number,
): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    const range = max - min + 1;
    const wrapped = ((hash % range) + range) % range;
    return min + wrapped;
}

// The STARK/org-2 human pools an objective revision's author is
// drawn from — a PURE reconstruction of the same pools
// postMockDataLoadIn's in-tx `humansByOrganization` (still used,
// unchanged, for the project_objective_baseline/actual-score
// deferral) derives by reading the memberships it just wrote
// back from the open transaction. Pass 1 forms an objective's
// pair before any transaction opens, so it has nothing to read
// back; this computes the identical pool straight from the
// seed's own membership assignment (member -> assignOrganization
// (index), 'current' -> both orgs — see postMockDataLoadIn's
// membership Promise.all) instead of a DB round trip.
//
// The two computations are proven to agree: the buffered-tx
// backend's getAll() is insertion-order (backend-buffer-tx.ts),
// and every put the membership Promise.all issues resolves
// synchronously in call order, so "read back what was just
// written" and "recompute from the same static inputs, in the
// same order" are the same list. tests/mock-data-pairs.test.ts
// spot-checks a seeded objective's pair-embedded member_id
// against the written revision row, so a future divergence
// (e.g. a reordered membership Promise.all) fails loudly there
// instead of silently.
export function humanMemberPoolsByOrganization(
    members: readonly SeedHumanMember[],
): ReadonlyMap<Id, readonly Id[]> {
    const pools = new Map<Id, Id[]>();
    members.forEach((member, index) => {
        const organizations = member.id === 'current'
            ? [STARK_ORGANIZATION, ORGANIZATION_TWO]
            : [assignOrganization(index)];
        for (const organization of organizations) {
            const pool = pools.get(organization) ?? [];
            pool.push(member.id);
            pools.set(organization, pool);
        }
    });
    return pools;
}

export function pickHumanMember(
    pools: ReadonlyMap<Id, readonly Id[]>,
    organization: Id,
    seed: string,
): Id {
    const pool = pools.get(organization) ?? [];
    if (pool.length === 0) return SYSTEM_MEMBER_ID;
    return pool[
        deterministicScore(seed, 0, pool.length - 1)
    ]!;
}
