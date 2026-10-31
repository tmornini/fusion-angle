export type ObjectiveCardHit =
    | { kind: 'open'; objectiveId: string }
    | { kind: 'close' }
    | { kind: 'none' };

export function objectiveCardHit(
    target: Element,
): ObjectiveCardHit {
    if (target.closest('.spark-dot') !== null) {
        return { kind: 'none' };
    }
    if (target.closest('a') !== null) {
        return { kind: 'none' };
    }
    if (target.closest('[data-drill-back]') !== null) {
        return { kind: 'close' };
    }
    const row = target.closest('[data-objective-id]');
    if (row === null) return { kind: 'none' };
    const objectiveId = row.getAttribute(
        'data-objective-id',
    );
    if (objectiveId === null) return { kind: 'none' };
    return { kind: 'open', objectiveId };
}
