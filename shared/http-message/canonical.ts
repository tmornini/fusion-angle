import { isRawJson } from './json-numbers.ts';
import type { FieldLine } from './types.ts';

// ASCII byte-ascending comparison. NOT localeCompare, whose
// ordering depends on the host locale — field names and JSON
// keys are ASCII, so UTF-16 code-unit order IS ASCII order, and
// it is the same on every machine. Determinism serves
// Reliability, not speed.
export function compareAscii(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

// Join same-name lines other than set-cookie with ", " in
// the order received, then sort by name, bytewise. The sort
// is stable, so each set-cookie line keeps its receipt order
// (RFC 9110 §5.3). A second call is a no-op: names are
// already joined and the order already ascends. Do not
// replace the sort with an unstable one.
export function sortFields(
    fields: readonly FieldLine[],
): FieldLine[] {
    const joined: FieldLine[] = [];
    const indexOf = new Map<string, number>();
    for (const field of fields) {
        if (field.name === 'set-cookie') {
            joined.push(field);
            continue;
        }
        const index = indexOf.get(field.name);
        if (index === undefined) {
            indexOf.set(field.name, joined.length);
            joined.push(field);
            continue;
        }
        const prior = joined[index]!;
        joined[index] = {
            name: prior.name,
            value: prior.value + ', ' + field.value,
        };
    }
    return joined.sort(
        (x, y) => compareAscii(x.name, y.name),
    );
}

// Recursively rebuild every object with its keys in ASCII-
// ascending order. JSON.stringify emits keys in INSERTION
// order, so canonical JSON must re-key first. Arrays keep their
// order (it is significant); primitives pass through.
export function sortJsonKeys(value: unknown): unknown {
    if (isRawJson(value)) return value;
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
