import {
    $, $$, $textarea, $input, $select,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import {
    navigateTo, initTabs,
    SECONDS_PER_DAY,
} from '../app/core';
import {
    getProjectById, putProject,
    getWorkflowsByProject,
    postWorkflowCreation,
    ProjectView,
} from '../app/adapters';
import type {
    WorkflowListItem,
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
    workflows: WorkflowListItem[],
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
                workflows, true,
            ),
        );

    $('#project-cancel-btn', document)
        ?.addEventListener(
            'click',
            () => mutateProjectPage(
                project, projectId,
                workflows, false,
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
        const timeBaseline = Number(
                $input(
                    '#project-edit-time-baseline',
                    document,
                )!.value,
        );
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
                estimated_duration:
                    timeBaseline
                    * SECONDS_PER_DAY,
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
                getWorkflowsByProject(
                    projectId,
                ),
            ]);
        mutateProjectPage(
            updated, projectId,
            updatedWfs, false,
        );
    });

    $$('[data-navigate-to-engineering]', document)
        .forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(
                        'engineering-requirements',
                        { projectId },
                );
            });
        });

    initTabs('.tab[data-tab]', '.tab-panel', 'active');

    const comment = $textarea(
            '#project-discussion-comment', document,
    );
    const postBtn = $(
            '#project-discussion-post-btn', document,
    );
    comment?.addEventListener(
            'input',
            () => {
                if (
                    postBtn
                            instanceof HTMLButtonElement
                )
                    postBtn.disabled =
                            !comment.value.trim();
            },
    );
    postBtn?.addEventListener('click', () => {
        showToast(
                'Comment posted', 'success',
        );
        if (comment) comment.value = '';
        if (
            postBtn instanceof HTMLButtonElement
        )
            postBtn.disabled = true;
    });

    $('#new-workflow-btn', document)
        ?.addEventListener(
            'click',
            async () => {
                const wfId =
                    crypto.randomUUID();
                try {
                    await postWorkflowCreation(
                        {
                            workflowId: wfId,
                            projectId,
                            name:
                                'New Workflow',
                            description: '',
                        },
                    );
                } catch {
                    showToast(
                        'Failed to create'
                        + ' workflow',
                        'error',
                    );
                    return;
                }
                navigateTo(
                    'flow-detail',
                    { workflowId: wfId },
                );
            },
        );

    $$('[data-workflow-id]', document)
        .forEach(el => {
            el.addEventListener(
                'click',
                (e) => {
                    e.preventDefault();
                    const wfId =
                        el.getAttribute(
                            'data-workflow-id',
                        );
                    if (!wfId) return;
                    navigateTo(
                        'flow-detail',
                        { workflowId: wfId },
                    );
                },
            );
        });
}

function mutateProjectPage(
    project: ProjectView,
    projectId: string,
    workflows: WorkflowListItem[],
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
            projectId, workflows, isEditing,
        ),
    );
    bindProjectEvents(
        project, projectId,
        workflows, isEditing,
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
    let workflows: WorkflowListItem[];
    try {
        [project, workflows] =
            await Promise.all([
                getProjectById(projectId),
                getWorkflowsByProject(
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
        workflows, false,
    );
}
