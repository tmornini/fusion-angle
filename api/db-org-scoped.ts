import { EntityNotFound } from './db.ts';
import type { DbAdapter, EntityStore } from './db.ts';
import type {
    Id,
    FlowVersionEntity,
    ProjectFlowEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    IdeaSubmissionEntity,
    ObjectiveRevision,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
    StateFieldValueEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
} from './types.ts';
import {
    OrgScopedEntityStore,
    type OrgScoped,
} from './store-org-scoped.ts';
import {
    ParentScopedEntityStore,
    ParentScopedStateStore,
    viaParent,
    viaMembership,
    ownerOrgOfEntity,
    type OwningOrgResolver,
} from './store-parent-scoped.ts';

// Wrap `base` in an org-scoped view. The org-owned entity
// stores fence by their stamped organization_id; the
// parent-derived rows (junctions, ledgers, the states log, the
// identity PII/credential facets) fence by DERIVING their
// owning org from a parent / the membership ledger at READ time
// (`api/store-parent-scoped.ts`); only the global identity/auth
// spine and the organizations directory pass straight through,
// with route guards fencing the directory and credential
// secrets. The scoped set is enumerated explicitly — no
// reflective "wrap everything" — so it stays reviewable, and a
// newly added store is global until deliberately fenced.
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

    const parentScope = <T extends { id: string }>(
        inner: EntityStore<T>,
        table: string,
        resolver: OwningOrgResolver<T>,
    ): ParentScopedEntityStore<T> =>
        new ParentScopedEntityStore(inner, org, table, resolver);

    // A state event's entity_id is any org-owned entity, or an
    // org-less member visible only to a co-member of this org —
    // resolved through the UNFENCED stores so a foreign owner
    // reports its real org and is hidden.
    const orgOwned = [
        base.ideas, base.projects, base.flows,
        base.records, base.objectives, base.workOrders,
    ];
    const states = new ParentScopedStateStore(
        base.states, org, 'states',
        (row) => ownerOrgOfEntity(
            orgOwned, base.memberships, org, row.entity_id,
        ),
    );

    // state_field_values pin to a parent state event — they are
    // owned by whatever owns that event (multi-hop).
    const stateFieldValues = parentScope(
        base.stateFieldValues, 'state_field_values',
        async (row: StateFieldValueEntity) => {
            let ev;
            try {
                ev = await base.states.getById(
                    row.state_event_id);
            } catch (e) {
                if (e instanceof EntityNotFound) return null;
                throw e;
            }
            return ownerOrgOfEntity(
                orgOwned, base.memberships, org, ev.entity_id,
            );
        },
    );

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
        // INSIDE the tx: a guard's read and its inner write now
        // run in one transaction, closing the TOCTOU for free.
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
        identityTokenRevocations:
            base.identityTokenRevocations,
        identityDefaultOrgs: base.identityDefaultOrgs,
        identityTokens: base.identityTokens,
        clients: base.clients,
        identityProviders: base.identityProviders,
        authorizationCodes: base.authorizationCodes,

        // The organizations directory is global; the
        // organizations/:id and GET /organizations route guards
        // fence it to the caller's memberships.
        organizations: base.organizations,

        // Identity PII / credential facets — visible to the
        // caller's org only for co-members (need-to-know),
        // derived from the membership ledger. Credentials also
        // get `secret` projected out at the route.
        identityPii: parentScope(
            base.identityPii, 'identity_pii',
            viaMembership(
                base.memberships,
                (r: IdentityPiiEntity) => r.id, org),
        ),
        identityCredentials: parentScope(
            base.identityCredentials, 'identity_credentials',
            viaMembership(
                base.memberships,
                (r: IdentityCredentialEntity) =>
                    r.identity_id, org),
        ),

        // Parent-derived leaves — owning org resolved from the
        // (unfenced) parent at READ time. No organization_id
        // column was added; this is a server-side join.
        flowVersions: parentScope(
            base.flowVersions, 'flow_versions',
            viaParent(
                base.flows,
                (r: FlowVersionEntity) => r.flow_id),
        ),
        projectFlows: parentScope(
            base.projectFlows, 'project_flows',
            viaParent(
                base.projects,
                (r: ProjectFlowEntity) => r.project_id),
        ),
        flowWorkOrders: parentScope(
            base.flowWorkOrders, 'flow_work_orders',
            viaParent(
                base.flows,
                (r: FlowWorkOrderEntity) => r.flow_id),
        ),
        flowRecords: parentScope(
            base.flowRecords, 'flow_records',
            viaParent(
                base.flows,
                (r: FlowRecordEntity) => r.flow_id),
        ),
        ideaSubmissions: parentScope(
            base.ideaSubmissions, 'idea_submissions',
            viaParent(
                base.ideas,
                (r: IdeaSubmissionEntity) => r.idea_id),
        ),
        objectiveRevisions: parentScope(
            base.objectiveRevisions, 'objective_revisions',
            viaParent(
                base.objectives,
                (r: ObjectiveRevision) => r.objective_id),
        ),
        projectObjectiveBaselineScores: parentScope(
            base.projectObjectiveBaselineScores,
            'project_objective_baseline_scores',
            viaParent(
                base.projects,
                (r: ProjectObjectiveBaselineScore) =>
                    r.project_id),
        ),
        projectObjectiveActualScores: parentScope(
            base.projectObjectiveActualScores,
            'project_objective_actual_scores',
            viaParent(
                base.projects,
                (r: ProjectObjectiveActualScore) =>
                    r.project_id),
        ),
        states,
        stateFieldValues,

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
