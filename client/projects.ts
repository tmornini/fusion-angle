import type {
    ProjectEntity,
    ProjectState,
} from '../shared/types.ts';
import {
    Project,
    assertProjectState,
} from '../shared/types.ts';
import type {
    Latch,
    RequestContext,
} from './request-context.ts';
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
): Promise<ProjectEntity[]> {
    return (await ctx.GETCollection<ProjectEntity>(
        organizationCollection(ctx, 'projects'),
    )).map((m) => m.body().toValue());
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

export async function getProjects(
    ctx: RequestContext,
): Promise<Project[]> {
    const rows = await getProjectEntities(ctx);
    return rows.map(row => new Project(
        row, projectStateOf(row),
    ));
}

export async function getProject(
    ctx: RequestContext,
    id: string,
): Promise<Project> {
    const row = await getProjectEntity(ctx, id);
    return new Project(
        row, projectStateOf(row),
    );
}

export async function getProjectEntity(
    ctx: RequestContext,
    id: string,
): Promise<ProjectEntity> {
    return (await ctx.GET<ProjectEntity>(
        organizationItem(ctx, 'projects', id),
    )).body().toValue();
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

export async function putProject(
    ctx: RequestContext,
    id: string,
    document: ProjectDocumentFields,
    latch: Latch | undefined,
): Promise<void> {
    const { state, ...entity } = document;
    await ctx.PUT(
        organizationItem(ctx, 'projects', id),
        { ...entity, state },
        latch,
    );
    projectChanges.notify();
}

// The current row's writable fields, read fresh so the
// domain ops below can overwrite whole-row without the
// caller ever holding the wire shape. The GET-stamped state
// is split out of the fields: a field edit sends the
// caller's state, a reorder keeps the head's. The head's
// message rides along too: a merge latches the head it
// merged.
async function projectRowFields(
    ctx: RequestContext,
    id: string,
): Promise<{
    fields: Omit<
        ProjectEntity,
        | 'id'
        | 'organization_id'
        | 'state'
    >;
    state: ProjectEntity['state'];
    read: HttpMessage<ProjectEntity>;
}> {
    const read = await ctx.GET<ProjectEntity>(
        organizationItem(ctx, 'projects', id),
    );
    const {
        id: _id,
        organization_id: _org,
        state,
        ...fields
    } = read.body().toValue();
    return { fields, state, read };
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

export async function putProjectFields(
    ctx: RequestContext,
    id: string,
    patch: ProjectFieldsPatch,
    state: ProjectState,
): Promise<void> {
    const { fields, read } = await projectRowFields(ctx, id);
    await putProject(ctx, id, {
        ...fields,
        title: patch.title,
        description: patch.description,
        start_date: patch.startDate,
        target_end_date: patch.targetEndDate,
        estimated_cost: patch.estimatedCost,
        state,
    }, [read]);
}

export async function putProjectPosition(
    ctx: RequestContext,
    id: string,
    position: number,
): Promise<void> {
    const { fields, state, read } =
        await projectRowFields(ctx, id);
    await putProject(ctx, id, {
        ...fields,
        position,
        state,
    }, [read]);
}

// State transition for an existing project: sends the new
// state and fires ONE document PUT via putProject — hop count
// 1 → 1 (today it is one PUT projects/:id). Callers supply the
// eight fields they already hold FROM RAW SOURCES ONLY — never
// from ProjectView's display-transformed accessors (see the
// DATA-CORRUPTION TRAP note on ProjectView). Entity fields
// only — strip any GET-stamped state at the call site before
// passing here.
export async function postProjectStateChange(
    ctx: RequestContext,
    id: string,
    fields: Omit<
        ProjectEntity,
        | 'id'
        | 'organization_id'
        | 'state'
    >,
    state: ProjectState,
): Promise<void> {
    await putProject(ctx, id, {
        ...fields,
        state,
    }, undefined);
}
