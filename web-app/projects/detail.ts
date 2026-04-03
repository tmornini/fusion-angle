import {
    $, $$, $textarea, $input, $select,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import {
    navigateTo,
} from '../app/core';
import {
    getProjectById, putProject,
    getFlowsByProject,
    postFlowCreation,
    ProjectView,
} from '../app/adapters';
import type {
    FlowListItem,
} from '../app/adapters';
import {
    ProjectDetailPresenter,
} from '../app/presenters';
import {
    isProjectStatus,
    type ProjectStatus,
    COST_DIVISOR,
} from '../../api/types';

function bindProjectEvents(
    project: ProjectView,
    projectId: string,
    flows: FlowListItem[],
    isEditing: boolean,
): void {
    $('#project-back-btn', document)
        ?.addEventListener(
                'click',
                () => navigateTo('projects'),
        );

    $('#project-edit-btn', document)
        ?.addEventListener(
            'click',
            () => mutateProjectPage(
                project, projectId,
                flows, true,
            ),
        );

    $('#project-cancel-btn', document)
        ?.addEventListener(
            'click',
            () => mutateProjectPage(
                project, projectId,
                flows, false,
            ),
        );

    $('#project-save-btn', document)
        ?.addEventListener(
                'click',
                async () => {
        const title =
                $input(
                    '#project-edit-title',
                    document,
                )!.value;
        const description =
                $textarea(
                    '#project-edit-description',
                    document,
                )!.value;
        const statusValue =
                $select(
                    '#project-edit-status',
                    document,
                )!.value;
        const status: ProjectStatus =
                isProjectStatus(statusValue)
                        ? statusValue
                        : project.status;
        const startDate =
                $input(
                    '#project-edit-start-date',
                    document,
                )!.value;
        const targetEndDate =
                $input(
                    '#project-edit-end-date',
                    document,
                )!.value;
            const costBaseline = Number(
                $input(
                    '#project-edit-cost-baseline',
                    document,
                )!.value,
        );
        const impactBaseline = Number(
                $input(
                    '#project-edit-impact-baseline',
                    document,
                )!.value,
        );
        try {
            await putProject(projectId, {
                title,
                description,
                status,
                start_date: startDate,
                target_end_date:
                    targetEndDate,
                estimated_cost:
                    costBaseline
                    * COST_DIVISOR,
                estimated_impact:
                    impactBaseline,
            });
        } catch {
            showToast(
                'Failed to save project',
                'error',
            );
            return;
        }
        showToast(
            'Project saved', 'success',
        );
        const [updated, updatedWfs] =
            await Promise.all([
                getProjectById(projectId),
                getFlowsByProject(
                    projectId,
                ),
            ]);
        mutateProjectPage(
            updated, projectId,
            updatedWfs, false,
        );
    });

    $('#new-flow-btn', document)
        ?.addEventListener(
            'click',
            async () => {
                const wfId =
                    crypto.randomUUID();
                try {
                    await postFlowCreation(
                        {
                            flowId: wfId,
                            projectId,
                            name:
                                'New Flow',
                            description: '',
                        },
                    );
                } catch {
                    showToast(
                        'Failed to create'
                        + ' flow',
                        'error',
                    );
                    return;
                }
                navigateTo(
                    'flow-detail',
                    { flowId: wfId },
                );
            },
        );

    $$('[data-flow-id]', document)
        .forEach(el => {
            el.addEventListener(
                'click',
                (e) => {
                    e.preventDefault();
                    const wfId =
                        el.getAttribute(
                            'data-flow-id',
                        );
                    if (!wfId) return;
                    navigateTo(
                        'flow-detail',
                        { flowId: wfId },
                    );
                },
            );
        });
}

function mutateProjectPage(
    project: ProjectView,
    projectId: string,
    flows: FlowListItem[],
    isEditing: boolean,
): void {
    const container = $(
        '#project-detail-content', document,
    );
    if (!container) return;
    const presenter =
        new ProjectDetailPresenter(project);
    setHtml(
        container,
        presenter.buildDetailView(
            projectId, flows, isEditing,
        ),
    );
    bindProjectEvents(
        project, projectId,
        flows, isEditing,
    );
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const projectId = params?.projectId;
    if (!projectId) { navigateTo('projects'); return; }

    const container = $(
            '#project-detail-content', document,
    );
    if (!container) return;
    setHtml(
            container,
            buildSkeleton('detail', 4),
    );

    let project: ProjectView;
    let flows: FlowListItem[];
    try {
        [project, flows] =
            await Promise.all([
                getProjectById(projectId),
                getFlowsByProject(
                    projectId,
                ),
            ]);
    } catch {
        setHtml(
                container,
                buildErrorState(
                        'Failed to load project'
                        + ' details. The project'
                        + ' may not exist.',
                        'Try Again',
                ),
        );
        container
            .querySelector('[data-retry-btn]')
            ?.addEventListener(
                    'click',
                    () => init(params),
            );
        return;
    }

    mutateProjectPage(
        project, projectId,
        flows, false,
    );
}
