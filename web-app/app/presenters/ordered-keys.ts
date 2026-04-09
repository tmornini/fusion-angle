export function orderedKeys<
    T extends string,
>(
    groups: Partial<Record<T, unknown>>,
    order: readonly T[],
): T[] {
    const ordered = order.filter(
        s => groups[s],
    );
    const rest = Object.keys(
        groups,
    ).filter(
        s => !order.includes(s as T),
    ) as T[];
    return [...ordered, ...rest];
}
