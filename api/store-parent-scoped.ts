import { EntityNotFoundError } from './db.ts';
import type {
    DbAdapter,
    EntityStore,
    EntityPut,
    StateStore,
    Tx,
} from './db.ts';
import type { OrgScoped } from './store-org-scoped.ts';
import type { Id, StateEntity } from './types.ts';

// Resolve the org that OWNS a leaf row, by following its parent
// FK (or the membership ledger). Returns the owning org, or
// null when the row has NO owner — an orphan (its parent is
// absent / it has no membership). The fence rule below treats
// null as visible, so an incomplete-but-harmless row is not
// mistaken for another tenant's data.
export type OwningOrgResolver<T> = (row: T) => Promise<Id | null>;

// The READ fence for rows that carry NO organization_id of
// their own (junctions, ledgers, the states log, the identity
// PII/credential facets). Where OrgScopedEntityStore filters by
// a stamped column, this DERIVES containment from the parent at
// read time. A row is visible iff its owner is the bound org or
// null (orphan); a row owned by a DIFFERENT, existing org is
// hidden — getById 404s it, NEVER 403, which would confirm a
// foreign row exists. Writes delegate (see put).
//
// DEPLOYMENT CONSTRAINT (inherited from access-token.ts): this
// is only as strong as the token whose verified `org` claim
// feeds #org, and that HMAC key is still client-shipped.
export class ParentScopedEntityStore<T extends { id: string }>
    implements EntityStore<T>
{
    readonly #inner: EntityStore<T>;
    readonly #org: Id;
    readonly #table: string;
    readonly #resolveOwningOrg: OwningOrgResolver<T>;

    constructor(
        inner: EntityStore<T>,
        org: Id,
        table: string,
        resolveOwningOrg: OwningOrgResolver<T>,
    ) {
        this.#inner = inner;
        this.#org = org;
        this.#table = table;
        this.#resolveOwningOrg = resolveOwningOrg;
    }

    async getAll(): Promise<T[]> {
        const rows = await this.#inner.getAll();
        const owner = await Promise.all(
            rows.map(row => this.#resolveOwningOrg(row)),
        );
        return rows.filter(
            (_, i) => isVisible(owner[i]!, this.#org),
        );
    }

    async getById(id: string): Promise<T> {
        const row = await this.#inner.getById(id);
        const owner = await this.#resolveOwningOrg(row);
        if (!isVisible(owner, this.#org)) {
            throw new EntityNotFoundError(this.#table, id);
        }
        return row;
    }

    // The keyed read, fenced like getAll: match through the
    // inner index, then resolve each MATCHED row's owner —
    // zero probe reads when nothing matches. An in-tx caller
    // must declare the resolver's probe tables alongside this
    // one.
    async getAllWhere(
        column: string,
        key: string,
    ): Promise<T[]> {
        const rows = await this.#inner
            .getAllWhere(column, key);
        const owner = await Promise.all(
            rows.map(row => this.#resolveOwningOrg(row)),
        );
        return rows.filter(
            (_, i) => isVisible(owner[i]!, this.#org),
        );
    }

    // Writes DELEGATE — they are not parent-fenced. A write
    // commit's transaction declares only the tables it mutates;
    // resolving a leaf's owning org reads its PARENT table,
    // which is outside that tx scope, so a write-side parent
    // check would break legitimate batches (e.g. creating a work
    // order reads `flows`). Cross-tenant write integrity rides
    // the parent's own OrgScoped fence — a foreign parent can be
    // neither created nor owned — and lands fully at the server
    // tier (FK + WHERE organization_id). READS are the fence.
    put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T> {
        return this.#inner.put(id, fields);
    }

    putMany(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
    ): Promise<void> {
        return this.#inner.putMany(entries, deleteIds);
    }

    delete(id: string): Promise<void> {
        return this.#inner.delete(id);
    }
}

// A row is visible to `org` when it owns the row or the row is
// an orphan (null owner). Only a DIFFERENT, existing owner
// hides it.
function isVisible(owner: Id | null, org: Id): boolean {
    return owner === null || owner === org;
}

// Build a resolver that derives org from a single parent store
// (the common case). The parent store is the UNFENCED one, so a
// foreign parent reports its real org and the row is hidden; an
// absent parent reports null and the row is a visible orphan.
export function viaParent<T, P extends OrgScoped>(
    parent: EntityStore<P>,
    parentIdOf: (row: T) => Id,
): OwningOrgResolver<T> {
    return async (row) => {
        try {
            const found = await parent.getById(parentIdOf(row));
            return found.organization_id;
        } catch (e) {
            if (e instanceof EntityNotFoundError) return null;
            throw e;
        }
    };
}

// The minimal store/ledger shapes the org-ownership checks need.
interface OrgOwnedProbe {
    getById(id: string): Promise<{ organization_id: Id }>;
}
// The keyed membership read the ownership checks need: an
// identity's memberships, narrowed through the identity_id
// index rather than scanning the whole ledger once per row.
interface MembershipReader {
    getAllWhere(
        column: string,
        key: string,
    ): Promise<readonly {
        identity_id: Id;
        organization_id: Id;
    }[]>;
}

// Resolve an identity's owning org for the PII / credential
// facets, via the membership ledger (member.id === identity.id).
// A co-member resolves to the bound org; an identity that
// belongs ONLY to other orgs resolves to one of those (foreign,
// hidden); an identity with NO membership is an orphan (null,
// visible).
export function viaMembership<T>(
    memberships: MembershipReader,
    identityIdOf: (row: T) => Id,
    boundOrg: Id,
): OwningOrgResolver<T> {
    return async (row) => {
        const id = identityIdOf(row);
        // The identity_id index IS the lookup — the rows it
        // returns already match `id`, so no JS filter after.
        const mine = await memberships.getAllWhere(
            'identity_id', id);
        if (mine.length === 0) return null;
        return mine.some(m => m.organization_id === boundOrg)
            ? boundOrg
            : mine[0]!.organization_id;
    };
}

// The org-owned stores the ownership probe walks — ONE list,
// shared by the states read fence (db-org-scoped) and the
// entity-states route guard (api.ts), so a new org-owned
// entity extends the system in exactly one place.
// `invitations` is included (though global-spine) so an
// invitation's lifecycle events resolve to the invitation's
// org and stay out of every other tenant's /states read.
export function orgOwnedProbes(
    db: DbAdapter,
): readonly OrgOwnedProbe[] {
    return [
        db.ideas, db.projects, db.flows,
        db.records, db.objectives, db.workOrders,
        db.invitations,
    ];
}

// Resolve the org that owns the entity behind a
// `states.entity_id`. The log is unified across kinds, so the
// id is probed against each org-owned store (UNFENCED, so a
// foreign entity reports its real org). A member-lifecycle
// event names an ORG-LESS member; it resolves via the
// membership ledger like viaMembership. An id matching nothing
// is an orphan (null). Used by the `states` and
// `state_field_values` read fences.
export async function ownerOrgOfEntity(
    orgOwnedStores: readonly OrgOwnedProbe[],
    memberships: MembershipReader,
    boundOrg: Id,
    entityId: Id,
): Promise<Id | null> {
    for (const store of orgOwnedStores) {
        try {
            return (await store.getById(entityId))
                .organization_id;
        } catch (e) {
            if (!(e instanceof EntityNotFoundError)) throw e;
        }
    }
    const mine = await memberships.getAllWhere(
        'identity_id', entityId);
    if (mine.length === 0) return null;
    return mine.some(m => m.organization_id === boundOrg)
        ? boundOrg
        : mine[0]!.organization_id;
}

// The READ fence for the unified states log. StateStore is not
// an EntityStore (it has postEvent/getCurrentFor/getAllFor, no
// putMany/delete), so it needs its own decorator. getAll and
// getById — the row-level read endpoints (routes `states` and
// `states/:id`) — fence by the same visible/hidden rule;
// getCurrentFor / getAllFor delegate and are gated at the
// entity-states routes; the *In twins and getDeletedIds are
// internal delete-filter mechanics the org fence already covers
// at the entity layer.
export class ParentScopedStateStore implements StateStore {
    readonly #inner: StateStore;
    readonly #org: Id;
    readonly #table: string;
    readonly #resolveOwningOrg: OwningOrgResolver<StateEntity>;

    constructor(
        inner: StateStore,
        org: Id,
        table: string,
        resolveOwningOrg: OwningOrgResolver<StateEntity>,
    ) {
        this.#inner = inner;
        this.#org = org;
        this.#table = table;
        this.#resolveOwningOrg = resolveOwningOrg;
    }

    async getAll(): Promise<StateEntity[]> {
        const rows = await this.#inner.getAll();
        const owner = await Promise.all(
            rows.map(row => this.#resolveOwningOrg(row)),
        );
        return rows.filter(
            (_, i) => isVisible(owner[i]!, this.#org),
        );
    }

    async getById(id: Id): Promise<StateEntity> {
        const row = await this.#inner.getById(id);
        const owner = await this.#resolveOwningOrg(row);
        if (!isVisible(owner, this.#org)) {
            throw new EntityNotFoundError(this.#table, id);
        }
        return row;
    }

    put(
        id: Id,
        fields: Omit<StateEntity, 'id'>,
    ): Promise<StateEntity> {
        return this.#inner.put(id, fields);
    }

    postEvent(
        id: Id,
        entityId: Id,
        state: string,
        memberId: Id,
        at: string,
    ): Promise<void> {
        return this.#inner.postEvent(
            id, entityId, state, memberId, at,
        );
    }

    getCurrentFor(entityId: Id): Promise<StateEntity | null> {
        return this.#inner.getCurrentFor(entityId);
    }

    getAllFor(entityId: Id): Promise<StateEntity[]> {
        return this.#inner.getAllFor(entityId);
    }

    getDeletedIds(): Promise<Set<Id>> {
        return this.#inner.getDeletedIds();
    }

    isDeleted(id: Id): Promise<boolean> {
        return this.#inner.isDeleted(id);
    }

    getCurrentForIn(
        tx: Tx,
        entityId: Id,
    ): Promise<StateEntity | null> {
        return this.#inner.getCurrentForIn(tx, entityId);
    }

    getAllForIn(tx: Tx, entityId: Id): Promise<StateEntity[]> {
        return this.#inner.getAllForIn(tx, entityId);
    }

    getDeletedIdsIn(tx: Tx): Promise<Set<Id>> {
        return this.#inner.getDeletedIdsIn(tx);
    }

    isDeletedIn(tx: Tx, id: Id): Promise<boolean> {
        return this.#inner.isDeletedIn(tx, id);
    }
}
