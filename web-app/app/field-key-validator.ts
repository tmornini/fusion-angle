// A type guard for a closed set of field keys. Each module
// keeps its own FieldKey union and its ReadonlySet of the
// valid keys; this factory turns that set into the guard the
// modules otherwise hand-roll identically. Null (the absent
// dataset attribute) is rejected.
export function makeFieldKeyValidator<K extends string>(
    fields: ReadonlySet<K>,
): (value: string | null) => value is K {
    return (value: string | null): value is K =>
        value !== null && fields.has(value as K);
}
