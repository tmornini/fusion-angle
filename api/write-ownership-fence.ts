import type { DbAdapter } from './db.ts';
import { ForeignOrganizationError } from './db.ts';
import type { Id } from './types.ts';
import { resolveGlobalOwner } from './derive-states.ts';

// Pre-write ownership gate on the pair plane. Without it, a
// foreign-id PUT would genesis in the caller's own namespace
// (pair plane is per-org namespaced). Resolves the document's
// owner BEFORE the handler runs:
// owner-null → genesis proceeds; foreign →
// ForeignOrganizationError (HTTP 403 — the honest covenant;
// existence of opaque high-entropy ids is accepted).
//
// Designed ONCE at the gate/op seam (api.ts consults
// writeOwnershipFenceFor; assertWritableInOrganization is the
// single throw site). Cost class matches
// resolveOwningOrganization (hit ~19µs / miss ~1.9ms).

export interface WriteOwnershipFence {
    readonly table: string;
    readonly idParamIndex: number;
}

// The 9 org-scoped families' existing-id PUT/DELETE addresses.
// Collection POSTs (genesis of a new id) are intentionally
// absent — owner-null is the happy path for those.
const WRITE_OWNERSHIP_FENCE:
    ReadonlyMap<string, WriteOwnershipFence> = new Map([
        ['ideas/:id', {
            table: 'ideas', idParamIndex: 0,
        }],
        ['projects/:id', {
            table: 'projects', idParamIndex: 0,
        }],
        ['flows/:id', {
            table: 'flows', idParamIndex: 0,
        }],
        ['work-orders/:id', {
            table: 'work_orders', idParamIndex: 0,
        }],
        ['records/:id', {
            table: 'records', idParamIndex: 0,
        }],
        ['record-attributes/:id', {
            table: 'record_attributes', idParamIndex: 0,
        }],
        ['objectives/:id', {
            table: 'objectives', idParamIndex: 0,
        }],
        ['memberships/:id', {
            table: 'memberships', idParamIndex: 0,
        }],
        ['role-grants/:id', {
            table: 'role_grants', idParamIndex: 0,
        }],
    ]);

export function writeOwnershipFenceFor(
    routePattern: string,
    method: string,
): WriteOwnershipFence | undefined {
    if (method !== 'PUT' && method !== 'DELETE') {
        return undefined;
    }
    return WRITE_OWNERSHIP_FENCE.get(routePattern);
}

export async function assertWritableInOrganization(
    db: DbAdapter,
    entityId: Id,
    organization: Id,
    table: string,
): Promise<void> {
    const owner = await resolveGlobalOwner(
        db, entityId, organization,
    );
    if (owner !== null && owner !== organization) {
        throw new ForeignOrganizationError(table, entityId);
    }
}
