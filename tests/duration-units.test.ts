import {
    assertMatch, assertStrictEquals, assertThrows,
} from '@std/assert';
import { formatMinAscending } from '../web-app/app/duration-units.ts';

Deno.test('formatMinAscending picks the largest unit ≥ 1', () => {
    assertStrictEquals(formatMinAscending(0),       '0s');
    assertStrictEquals(formatMinAscending(47),      '47s');
    assertStrictEquals(formatMinAscending(59),      '59s');
    assertStrictEquals(formatMinAscending(60),      '1m');
    assertStrictEquals(formatMinAscending(90),      '1.5m');
    assertStrictEquals(formatMinAscending(510),     '8.5m');
    assertStrictEquals(formatMinAscending(600),     '10m');
    assertStrictEquals(formatMinAscending(3599),    '60m');
    assertStrictEquals(formatMinAscending(3600),    '1h');
    assertStrictEquals(formatMinAscending(11520),   '3.2h');
    assertStrictEquals(formatMinAscending(86400),   '1d');
    assertStrictEquals(formatMinAscending(414720),  '4.8d');
    assertStrictEquals(formatMinAscending(604800),  '1w');
    assertStrictEquals(formatMinAscending(1270080), '2.1w');
    assertStrictEquals(formatMinAscending(52 * 604800), '52w');
});

Deno.test('formatMinAscending rejects negative input', () => {
    const err = assertThrows(
        () => formatMinAscending(-1),
    ) as Error;
    assertMatch(err.message, /negative/i);
});
