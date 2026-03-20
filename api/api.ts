import type { DbAdapter } from './db';
import { nowUtc } from './types';

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}

const apiModule = (() => {
    let db: DbAdapter | null = null;
    return {
        init(dbAdapter: DbAdapter): void {
            db = dbAdapter;
        },
        get(): DbAdapter {
            if (!db) {
                throw new Error(
                    'API not initialized.'
                    + ' Call initApi()'
                    + ' first.',
                );
            }
            return db;
        },
    };
})();

export function initApi(
    dbAdapter: DbAdapter,
): void {
    apiModule.init(dbAdapter);
}

export function getDbAdapter(): DbAdapter {
    return apiModule.get();
}

type GetHandler = (
    adapter: DbAdapter,
    params: string[],
) => Promise<unknown>;

type PutHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
) => Promise<unknown>;

type DeleteHandler = (
    adapter: DbAdapter,
    params: string[],
) => Promise<void>;

type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
) => Promise<unknown>;

interface Route {
    segments: string[];
    get?: GetHandler;
    put?: PutHandler;
    delete?: DeleteHandler;
    post?: PostHandler;
}

function route(
    pattern: string,
    handlers: {
        get?: GetHandler;
        put?: PutHandler;
        delete?: DeleteHandler;
        post?: PostHandler;
    },
): Route {
    return {
        segments: pattern.split('/'),
        ...handlers,
    };
}

function param(
    params: string[],
    index: number,
): string {
    const value = params[index];
    if (value === undefined) {
        throw new Error(
            'Missing route param at index '
            + index,
        );
    }
    return value;
}

const routes: Route[] = [
    route('users', {
        get: (db) => db.users.getAll(),
    }),
    route('ideas', {
        get: (db) => db.ideas.getAll(),
    }),
    route('projects', {
        get: (db) => db.projects.getAll(),
    }),
    route('edges', {
        get: (db) => db.edges.getAll(),
    }),
    route('activities', {
        get: (db) => db.activities.getAll(),
    }),
    route('crunch-columns', {
        get: (db) =>
            db.crunchColumns.getAll(),
    }),
    route('crunch-column-acronyms', {
        get: (db) =>
            db.crunchColumnAcronyms
                .getAll(),
    }),
    route('crunch-column-acronym-links', {
        get: (db) =>
            db.crunchColumnAcronymLinks
                .getAll(),
    }),
    route('processes', {
        get: (db) => db.flows.getAll(),
    }),
    route('edge-outcomes', {
        get: (db) =>
            db.edgeOutcomes.getAll(),
    }),
    route('edge-outcome-edges', {
        get: (db) =>
            db.edgeOutcomeEdges.getAll(),
    }),
    route('edge-metrics', {
        get: (db) =>
            db.edgeMetrics.getAll(),
    }),
    route('edge-metric-outcomes', {
        get: (db) =>
            db.edgeMetricOutcomes
                .getAll(),
    }),
    route('process-steps', {
        get: (db) =>
            db.flowSteps.getAll(),
    }),
    route('idea-submissions', {
        get: (db) =>
            db.ideaSubmissions.getAll(),
    }),
    route('idea-project-links', {
        get: (db) =>
            db.ideaProjectLinks.getAll(),
    }),
    route('edge-ideas', {
        get: (db) =>
            db.edgeIdeas.getAll(),
    }),
    route('edge-ownerships', {
        get: (db) =>
            db.edgeOwnerships.getAll(),
    }),
    route('task-assignments', {
        get: (db) =>
            db.taskAssignments.getAll(),
    }),
    route('discussion-authorships', {
        get: (db) =>
            db.discussionAuthorships
                .getAll(),
    }),
    route('discussion-projects', {
        get: (db) =>
            db.discussionProjects
                .getAll(),
    }),
    route('version-authorships', {
        get: (db) =>
            db.versionAuthorships.getAll(),
    }),
    route('activity-actors', {
        get: (db) =>
            db.activityActors.getAll(),
    }),
    route('clarification-answers', {
        get: (db) =>
            db.clarificationAnswers
                .getAll(),
    }),
    route(
        'clarification-answer-clarifications',
        {
            get: (db) =>
                db
                    .clarificationAnswerClarifications
                    .getAll(),
        },
    ),
    route('clarification-askers', {
        get: (db) =>
            db.clarificationAskers
                .getAll(),
    }),
    route('clarification-answerers', {
        get: (db) =>
            db.clarificationAnswerers
                .getAll(),
    }),
    route('clarification-projects', {
        get: (db) =>
            db.clarificationProjects
                .getAll(),
    }),
    route('idea-score-ideas', {
        get: (db) =>
            db.ideaScoreIdeas.getAll(),
    }),
    route('project-task-projects', {
        get: (db) =>
            db.projectTaskProjects
                .getAll(),
    }),
    route('process-step-processes', {
        get: (db) =>
            db.processStepProcesses
                .getAll(),
    }),
    route('milestone-projects', {
        get: (db) =>
            db.milestoneProjects
                .getAll(),
    }),
    route('project-version-projects', {
        get: (db) =>
            db.projectVersionProjects
                .getAll(),
    }),
    route('team-memberships', {
        get: (db) =>
            db.teamMemberships.getAll(),
    }),
    route('team-membership-projects', {
        get: (db) =>
            db.teamMembershipProjects
                .getAll(),
    }),
    route('team-membership-users', {
        get: (db) =>
            db.teamMembershipUsers
                .getAll(),
    }),

    route('company-settings', {
        get: (db) =>
            db.companySettings.get(),
        put: (db, _, payload) =>
            db.companySettings.put(payload),
    }),
    route('account', {
        get: (db) => db.account.get(),
        put: (db, _, payload) =>
            db.account.put(payload),
    }),
    route('current-user', {
        get: (db) =>
            db.users.getById('current'),
    }),

    route('users/:id', {
        get: (db, p) =>
            db.users.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.users.put(
                param(p, 0),
                payload,
            ),
    }),
    route('ideas/:id', {
        get: (db, p) =>
            db.ideas.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.ideas.put(
                param(p, 0),
                payload,
            ),
        delete: (db, p) =>
            db.ideas.delete(param(p, 0)),
    }),
    route('projects/:id', {
        get: (db, p) =>
            db.projects.getById(
                param(p, 0),
            ),
        put: (db, p, payload) =>
            db.projects.put(
                param(p, 0),
                payload,
            ),
        delete: (db, p) =>
            db.projects.delete(param(p, 0)),
    }),
    route('edges/:id', {
        get: (db, p) =>
            db.edges.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.edges.put(
                param(p, 0),
                payload,
            ),
        delete: (db, p) =>
            db.edges.delete(param(p, 0)),
    }),
    route('processes/:id', {
        get: (db, p) =>
            db.flows.getById(param(p, 0)),
        put: (db, p, payload) =>
            db.flows.put(
                param(p, 0),
                payload,
            ),
        delete: (db, p) =>
            db.flows.delete(param(p, 0)),
    }),
    route('processes/:processId/steps', {
        get: async (db, p) => {
            const pid = param(p, 0);
            const [links, steps] =
                await Promise.all([
                    db.processStepProcesses
                        .getAll(),
                    db.flowSteps.getAll(),
                ]);
            const stepIds = new Set(
                links
                    .filter(
                        l => l.process_id
                            === pid,
                    )
                    .map(
                        l => l.process_step_id,
                    ),
            );
            return steps
                .filter(
                    s => stepIds.has(s.id),
                )
                .sort(
                    (a, b) =>
                        a.sort_order
                        - b.sort_order,
                );
        },
    }),
    route(
        'processes/:processId/steps/:stepId',
        {
            get: (db, p) =>
                db.flowSteps.getById(
                    param(p, 1),
                ),
            put: (db, p, payload) =>
                db.flowSteps.put(
                    param(p, 1),
                    payload,
                ),
        },
    ),
    route('activities/:id', {
        put: (db, p, payload) =>
            db.activities.put(
                param(p, 0),
                payload,
            ),
    }),
    route('crunch-columns/:id', {
        put: (db, p, payload) =>
            db.crunchColumns.put(
                param(p, 0),
                payload,
            ),
    }),
    route('crunch-column-acronyms/:id', {
        put: (db, p, payload) =>
            db.crunchColumnAcronyms.put(
                param(p, 0),
                payload,
            ),
    }),
    route(
        'crunch-column-acronym-links/:id',
        {
            put: (db, p, payload) =>
                db.crunchColumnAcronymLinks
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route('idea-submissions/:id', {
        put: (db, p, payload) =>
            db.ideaSubmissions.put(
                param(p, 0),
                payload,
            ),
    }),
    route('idea-project-links/:id', {
        put: (db, p, payload) =>
            db.ideaProjectLinks.put(
                param(p, 0),
                payload,
            ),
    }),
    route('edge-ideas/:id', {
        put: (db, p, payload) =>
            db.edgeIdeas.put(
                param(p, 0),
                payload,
            ),
    }),
    route('edge-ownerships/:id', {
        put: (db, p, payload) =>
            db.edgeOwnerships.put(
                param(p, 0),
                payload,
            ),
    }),
    route('edge-outcome-edges/:id', {
        put: (db, p, payload) =>
            db.edgeOutcomeEdges.put(
                param(p, 0),
                payload,
            ),
    }),
    route('edge-metric-outcomes/:id', {
        put: (db, p, payload) =>
            db.edgeMetricOutcomes.put(
                param(p, 0),
                payload,
            ),
    }),
    route('task-assignments/:id', {
        put: (db, p, payload) =>
            db.taskAssignments.put(
                param(p, 0),
                payload,
            ),
    }),
    route('discussion-authorships/:id', {
        put: (db, p, payload) =>
            db.discussionAuthorships.put(
                param(p, 0),
                payload,
            ),
    }),
    route('discussion-projects/:id', {
        put: (db, p, payload) =>
            db.discussionProjects.put(
                param(p, 0),
                payload,
            ),
    }),
    route('version-authorships/:id', {
        put: (db, p, payload) =>
            db.versionAuthorships.put(
                param(p, 0),
                payload,
            ),
    }),
    route('activity-actors/:id', {
        put: (db, p, payload) =>
            db.activityActors.put(
                param(p, 0),
                payload,
            ),
    }),
    route('clarification-answers/:id', {
        put: (db, p, payload) =>
            db.clarificationAnswers.put(
                param(p, 0),
                payload,
            ),
    }),
    route(
        'clarification-answer'
        + '-clarifications/:id',
        {
            put: (db, p, payload) =>
                db
                    .clarificationAnswerClarifications
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route('clarification-askers/:id', {
        put: (db, p, payload) =>
            db.clarificationAskers.put(
                param(p, 0),
                payload,
            ),
    }),
    route('clarification-answerers/:id', {
        put: (db, p, payload) =>
            db.clarificationAnswerers.put(
                param(p, 0),
                payload,
            ),
    }),
    route('clarification-projects/:id', {
        put: (db, p, payload) =>
            db.clarificationProjects.put(
                param(p, 0),
                payload,
            ),
    }),
    route('idea-score-ideas/:id', {
        put: (db, p, payload) =>
            db.ideaScoreIdeas.put(
                param(p, 0),
                payload,
            ),
    }),
    route('project-task-projects/:id', {
        put: (db, p, payload) =>
            db.projectTaskProjects.put(
                param(p, 0),
                payload,
            ),
    }),
    route('process-step-processes/:id', {
        put: (db, p, payload) =>
            db.processStepProcesses.put(
                param(p, 0),
                payload,
            ),
    }),
    route('milestone-projects/:id', {
        put: (db, p, payload) =>
            db.milestoneProjects.put(
                param(p, 0),
                payload,
            ),
    }),
    route(
        'project-version-projects/:id',
        {
            put: (db, p, payload) =>
                db.projectVersionProjects
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route('team-memberships/:id', {
        put: (db, p, payload) =>
            db.teamMemberships.put(
                param(p, 0),
                payload,
            ),
    }),
    route(
        'team-membership-projects/:id',
        {
            put: (db, p, payload) =>
                db.teamMembershipProjects
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route(
        'team-membership-users/:id',
        {
            put: (db, p, payload) =>
                db.teamMembershipUsers
                    .put(
                        param(p, 0),
                        payload,
                    ),
        },
    ),
    route('ideas/:ideaId/edge', {
        get: async (db, p) => {
            const ideaId = param(p, 0);
            const links =
                await db.edgeIdeas
                    .getAll();
            const link = links.find(
                l => l.idea_id === ideaId,
            );
            if (!link) return null;
            return db.edges.getById(
                link.edge_id,
            );
        },
    }),
    route('ideas/:ideaId/score', {
        get: async (db, p) => {
            const ideaId = param(p, 0);
            const links =
                await db.ideaScoreIdeas
                    .getAll();
            const link = links.find(
                l => l.idea_id === ideaId,
            );
            if (!link) return null;
            return db.ideaScores.getById(
                link.idea_score_id,
            );
        },
        put: async (db, p, payload) => {
            const ideaId = param(p, 0);
            const links =
                await db.ideaScoreIdeas
                    .getAll();
            const existing = links.find(
                l => l.idea_id === ideaId,
            );
            const scoreId =
                typeof payload.id === 'string'
                    ? payload.id
                    : (existing
                        ?.idea_score_id
                        ?? `score-${ideaId}`);
            const score =
                await db.ideaScores.put(
                    scoreId, payload,
                );
            if (!existing) {
                const linkId =
                    `isi-${ideaId}`;
                await db.ideaScoreIdeas.put(
                    linkId,
                    {
                        id: linkId,
                        idea_score_id:
                            scoreId,
                        idea_id: ideaId,
                        created_at:
                            nowUtc(),
                    },
                );
            }
            return score;
        },
    }),

    route('projects/:projectId/team', {
        get: async (db, p) => {
            const pid = param(p, 0);
            const [
                tmProjects,
                memberships,
                tmUsers,
            ] = await Promise.all([
                db.teamMembershipProjects
                    .getAll(),
                db.teamMemberships
                    .getAll(),
                db.teamMembershipUsers
                    .getAll(),
            ]);
            const membershipIds = new Set(
                tmProjects
                    .filter(
                        l => l.project_id
                            === pid,
                    )
                    .map(
                        l =>
                            l.team_membership_id,
                    ),
            );
            const userByMembership = new Map(
                tmUsers.map(
                    u => [
                        u.team_membership_id,
                        u.user_id,
                    ],
                ),
            );
            return memberships
                .filter(
                    m =>
                        membershipIds.has(
                            m.id,
                        ),
                )
                .map(m => ({
                    id: m.id,
                    user_id:
                        userByMembership
                            .get(m.id)
                        ?? '',
                    role: m.role,
                    type: m.type,
                }));
        },
    }),
    route(
        'projects/:projectId/milestones',
        {
            get: async (db, p) => {
                const pid = param(p, 0);
                const [links, all] =
                    await Promise.all([
                        db.milestoneProjects
                            .getAll(),
                        db.milestones
                            .getAll(),
                    ]);
                const ids = new Set(
                    links
                        .filter(
                            l =>
                                l.project_id
                                === pid,
                        )
                        .map(
                            l =>
                                l.milestone_id,
                        ),
                );
                return all
                    .filter(
                        m => ids.has(m.id),
                    )
                    .sort(
                        (a, b) =>
                            a.sort_order
                            - b.sort_order,
                    );
            },
        },
    ),
    route('projects/:projectId/tasks', {
        get: async (db, p) => {
            const pid = param(p, 0);
            const [links, all] =
                await Promise.all([
                    db.projectTaskProjects
                        .getAll(),
                    db.projectTasks
                        .getAll(),
                ]);
            const ids = new Set(
                links
                    .filter(
                        l =>
                            l.project_id
                            === pid,
                    )
                    .map(
                        l =>
                            l.project_task_id,
                    ),
            );
            return all.filter(
                t => ids.has(t.id),
            );
        },
    }),
    route(
        'projects/:projectId/discussions',
        {
            get: async (db, p) => {
                const pid = param(p, 0);
                const [links, all] =
                    await Promise.all([
                        db.discussionProjects
                            .getAll(),
                        db.discussions
                            .getAll(),
                    ]);
                const ids = new Set(
                    links
                        .filter(
                            l =>
                                l.project_id
                                === pid,
                        )
                        .map(
                            l =>
                                l.discussion_id,
                        ),
                );
                return all
                    .filter(
                        d => ids.has(d.id),
                    )
                    .sort(
                        (a, b) =>
                            b.date
                                .localeCompare(
                                    a.date,
                                ),
                    );
            },
        },
    ),
    route(
        'projects/:projectId/versions',
        {
            get: async (db, p) => {
                const pid = param(p, 0);
                const [links, all] =
                    await Promise.all([
                        db
                            .projectVersionProjects
                            .getAll(),
                        db.projectVersions
                            .getAll(),
                    ]);
                const ids = new Set(
                    links
                        .filter(
                            l =>
                                l.project_id
                                === pid,
                        )
                        .map(
                            l =>
                                l
                                    .project_version_id,
                        ),
                );
                return all
                    .filter(
                        v => ids.has(v.id),
                    )
                    .sort(
                        (a, b) =>
                            b.date
                                .localeCompare(
                                    a.date,
                                ),
                    );
            },
        },
    ),
    route(
        'projects/:projectId/clarifications',
        {
            get: async (db, p) => {
                const pid = param(p, 0);
                const [links, all] =
                    await Promise.all([
                        db.clarificationProjects
                            .getAll(),
                        db.clarifications
                            .getAll(),
                    ]);
                const ids = new Set(
                    links
                        .filter(
                            l =>
                                l.project_id
                                === pid,
                        )
                        .map(
                            l =>
                                l.clarification_id,
                        ),
                );
                return all.filter(
                    c => ids.has(c.id),
                );
            },
        },
    ),

    route(
        'projects/:projectId/team/:userId',
        {
            put: async (db, p, payload) => {
                const pid = param(p, 0);
                const uid = param(p, 1);
                const tmId =
                    `tm-${pid}-${uid}`;
                const membership =
                    await db.teamMemberships
                        .put(tmId, {
                            id: tmId,
                            role:
                                typeof payload
                                    .role
                                === 'string'
                                    ? payload.role
                                    : '',
                            type:
                                typeof payload
                                    .type
                                === 'string'
                                    ? payload.type
                                    : '',
                        });
                const projLinkId =
                    `tmp-${tmId}`;
                const userLinkId =
                    `tmu-${tmId}`;
                await Promise.all([
                    db.teamMembershipProjects
                        .put(projLinkId, {
                            id: projLinkId,
                            team_membership_id:
                                tmId,
                            project_id: pid,
                            created_at:
                                nowUtc(),
                        }),
                    db.teamMembershipUsers
                        .put(userLinkId, {
                            id: userLinkId,
                            team_membership_id:
                                tmId,
                            user_id: uid,
                            created_at:
                                nowUtc(),
                        }),
                ]);
                return membership;
            },
        },
    ),
    route(
        'projects/:projectId'
        + '/milestones/:milestoneId',
        {
            put: async (db, p, payload) => {
                const pid = param(p, 0);
                const mid = param(p, 1);
                const result =
                    await db.milestones.put(
                        mid, payload,
                    );
                const links =
                    await db.milestoneProjects
                        .getAll();
                const hasLink = links.some(
                    l =>
                        l.milestone_id
                            === mid
                        && l.project_id
                            === pid,
                );
                if (!hasLink) {
                    const linkId =
                        `mp-${mid}`;
                    await db
                        .milestoneProjects
                        .put(linkId, {
                            id: linkId,
                            milestone_id:
                                mid,
                            project_id:
                                pid,
                            created_at:
                                nowUtc(),
                        });
                }
                return result;
            },
        },
    ),
    route(
        'projects/:projectId'
        + '/tasks/:taskId',
        {
            put: async (db, p, payload) => {
                const pid = param(p, 0);
                const tid = param(p, 1);
                const result =
                    await db.projectTasks
                        .put(tid, payload);
                const links =
                    await db
                        .projectTaskProjects
                        .getAll();
                const hasLink = links.some(
                    l =>
                        l.project_task_id
                            === tid
                        && l.project_id
                            === pid,
                );
                if (!hasLink) {
                    const linkId =
                        `ptp-${tid}`;
                    await db
                        .projectTaskProjects
                        .put(linkId, {
                            id: linkId,
                            project_task_id:
                                tid,
                            project_id:
                                pid,
                            created_at:
                                nowUtc(),
                        });
                }
                return result;
            },
        },
    ),
    route(
        'projects/:projectId'
        + '/discussions/:discussionId',
        {
            put: async (db, p, payload) => {
                const pid = param(p, 0);
                const did = param(p, 1);
                const result =
                    await db.discussions
                        .put(did, payload);
                const links =
                    await db
                        .discussionProjects
                        .getAll();
                const hasLink = links.some(
                    l =>
                        l.discussion_id
                            === did
                        && l.project_id
                            === pid,
                );
                if (!hasLink) {
                    const linkId =
                        `dp-${did}`;
                    await db
                        .discussionProjects
                        .put(linkId, {
                            id: linkId,
                            discussion_id:
                                did,
                            project_id:
                                pid,
                            created_at:
                                nowUtc(),
                        });
                }
                return result;
            },
        },
    ),
    route(
        'projects/:projectId'
        + '/versions/:versionId',
        {
            put: async (db, p, payload) => {
                const pid = param(p, 0);
                const vid = param(p, 1);
                const result =
                    await db.projectVersions
                        .put(vid, payload);
                const links =
                    await db
                        .projectVersionProjects
                        .getAll();
                const hasLink =
                    links.some(
                        l =>
                            l
                                .project_version_id
                                === vid
                            && l.project_id
                                === pid,
                    );
                if (!hasLink) {
                    const linkId =
                        `pvp-${vid}`;
                    await db
                        .projectVersionProjects
                        .put(linkId, {
                            id: linkId,
                            project_version_id:
                                vid,
                            project_id:
                                pid,
                            created_at:
                                nowUtc(),
                        });
                }
                return result;
            },
        },
    ),
    route(
        'projects/:projectId'
        + '/clarifications'
        + '/:clarificationId',
        {
            put: (db, p, payload) =>
                db.clarifications.put(
                    param(p, 1),
                    payload,
                ),
        },
    ),

    route('edges/:edgeId/outcomes', {
        get: async (db, p) => {
            const edgeId = param(p, 0);
            const [links, outcomes] =
                await Promise.all([
                    db.edgeOutcomeEdges
                        .getAll(),
                    db.edgeOutcomes
                        .getAll(),
                ]);
            const outcomeIds = new Set(
                links
                    .filter(
                        l => l.edge_id
                            === edgeId,
                    )
                    .map(
                        l =>
                            l.edge_outcome_id,
                    ),
            );
            return outcomes.filter(
                o => outcomeIds.has(o.id),
            );
        },
    }),
    route(
        'edges/:edgeId'
        + '/outcomes/:outcomeId',
        {
            put: async (db, p, payload) => {
                const edgeId =
                    param(p, 0);
                const outcomeId =
                    param(p, 1);
                const result =
                    await db.edgeOutcomes
                        .put(
                            outcomeId,
                            payload,
                        );
                const links =
                    await db
                        .edgeOutcomeEdges
                        .getAll();
                const hasLink =
                    links.some(
                        l =>
                            l.edge_outcome_id
                                === outcomeId
                            && l.edge_id
                                === edgeId,
                    );
                if (!hasLink) {
                    const linkId =
                        `eoe-${outcomeId}`;
                    await db
                        .edgeOutcomeEdges
                        .put(linkId, {
                            id: linkId,
                            edge_outcome_id:
                                outcomeId,
                            edge_id:
                                edgeId,
                            created_at:
                                nowUtc(),
                        });
                }
                return result;
            },
        },
    ),
    route(
        'edges/:edgeId'
        + '/outcomes/:outcomeId'
        + '/metrics/:metricId',
        {
            put: async (db, p, payload) => {
                const outcomeId =
                    param(p, 1);
                const metricId =
                    param(p, 2);
                const result =
                    await db.edgeMetrics
                        .put(
                            metricId,
                            payload,
                        );
                const links =
                    await db
                        .edgeMetricOutcomes
                        .getAll();
                const hasLink =
                    links.some(
                        l =>
                            l.edge_metric_id
                                === metricId
                            && l.outcome_id
                                === outcomeId,
                    );
                if (!hasLink) {
                    const linkId =
                        `emo-${metricId}`;
                    await db
                        .edgeMetricOutcomes
                        .put(linkId, {
                            id: linkId,
                            edge_metric_id:
                                metricId,
                            outcome_id:
                                outcomeId,
                            created_at:
                                nowUtc(),
                        });
                }
                return result;
            },
        },
    ),

    route('snapshots/schema', {
        get: async (db) =>
            (await db.hasSchema())
                ? db.exportSnapshot()
                : null,
        delete: (db) => db.deleteSchema(),
        post: (db) => db.createSchema(),
    }),
    route('snapshots/mock-data', {
        post: async (db) => {
            const { populateMockData } =
                await import('./seed');
            await populateMockData(db);
        },
    }),
    route('snapshots/import', {
        put: (db, _, payload) => {
            if (
                typeof payload.json
                    !== 'string'
            ) {
                throw new ApiError(
                    'Missing or invalid'
                    + ' "json" field:'
                    + ' expected a string.',
                    400,
                );
            }
            return db.importSnapshot(
                payload.json,
            );
        },
    }),
];

function matchRoute(
    pathSegments: string[],
): { route: Route; params: string[] } | null {
    for (
        const routeDefinition of routes
    ) {
        if (
            routeDefinition.segments.length
            !== pathSegments.length
        ) {
            continue;
        }
        const params: string[] = [];
        let matched = true;
        for (
            let i = 0;
            i
                < routeDefinition.segments
                    .length;
            i++
        ) {
            if (
                routeDefinition
                    .segments[i]!
                    .startsWith(':')
            ) {
                params.push(
                    pathSegments[i]!,
                );
            } else if (
                routeDefinition.segments[i]
                !== pathSegments[i]
            ) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return {
                route: routeDefinition,
                params,
            };
        }
    }
    return null;
}

const BASE_URL = 'http://localhost';

export async function handleRequest(
    request: Request,
): Promise<Response> {
    const { pathname } = new URL(request.url);
    const pathSegments = pathname
        .split('/')
        .filter(Boolean);
    const match = matchRoute(pathSegments);

    if (!match) {
        return Response.json(
            {
                error:
                    'Not found: ' + pathname,
            },
            { status: 404 },
        );
    }

    const { route: matched, params } = match;
    const method = request.method;
    const db = getDbAdapter();

    try {
        switch (method) {
            case 'GET': {
                if (!matched.get) {
                    return Response.json(
                        {
                            error:
                                'Method GET not'
                                + ' allowed on '
                                + pathname,
                        },
                        { status: 405 },
                    );
                }
                return Response.json(
                    await matched.get(
                        db,
                        params,
                    ),
                );
            }
            case 'PUT': {
                if (!matched.put) {
                    return Response.json(
                        {
                            error:
                                'Method PUT not'
                                + ' allowed on '
                                + pathname,
                        },
                        { status: 405 },
                    );
                }
                const payload =
                    (await request.json()) as Record<
                        string,
                        unknown
                    >;
                return Response.json(
                    await matched.put(
                        db,
                        params,
                        payload,
                    ),
                );
            }
            case 'DELETE': {
                if (!matched.delete) {
                    return Response.json(
                        {
                            error:
                                'Method DELETE'
                                + ' not allowed'
                                + ' on '
                                + pathname,
                        },
                        { status: 405 },
                    );
                }
                await matched.delete(
                    db,
                    params,
                );
                return new Response(null, {
                    status: 204,
                });
            }
            case 'POST': {
                if (!matched.post) {
                    return Response.json(
                        {
                            error:
                                'Method POST'
                                + ' not allowed'
                                + ' on '
                                + pathname,
                        },
                        { status: 405 },
                    );
                }
                const payload =
                    (await request.json()) as Record<
                        string,
                        unknown
                    >;
                const result =
                    await matched.post(
                        db,
                        params,
                        payload,
                    );
                if (result === undefined) {
                    return new Response(null, {
                        status: 204,
                    });
                }
                return Response.json(result);
            }
            default:
                return Response.json(
                    {
                        error:
                            'Method '
                            + method
                            + ' not allowed',
                    },
                    { status: 405 },
                );
        }
    } catch (error) {
        const status =
            error instanceof ApiError
                ? error.status
                : 500;
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
            { status },
        );
    }
}

async function unwrapResponse<T>(
    response: Response,
): Promise<T> {
    if (response.ok) {
        return (response.status === 204
            ? undefined
            : await response.json()) as T;
    }
    const { error } =
        (await response.json()) as {
            error: string;
        };
    throw new Error(
        `${error} (${response.url})`,
    );
}

export async function GET<T>(
    resource: string,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
            ),
        ),
    );
}

export async function PUT<T>(
    resource: string,
    payload: Record<string, unknown>,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type':
                            'application/json',
                    },
                    body: JSON.stringify(
                        payload,
                    ),
                },
            ),
        ),
    );
}

export async function DELETE(
    resource: string,
): Promise<void> {
    await unwrapResponse(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
                { method: 'DELETE' },
            ),
        ),
    );
}

export async function POST<T>(
    resource: string,
    payload: Record<string, unknown>,
): Promise<T> {
    return unwrapResponse<T>(
        await handleRequest(
            new Request(
                `${BASE_URL}/${resource}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json',
                    },
                    body: JSON.stringify(
                        payload,
                    ),
                },
            ),
        ),
    );
}
