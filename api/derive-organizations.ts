import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
} from './db.ts';
import type { Id, OrganizationEntity } from '../shared/types.ts';
import { validateOrganizationEntity } from './validators.ts';
import { canonicalPath } from './message-pair.ts';
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
// itself organization-nested — canonicalPath(undefined,
// '/organizations/') resolves the SAME flat prefix whether or
// not the family is registered (ORGANIZATION_NESTED_FIRST_
// SEGMENTS's fallback in message-pair.ts and the eventual
// registry row both say false — this task's own report
// re-confirms the two branches are byte-identical).
//
// id-FIRST, matching the seven-sibling entityOf convention
// (Task 5): organizationEntityOf re-runs the head pair's own
// stored response (the wire) through
// validateOrganizationEntity — the SAME
// validator WRITE_RESPONSE_SPECS['organizations/:id']
// .successBody already runs (api/routes.ts; message-plane only
// since Phase Final Task 2 retired the organizations ROW) —
// so the derived shape is byte-identical to the STORED wire
// body, id-first. Stored PUT = GET: the writer emits this
// mapper. Reusing the validator rather than re-listing its six
// field names here is the DRY choice: ORGANIZATION_BODY_KEYS
// (validators.ts) stays the one place that vocabulary lives.
// withoutId strips `id` FIRST — the stored response is the
// wire, id-first, and validateOrganizationEntity's
// assertOnlyKeys rejects an `id` key. Stripping it here is what
// keeps assertOnlyKeys from rejecting a head pair the live PUT
// legitimately formed.
//
// ONE shared readonly tx per call (Efficiency): db.messagePairs
// read inside the SAME db.readTransaction(...) rather
// than an independent getAllWhere that would open its
// own transaction. One
// physical transaction per derivation, mirroring
// api/derive-identity-spine.ts's own closure — there it
// also closes a torn-read hazard; organizations/:id is
// not a hard-delete zone, so here it is simply the
// cheaper shape.
//
// Reads db.messagePairs ONLY;
// tests/derive-organizations.test.ts is the proof of parity
// against the live PUT's own wire body (Phase Final Task 2:
// organizations ROW half stripped — message plane is truth).

const ORGANIZATIONS_TABLE = 'organizations';

const ORGANIZATIONS_PREFIX =
    canonicalPath(undefined, '/organizations/');

export function organizationEntityOf(
    document: DerivedDocument,
): OrganizationEntity {
    return {
        id: document.name,
        ...validateOrganizationEntity(withoutId(document.body)),
    };
}

// Every LIVE organization head, id-lex ordered (byIdAscending —
// the derivation's own order, never the backend's).
export async function deriveOrganizations(
    db: DbAdapter,
): Promise<OrganizationEntity[]> {
    return db.readTransaction(async (view) => {
            const messagePairs = await view.messagePairs.getCollectionPairs(
                ORGANIZATIONS_PREFIX,
            );
            const documents = deriveDocumentsAt(
                messagePairs, ORGANIZATIONS_PREFIX,
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
    return db.readTransaction(async (view) => {
            const messagePairs = await view.messagePairs.getCollectionPairs(
                ORGANIZATIONS_PREFIX,
            );
            const document = deriveDocumentsAt(
                messagePairs, ORGANIZATIONS_PREFIX,
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
