import type { FieldLine } from './types.ts';

// ASCII byte-ascending comparison. NOT localeCompare, whose
// ordering depends on the host locale — field names and JSON
// keys are ASCII, so UTF-16 code-unit order IS ASCII order, and
// it is the same on every machine. Determinism serves
// Reliability, not speed.
export function compareAscii(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

// Canonical field order: ascending by name, STABLE within a
// name so same-name lines keep their relative order (RFC 9110
// §5.3 — the order of same-name fields is significant).
// Array.prototype.sort is stable in ES2024 and the comparator
// returns 0 for equal names, so the stability is what preserves
// the order. Do not replace with an unstable sort.
export function sortFields(
    fields: readonly FieldLine[],
): FieldLine[] {
    return [...fields].sort(
        (x, y) => compareAscii(x.name, y.name),
    );
}

// Recursively rebuild every object with its keys in ASCII-
// ascending order. JSON.stringify emits keys in INSERTION
// order, so canonical JSON must re-key first. Arrays keep their
// order (it is significant); primitives pass through.
export function sortJsonKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJsonKeys);
    }
    if (value !== null && typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort(compareAscii)) {
            out[key] = sortJsonKeys(source[key]);
        }
        return out;
    }
    return value;
}
