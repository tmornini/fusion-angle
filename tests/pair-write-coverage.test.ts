import { assert, assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';
import { routes, type Route } from '../api/routes.ts';
import {
    MESSAGE_PAIR_WIRED_ROUTE_PATTERNS,
    REPLAY_EXEMPT_ROUTE_PATTERNS,
} from '../api/message-pair.ts';
import {
    AUTHENTICATION_ROUTES,
} from '../api/request-auth.ts';

// The B4 discharge (Phase 1 exit checklist, Task 6a): every
// write-verb registration in the LIVE route table — parsed at
// runtime, never hand-read — must be pair-wired or named
// exempt. This is the mechanical completeness gate
// task-2a-report.md deferred to explicitly: "the Task 6 exit
// test will catch any gap mechanically."

const repoRoot = fromFileUrl(new URL('..', import.meta.url));

function sourceText(relativePath: string): string {
    return Deno.readTextFileSync(repoRoot + relativePath);
}

// A write registration: a Route entry exposing put, post,
// patch, or delete. `route()` builds every entry (the
// `makeIdRoute()` factory that used to build some of them was
// retired once its last two live callers — members/:id,
// organizations/:id/objectives/:id — were replaced with pair-appending
// bespoke
// routes), so this walks the table generically rather than
// caring how an entry was built. Task 10: patch joins the
// alphabet — intentional widen, not weakening.
function writtenPattern(entry: Route): string | undefined {
    if (
        entry.put === undefined
        && entry.post === undefined
        && entry.patch === undefined
        && entry.delete === undefined
    ) {
        return undefined;
    }
    return entry.segments.join('/');
}

// AUTHENTICATION_ROUTES (the dedicated grant arm) stay
// named-exempt and never reach the generic pair block.
// There is no snapshot plane to skip. Named, not
// inferred.
const NAMED_EXEMPT_ROUTE_PATTERNS:
    ReadonlySet<string> = new Set([
        ...AUTHENTICATION_ROUTES,
        // Invitation writes form their own pairs at
        // /invitations/ (storage prefix). PAIR_WIRE
        // would store a second nest document and turn
        // grant 200 into 201 via sendWriteResponse.
        'organizations/:id/invitations/',
        'organizations/:id/invitations/:id',
        'identities/:id/invitations/:id',
    ]);

Deno.test('every write-verb route is pair-wired or named exempt',
() => {
    const writeRoutePatterns = routes
        .map(writtenPattern)
        .filter(
            (pattern): pattern is string =>
                pattern !== undefined,
        );
    // A sanity floor: fails loudly if route parsing regresses
    // to near-zero (e.g. an import returns the wrong shape)
    // instead of silently passing on an empty list.
    assert(writeRoutePatterns.length > 36);
    for (const pattern of writeRoutePatterns) {
        assert(
            MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.has(pattern)
                || NAMED_EXEMPT_ROUTE_PATTERNS.has(pattern),
            'unwired, un-exempt write route: ' + pattern,
        );
    }
});

// Task 10: a synthetic patch-only route is a write for the
// walker. Without a MESSAGE_PAIR_WIRED / named-exempt
// entry it would
// fail the completeness gate above — the alphabet grew, so
// the gate must see patch. Currently no live route carries
// patch; this pins the walker, not a table row.
Deno.test('patch-only synthetic is a write route the walker'
+ ' would require pair-wired', () => {
    const synthetic: Route = {
        segments: ['patch-only-synthetic', ':id'],
        // Cast: no live PatchHandler yet; the walker only
        // tests presence, never calls.
        patch: (async () => ({})) as NonNullable<Route['patch']>,
    };
    const pattern = writtenPattern(synthetic);
    assertStrictEquals(pattern, 'patch-only-synthetic/:id');
    assertStrictEquals(
        MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.has(pattern!),
        false,
    );
    assertStrictEquals(
        NAMED_EXEMPT_ROUTE_PATTERNS.has(pattern!),
        false,
    );
});

Deno.test('AUTHENTICATION_ROUTES ride the dedicated pair arm, so'
+ ' both are also replay-exempt', () => {
    for (const pattern of AUTHENTICATION_ROUTES) {
        assert(
            REPLAY_EXEMPT_ROUTE_PATTERNS.has(pattern),
            pattern + ' rides the dedicated arm but is not'
                + ' replay-exempt',
        );
    }
});

// Invitation nest writes are named-exempt (test 1). Pair
// formation still lives in invitations-domain.ts at the
// /invitations/ storage prefix. Pin the primitives.
Deno.test('invitation writes import pair-formation primitives',
() => {
    const path = 'api/invitations-domain.ts';
    const text = sourceText(path);
    assert(
        text.includes('appendMessagePair'),
        path + ' does not import appendMessagePair',
    );
    assert(
        text.includes('formWriteMessagePair'),
        path + ' does not import formWriteMessagePair',
    );
});

Deno.test('api/api.ts awaits simulateLatency exactly 4 times', () => {
    const text = sourceText('api/api.ts');
    const hits = text.match(
        /await adapter\.simulateLatency\(\);/g,
    ) ?? [];
    assertStrictEquals(hits.length, 4);
});
