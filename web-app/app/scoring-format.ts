import type { ObjectiveId } from '../../api/types.ts';
import { latestByKey } from '../../api/ledger-reduction.ts';

export type Tone = 'success' | 'error' | 'muted';

export const IMPACT_POSITION_DECAY = 0.95;

export function latestPerPair<T extends {
    projectId: string;
    objectiveId: string;
    at: string;
}>(rows: readonly T[]): T[] {
    const latest = latestByKey(
        rows,
        r => `${r.projectId}:${r.objectiveId}`,
        (a, b) => a.at > b.at,
    );
    return Array.from(latest.values());
}

// Geometric position-weighted mean. Each successive
// objective contributes IMPACT_POSITION_DECAY (0.95)
// of the previous one's weight, so the highest-priority
// objective dominates without the tail going to zero.
// Items are sorted by their objective's position before
// weights are applied; an unknown objectiveId throws.
export function weightedMeanByPosition(
    items: ReadonlyArray<{
        objectiveId: ObjectiveId;
        score: number;
    }>,
    positionByObjectiveId:
        ReadonlyMap<ObjectiveId, number>,
): number | null {
    if (items.length === 0) return null;
    const sorted = [...items]
        .map(item => {
            const pos = positionByObjectiveId.get(
                item.objectiveId,
            );
            if (pos === undefined) {
                throw new Error(
                    'missing position for objective: '
                    + item.objectiveId,
                );
            }
            return { ...item, pos };
        })
        .sort((a, b) => a.pos - b.pos);
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < sorted.length; i++) {
        const w = Math.pow(
            IMPACT_POSITION_DECAY, i,
        );
        weightedSum += sorted[i]!.score * w;
        weightTotal += w;
    }
    return Math.round(weightedSum / weightTotal);
}

export function formatSigned(score: number): string {
    if (score > 0) return `+${score}`;
    if (score < 0) return `−${Math.abs(score)}`;
    return '0';
}

export function toneForScore(score: number): Tone {
    if (score > 0) return 'success';
    if (score < 0) return 'error';
    return 'muted';
}
