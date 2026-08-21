import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
    MESSAGE_TABLES,
} from './db.ts';
import type { Id, OrganizationEntity } from './types.ts';
import { validateOrganizationEntity } from './validators.ts';
import { canonicalUriCollection } from './message-pair.ts';
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
// itself organization-nested — canonicalUriCollection(undefined,
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
// validator WRITE_RESPONSE_SPECS['organizations/:id']
// .successBody already runs (api/routes.ts; pair-plane only
// since Phase Final Task 2 retired the organizations ROW) —
// so the derived shape is byte-identical to the STORED wire
// body, id-LAST, never id-first. GET wins: the writer emits
// this mapper, not the older id-first stamp. Reusing the
// validator rather than re-listing its six field names here
// is the DRY choice: ORGANIZATION_BODY_KEYS (validators.ts)
// stays the one place that vocabulary lives. withoutId
// strips a stray `id` FIRST — the fetch-edit-PUT client
// pattern echoes the GET body's own `id` right back into
// the PUT payload, and the STORED request body is the raw
// wire body, echoed id and all (formWritePair stores the
// caller's body verbatim; successBody's withoutId(body)
// strips it before validating). Mirroring that same strip
// here is what keeps assertOnlyKeys from rejecting a head
// pair the live PUT legitimately formed.
//
// ONE shared readonly tx per call (Efficiency): db.pairs
// read inside the SAME db.readTransaction(
// MESSAGE_TABLES, ...) rather than an independent
// getAllWhere that would open its own transaction. One
// physical transaction per derivation, mirroring
// api/derive-identity-spine.ts's own closure — there it
// also closes a torn-read hazard; organizations/:id is
// not a hard-delete zone, so here it is simply the
// cheaper shape.
//
// Reads db.pairs ONLY;
// tests/derive-organizations.test.ts is the proof of parity
// against the live PUT's own wire body (Phase Final Task 2:
// organizations ROW half stripped — pair plane is truth).

const ORGANIZATIONS_TABLE = 'organizations';

const ORGANIZATIONS_PREFIX =
    canonicalUriCollection(undefined, '/organizations/');

export function organizationEntityOf(
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
    return db.readTransaction(
        MESSAGE_TABLES,
        async (view) => {
            const pairs = await view.pairs.getAllWhere(
                'uri_collection', ORGANIZATIONS_PREFIX,
            );
            const documents = deriveDocumentsAt(
                pairs, ORGANIZATIONS_PREFIX,
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
    return db.readTransaction(
        MESSAGE_TABLES,
        async (view) => {
            const pairs = await view.pairs.getAllWhere(
                'uri_collection', ORGANIZATIONS_PREFIX,
            );
            const document = deriveDocumentsAt(
                pairs, ORGANIZATIONS_PREFIX,
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
