import { TABLE_NAMES } from './db.ts';
import type { DbAdapter } from './db.ts';
import { isPermitted } from './authorization.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
} from './http-errors.ts';
import {
    matchRoute,
    route,
    type Route,
} from './routes.ts';

// One unit of a batched commit: a put (full-state upsert)
// or a delete, addressed by resource path. Validated at the
// gate, then dispatched to the same per-resource handler the
// HTTP router uses, bound to the open transaction view.
export type CommitOp =
    | {
        method: 'put';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        method: 'delete';
        resource: string;
    };

function validateCommitOp(
    raw: unknown,
    index: number,
): CommitOp {
    const label = 'commit op[' + index + ']';
    if (
        typeof raw !== 'object'
        || raw === null
        || Array.isArray(raw)
    ) {
        throw new ApiError(
            label + ' must be an object.',
            HTTP_BAD_REQUEST,
        );
    }
    const op = raw as Record<string, unknown>;
    const resource = op['resource'];
    if (typeof resource !== 'string' || resource === '') {
        throw new ApiError(
            label + ' needs a non-empty "resource".',
            HTTP_BAD_REQUEST,
        );
    }
    if (op['method'] === 'put') {
        const body = op['body'];
        if (
            typeof body !== 'object'
            || body === null
            || Array.isArray(body)
        ) {
            throw new ApiError(
                label + ' put needs an object "body".',
                HTTP_BAD_REQUEST,
            );
        }
        return {
            method: 'put',
            resource,
            body: body as Record<string, unknown>,
        };
    }
    if (op['method'] === 'delete') {
        return { method: 'delete', resource };
    }
    throw new ApiError(
        label + ' method must be "put" or "delete".',
        HTTP_BAD_REQUEST,
    );
}

function validateCommitBody(
    payload: Record<string, unknown>,
): CommitOp[] {
    const ops = payload['ops'];
    if (!Array.isArray(ops)) {
        throw new ApiError(
            'commit body needs an "ops" array.',
            HTTP_BAD_REQUEST,
        );
    }
    return ops.map(validateCommitOp);
}

const COMMIT_TABLES: ReadonlySet<string> =
    new Set(TABLE_NAMES);

// Resources whose collection name is not their table; every
// other resource maps first-segment hyphen→underscore. The
// map is closed and enumerated — no reflection.
const COMMIT_RESOURCE_TABLE: Record<string, string> = {
    'current-member': 'members',
};

function tableForCommitResource(resource: string): string {
    const segments = resource.split('/').filter(Boolean);
    const first = segments[0];
    if (first === undefined) {
        throw new ApiError(
            'commit op resource is empty.',
            HTTP_BAD_REQUEST,
        );
    }
    // identities/:id/pii is the PII facet of an identity's
    // subtree — it lands in identity_pii, not identities.
    const table =
        first === 'identities' && segments[2] === 'pii'
            ? 'identity_pii'
            : COMMIT_RESOURCE_TABLE[first]
                ?? first.replace(/-/g, '_');
    if (!COMMIT_TABLES.has(table)) {
        throw new ApiError(
            'commit op resource "' + resource
            + '" maps to no table.',
            HTTP_BAD_REQUEST,
        );
    }
    return table;
}

// The transaction scope for a batch. Always includes
// 'states': every org-scoped put reads it (the fence's
// #assertWritable getById scans the tombstone log), so it
// must be in scope.
export function unionTablesFor(
    ops: readonly CommitOp[],
): string[] {
    const tables = new Set<string>(['states']);
    for (const op of ops) {
        tables.add(tableForCommitResource(op.resource));
    }
    return [...tables];
}

// Each batch op stands for the HTTP request it would have
// been — so it faces the same role policy at the same gate.
// One denied op fails the whole batch before any dispatch.
// A malformed ops payload is NOT judged here: the dispatch
// path's own validation raises the precise 400.
export function commitOpsAuthzFailure(
    payload: Record<string, unknown>,
    roles: readonly string[],
): string | null {
    let ops: CommitOp[];
    try {
        ops = validateCommitBody(payload);
    } catch {
        return null;
    }
    for (const op of ops) {
        const verb =
            op.method === 'put' ? 'PUT' : 'DELETE';
        if (!isPermitted(verb, '/' + op.resource, roles)) {
            return 'forbidden: commit op ' + verb + ' /'
                + op.resource
                + ' requires a role this principal lacks';
        }
    }
    return null;
}

async function dispatchOpInTx(
    view: DbAdapter,
    op: CommitOp,
    table: readonly Route[],
): Promise<void> {
    const segments =
        op.resource.split('/').filter(Boolean);
    const match = matchRoute(table, segments);
    if (match === null) {
        throw new ApiError(
            'commit op resource not found: '
            + op.resource,
            HTTP_NOT_FOUND,
        );
    }
    const { route: matched, params } = match;
    if (op.method === 'put') {
        if (matched.put === undefined) {
            throw new ApiError(
                'commit op put not allowed on '
                + op.resource,
                HTTP_BAD_REQUEST,
            );
        }
        await matched.put(view, params, op.body);
    } else {
        if (matched.delete === undefined) {
            throw new ApiError(
                'commit op delete not allowed on '
                + op.resource,
                HTTP_BAD_REQUEST,
            );
        }
        await matched.delete(view, params);
    }
}

// The batch route's body handler. One authenticated request;
// `effective` is already org-scoped, and its transaction
// re-scopes the view — so each op dispatches without re-auth
// or re-latency. Real rollback: any op throwing discards the
// whole batch.
async function applyCommit(
    effective: DbAdapter,
    payload: Record<string, unknown>,
    table: readonly Route[],
): Promise<void> {
    const ops = validateCommitBody(payload);
    const tables = unionTablesFor(ops);
    await effective.transaction(tables, async (view) => {
        for (const op of ops) {
            await dispatchOpInTx(view, op, table);
        }
    });
}

// The batch route, bound at composition time to the table its
// ops dispatch against — the same table that serves it,
// commit included. Wired ONCE by the composition root, so the
// dispatch reaches the route table with no module edge back
// into it.
export function commitRouteFor(
    table: readonly Route[],
): Route {
    return route('commit', {
        post: async (db, _p, body) => {
            await applyCommit(db, body, table);
        },
    });
}
