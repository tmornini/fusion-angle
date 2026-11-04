import {
    assertStrictEquals,
} from '@std/assert';
import { parseGitSha } from '../server/git-sha.ts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

Deno.test('parseGitSha accepts 40 lowercase hex', () => {
    assertStrictEquals(parseGitSha(SHA), SHA);
    assertStrictEquals(parseGitSha(SHA + '\n'), SHA);
});

Deno.test('parseGitSha rejects other text', () => {
    assertStrictEquals(parseGitSha(''), undefined);
    assertStrictEquals(parseGitSha('nope'), undefined);
    assertStrictEquals(
        parseGitSha(SHA.slice(0, 39)), undefined,
    );
    assertStrictEquals(
        parseGitSha(SHA.toUpperCase()), undefined,
    );
});
