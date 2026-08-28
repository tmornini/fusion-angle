export const HYSTERESIS_PX = 8;
export const FIRST_POSITION = 1;
export const POSITION_GAP = 1;

export interface CardRect {
    readonly top: number;
    readonly height: number;
}

export function dropIndex(
    y: number,
    lastIdx: number | null,
    rects: readonly CardRect[],
): number {
    for (let i = 0; i < rects.length; i++) {
        const rect = rects[i]!;
        const mid = rect.top + rect.height / 2;
        let boundary = mid;
        if (lastIdx === i) {
            boundary = mid + HYSTERESIS_PX;
        } else if (lastIdx === i + 1) {
            boundary = mid - HYSTERESIS_PX;
        }
        if (y < boundary) return i;
    }
    return rects.length;
}

// The position that lies between two existing
// positions — the room a new item needs to wedge in
// without disturbing its neighbors. The arithmetic
// is averaging; the semantic is BETWEENING.
export function positionBetween(
    left: number,
    right: number,
): number {
    return (left + right) / 2;
}

// The next position past the tail of the list — the
// seed for an empty list, or one POSITION_GAP beyond
// the current last entry. The canonical append.
export function nextPosition(
    positions: readonly number[],
): number {
    if (positions.length === 0) {
        return FIRST_POSITION;
    }
    return positions[positions.length - 1]!
        + POSITION_GAP;
}

export function computeNewPosition(
    positions: readonly number[],
    idx: number,
): number {
    if (positions.length === 0
        || idx >= positions.length) {
        return nextPosition(positions);
    }
    if (idx === 0) {
        return positions[0]! - POSITION_GAP;
    }
    return positionBetween(
        positions[idx - 1]!,
        positions[idx]!,
    );
}

export function followTranslateY(
    startClientY: number,
    clientY: number,
): string {
    return 'translateY('
        + (clientY - startClientY)
        + 'px)';
}
