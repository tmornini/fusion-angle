import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id } from './types.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import { resolveOwningOrganization } from './derive-states.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';

// Phase Final Task 1(e): the pre-write ownership gate that
// preserves today's foreign-id 404 bytes once dual-write row
// halves die. OrganizationScopedEntityStore#assertMine (PUT)
// and #ownsRow (DELETE) today fence against the ROW keyspace;
// after strip the pair plane is per-org namespaced, so a
// naive strip would flip foreign-id PUT from 404 to genesis
// 2xx in the caller's own namespace. This gate resolves the
// document's owner on the pair plane BEFORE the handler runs:
// owner-null → genesis proceeds; foreign → EntityNotFoundError
// (the same 404 bytes #assertMine throws today).
//
// Designed ONCE at the gate/op seam (api.ts consults
// writeOwnershipFenceFor; assertWritableInOrganization is the
// single throw site). Cost class matches
// resolveOwningOrganization (hit ~19µs / miss ~1.9ms).

const ROLE_GRANTS_PREFIX =
    canonicalUriPrefix(undefined, '/role-grants/');

// Organization-nested document prefixes:
// /organizations/{id}/...
const ORGANIZATION_NESTED_PREFIX =
    /^\/organizations\/([^/]+)\//;

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

function responseBodyOf(
    message: string,
): Record<string, unknown> {
    const model = parseJson(message, defaultBodyRegistry());
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : {};
}

// Resolve the document's owning organization for a write fence.
// Prefers a direct uri_id hit (covers memberships + record-
// attributes, which resolveOwningOrganization's states.entity_id
// alphabet does not list, and role-grants' flat prefix whose org
// lives in the response body). Falls back to
// resolveOwningOrganization for the nested document families
// already in that alphabet (ideas/projects/flows/...).
export async function resolveWriteOwner(
    db: DbAdapter,
    entityId: Id,
    boundOrganization: Id,
): Promise<Id | null> {
    const hits = await db.responses.getAllWhere(
        'uri_id', entityId,
    );
    for (const response of hits) {
        const nested = ORGANIZATION_NESTED_PREFIX.exec(
            response.uri_prefix,
        );
        if (nested !== null) return nested[1]!;
        if (response.uri_prefix === ROLE_GRANTS_PREFIX) {
            const body = responseBodyOf(response.message);
            const organizationId = body['organization_id'];
            if (typeof organizationId === 'string') {
                return organizationId;
            }
        }
    }
    return resolveOwningOrganization(
        db, entityId, boundOrganization,
    );
}

export async function assertWritableInOrganization(
    db: DbAdapter,
    entityId: Id,
    organization: Id,
    table: string,
): Promise<void> {
    const owner = await resolveWriteOwner(
        db, entityId, organization,
    );
    if (owner !== null && owner !== organization) {
        throw new EntityNotFoundError(table, entityId);
    }
}
