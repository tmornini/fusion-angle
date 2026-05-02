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

export function computeNewPosition(
    positions: readonly number[],
    idx: number,
): number {
    if (positions.length === 0) {
        return FIRST_POSITION;
    }
    if (idx === 0) {
        return positions[0]! - POSITION_GAP;
    }
    if (idx >= positions.length) {
        return positions[positions.length - 1]!
            + POSITION_GAP;
    }
    return (
        positions[idx - 1]! + positions[idx]!
    ) / 2;
}
