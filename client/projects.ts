import type {
    ProjectEntity,
    ProjectState,
} from '../shared/types.ts';
import {
    Project,
    assertProjectState,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import {
    organizationCollection,
    organizationItem,
} from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';

const projectChanges =
    createSubscriptionChannel();

export function subscribeProjectChanges(
    fn: () => void,
): () => void {
    return projectChanges.subscribe(fn);
}

export function notifyProjectChange(): void {
    projectChanges.notify();
}

export async function getProjectEntities(
    ctx: RequestContext,
): Promise<HttpMessage<ProjectEntity>[]> {
    return await ctx.GETCollection<ProjectEntity>(
        organizationCollection(ctx, 'projects'),
    );
}

// Domain state rides the ProjectEntity GET row; narrow it
// once, at the wire.
export function projectStateOf(
    row: ProjectEntity,
): ProjectState {
    return assertProjectState(
        row.state, 'project ' + row.id,
    );
}

export function projectOf(
    message: HttpMessage<ProjectEntity>,
): Project {
    return new Project(
        message, projectStateOf(message.body().toValue()),
    );
}

export async function getProjects(
    ctx: RequestContext,
): Promise<Project[]> {
    return (await getProjectEntities(ctx)).map(projectOf);
}

export async function getProjectEntity(
    ctx: RequestContext,
    id: string,
): Promise<HttpMessage<ProjectEntity>> {
    return await ctx.GET<ProjectEntity>(
        organizationItem(ctx, 'projects', id),
    );
}

// The wire document PUT /projects/:id now takes today's
// entity fields plus state, camelCase on this side of the
// adapter seam — the IdeaDocumentFields precedent
// (adapters/ideas.ts). organization_id is EXCLUDED too — the
// client never supplies it (the org fence stamps it
// downstream).
export type ProjectDocumentFields =
    Omit<
        ProjectEntity,
        | 'id'
        | 'organization_id'
    >;

// A save from the held project names the head it replaces,
// so a write over a newer head is refused rather than lost.
export async function putProject(
    ctx: RequestContext,
    held: HttpMessage<ProjectEntity>,
    document: ProjectDocumentFields,
): Promise<HttpMessage<ProjectEntity>> {
    const saved = await ctx.PUT<ProjectEntity>(
        organizationItem(ctx, 'projects', held.body().toValue().id),
        { ...document },
        [held],
    );
    projectChanges.notify();
    return saved;
}

// The camelCase patch for a project's editable fields.
// The adapter is the divorce point: pages and presenters
// speak this shape; the wire merge below speaks storage.
export interface ProjectFieldsPatch {
    title: string;
    description: string;
    startDate: string;
    targetEndDate: string;
    estimatedCost: number;
}

// The patch merges onto the held body, so the columns the
// form never touches (progress, actual cost, position) and
// the held state ride along unchanged.
export async function putProjectFields(
    ctx: RequestContext,
    held: HttpMessage<ProjectEntity>,
    patch: ProjectFieldsPatch,
): Promise<HttpMessage<ProjectEntity>> {
    const {
        id: _id,
        organization_id: _organizationId,
        ...fields
    } = held.body().toValue();
    return await putProject(ctx, held, {
        ...fields,
        title: patch.title,
        description: patch.description,
        start_date: patch.startDate,
        target_end_date: patch.targetEndDate,
        estimated_cost: patch.estimatedCost,
    });
}

export async function putProjectPosition(
    ctx: RequestContext,
    held: HttpMessage<ProjectEntity>,
    position: number,
): Promise<HttpMessage<ProjectEntity>> {
    const {
        id: _id,
        organization_id: _organizationId,
        ...fields
    } = held.body().toValue();
    return await putProject(ctx, held, { ...fields, position });
}

// State transition for an existing project: ONE document PUT
// via putProject, latched on the held project — hop count
// 1 → 1. The body is the held project's own fields, never
// ProjectView's display-transformed accessors (see the
// DATA-CORRUPTION TRAP note on ProjectView), with the new
// state replacing the held one.
export async function postProjectStateChange(
    ctx: RequestContext,
    held: HttpMessage<ProjectEntity>,
    state: ProjectState,
): Promise<HttpMessage<ProjectEntity>> {
    const {
        id: _id,
        organization_id: _organizationId,
        ...fields
    } = held.body().toValue();
    return await putProject(ctx, held, { ...fields, state });
}
