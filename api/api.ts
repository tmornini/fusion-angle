// ============================================
// FUSION AI — REST-style API
// GET/PUT/DELETE routing for the database adapter.
// ============================================

import type { DbAdapter } from './db';

let adapter: DbAdapter | null = null;

export function initApi(dbAdapter: DbAdapter): void {
  adapter = dbAdapter;
}

export function getDbAdapter(): DbAdapter {
  if (!adapter) throw new Error('API not initialized. Call initApi() first.');
  return adapter;
}

// ── Route Registry ──────────────────────────

type GetHandler = (adapter: DbAdapter, params: string[]) => Promise<unknown>;
type PutHandler = (adapter: DbAdapter, params: string[], payload: Record<string, unknown>) => Promise<unknown>;
type DeleteHandler = (adapter: DbAdapter, params: string[]) => Promise<void>;

interface Route {
  segments: string[];
  get?: GetHandler;
  put?: PutHandler;
  delete?: DeleteHandler;
}

function route(pattern: string, handlers: { get?: GetHandler; put?: PutHandler; delete?: DeleteHandler }): Route {
  return { segments: pattern.split('/'), ...handlers };
}

const routes: Route[] = [
  // ── Collections ────────────────────────────
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
  route('notifications', {
    get: (db) => db.notifications.getAll(),
  }),
  route('crunch-columns', {
    get: (db) => db.crunchColumns.getAll(),
  }),
  route('processes', {
    get: (db) => db.processes.getAll(),
  }),
  route('notification-categories', {
    get: (db) => db.notificationCategories.getAll(),
  }),
  route('notification-preferences', {
    get: (db) => db.notificationPreferences.getAll(),
  }),
  route('edge-outcomes', {
    get: (db) => db.edgeOutcomes.getAll(),
  }),
  route('edge-metrics', {
    get: (db) => db.edgeMetrics.getAll(),
  }),

  // ── Singletons ─────────────────────────────
  route('company-settings', {
    get: (db) => db.companySettings.get(),
    put: (db, _, payload) => db.companySettings.put(payload),
  }),
  route('account', {
    get: (db) => db.account.get(),
    put: (db, _, payload) => db.account.put(payload),
  }),
  route('current-user', {
    get: (db) => db.users.getById('current'),
  }),

  // ── Items by ID ────────────────────────────
  route('users/:id', {
    get: (db, [id]) => db.users.getById(id!),
    put: (db, [id], payload) => db.users.put(id!, payload),
  }),
  route('ideas/:id', {
    get: (db, [id]) => db.ideas.getById(id!),
    put: (db, [id], payload) => db.ideas.put(id!, payload),
    delete: (db, [id]) => db.ideas.delete(id!),
  }),
  route('projects/:id', {
    get: (db, [id]) => db.projects.getById(id!),
    put: (db, [id], payload) => db.projects.put(id!, payload),
    delete: (db, [id]) => db.projects.delete(id!),
  }),
  route('edges/:id', {
    get: (db, [id]) => db.edges.getById(id!),
    put: (db, [id], payload) => db.edges.put(id!, payload),
    delete: (db, [id]) => db.edges.delete(id!),
  }),
  route('processes/:id', {
    get: (db, [id]) => db.processes.getById(id!),
    put: (db, [id], payload) => db.processes.put(id!, payload),
    delete: (db, [id]) => db.processes.delete(id!),
  }),
  route('processes/:processId/steps', {
    get: (db, [processId]) => db.processSteps.getByProcessId(processId!),
  }),
  route('activities/:id', {
    put: (db, [id], payload) => db.activities.put(id!, payload),
  }),
  route('notifications/:id', {
    put: (db, [id], payload) => db.notifications.put(id!, payload),
  }),
  route('crunch-columns/:id', {
    put: (db, [id], payload) => db.crunchColumns.put(id!, payload),
  }),
  route('notification-preferences/:id', {
    put: (db, [id], payload) => db.notificationPreferences.put(id!, payload),
  }),

  // ── Nested: idea children ──────────────────
  route('ideas/:ideaId/edge', {
    get: (db, [ideaId]) => db.edges.getByIdeaId(ideaId!),
  }),
  route('ideas/:ideaId/score', {
    get: (db, [ideaId]) => db.ideaScores.getByIdeaId(ideaId!),
    put: (db, [ideaId], payload) => db.ideaScores.put(ideaId!, payload),
  }),

  // ── Nested: project children (GET) ─────────
  route('projects/:projectId/team', {
    get: (db, [projectId]) => db.projectTeam.getByProjectId(projectId!),
  }),
  route('projects/:projectId/milestones', {
    get: (db, [projectId]) => db.milestones.getByProjectId(projectId!),
  }),
  route('projects/:projectId/tasks', {
    get: (db, [projectId]) => db.projectTasks.getByProjectId(projectId!),
  }),
  route('projects/:projectId/discussions', {
    get: (db, [projectId]) => db.discussions.getByProjectId(projectId!),
  }),
  route('projects/:projectId/versions', {
    get: (db, [projectId]) => db.projectVersions.getByProjectId(projectId!),
  }),
  route('projects/:projectId/clarifications', {
    get: (db, [projectId]) => db.clarifications.getByProjectId(projectId!),
  }),

  // ── Nested: project children (PUT) ─────────
  route('projects/:projectId/team/:userId', {
    put: (db, [projectId, userId], payload) => db.projectTeam.put(projectId!, userId!, payload),
  }),
  route('projects/:projectId/milestones/:milestoneId', {
    put: (db, [projectId, milestoneId], payload) => db.milestones.put(milestoneId!, { ...payload, project_id: projectId }),
  }),
  route('projects/:projectId/tasks/:taskId', {
    put: (db, [projectId, taskId], payload) => db.projectTasks.put(taskId!, { ...payload, project_id: projectId }),
  }),
  route('projects/:projectId/discussions/:discussionId', {
    put: (db, [projectId, discussionId], payload) => db.discussions.put(discussionId!, { ...payload, project_id: projectId }),
  }),
  route('projects/:projectId/versions/:versionId', {
    put: (db, [projectId, versionId], payload) => db.projectVersions.put(versionId!, { ...payload, project_id: projectId }),
  }),
  route('projects/:projectId/clarifications/:clarificationId', {
    put: (db, [projectId, clarificationId], payload) => db.clarifications.put(clarificationId!, { ...payload, project_id: projectId }),
  }),

  // ── Nested: edge children ──────────────────
  route('edges/:edgeId/outcomes', {
    get: (db, [edgeId]) => db.edgeOutcomes.getByEdgeId(edgeId!),
  }),
  route('edges/:edgeId/outcomes/:outcomeId', {
    put: (db, [edgeId, outcomeId], payload) => db.edgeOutcomes.put(outcomeId!, { ...payload, edge_id: edgeId }),
  }),
  route('edges/:edgeId/outcomes/:outcomeId/metrics/:metricId', {
    put: (db, [, , metricId], payload) => db.edgeMetrics.put(metricId!, payload),
  }),
];

// ── Route Matching ──────────────────────────

function matchRoute(pathSegments: string[]): { route: Route; params: string[] } | null {
  for (const routeDefinition of routes) {
    if (routeDefinition.segments.length !== pathSegments.length) continue;
    const params: string[] = [];
    let matched = true;
    for (let i = 0; i < routeDefinition.segments.length; i++) {
      if (routeDefinition.segments[i]!.startsWith(':')) {
        params.push(pathSegments[i]!);
      } else if (routeDefinition.segments[i] !== pathSegments[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { route: routeDefinition, params };
  }
  return null;
}

// ── GET / PUT / DELETE ──────────────────────

export async function GET(resource: string): Promise<unknown> {
  const pathSegments = resource.split('/').filter(Boolean);
  const match = matchRoute(pathSegments);
  if (match?.route.get) return match.route.get(getDbAdapter(), match.params);
  throw new Error(`GET: Unknown resource "${resource}"`);
}

export async function PUT(resource: string, payload: Record<string, unknown>): Promise<unknown> {
  const pathSegments = resource.split('/').filter(Boolean);
  const match = matchRoute(pathSegments);
  if (match?.route.put) return match.route.put(getDbAdapter(), match.params, payload);
  throw new Error(`PUT: Unknown resource "${resource}"`);
}

export async function DELETE(resource: string): Promise<void> {
  const pathSegments = resource.split('/').filter(Boolean);
  const match = matchRoute(pathSegments);
  if (match?.route.delete) return match.route.delete(getDbAdapter(), match.params);
  throw new Error(`DELETE: Unknown resource "${resource}"`);
}
