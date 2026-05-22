import type { ObjectiveId } from '../../api/types.ts';

export type Tone = 'success' | 'error' | 'muted';

export const IMPACT_POSITION_DECAY = 0.95;

export function latestPerPair<T extends {
    project_id: string;
    objective_id: string;
    at: string;
}>(rows: readonly T[]): T[] {
    const map = new Map<string, T>();
    for (const r of rows) {
        const key =
            `${r.project_id}:${r.objective_id}`;
        const prev = map.get(key);
        if (!prev || r.at > prev.at) {
            map.set(key, r);
        }
    }
    return Array.from(map.values());
}

// Geometric position-weighted mean. Each successive
// objective contributes IMPACT_POSITION_DECAY (0.95)
// of the previous one's weight, so the highest-priority
// objective dominates without the tail going to zero.
// Items are sorted by their objective's position before
// weights are applied; an unknown objective_id throws.
export function weightedMeanByPosition(
    items: ReadonlyArray<{
        objective_id: ObjectiveId;
        score: number;
    }>,
    positionByObjectiveId:
        ReadonlyMap<ObjectiveId, number>,
): number | null {
    if (items.length === 0) return null;
    const sorted = [...items]
        .map(item => {
            const pos = positionByObjectiveId.get(
                item.objective_id,
            );
            if (pos === undefined) {
                throw new Error(
                    'missing position for objective: '
                    + item.objective_id,
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
