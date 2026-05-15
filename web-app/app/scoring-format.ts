export type Tone = 'positive' | 'negative' | 'neutral';

export function latestPerPair<T extends {
    project_id: string;
    objective_id: string;
    scored_at: string;
}>(rows: readonly T[]): T[] {
    const map = new Map<string, T>();
    for (const r of rows) {
        const key =
            `${r.project_id}:${r.objective_id}`;
        const prev = map.get(key);
        if (!prev || r.scored_at > prev.scored_at) {
            map.set(key, r);
        }
    }
    return Array.from(map.values());
}

export function formatSigned(score: number): string {
    if (score > 0) return `+${score}`;
    if (score < 0) return `−${Math.abs(score)}`;
    return '0';
}

export function toneForScore(score: number): Tone {
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
}
