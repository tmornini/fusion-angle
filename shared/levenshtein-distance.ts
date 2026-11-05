// Unit-cost insert, delete, and substitute over UTF-16 code
// units. Two rolling rows keep memory at the shorter string.
export function levenshteinDistance(
    a: string,
    b: string,
): number {
    const [long, short] = a.length >= b.length ? [a, b] : [b, a];
    let previous = Array.from(
        { length: short.length + 1 },
        (_, index) => index,
    );
    for (let row = 1; row <= long.length; row++) {
        const current = [row];
        for (let column = 1; column <= short.length; column++) {
            const substitution = previous[column - 1]!
                + (long[row - 1] === short[column - 1] ? 0 : 1);
            current.push(Math.min(
                substitution,
                previous[column]! + 1,
                current[column - 1]! + 1,
            ));
        }
        previous = current;
    }
    return previous[short.length]!;
}
