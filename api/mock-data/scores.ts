// The seeded project_objective_baseline_scores /
// project_objective_actual_scores rows — hoisted VERBATIM out of
// postMockDataLoadIn's two scoring loops (mock-data.ts) so the
// SAME computation feeds both the seed's row writes and pass 1's
// pre-tx pair formation (seed-message-pairs.ts). Pure: no
// Math.random, no store read. The Friday window reads the
// shared seed clock `now` (start of the current UTC day), not
// a second clock, so the Honolulu pass and a same-day re-seed
// agree. deterministicScore is a hash over its seed string,
// and every project fact (organization_id, state) arrives
// already resolved (buildScoreSeedProjects,
// seed-message-pairs.ts) rather than read back from a
// transaction.
//
// The author pick moves off the in-tx memberFor (a DB-read of
// the just-written memberships) onto pickHumanMember over a
// pre-tx pool, keyed BY CONTENT so the pick never drifts from
// memberFor's own draw (the standing member_id content pins,
// tests/mock-data-objectives.test.ts, guard this — the id-only
// fingerprint cannot see an author-pick regression): a
// baseline's key is `${p.id}:${obj.id}:baseline`; an actual's
// key is `${p.id}:${obj.id}:actual:${k}`, PER-ACTUAL-INDEX —
// omitting the `:${k}` suffix silently diverges 68 of 92 authors
// from the prior memberFor pick (measured at verification),
// invisible to the id-only fingerprint.
//
// deterministicScore/pickHumanMember live in seed-kit.ts (the
// designated home for pure shared seed primitives) rather than
// seed-message-pairs.ts, so this file has no import back to its
// own caller: seed-message-pairs.ts imports buildSeedScoreRows
// from here (pass 1's invocation builder drives the seed's
// score-pair formation off this SAME output), and this file
// imports nothing from seed-message-pairs.ts in return — a
// one-way dependency, no cycle.

import type { Id, ObjectiveId } from '../../shared/types.ts';
import { MS_PER_DAY } from '../../shared/types.ts';
import {
    isoFromMs,
    deterministicScore,
    now,
    pickHumanMember,
} from './seed-kit.ts';
import { seedHashKey } from
    './seed-hash-preimage.ts';
import { OBJECTIVE_SEEDS } from './objectives.ts';

// The one project shape the scoring loop needs — narrower than
// a full ProjectEntity: organization_id and state are resolved
// by the caller (buildScoreSeedProjects, seed-message-pairs.ts)
// from the SAME pure project-state-event data pass 1 already
// threads through, so this builder never reads the store.
export interface ScoreSeedProject {
    readonly id: Id;
    readonly organization_id: Id;
    readonly start_date: string;
    readonly state: string;
}

export interface SeedScoreRow {
    readonly id: Id;
    readonly fields: {
        readonly project_id: Id;
        readonly objective_id: ObjectiveId;
        readonly score: number;
        readonly member_id: Id;
        readonly at: string;
    };
}

export interface SeedScoreRows {
    readonly baselines: readonly SeedScoreRow[];
    readonly actuals: readonly SeedScoreRow[];
}

// Sixteen weekly actuals on committed projects. The
// newest Friday is the seed clock's own Friday when
// that UTC day is Friday, otherwise the Friday before
// it, then fifteen older ones. Clock time is an
// America/New_York business hour, spread across the
// sixteen weeks. One entry in ten slips forward onto
// Saturday, Sunday, or Monday. Each series wanders,
// then climbs, and both stretches start on a week of
// their own. One objective per project stays neutral
// or falls, rotating so every objective's mean climbs.
const WEEKLY_ACTUALS = 16;
const BUSINESS_ZONE = 'America/New_York';
const OPEN_MINUTE = 9 * 60;
const DAY_MINUTES = 8 * 60;

function clampScore(score: number): number {
    if (score < -100) return -100;
    if (score > 100) return 100;
    return score;
}

function fridayAnchors(
    today: Date,
): readonly number[] {
    const back = (today.getUTCDay() + 2) % 7;
    const newest = Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - back,
    );
    const anchors: number[] = [];
    for (
        let ago = WEEKLY_ACTUALS - 1;
        ago >= 0;
        ago--
    ) {
        anchors.push(
            newest - ago * 7 * MS_PER_DAY,
        );
    }
    return anchors;
}

function zoneOffsetMs(utcMs: number): number {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_ZONE,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const parts = fmt.formatToParts(
        new Date(utcMs),
    );
    const pick = (type: string): number => {
        const part = parts.find(
            item => item.type === type,
        );
        return Number(part!.value);
    };
    let hour = pick('hour');
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(
        pick('year'),
        pick('month') - 1,
        pick('day'),
        hour,
        pick('minute'),
        pick('second'),
    );
    return asUtc - utcMs;
}

function zonedToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
): number {
    const guess = Date.UTC(
        year, month - 1, day, hour, minute,
    );
    const offset = zoneOffsetMs(guess);
    let utc = guess - offset;
    const again = zoneOffsetMs(utc);
    if (again !== offset) utc = guess - again;
    return utc;
}

function businessMinute(
    week: number,
    key: string,
): number {
    const slot = Math.round(
        (week + 0.5)
            / WEEKLY_ACTUALS
            * (DAY_MINUTES - 1),
    );
    const jitter = deterministicScore(
        key, -30, 30,
    );
    let minute = slot + jitter;
    if (minute < 0) minute = 0;
    if (minute >= DAY_MINUTES) {
        minute = DAY_MINUTES - 1;
    }
    return OPEN_MINUTE + minute;
}

function businessInstant(
    anchorMs: number,
    daySlip: number,
    minuteOfDay: number,
): number {
    const anchor = new Date(anchorMs);
    const shifted = new Date(Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth(),
        anchor.getUTCDate() + daySlip,
    ));
    return zonedToUtc(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth() + 1,
        shifted.getUTCDate(),
        Math.floor(minuteOfDay / 60),
        minuteOfDay % 60,
    );
}

function onsetWeek(
    seriesKey: string,
    laggard: boolean,
): number {
    // Each series picks its own handoff week, so the
    // aggregate bends across many Fridays.
    return deterministicScore(
        seriesKey + ':onset',
        laggard ? 2 : 0,
        laggard ? 10 : 9,
    );
}

function weekToken(week: number): string {
    // This hash moves by its last character, so a
    // bare week digit would march Friday by Friday.
    // A quadratic puts each Friday on a distant seed.
    const mixed = week * week * 997
        + week * 13 + 5;
    return ':' + mixed;
}

function openingDraw(
    objectiveKey: string,
    week: number,
    half: number,
): number {
    return deterministicScore(
        objectiveKey + ':wander' + weekToken(week),
        -half,
        half,
    );
}

function sharedShock(
    objectiveKey: string,
    week: number,
): number {
    // The first four Fridays keep their random shape
    // and a shared spread, so every objective leaves
    // its baseline on its own path. Later Fridays
    // stay a smaller wiggle on the climb.
    if (week < 4) {
        let sum = 0;
        const draws: number[] = [];
        for (let w = 0; w < 4; w++) {
            const draw = openingDraw(
                objectiveKey, w, 14,
            );
            draws.push(draw);
            sum += draw;
        }
        const mid = sum / 4;
        let low = Infinity;
        let high = -Infinity;
        const centered: number[] = [];
        for (const draw of draws) {
            const value = draw - mid;
            centered.push(value);
            if (value < low) low = value;
            if (value > high) high = value;
        }
        const spread = high - low;
        if (spread < 1) return 0;
        const target = 16;
        return Math.round(
            (centered[week]! - low) / spread
                * target - target / 2,
        );
    }
    const now = openingDraw(
        objectiveKey, week, 8,
    );
    const prev = openingDraw(
        objectiveKey, week - 1, 8,
    );
    return Math.round(now * 0.75 + prev * 0.25);
}

function noiseScale(
    week: number,
    onset: number,
): number {
    const last = WEEKLY_ACTUALS - 1;
    const open = 1 - week / last;
    let rise = 0;
    if (week >= onset) {
        const span = last - onset;
        rise = span === 0
            ? 1
            : 1 - (week - onset) / span;
    }
    const peak = open > rise ? open : rise;
    return 0.35 + 0.65 * peak;
}

function actualScore(
    baseline: number,
    week: number,
    laggard: boolean,
    objectiveKey: string,
    seriesKey: string,
): number {
    const onset = onsetWeek(seriesKey, laggard);
    const last = WEEKLY_ACTUALS - 1;
    const span = Math.max(1, last - onset);
    const t = week < onset
        ? 0
        : (week - onset) / span;
    const own = deterministicScore(
        seriesKey + ':own' + weekToken(week),
        -5,
        5,
    );
    const noise = Math.round(
        (sharedShock(objectiveKey, week) + own)
            * noiseScale(week, onset),
    );
    if (laggard) {
        const drop = deterministicScore(
            seriesKey + ':lag-end', 6, 22,
        );
        let score = baseline + noise
            - Math.round(drop * t);
        if (week === last) {
            if (score > baseline) score = baseline;
            const floor = baseline - 30;
            if (score < floor) score = floor;
        }
        return clampScore(score);
    }
    const headroom = 100 - baseline;
    const lift = Math.round(headroom * 0.88 * t);
    let score = baseline + noise + lift;
    if (week === last && headroom > 0) {
        const floor = baseline + Math.min(
            headroom, Math.max(lift, 1),
        );
        if (score < floor) score = floor;
    }
    return clampScore(score);
}

export function buildSeedScoreRows(
    projects: readonly ScoreSeedProject[],
    pools: ReadonlyMap<Id, readonly Id[]>,
): SeedScoreRows {
    const baselines: SeedScoreRow[] = [];
    const actuals: SeedScoreRow[] = [];
    const anchors = fridayAnchors(now);
    let approvedOrdinal = 0;
    let archivedOrdinal = 0;

    for (const p of projects) {
        if (
            p.state === 'submitted'
            || p.state === 'declined'
            || p.state === 'deleted'
        ) {
            continue;
        }

        const baselineCoverage =
            p.state === 'approved'
            || p.state === 'archived'
                ? OBJECTIVE_SEEDS.length
                : deterministicScore(
                    seedHashKey(p.id) + ':coverage',
                    0,
                    OBJECTIVE_SEEDS.length - 1,
                );

        const baselineStart =
            new Date(p.start_date).getTime();
        // Committed work (approved + archived) is
        // expected to advance objectives; baselines
        // skew positive. Drafts (under_review +
        // sent_back) can dip negative — a flagged
        // risk worth surfacing on the dashboard.
        const baselineMin =
            p.state === 'approved'
            || p.state === 'archived'
                ? 0
                : -100;
        for (let i = 0; i < baselineCoverage; i++) {
            const obj = OBJECTIVE_SEEDS[i]!;
            const score = deterministicScore(
                seedHashKey(p.id) + ':'
                    + seedHashKey(obj.id)
                    + ':baseline',
                baselineMin,
                100,
            );
            const scoredAt = isoFromMs(
                baselineStart + i * 1000,
            );
            baselines.push({
                id: `${p.id}:${obj.id}:${scoredAt}`,
                fields: {
                    project_id: p.id,
                    objective_id: obj.id,
                    score,
                    member_id: pickHumanMember(
                        pools, p.organization_id,
                        seedHashKey(p.id) + ':'
                            + seedHashKey(obj.id)
                            + ':baseline',
                    ),
                    at: scoredAt,
                },
            });
        }

        if (
            p.state === 'approved'
            || p.state === 'archived'
        ) {
            const ordinal = p.state === 'approved'
                ? approvedOrdinal++
                : archivedOrdinal++;
            const laggard =
                ordinal % OBJECTIVE_SEEDS.length;
            for (
                let i = 0; i < OBJECTIVE_SEEDS.length; i++
            ) {
                const obj = OBJECTIVE_SEEDS[i]!;
                const objectiveKey =
                    seedHashKey(obj.id);
                const seriesKey =
                    seedHashKey(p.id) + ':'
                    + objectiveKey;
                const baseline = deterministicScore(
                    seedHashKey(p.id) + ':'
                        + objectiveKey
                        + ':baseline',
                    0,
                    100,
                );
                for (
                    let k = 0; k < WEEKLY_ACTUALS; k++
                ) {
                    const entryKey =
                        seriesKey + ':actual:' + k;
                    const daySlip =
                        deterministicScore(
                            entryKey + ':slip',
                            0,
                            9,
                        ) === 0
                            ? deterministicScore(
                                entryKey + ':day',
                                1,
                                3,
                            )
                            : 0;
                    const minuteKey = daySlip === 0
                        ? objectiveKey
                            + ':friday:' + k
                        : entryKey + ':minute';
                    const scoredAt = isoFromMs(
                        businessInstant(
                            anchors[k]!,
                            daySlip,
                            businessMinute(
                                k, minuteKey,
                            ),
                        ),
                    );
                    actuals.push({
                        id: `${p.id}:${obj.id}:${
                            scoredAt
                        }`,
                        fields: {
                            project_id: p.id,
                            objective_id: obj.id,
                            score: actualScore(
                                baseline,
                                k,
                                i === laggard,
                                objectiveKey,
                                seriesKey,
                            ),
                            member_id: pickHumanMember(
                                pools,
                                p.organization_id,
                                entryKey,
                            ),
                            at: scoredAt,
                        },
                    });
                }
            }
        }
    }

    return { baselines, actuals };
}
