// ============================================
// FUSION AI — REST-style API
// GET/PUT/DELETE/POST routing for the database adapter.
// ============================================

import type { DbAdapter } from './db';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

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
type PostHandler = (adapter: DbAdapter, params: string[], payload: Record<string, unknown>) => Promise<unknown>;

interface Route {
  segments: string[];
  get?: GetHandler;
  put?: PutHandler;
  delete?: DeleteHandler;
  post?: PostHandler;
}

function route(pattern: string, handlers: { get?: GetHandler; put?: PutHandler; delete?: DeleteHandler; post?: PostHandler }): Route {
  return { segments: pattern.split('/'), ...handlers };
}

// Safe route param access — eliminates non-null assertions in route handlers
function param(params: string[], index: number): string {
  const value = params[index];
  if (value === undefined) throw new Error(`Missing route param at index ${index}`);
  return value;
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
  route('crunch-columns', {
    get: (db) => db.crunchColumns.getAll(),
  }),
  route('processes', {
    get: (db) => db.processes.getAll(),
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
    get: (db, p) => db.users.getById(param(p, 0)),
    put: (db, p, payload) => db.users.put(param(p, 0), payload),
  }),
  route('ideas/:id', {
    get: (db, p) => db.ideas.getById(param(p, 0)),
    put: (db, p, payload) => db.ideas.put(param(p, 0), payload),
    delete: (db, p) => db.ideas.delete(param(p, 0)),
  }),
  route('projects/:id', {
    get: (db, p) => db.projects.getById(param(p, 0)),
    put: (db, p, payload) => db.projects.put(param(p, 0), payload),
    delete: (db, p) => db.projects.delete(param(p, 0)),
  }),
  route('edges/:id', {
    get: (db, p) => db.edges.getById(param(p, 0)),
    put: (db, p, payload) => db.edges.put(param(p, 0), payload),
    delete: (db, p) => db.edges.delete(param(p, 0)),
  }),
  route('processes/:id', {
    get: (db, p) => db.processes.getById(param(p, 0)),
    put: (db, p, payload) => db.processes.put(param(p, 0), payload),
    delete: (db, p) => db.processes.delete(param(p, 0)),
  }),
  route('processes/:processId/steps', {
    get: (db, p) => db.processSteps.getByProcessId(param(p, 0)),
  }),
  route('activities/:id', {
    put: (db, p, payload) => db.activities.put(param(p, 0), payload),
  }),
  route('crunch-columns/:id', {
    put: (db, p, payload) => db.crunchColumns.put(param(p, 0), payload),
  }),
  // ── Nested: idea children ──────────────────
  route('ideas/:ideaId/edge', {
    get: (db, p) => db.edges.getByIdeaId(param(p, 0)),
  }),
  route('ideas/:ideaId/score', {
    get: (db, p) => db.ideaScores.getByIdeaId(param(p, 0)),
    put: (db, p, payload) => db.ideaScores.put(param(p, 0), payload),
  }),

  // ── Nested: project children (GET) ─────────
  route('projects/:projectId/team', {
    get: (db, p) => db.projectTeam.getByProjectId(param(p, 0)),
  }),
  route('projects/:projectId/milestones', {
    get: (db, p) => db.milestones.getByProjectId(param(p, 0)),
  }),
  route('projects/:projectId/tasks', {
    get: (db, p) => db.projectTasks.getByProjectId(param(p, 0)),
  }),
  route('projects/:projectId/discussions', {
    get: (db, p) => db.discussions.getByProjectId(param(p, 0)),
  }),
  route('projects/:projectId/versions', {
    get: (db, p) => db.projectVersions.getByProjectId(param(p, 0)),
  }),
  route('projects/:projectId/clarifications', {
    get: (db, p) => db.clarifications.getByProjectId(param(p, 0)),
  }),

  // ── Nested: project children (PUT) ─────────
  route('projects/:projectId/team/:userId', {
    put: (db, p, payload) => db.projectTeam.put(param(p, 0), param(p, 1), payload),
  }),
  route('projects/:projectId/milestones/:milestoneId', {
    put: (db, p, payload) => db.milestones.put(param(p, 1), { ...payload, project_id: param(p, 0) }),
  }),
  route('projects/:projectId/tasks/:taskId', {
    put: (db, p, payload) => db.projectTasks.put(param(p, 1), { ...payload, project_id: param(p, 0) }),
  }),
  route('projects/:projectId/discussions/:discussionId', {
    put: (db, p, payload) => db.discussions.put(param(p, 1), { ...payload, project_id: param(p, 0) }),
  }),
  route('projects/:projectId/versions/:versionId', {
    put: (db, p, payload) => db.projectVersions.put(param(p, 1), { ...payload, project_id: param(p, 0) }),
  }),
  route('projects/:projectId/clarifications/:clarificationId', {
    put: (db, p, payload) => db.clarifications.put(param(p, 1), { ...payload, project_id: param(p, 0) }),
  }),

  // ── Nested: edge children ──────────────────
  route('edges/:edgeId/outcomes', {
    get: (db, p) => db.edgeOutcomes.getByEdgeId(param(p, 0)),
  }),
  route('edges/:edgeId/outcomes/:outcomeId', {
    put: (db, p, payload) => db.edgeOutcomes.put(param(p, 1), { ...payload, edge_id: param(p, 0) }),
  }),
  route('edges/:edgeId/outcomes/:outcomeId/metrics/:metricId', {
    put: (db, p, payload) => db.edgeMetrics.put(param(p, 2), payload),
  }),

  // ── Snapshots ──────────────────────────────
  route('snapshots/schema', {
    get: async (db) => await db.hasSchema() ? db.exportSnapshot() : null,
    delete: (db) => db.deleteSchema(),
    post: (db) => db.createSchema(),
  }),
  route('snapshots/mock-data', {
    post: async (db) => { const { populateMockData } = await import('./seed'); await populateMockData(db); },
  }),
  route('snapshots/import', {
    put: (db, _, payload) => db.importSnapshot(payload.json as string),
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

const BASE_URL = 'http://localhost';

// ── Request / Response Dispatch ─────────────

export async function handleRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const pathSegments = pathname.split('/').filter(Boolean);
  const match = matchRoute(pathSegments);

  if (!match) return Response.json({ error: `Not found: ${pathname}` }, { status: 404 });

  const { route: matched, params } = match;
  const method = request.method;
  const db = getDbAdapter();

  try {
    switch (method) {
      case 'GET': {
        if (!matched.get) return Response.json({ error: `Method GET not allowed on ${pathname}` }, { status: 405 });
        return Response.json(await matched.get(db, params));
      }
      case 'PUT': {
        if (!matched.put) return Response.json({ error: `Method PUT not allowed on ${pathname}` }, { status: 405 });
        const payload = await request.json() as Record<string, unknown>;
        return Response.json(await matched.put(db, params, payload));
      }
      case 'DELETE': {
        if (!matched.delete) return Response.json({ error: `Method DELETE not allowed on ${pathname}` }, { status: 405 });
        await matched.delete(db, params);
        return new Response(null, { status: 204 });
      }
      case 'POST': {
        if (!matched.post) return Response.json({ error: `Method POST not allowed on ${pathname}` }, { status: 405 });
        const payload = await request.json() as Record<string, unknown>;
        const result = await matched.post(db, params, payload);
        if (result === undefined) return new Response(null, { status: 204 });
        return Response.json(result);
      }
      default:
        return Response.json({ error: `Method ${method} not allowed` }, { status: 405 });
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status });
  }
}

// ── GET / PUT / DELETE / POST ────────────────

async function unwrapResponse(response: Response): Promise<unknown> {
  if (response.ok) return response.status === 204 ? undefined : response.json();
  const { error } = await response.json() as { error: string };
  throw new Error(`${error} (${response.url})`);
}

export async function GET(resource: string): Promise<unknown> {
  return unwrapResponse(await handleRequest(new Request(`${BASE_URL}/${resource}`)));
}

export async function PUT(resource: string, payload: Record<string, unknown>): Promise<unknown> {
  return unwrapResponse(await handleRequest(new Request(`${BASE_URL}/${resource}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })));
}

export async function DELETE(resource: string): Promise<void> {
  await unwrapResponse(await handleRequest(new Request(`${BASE_URL}/${resource}`, {
    method: 'DELETE',
  })));
}

export async function POST(resource: string, payload: Record<string, unknown>): Promise<unknown> {
  return unwrapResponse(await handleRequest(new Request(`${BASE_URL}/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })));
}
