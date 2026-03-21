import { GET, PUT } from '../../../api/api';
import type {
    CrunchColumnEntity,
    CrunchColumnAcronymEntity,
    CrunchColumnAcronymLinkEntity,
    FlowEntity,
    FlowStepEntity,
    ProcessStepProcessEntity,
} from '../../../api/types';
import { parseJson } from './helpers';

export interface CrunchColumn {
    id: string;
    originalName: string;
    friendlyName: string;
    dataType: string;
    description: string;
    sampleValues: string[];
    isAcronym: boolean;
    acronymExpansion: string;
}

export async function getCrunchColumns(
): Promise<CrunchColumn[]> {
    const [rows, acronyms, links] =
        await Promise.all([
            GET<CrunchColumnEntity[]>(
                'crunch-columns',
            ),
            GET<CrunchColumnAcronymEntity[]>(
                'crunch-column-acronyms',
            ),
            GET<
                CrunchColumnAcronymLinkEntity[]
            >(
                'crunch-column'
                + '-acronym-links',
            ),
        ]);
    const acronymMap = new Map(
        acronyms.map(
            a => [a.id, a.expansion],
        ),
    );
    const linkByColumnId = new Map(
        links.map(
            l => [
                l.crunch_column_id,
                l.crunch_column_acronym_id,
            ],
        ),
    );
    return rows.map(row => {
        const acronymId =
            linkByColumnId.get(row.id);
        return {
            id: row.id,
            originalName: row.original_name,
            friendlyName: row.friendly_name,
            dataType: row.data_type,
            description: row.description,
            sampleValues:
                parseJson<string[]>(
                    row.sample_values,
                    [],
                ),
            isAcronym:
                acronymId !== undefined,
            acronymExpansion: acronymId
                ? acronymMap.get(acronymId)!
                : '',
        };
    });
}

export interface FlowListItem {
    id: string;
    name: string;
    description: string;
    department: string;
    stepsCount: number;
}

export async function getFlows(
): Promise<FlowListItem[]> {
    const [flows, links] =
        await Promise.all([
            GET<FlowEntity[]>('processes'),
            GET<ProcessStepProcessEntity[]>(
                'process-step-processes',
            ),
        ]);
    const linksByProcessId = Map.groupBy(
        links,
        link => link.process_id,
    );
    return flows.map(flow => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        department: flow.department,
        stepsCount:
            linksByProcessId.get(flow.id)
                ?.length ?? 0,
    }));
}

export interface FlowStep {
    id: string;
    title: string;
    description: string;
    owner: string;
    role: string;
    tools: string[];
    duration: string;
    sortOrder: number;
    type: 'action'
        | 'decision'
        | 'start'
        | 'end';
}

export interface Flow {
    name: string;
    description: string;
    department: string;
    steps: FlowStep[];
}

export async function getFlow(
    flowId: string,
): Promise<Flow> {
    const [flow, steps] = await Promise.all([
        GET<FlowEntity | undefined>(
            `processes/${flowId}`,
        ),
        GET<FlowStepEntity[]>(
            `processes/${flowId}/steps`,
        ),
    ]);
    if (!flow) {
        throw new Error(
            `Flow not found: ${flowId}`,
        );
    }

    return {
        name: flow.name,
        description: flow.description,
        department: flow.department,
        steps: steps.map(step => ({
            id: step.id,
            title: step.title,
            description: step.description,
            owner: step.owner,
            role: step.role,
            tools: parseJson<string[]>(
                step.tools,
                [],
            ),
            duration: step.duration,
            sortOrder: step.sort_order,
            type: step.type,
        })),
    };
}

export async function putFlow(
    id: string,
    entity: Partial<FlowEntity>,
): Promise<void> {
    await PUT(`processes/${id}`, entity);
}

export async function putFlowStep(
    flowId: string,
    stepId: string,
    entity: Partial<FlowStepEntity>,
): Promise<void> {
    await PUT(
        `processes/${flowId}`
            + `/steps/${stepId}`,
        entity,
    );
}
