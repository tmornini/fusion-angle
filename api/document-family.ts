import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id } from './types.ts';
import type { MessagePair } from './message-pair.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    byIdAscending,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentPair,
} from './derive-documents.ts';
import type {
    Route,
    GetHandler,
    PutHandler,
    WriteResponseSpec,
} from './routes.ts';

// param/requireOrganization/withoutId live HERE, not in
// routes.ts, so this module has NO runtime (value) dependency on
// routes.ts — only the type-only import above, which
// `--strip-types` erases entirely, so it never enters the
// runtime module graph. routes.ts imports them back (a one-way
// dependency): it needs the generic constructors below plus
// registerDocumentFamilyWiring, so SOMETHING must break the
// cycle, and these three small, self-contained request helpers
// (no dependency on routes.ts's own route table) are the
// smallest thing that can move. This is load-bearing: routes.ts
// calls registerDocumentFamilyWiring at ITS OWN module scope
// (below), which requires this module to be fully evaluated
// first — true only because this module no longer has a value
// import that could pause ITS evaluation partway through waiting
// on routes.ts.

export function param(
    params: string[],
    index: number,
): string {
    const value = params[index];
    if (value === undefined || value === '') {
        throw new Error(
            'Missing route param at index '
            + index,
        );
    }
    return value;
}

// The fence organization a ledger-derived, org-owned GET
// handler requires: the verified token claim the gate resolved,
// never the path. Its absence is a wiring bug — a bearer-exempt
// or global route reaching a handler that must derive org-
// scoped state — never a valid contingency, so this crashes
// loud rather than deriving cross-tenant or falling back to an
// empty read.
export function requireOrganization(
    organization: Id | undefined,
): Id {
    if (organization === undefined) {
        throw new Error(
            'organization-owned read dispatched with no'
            + ' fence organization',
        );
    }
    return organization;
}

// Strip `id` from the request body before
// passing to entity validators. `id` is a
// routing/storage key, not a body field;
// validators enforce the exact body key set.
export function withoutId(
    body: Record<string, unknown>,
): Record<string, unknown> {
    const { id: _id, ...rest } = body;
    return rest;
}

// The generic verb-class components (spec verb-class addendum):
// by the third registered family, the hand-written per-family
// route scaffolding (a GET deriving the head document, a PUT
// dispatching to the family's own decompose op, a
// WRITE_RESPONSE_SPECS entry re-deriving the same successBody)
// is ONE shape, parameterized by exactly three per-family
// facts — never grown beyond them without a fourth family's
// evidence.
export interface DocumentFamilyWiring {
    readonly family: string;
    // Validates the full wire document (entity + trio [+ family
    // extras]); throws ValidationError.
    readonly validateDocument:
        (body: Record<string, unknown>) => unknown;
    // The family's decompose op (old-plane rows + pair).
    readonly documentOp: (
        db: DbAdapter, id: Id,
        body: Record<string, unknown>, actor: Id,
        pair?: MessagePair,
    ) => Promise<unknown>;
    // Head-pair body -> wire entity (id + organization_id
    // stamped by the caller).
    readonly entityOf: (
        document: DerivedDocument, organization: Id,
    ) => unknown;
}

// The per-family wiring table — grown family by family (Task 3
// adds the flows row) — never consulted through anything but
// documentFamilyWiring: the gate's locked/simple keying (api.ts)
// treats membership here, ANDed with a 'locked' registration, as
// "this route is served via documentPutHandler" — never a
// blanket family-registry or DOCUMENT_CLASS_ROUTE_PATTERNS
// consult, so an unregistered-here family (flows, through this
// task) never rides the locked arm no matter what
// family-registry.ts declares. Exported (a mutable table, like
// FAMILY_REGISTRY) so the locked-arm's own tests can register a
// SYNTHETIC family for the duration of a test — no live family
// rides the locked arm through this task, since only ideas and
// projects are registered here, and both are 'simple'.
export const DOCUMENT_FAMILY_WIRINGS:
    Record<string, DocumentFamilyWiring> = {};

// The ONE place a family's wiring row is written. routes.ts
// builds each row from ITS OWN local bindings (the ops, the
// validators, the entity mappers all live there) and calls this
// at module scope, once, right after defining the row — this
// module never constructs ideas/projects' own rows itself, and
// (per the comment above) has no runtime import of routes.ts to
// race against, only the erased type-only import of the Route
// family of types the generic constructors below need. A future
// family (Task 3's flows row) registers the same way, beside
// ITS OWN ops.
export function registerDocumentFamilyWiring(
    wiring: DocumentFamilyWiring,
): void {
    DOCUMENT_FAMILY_WIRINGS[wiring.family] = wiring;
}

export function documentFamilyWiring(
    family: string,
): DocumentFamilyWiring | undefined {
    return DOCUMENT_FAMILY_WIRINGS[family];
}

// The generic per-id derivation: fetch the family's prefix ONCE,
// reduce to the head document (deriveDocumentsAt) plus the
// lifecycle history (documentLifecycleEvents/stateHistoryFrom/
// currentDocumentState) over the SAME pairs, and 404 either
// absent or lifecycle-deleted — byte-identical to what
// deriveIdea/deriveProject already compute, since neither ever
// carried family-specific logic beyond the prefix, the
// not-found table name, and the entity mapper.
async function derivedDocumentEntity(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<unknown> {
    const prefix = canonicalUriPrefix(
        organization, '/' + wiring.family + '/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
    const document = deriveDocumentsAt(
        requests, responses, prefix,
    ).get(id);
    if (document === undefined) {
        throw new EntityNotFoundError(wiring.family, id);
    }
    const pairs = documentPairsAt(requests, responses, prefix)
        .filter((pair) => pair.uriId === id);
    const history = stateHistoryFrom(
        documentLifecycleEvents(pairs), id,
    );
    if (currentDocumentState(history) === DELETED_STATE) {
        throw new EntityNotFoundError(wiring.family, id);
    }
    return wiring.entityOf(document, organization);
}

export function documentGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return (db, params, _actor, organization) =>
        derivedDocumentEntity(
            wiring, db, requireOrganization(organization),
            param(params, 0),
        );
}

// The document's own head pair id — DerivedDocument.pairId,
// "the advertisable Response-ID" (derive-documents.ts) — over
// the SAME (requests, responses) fetch and the SAME reduction
// (deriveDocumentsAt) derivedDocumentEntity runs to build the
// entity. Mirrors headPairIdAt's own (db, uriPrefix, uriId)
// shape (message-pair.ts) so a caller already holding a
// family-prefixed uriPrefix swaps the source with no other
// change, but computes the DOCUMENT head (2xx PUT/DELETE pairs
// only) rather than headPairIdAt's LOCK head (any method, any
// status) — a locked family's GET Response-ID attach (api.ts)
// is the one caller: a document-class address (design decision
// 6) exposes only PUT at flows/:id, so the two reductions agree
// in practice (pinned by a test), but this is now ONE mechanism
// computing the concept, not two independently-maintained ones.
export async function documentHeadPairId(
    db: DbAdapter,
    uriPrefix: string,
    id: Id,
): Promise<string | undefined> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', uriPrefix),
        db.responses.getAllWhere('uri_prefix', uriPrefix),
    ]);
    return deriveDocumentsAt(requests, responses, uriPrefix)
        .get(id)?.pairId;
}

// The route body is UNCHANGED dispatch to the documentOp for
// BOTH concurrency classes — the locked/simple divide is
// resolved entirely upstream, at the gate (api.ts's four-outcome
// table decides follows/supersedes/412 BEFORE this handler ever
// runs), so documentPutHandler carries no concurrency branch of
// its own.
export function documentPutHandler(
    wiring: DocumentFamilyWiring,
): PutHandler {
    return (db, params, body, actor, pair) =>
        wiring.documentOp(
            db, param(params, 0), body, actor, pair,
        );
}

export function documentEntityRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [wiring.family, ':id'],
        get: documentGetHandler(wiring),
        put: documentPutHandler(wiring),
    };
}

// The generic per-family list derivation, split out from
// documentCollectionRoute below (mirroring documentGetHandler/
// documentEntityRoute's own split) so a caller needing the bare
// GetHandler value — routes.ts's route('flows', {...}), which
// pairs this get with its own hand-written post — has one typed
// exactly `GetHandler`, not `GetHandler | undefined` off a
// constructed Route's optional field.
export function documentCollectionGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return async (db, _params, _actor, organization) => {
        const organizationId = requireOrganization(
            organization,
        );
        const prefix = canonicalUriPrefix(
            organizationId, '/' + wiring.family + '/',
        );
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_prefix', prefix),
            db.responses.getAllWhere('uri_prefix', prefix),
        ]);
        const documents = deriveDocumentsAt(
            requests, responses, prefix,
        );
        const pairs = documentPairsAt(
            requests, responses, prefix,
        );
        const pairsById = new Map<Id, DocumentPair[]>();
        for (const pair of pairs) {
            const list = pairsById.get(pair.uriId);
            if (list === undefined) {
                pairsById.set(pair.uriId, [pair]);
            } else {
                list.push(pair);
            }
        }
        const rows: { id: Id }[] = [];
        for (const [id, document] of documents) {
            const history = stateHistoryFrom(
                documentLifecycleEvents(
                    pairsById.get(id) ?? [],
                ),
                id,
            );
            if (
                currentDocumentState(history)
                    === DELETED_STATE
            ) continue;
            rows.push(
                wiring.entityOf(
                    document, organizationId,
                ) as { id: Id },
            );
        }
        return rows.sort(byIdAscending);
    };
}

export function documentCollectionRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [wiring.family],
        get: documentCollectionGetHandler(wiring),
    };
}

export function documentWriteResponseSpec(
    wiring: DocumentFamilyWiring,
): WriteResponseSpec {
    return {
        status: 200,
        successBody: (params, body, _actor, organization) => {
            const doc = wiring.validateDocument(
                withoutId(body ?? {}),
            ) as { entity: Record<string, unknown> };
            return {
                id: param(params, 0),
                organization_id: organization,
                ...doc.entity,
            };
        },
    };
}
