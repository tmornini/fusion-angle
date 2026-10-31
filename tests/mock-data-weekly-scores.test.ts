import { assert, assertStrictEquals } from '@std/assert';
import { OBJECTIVE_SEEDS } from
    '../api/mock-data/objectives.ts';
import {
    buildSeedScoreRows,
    type SeedScoreRow,
} from '../api/mock-data/scores.ts';
import { buildScoreSeedProjects } from
    '../api/mock-data/seed-message-pairs.ts';
import {
    humanMemberPoolsByOrganization,
    now,
} from '../api/mock-data/seed-kit.ts';
import { buildMembers } from
    '../api/mock-data/members.ts';

// Sixteen Friday readings per objective. The newest is
// the seed clock's UTC Friday when that day is Friday,
// otherwise the Friday before it, then fifteen older
// Fridays. Clock time is an America/New_York business
// hour. One reading in ten slips to Sat, Sun, or Mon.
// Each series wanders before it climbs, and both the
// wander and the climb start on their own week. Three
// objectives finish up and one finishes neutral or
// down, while each approved mean still climbs.

const WEEKLY = 16;
const ZONE = 'America/New_York';
const OPEN_MINUTE = 9 * 60;
const CLOSE_MINUTE = 17 * 60;
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

const WEEKDAY: Readonly<Record<string, number>> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
};

const projects = buildScoreSeedProjects();
const rows = buildSeedScoreRows(
    projects,
    humanMemberPoolsByOrganization(buildMembers()),
);

function isScored(state: string): boolean {
    return state === 'approved'
        || state === 'archived';
}

function actualsFor(
    projectId: string,
    objectiveId: string,
): SeedScoreRow[] {
    return rows.actuals
        .filter(row =>
            row.fields.project_id === projectId
            && row.fields.objective_id === objectiveId,
        )
        .sort((a, b) =>
            a.fields.at.localeCompare(b.fields.at),
        );
}

function baselineOf(
    projectId: string,
    objectiveId: string,
): number {
    const row = rows.baselines.find(item =>
        item.fields.project_id === projectId
        && item.fields.objective_id === objectiveId,
    );
    if (row === undefined) {
        throw new Error(
            'no baseline for '
            + projectId + ' ' + objectiveId,
        );
    }
    return row.fields.score;
}

function mean(values: readonly number[]): number {
    let sum = 0;
    for (const value of values) sum += value;
    return sum / values.length;
}

interface Wall {
    date: string;
    minutes: number;
    weekday: number;
}

function wall(iso: string): Wall {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ZONE,
        hourCycle: 'h23',
        weekday: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(new Date(iso));
    const pick = (type: string): string => {
        const part = parts.find(
            item => item.type === type,
        );
        if (part === undefined) {
            throw new Error('missing ' + type);
        }
        return part.value;
    };
    const weekday = WEEKDAY[pick('weekday')];
    if (weekday === undefined) {
        throw new Error(
            'bad weekday ' + pick('weekday'),
        );
    }
    return {
        date: pick('year') + '-'
            + pick('month') + '-' + pick('day'),
        minutes: Number(pick('hour')) * 60
            + Number(pick('minute')),
        weekday,
    };
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function ymd(ms: number): string {
    const day = new Date(ms);
    return day.getUTCFullYear() + '-'
        + pad(day.getUTCMonth() + 1) + '-'
        + pad(day.getUTCDate());
}

// The Friday on or before this New York calendar
// date. Sat, Sun, and Mon walk back; Friday stays.
function fridayOf(date: string, weekday: number): string {
    const back = (weekday + 2) % 7;
    const parts = date.split('-').map(Number);
    const year = parts[0]!;
    const month = parts[1]!;
    const day = parts[2]!;
    return ymd(Date.UTC(
        year, month - 1, day - back,
    ));
}

function expectedFridays(): string[] {
    const back = (now.getUTCDay() + 2) % 7;
    const newest = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - back,
    );
    const dates: string[] = [];
    for (let ago = WEEKLY - 1; ago >= 0; ago--) {
        dates.push(ymd(
            newest - ago * 7 * 86_400_000,
        ));
    }
    return dates;
}

Deno.test('scored projects carry sixteen weekly actuals'
+ ' per objective', () => {
    assertStrictEquals(OBJECTIVE_SEEDS.length, 4);
    const scored = projects.filter(project =>
        isScored(project.state),
    );
    assert(scored.length > 0, 'no scored projects');
    for (const project of scored) {
        for (const objective of OBJECTIVE_SEEDS) {
            assertStrictEquals(
                actualsFor(
                    project.id, objective.id,
                ).length,
                WEEKLY,
                project.id + ' ' + objective.name,
            );
        }
    }
    for (const project of projects) {
        if (isScored(project.state)) continue;
        const mine = rows.actuals.filter(row =>
            row.fields.project_id === project.id,
        );
        assertStrictEquals(
            mine.length, 0, project.id,
        );
    }
});

Deno.test('weekly actuals use the Friday window in'
+ ' business hours, one in ten slipped', () => {
    const fridays = expectedFridays();
    let slipped = 0;
    let total = 0;
    for (const project of projects) {
        if (!isScored(project.state)) continue;
        for (const objective of OBJECTIVE_SEEDS) {
            const actuals = actualsFor(
                project.id, objective.id,
            );
            const anchors: string[] = [];
            for (const row of actuals) {
                assert(
                    ZULU_6.test(row.fields.at),
                    row.fields.at,
                );
                const clock = wall(row.fields.at);
                assert(
                    clock.minutes >= OPEN_MINUTE
                        && clock.minutes < CLOSE_MINUTE,
                    row.fields.at + ' ' + clock.minutes,
                );
                anchors.push(fridayOf(
                    clock.date, clock.weekday,
                ));
                if (clock.weekday !== 5) {
                    assert(
                        clock.weekday === 6
                            || clock.weekday === 0
                            || clock.weekday === 1,
                        row.fields.at,
                    );
                    slipped += 1;
                }
                total += 1;
            }
            assertStrictEquals(
                anchors.join(','),
                fridays.join(','),
                project.id + ' ' + objective.name,
            );
        }
    }
    const ratio = slipped / total;
    assert(
        ratio >= 0.08 && ratio <= 0.12,
        'slipped ' + slipped + ' of ' + total,
    );
});

Deno.test('Friday readings share one instant per week'
+ ' and those instants span the business day', () => {
    for (const objective of OBJECTIVE_SEEDS) {
        const atByFriday = new Map<string, string>();
        for (const project of projects) {
            if (!isScored(project.state)) continue;
            for (const row of actualsFor(
                project.id, objective.id,
            )) {
                const clock = wall(row.fields.at);
                if (clock.weekday !== 5) continue;
                const prior = atByFriday.get(clock.date);
                if (prior === undefined) {
                    atByFriday.set(
                        clock.date, row.fields.at,
                    );
                } else {
                    assertStrictEquals(
                        row.fields.at,
                        prior,
                        objective.name + ' ' + clock.date,
                    );
                }
            }
        }
        const minutes = [...atByFriday.values()]
            .map(iso => wall(iso).minutes);
        assert(
            minutes.length >= 14,
            objective.name + ' fridays '
                + minutes.length,
        );
        const span = Math.max(...minutes)
            - Math.min(...minutes);
        assert(
            span >= 180,
            objective.name + ' span ' + span,
        );
    }
});

function rose(
    baseline: number,
    last: number,
): boolean {
    const headroom = 100 - baseline;
    const gained = last - baseline;
    // A baseline near the ceiling can only step up
    // a little. Lower ones have to finish well up.
    if (headroom >= 20) return gained >= 15;
    return gained >= 1;
}

// The week that best splits a series into an earlier
// and a later level. A shared stage puts every riser
// on the same week; staggered starts spread them.
function changeWeek(
    scores: readonly number[],
): number {
    let best = 2;
    let bestGap = -Infinity;
    for (let k = 2; k <= 12; k++) {
        const gap = mean(scores.slice(k))
            - mean(scores.slice(0, k));
        if (gap > bestGap) {
            bestGap = gap;
            best = k;
        }
    }
    return best;
}

function lagged(
    baseline: number,
    last: number,
): boolean {
    const gained = last - baseline;
    return gained <= 0 && gained >= -30;
}

Deno.test('three objectives rise and one does not,'
+ ' while every approved mean still climbs', () => {
    const samples: number[][][] = [];
    const onsets: number[][] = [];
    for (let i = 0; i < OBJECTIVE_SEEDS.length; i++) {
        const weeks: number[][] = [];
        for (let k = 0; k < WEEKLY; k++) {
            weeks.push([]);
        }
        samples.push(weeks);
        onsets.push([]);
    }
    for (const project of projects) {
        if (!isScored(project.state)) continue;
        let rising = 0;
        let lagging = 0;
        for (
            let i = 0; i < OBJECTIVE_SEEDS.length; i++
        ) {
            const objective = OBJECTIVE_SEEDS[i]!;
            const scores = actualsFor(
                project.id, objective.id,
            ).map(row => row.fields.score);
            const baseline = baselineOf(
                project.id, objective.id,
            );
            const last = scores[WEEKLY - 1]!;
            if (rose(baseline, last)) {
                rising += 1;
                if (project.state === 'approved') {
                    onsets[i]!.push(changeWeek(scores));
                }
            } else if (lagged(baseline, last)) {
                lagging += 1;
            } else {
                assert(
                    false,
                    project.id + ' ' + objective.name
                        + ' last ' + last
                        + ' baseline ' + baseline,
                );
            }
            if (project.state !== 'approved') continue;
            const weeks = samples[i]!;
            for (let k = 0; k < WEEKLY; k++) {
                weeks[k]!.push(scores[k]!);
            }
        }
        assertStrictEquals(rising, 3, project.id);
        assertStrictEquals(lagging, 1, project.id);
    }
    for (
        let i = 0; i < OBJECTIVE_SEEDS.length; i++
    ) {
        const objective = OBJECTIVE_SEEDS[i]!;
        const series = samples[i]!.map(
            week => mean(week),
        );
        const opening = series.slice(0, 4);
        const span = Math.max(...opening)
            - Math.min(...opening);
        assert(
            span >= 10,
            objective.name + ' opening span '
                + span.toFixed(1),
        );
        let turns = 0;
        let prior = series[1]! - series[0]!;
        for (let k = 2; k <= 3; k++) {
            const step = series[k]! - series[k - 1]!;
            const reversed = (prior < 0 && step > 0)
                || (prior > 0 && step < 0);
            if (reversed) turns += 1;
            if (step !== 0) prior = step;
        }
        assert(
            turns >= 1,
            objective.name + ' opening turns '
                + turns,
        );
        const early = mean(series.slice(0, 4));
        const late = mean(series.slice(-4));
        assert(
            late >= early + 8,
            objective.name + ' climb '
                + late.toFixed(1)
                + ' from ' + early.toFixed(1),
        );
        let dips = 0;
        for (let k = 1; k < WEEKLY; k++) {
            if (series[k]! < series[k - 1]!) dips += 1;
        }
        assert(
            dips >= 2,
            objective.name + ' dips ' + dips,
        );
        const starts = [...new Set(onsets[i]!)];
        starts.sort((a, b) => a - b);
        const spread = starts[starts.length - 1]!
            - starts[0]!;
        assert(
            starts.length >= 2 && spread >= 3,
            objective.name + ' starts '
                + starts.join(','),
        );
    }
});
