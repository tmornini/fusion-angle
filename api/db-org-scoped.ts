import type { DbAdapter, EntityStore } from './db.ts';
import type { Id } from './types.ts';
import {
    OrgScopedEntityStore,
    type OrgScoped,
} from './store-org-scoped.ts';

// Wrap `base` in an org-scoped view. ONLY the org-owned entity
// stores are guarded; the global spine, the junction/ledger
// tables, and the lifecycle methods pass straight through. The
// scoped set is enumerated explicitly — no reflective "wrap
// everything that has a column" — so it stays short and
// reviewable, and a newly added store is global until
// deliberately fenced here.
//
// `base` is a class instance (private backend, prototype
// methods), so it cannot be spread; the lifecycle methods
// arrow-delegate to keep `this` bound to `base`.
//
// DEPLOYMENT CONSTRAINT (inherited from access-token.ts): this
// is only as strong as the token whose verified `org` claim
// feeds the guard, and that HMAC key is still client-shipped.
// Do not rely on tenant isolation in a networked / multi-user
// context until the signing key lives server-side.
export function orgScopedAdapter(
    base: DbAdapter,
    org: Id,
): DbAdapter {
    const scope = <T extends OrgScoped>(
        inner: EntityStore<T>,
        table: string,
    ): OrgScopedEntityStore<T> =>
        new OrgScopedEntityStore(inner, org, table);
    return {
        initialize: () => base.initialize(),
        close: () => base.close(),
        flush: () => base.flush(),
        deleteSchema: () => base.deleteSchema(),
        hasSchema: () => base.hasSchema(),
        createSchema: () => base.createSchema(),
        exportSnapshot: () => base.exportSnapshot(),
        importSnapshot: (json) =>
            base.importSnapshot(json),
        simulateLatency: () => base.simulateLatency(),
        // Re-scope the open view to `org` so the fence rides
        // INSIDE the tx: OrgScopedEntityStore's
        // #assertWritable read and its inner put now run in
        // one transaction, closing the TOCTOU for free — no
        // OrgScopedEntityStore change needed.
        transaction: (tables, fn) =>
            base.transaction(
                tables,
                (view) => fn(orgScopedAdapter(view, org)),
            ),

        // Global identity/auth spine — untouched.
        members: base.members,
        humanMembers: base.humanMembers,
        aiMembers: base.aiMembers,
        identities: base.identities,
        identityPii: base.identityPii,
        identityCredentials: base.identityCredentials,
        identityTokenRevocations:
            base.identityTokenRevocations,
        identityDefaultOrgs: base.identityDefaultOrgs,
        identityTokens: base.identityTokens,
        clients: base.clients,
        identityProviders: base.identityProviders,
        authorizationCodes: base.authorizationCodes,

        // Junctions + ledgers derive org from a parent, and the
        // organizations directory is global — all passthrough.
        flowVersions: base.flowVersions,
        projectFlows: base.projectFlows,
        flowWorkOrders: base.flowWorkOrders,
        stateFieldValues: base.stateFieldValues,
        flowRecords: base.flowRecords,
        organizations: base.organizations,
        ideaSubmissions: base.ideaSubmissions,
        objectiveRevisions: base.objectiveRevisions,
        projectObjectiveBaselineScores:
            base.projectObjectiveBaselineScores,
        projectObjectiveActualScores:
            base.projectObjectiveActualScores,
        states: base.states,

        // Org-owned entities — fenced to `org`.
        roleGrants: scope(base.roleGrants, 'role_grants'),
        ideas: scope(base.ideas, 'ideas'),
        projects: scope(base.projects, 'projects'),
        flows: scope(base.flows, 'flows'),
        workOrders: scope(base.workOrders, 'work_orders'),
        records: scope(base.records, 'records'),
        recordAttributes: scope(
            base.recordAttributes, 'record_attributes'),
        objectives: scope(base.objectives, 'objectives'),
        memberships: scope(base.memberships, 'memberships'),
    };
}
