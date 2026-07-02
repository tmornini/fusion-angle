import { EntityNotFoundError } from './db.ts';
import type {
    DbAdapter,
    GuardedDbAdapter,
    GuardedEntityStore,
} from './db.ts';
import type {
    Id,
    FlowVersionEntity,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
    ProjectFlowEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    IdeaSubmissionEntity,
    ObjectiveRevisionEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
    StateFieldValueEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
} from './types.ts';
import {
    OrganizationScopedEntityStore,
    type OrganizationScoped,
} from './store-organization-scoped.ts';
import {
    ParentScopedEntityStore,
    ParentScopedStateStore,
    viaParent,
    viaMembership,
    ownerOrganizationOfEntity,
    organizationOwnedProbes,
    graphEntityProbe,
    type OwningOrganizationResolver,
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
export function organizationScopedAdapter(
    base: GuardedDbAdapter,
    organization: Id,
): DbAdapter {
    const scope = <T extends OrganizationScoped>(
        inner: GuardedEntityStore<T>,
        table: string,
    ): OrganizationScopedEntityStore<T> =>
        new OrganizationScopedEntityStore(inner, organization, table);

    const parentScope = <T extends { id: string }>(
        inner: GuardedEntityStore<T>,
        table: string,
        resolver: OwningOrganizationResolver<T>,
    ): ParentScopedEntityStore<T> =>
        new ParentScopedEntityStore(inner, organization, table, resolver);

    // The membership ledger is read for parent-derived
    // ownership (PII, credentials, state events): an identity's
    // memberships resolve through the identity_id index, never
    // a per-row whole-ledger scan.
    const memberships = base.memberships;

    // A state event's entity_id is any org-owned entity, or an
    // org-less member visible only to a co-member of this org —
    // resolved through the UNFENCED stores so a foreign owner
    // reports its real org and is hidden. The graphProbe closes
    // the flow_nodes / flow_edges two-hop for deletion events.
    // rawReadRow bypasses EntityStore's deleted filter so the
    // probe works even after the node/edge is soft-deleted.
    const organizationOwned = organizationOwnedProbes(base);
    const graphProbe = graphEntityProbe(base, base.flows);
    const states = new ParentScopedStateStore(
        base.states, organization, 'states',
        (row) => ownerOrganizationOfEntity(
            organizationOwned, memberships, organization,
            row.entity_id, graphProbe,
        ),
    );

    // state_field_values pin to a parent state event — they are
    // owned by whatever owns that event (multi-hop). The same
    // graphProbe resolves flow-graph deletion events here too.
    const stateFieldValues = parentScope(
        base.stateFieldValues, 'state_field_values',
        async (row: StateFieldValueEntity) => {
            let ev;
            try {
                ev = await base.states.getById(
                    row.state_event_id);
            } catch (e) {
                if (e instanceof EntityNotFoundError) return null;
                throw e;
            }
            return ownerOrganizationOfEntity(
                organizationOwned, memberships, organization,
                ev.entity_id, graphProbe,
            );
        },
    );

    // A flow-graph ledger row owns no org of its own, and its
    // node parent owns none either (flow_nodes is itself fenced
    // via its flow). So resolve TWO hops: ledger → flow_nodes →
    // flows.organization_id. An absent node (or flow) is a
    // visible orphan, like every other parent-derived leaf.
    const flowOrganizationOfNode = viaParent(
        base.flows, (n: FlowNodeEntity) => n.flow_id);
    const viaFlowNode = <T>(
        flowNodeIdOf: (row: T) => Id,
    ): OwningOrganizationResolver<T> =>
        async (row) => {
            try {
                const node = await base.flowNodes.getById(
                    flowNodeIdOf(row));
                return flowOrganizationOfNode(node);
            } catch (e) {
                if (e instanceof EntityNotFoundError) {
                    return null;
                }
                throw e;
            }
        };

    return {
        initialize: () => base.initialize(),
        deleteSchema: () => base.deleteSchema(),
        hasSchema: () => base.hasSchema(),
        postSchemaCreation: () => base.postSchemaCreation(),
        ensureTables: (tables) =>
            base.ensureTables(tables),
        getSnapshot: () => base.getSnapshot(),
        putSnapshot: (json) =>
            base.putSnapshot(json),
        // Re-scope the open view to `org` so the fence rides
        // INSIDE the tx: a guard's read and its inner write now
        // run in one transaction, closing the TOCTOU for free.
        transaction: (tables, fn) =>
            base.transaction(
                tables,
                (view) => fn(organizationScopedAdapter(view, organization)),
            ),

        // Global identity/auth spine — untouched.
        members: base.members,
        humanMembers: base.humanMembers,
        aiMembers: base.aiMembers,
        identities: base.identities,
        identityTokenRevocations:
            base.identityTokenRevocations,
        identityDefaultOrganizations: base.identityDefaultOrganizations,
        identityTokens: base.identityTokens,
        clients: base.clients,
        identityProviders: base.identityProviders,
        authorizationCodes: base.authorizationCodes,

        // The organizations directory is global; the
        // organizations/:id and GET /organizations route guards
        // fence it to the caller's memberships.
        organizations: base.organizations,

        // Invitations are global-spine: the invitee must read an
        // invitation to an org they are NOT yet in, which an org
        // fence would hide. The dedicated invitation routes fence
        // by the caller's identity (invitee) or admin role
        // (inviter) instead.
        invitations: base.invitations,

        // The message plane (requests/responses) is the global
        // substrate the migration rides on: tenancy lives IN
        // `uri_prefix`, enforced at the route gate, not by an
        // organization_id column — so both pass through unwrapped,
        // like the identity/auth spine above.
        requests: base.requests,
        responses: base.responses,

        // Identity PII / credential facets — visible to the
        // caller's org only for co-members (need-to-know),
        // derived from the membership ledger. Credentials also
        // get `secret` projected out at the route.
        identityPii: parentScope(
            base.identityPii, 'identity_pii',
            viaMembership(
                memberships,
                (r: IdentityPiiEntity) => r.id, organization),
        ),
        identityCredentials: parentScope(
            base.identityCredentials, 'identity_credentials',
            viaMembership(
                memberships,
                (r: IdentityCredentialEntity) =>
                    r.identity_id, organization),
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
        flowNodes: parentScope(
            base.flowNodes, 'flow_nodes',
            viaParent(
                base.flows,
                (r: FlowNodeEntity) => r.flow_id),
        ),
        flowEdges: parentScope(
            base.flowEdges, 'flow_edges',
            viaParent(
                base.flows,
                (r: FlowEdgeEntity) => r.flow_id),
        ),
        flowNodeMembers: parentScope(
            base.flowNodeMembers, 'flow_node_members',
            viaFlowNode(
                (r: FlowNodeMemberEntity) => r.flow_node_id),
        ),
        flowNodeAttributes: parentScope(
            base.flowNodeAttributes, 'flow_node_attributes',
            viaFlowNode(
                (r: FlowNodeAttributeEntity) =>
                    r.flow_node_id),
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
                (r: ObjectiveRevisionEntity) => r.objective_id),
        ),
        projectObjectiveBaselineScores: parentScope(
            base.projectObjectiveBaselineScores,
            'project_objective_baseline_scores',
            viaParent(
                base.projects,
                (r: ProjectObjectiveBaselineScoreEntity) =>
                    r.project_id),
        ),
        projectObjectiveActualScores: parentScope(
            base.projectObjectiveActualScores,
            'project_objective_actual_scores',
            viaParent(
                base.projects,
                (r: ProjectObjectiveActualScoreEntity) =>
                    r.project_id),
        ),
        states,
        stateFieldValues,

        // Organization-owned entities — fenced to `org`.
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
