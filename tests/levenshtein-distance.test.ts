import { assertStrictEquals } from '@std/assert';
import {
    levenshteinDistance,
} from '../shared/levenshtein-distance.ts';

const rows: readonly (readonly [string, string, number])[] = [
    ['', '', 0],
    ['', 'abc', 3],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['flaw', 'lawn', 2],
    ['aproval', 'approval', 1],
    ['approval', 'approval', 0],
    ['abc', 'acb', 2],
    ['a', 'b', 1],
];

for (const [a, b, distance] of rows) {
    Deno.test(
        `levenshteinDistance('${a}', '${b}') is ${distance}`,
        () => {
            assertStrictEquals(
                levenshteinDistance(a, b),
                distance,
            );
            assertStrictEquals(
                levenshteinDistance(b, a),
                distance,
            );
        },
    );
}
