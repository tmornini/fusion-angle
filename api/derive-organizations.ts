import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id, OrganizationEntity } from './types.ts';
import { validateOrganizationEntity } from './validators.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import { withoutId } from './document-family.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    type DerivedDocument,
} from './derive-documents.ts';

// The tenant root's own reduction over the message ledger —
// Phase 12 Task 2: the derive module lands ahead of both the
// family's registration (this commit's sibling) and its seed
// pairs (Task 3). organizations is the THIRTEENTH family and
// the last unflipped in-scope one — the reads flip at Task 5;
// nothing reads this module in production yet.
//
// GLOBAL plane, like members/ai-members/human-members/
// identities: organizations IS the tenant root, so it is never
// itself organization-nested — canonicalUriPrefix(undefined,
// '/organizations/') resolves the SAME flat prefix whether or
// not the family is registered (ORGANIZATION_NESTED_FIRST_
// SEGMENTS's fallback in message-pair.ts and the eventual
// registry row both say false — this task's own report
// re-confirms the two branches are byte-identical).
//
// THE KEY-ORDER DEPARTURE from the seven-sibling entityOf
// convention (id-first, field-by-field pickString/pickNumber):
// organizationEntityOf instead re-runs the head pair's own
// REQUEST body through validateOrganizationEntity — the SAME
// validator route('organizations/:id')'s PUT handler already
// runs via EntityStore.put (api/store-entity.ts's own `{
// ...validate(body), id }` spread) — so the derived shape is
// byte-identical to the STORED ROW, id-LAST, never id-first.
// Reusing the validator rather than re-listing its six field
// names here is the DRY choice: ORGANIZATION_BODY_KEYS
// (validators.ts) stays the one place that vocabulary lives.
// withoutId strips a stray `id` FIRST — the fetch-edit-PUT
// client pattern echoes the GET body's own `id` right back into
// the PUT payload, and the STORED request body is the raw wire
// body, echoed id and all (formWritePair stores the caller's
// body verbatim; only the route handler's own withoutId(body)
// call, ahead of EntityStore.put, strips it before validating
// the ROW — api/routes.ts's PUT organizations/:id handler).
// Mirroring that same strip here is what keeps assertOnlyKeys
// from rejecting a head pair the live PUT legitimately formed.
//
// ONE shared readonly tx per call (Efficiency): both stores
// read inside the SAME db.transaction(['requests', 'responses'],
// ...) rather than two independent getAllWhere calls, each of
// which would open its own transaction. One physical
// transaction per derivation, mirroring api/derive-identity-
// spine.ts's own closure — there it also closes a torn-read
// hazard; organizations/:id is not a hard-delete zone, so here
// it is simply the cheaper shape.
//
// Reads db.requests/db.responses ONLY;
// tests/derive-organizations.test.ts is the proof of parity
// against the live PUT's own written row.

const ORGANIZATIONS_TABLE = 'organizations';

const ORGANIZATIONS_PREFIX =
    canonicalUriPrefix(undefined, '/organizations/');

function organizationEntityOf(
    document: DerivedDocument,
): OrganizationEntity {
    return {
        ...validateOrganizationEntity(withoutId(document.body)),
        id: document.uriId,
    };
}

// Every LIVE organization head, id-lex ordered (byIdAscending,
// the IndexedDB reference).
export async function deriveOrganizations(
    db: DbAdapter,
): Promise<OrganizationEntity[]> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAllWhere(
                    'uri_prefix', ORGANIZATIONS_PREFIX,
                ),
                view.responses.getAllWhere(
                    'uri_prefix', ORGANIZATIONS_PREFIX,
                ),
            ]);
            const documents = deriveDocumentsAt(
                requests, responses, ORGANIZATIONS_PREFIX,
            );
            const rows: OrganizationEntity[] = [];
            for (const document of documents.values()) {
                rows.push(organizationEntityOf(document));
            }
            return rows.sort(byIdAscending);
        },
    );
}

// The single-head read; throws EntityNotFoundError(
// 'organizations', id) on absence — mirroring
// db.organizations.getById's own EntityNotFoundError(
// this.#table, id), the same table name.
export async function deriveOrganization(
    db: DbAdapter,
    id: Id,
): Promise<OrganizationEntity> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const [requests, responses] = await Promise.all([
                view.requests.getAllWhere(
                    'uri_prefix', ORGANIZATIONS_PREFIX,
                ),
                view.responses.getAllWhere(
                    'uri_prefix', ORGANIZATIONS_PREFIX,
                ),
            ]);
            const document = deriveDocumentsAt(
                requests, responses, ORGANIZATIONS_PREFIX,
            ).get(id);
            if (document === undefined) {
                throw new EntityNotFoundError(
                    ORGANIZATIONS_TABLE, id,
                );
            }
            return organizationEntityOf(document);
        },
    );
}
