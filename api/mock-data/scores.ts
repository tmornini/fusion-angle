// The seeded project_objective_baseline_scores /
// project_objective_actual_scores rows — hoisted VERBATIM out of
// postMockDataLoadIn's two scoring loops (mock-data.ts) so the
// SAME computation feeds both the seed's row writes and pass 1's
// pre-tx pair formation (seed-message-pairs.ts). Pure: no clock,
// no randomness, no store read — deterministicScore is a hash
// over its seed string, never Math.random, and every project
// fact (organization_id, state) arrives already resolved
// (buildScoreSeedProjects, seed-message-pairs.ts) rather than
// read back from a transaction.
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

import type { Id, ObjectiveId } from '../types.ts';
import { MS_PER_DAY } from '../types.ts';
import {
    isoFromMs,
    deterministicScore,
    pickHumanMember,
} from './seed-kit.ts';
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

export function buildSeedScoreRows(
    projects: readonly ScoreSeedProject[],
    pools: ReadonlyMap<Id, readonly Id[]>,
): SeedScoreRows {
    const baselines: SeedScoreRow[] = [];
    const actuals: SeedScoreRow[] = [];

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
                    p.id + ':coverage',
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
                `${p.id}:${obj.id}:baseline`,
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
                        `${p.id}:${obj.id}:baseline`,
                    ),
                    at: scoredAt,
                },
            });
        }

        if (
            p.state === 'approved'
            || p.state === 'archived'
        ) {
            const minActuals = 1;
            const baseActualTime =
                baselineStart + MS_PER_DAY;
            for (
                let i = 0; i < OBJECTIVE_SEEDS.length; i++
            ) {
                const obj = OBJECTIVE_SEEDS[i]!;
                const nActuals =
                    minActuals
                    + deterministicScore(
                        `${p.id}:${obj.id}:nactual`,
                        0,
                        2,
                    );
                for (let k = 0; k < nActuals; k++) {
                    const score = deterministicScore(
                        `${p.id}:${obj.id}:actual:${k}`,
                        -100,
                        100,
                    );
                    const scoredAt = isoFromMs(
                        baseActualTime
                            + (i * 10 + k) * 1000,
                    );
                    actuals.push({
                        id: `${p.id}:${obj.id}:${scoredAt}`,
                        fields: {
                            project_id: p.id,
                            objective_id: obj.id,
                            score,
                            member_id: pickHumanMember(
                                pools, p.organization_id,
                                `${p.id}:${obj.id}:actual:${k}`,
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
