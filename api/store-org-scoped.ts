import { EntityNotFound } from './db.ts';
import type { EntityStore, EntityPut } from './db.ts';
import type { Id } from './types.ts';

// The minimal shape the org guard requires: every row it
// fences carries the containment fact it filters and stamps
// by. Entity interfaces that gain organization_id (the SP-2
// rollout) satisfy it; pure join tables never do — they
// derive org from a parent — so no guard ever wraps them.
export interface OrgScoped {
    id: Id;
    organization_id: Id;
}

// The divorce point. An EntityStore decorator bound to one
// org: reads are filtered, writes are stamped, foreign ids
// 404 — never 403, which would confirm a foreign row exists.
// Handlers and inner stores never learn org exists; the guard
// rides the SAME seam every store already crosses. When
// Postgres arrives this becomes WHERE organization_id = $org,
// callers unchanged.
//
// DEPLOYMENT CONSTRAINT (inherited from access-token.ts): this
// guard is only as strong as the token whose verified `org`
// claim feeds #org, and that HMAC key is still client-shipped.
// Tenant isolation MUST NOT be relied on in a networked /
// multi-user context until the signing key lives server-side.
export class OrgScopedEntityStore<T extends OrgScoped>
    implements EntityStore<T>
{
    readonly #inner: EntityStore<T>;
    readonly #org: Id;
    readonly #table: string;

    constructor(
        inner: EntityStore<T>,
        org: Id,
        table: string,
    ) {
        this.#inner = inner;
        this.#org = org;
        this.#table = table;
    }

    async getAll(): Promise<T[]> {
        const rows = await this.#inner.getAll();
        return rows.filter(
            row => row.organization_id === this.#org,
        );
    }

    async getById(id: string): Promise<T> {
        const row = await this.#inner.getById(id);
        if (row.organization_id !== this.#org) {
            // The exact error a genuinely-absent id throws, so
            // a foreign-tenant row reads as one that never
            // existed — no existence is confirmed.
            throw new EntityNotFound(this.#table, id);
        }
        return row;
    }

    async put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T> {
        return this.#inner.put(id, this.#stamp(fields));
    }

    async putMany(
        entries: readonly EntityPut<T>[],
        deleteIds: readonly string[],
    ): Promise<void> {
        for (const id of deleteIds) {
            await this.getById(id);
        }
        const stamped = entries.map(entry => ({
            id: entry.id,
            fields: this.#stamp(entry.fields),
        }));
        await this.#inner.putMany(stamped, deleteIds);
    }

    async delete(id: string): Promise<void> {
        await this.getById(id);
        await this.#inner.delete(id);
    }

    // Stamp org onto a write body: the store owns the
    // containment fact, so the caller can neither forge nor
    // omit it. The cast is the one assertion TS cannot verify
    // — a spread into a generic T narrows to no nameable type
    // — but the shape is exact: T minus id, organization_id
    // pinned to the bound org.
    #stamp(fields: Omit<T, 'id'>): Omit<T, 'id'> {
        return {
            ...fields,
            organization_id: this.#org,
        } as Omit<T, 'id'>;
    }
}
