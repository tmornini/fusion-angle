import type { DbAdapter } from './db.ts';
import { ForeignOrganizationError } from './db.ts';
import type { Id } from './types.ts';
import { resolveGlobalOwner } from './derive-states.ts';
import {
    RECORD_TYPE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
} from './family-registry.ts';

// Pre-write ownership authorizer on the pair plane. Probes
// THIS route's collection, not any row with this id. Same
// id at two collections is two documents. owner-null
// (never written at this address) → genesis proceeds;
// this address has a live PUT the caller may not have →
// ForeignOrganizationError (HTTP 403).
//
// Designed ONCE at the gate/op seam (api.ts consults
// writeAuthorizerFor; assertWritableInOrganization is the
// single throw site). Cost class matches
// resolveOwningOrganization (hit ~19µs / miss ~1.9ms).

export interface WriteAuthorizer {
    readonly table: string;
    readonly idParamIndex: number;
}

// Org-scoped existing-id PUT/DELETE/PATCH addresses.
// Collection POSTs (genesis of a new id) are
// intentionally absent — owner-null is the happy path for
// those. PATCH must share this map so a future flat PATCH
// cannot bypass the ownership fence (Task 10 / Security).
const WRITE_AUTHORIZERS:
    ReadonlyMap<string, WriteAuthorizer> = new Map([
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
        // Flat records/:id + record-attributes/:id retired
        // (Task 23). Nested types use RECORD_TYPE_DETAIL_
        // PATTERN below; nested attributes have no row
        // (parent type 404 + path org gate).
        ['objectives/:id', {
            table: 'objectives', idParamIndex: 0,
        }],
        // Nested record-types detail (Task 3): id is param
        // index 1 (:record-type-id).
        [RECORD_TYPE_DETAIL_PATTERN, {
            table: 'record_types', idParamIndex: 1,
        }],
        [ORGANIZATION_MEMBER_DETAIL_PATTERN, {
            table: 'organization_members',
            idParamIndex: 1,
        }],
    ]);

export function writeAuthorizerFor(
    routePattern: string,
    method: string,
): WriteAuthorizer | undefined {
    if (
        method !== 'PUT'
        && method !== 'DELETE'
        && method !== 'PATCH'
    ) {
        return undefined;
    }
    return WRITE_AUTHORIZERS.get(routePattern);
}

export async function assertWritableInOrganization(
    db: DbAdapter,
    entityId: Id,
    organization: Id,
    table: string,
): Promise<void> {
    const owner = await resolveGlobalOwner(
        db, entityId, organization, table,
    );
    if (owner !== null && owner !== organization) {
        throw new ForeignOrganizationError(table, entityId);
    }
}
