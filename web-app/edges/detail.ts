import {
    $, $$, $textarea, $select, $input, attr,
} from '../app/dom';
import { setHtml } from '../app/safe-html';
import { showToast } from '../app/toast';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states';
import { navigateTo } from '../app/core';
import {
    getIdeaForEdge, getEdgeDataByIdeaId,
    putEdge, putEdgeOutcome, putEdgeMetric,
    type EdgeData,
} from '../app/adapters';
import {
    EdgeDetailPresenter,
} from '../app/presenters';

async function persistEdgeData(
    ideaId: string,
    edgeData: EdgeData,
): Promise<void> {
    const edge = await putEdge(
        ideaId,
        {
            confidence:
                edgeData.confidence,
            impact_short_term:
                edgeData.impact.shortTerm,
            impact_mid_term:
                edgeData.impact.midTerm,
            impact_long_term:
                edgeData.impact.longTerm,
            status: 'complete',
        },
    );
    await Promise.all(
        edgeData.outcomes.map(
            async outcome => {
                await putEdgeOutcome(
                    edge.id,
                    outcome.id,
                    {
                        description:
                            outcome
                                .description,
                    },
                );
                await Promise.all(
                    outcome.metrics.map(
                        metric =>
                            putEdgeMetric(
                                edge.id,
                                outcome.id,
                                metric.id,
                                {
                                    name:
                                        metric
                                        .name,
                                    target:
                                        metric
                                        .target,
                                    unit:
                                        metric
                                        .unit,
                                    current:
                                        metric
                                        .current,
                                },
                            ),
                    ),
                );
            },
        ),
    );
}

function readFormData(
): {
    confidence: string | undefined;
    owner: string | undefined;
    shortTerm: string | undefined;
    midTerm: string | undefined;
    longTerm: string | undefined;
    outcomes: Array<{
        id: string;
        description: string;
        metrics: Array<{
            id: string;
            name: string;
            target: string;
            unit: string;
            current: string;
        }>;
    }> | undefined;
} {
    const confSelect = $select(
        '#edge-confidence-select',
        document,
    );
    const ownerInput = $input(
        '#edge-owner-input',
        document,
    );
    const shortTermEl = $textarea(
        '#edge-impact-short-term',
        document,
    );
    const midTermEl = $textarea(
        '#edge-impact-mid-term',
        document,
    );
    const longTermEl = $textarea(
        '#edge-impact-long-term',
        document,
    );
    const outcomeMap =
        new Map<string, {
            id: string;
            description: string;
            metrics: Map<string, {
                id: string;
                name: string;
                target: string;
                unit: string;
                current: string;
            }>;
        }>();
    document
        .querySelectorAll<HTMLInputElement>(
            '[data-outcome-description]',
        ).forEach(el => {
            const oid = attr(
                el,
                'data-outcome-description',
            );
            outcomeMap.set(oid, {
                id: oid,
                description: el.value,
                metrics: new Map(),
            });
        });
    document
        .querySelectorAll<HTMLInputElement>(
            '[data-metric-field]',
        ).forEach(el => {
            const oid = attr(
                el, 'data-outcome-id',
            );
            const mid = attr(
                el, 'data-metric-id',
            );
            const field = attr(
                el, 'data-metric-field',
            );
            const outcome =
                outcomeMap.get(oid);
            if (!outcome) return;
            const existing =
                outcome.metrics.get(mid)
                ?? {
                    id: mid,
                    name: '',
                    target: '',
                    unit: '',
                    current: '',
                };
            existing[
                field as keyof
                    typeof existing
            ] = el.value;
            outcome.metrics.set(
                mid, existing,
            );
        });
    const outcomes = [
        ...outcomeMap.values(),
    ].map(o => ({
        id: o.id,
        description: o.description,
        metrics: [
            ...o.metrics.values(),
        ],
    }));
    return {
        confidence:
            confSelect?.value,
        owner:
            ownerInput?.value,
        shortTerm:
            shortTermEl?.value,
        midTerm:
            midTermEl?.value,
        longTerm:
            longTermEl?.value,
        outcomes:
            outcomes.length > 0
                ? outcomes
                : undefined,
    };
}

function syncPresenter(
    presenter: EdgeDetailPresenter,
): void {
    presenter.syncFromForm(readFormData());
}

function mutateEdgePage(
    ideaId: string,
    presenter: EdgeDetailPresenter,
) {
    const container = $(
        '#edge-content', document,
    );
    if (!container) return;
    setHtml(
        container,
        presenter.buildDetailView(
            ideaId,
        ),
    );
    bindEdgeEvents(ideaId, presenter);
}

function bindEdgeEvents(
    ideaId: string,
    presenter: EdgeDetailPresenter,
) {
    $('#edge-back-btn', document)
        ?.addEventListener(
            'click',
            () => navigateTo('ideas'),
        );

    $('#edge-add-outcome', document)
        ?.addEventListener(
            'click',
            () => {
                syncPresenter(presenter);
                presenter.addOutcome();
                mutateEdgePage(
                    ideaId, presenter,
                );
            },
        );

    $$('[data-add-template]', document)
        .forEach(
            templateButton => {
                templateButton
                    .addEventListener(
                        'click',
                        () => {
                            syncPresenter(
                                presenter,
                            );
                            presenter
                                .addOutcome(
                                    attr(
                                        templateButton,
                                        'data-add'
                                        + '-template',
                                    ),
                                );
                            mutateEdgePage(
                                ideaId,
                                presenter,
                            );
                        },
                    );
            },
        );

    $$('[data-remove-outcome]', document)
        .forEach(
            removeButton => {
                removeButton
                    .addEventListener(
                        'click',
                        () => {
                            syncPresenter(
                                presenter,
                            );
                            const removeId =
                                attr(
                                    removeButton,
                                    'data-remove'
                                    + '-outcome',
                                );
                            presenter
                                .removeOutcome(
                                    removeId,
                                );
                            mutateEdgePage(
                                ideaId,
                                presenter,
                            );
                        },
                    );
            },
        );

    $$('[data-add-metric]', document)
        .forEach(
            addButton => {
                addButton
                    .addEventListener(
                        'click',
                        () => {
                            syncPresenter(
                                presenter,
                            );
                            const oid =
                                attr(
                                    addButton,
                                    'data-add'
                                    + '-metric',
                                );
                            presenter
                                .addMetric(
                                    oid,
                                );
                            mutateEdgePage(
                                ideaId,
                                presenter,
                            );
                        },
                    );
            },
        );

    $$(
        '[data-action="remove-metric"]',
        document,
    ).forEach(
        removeButton => {
            removeButton
                .addEventListener(
                    'click',
                    () => {
                        syncPresenter(
                            presenter,
                        );
                        const oid =
                            attr(
                                removeButton,
                                'data-'
                                + 'outcome'
                                + '-id',
                            );
                        const mid =
                            attr(
                                removeButton,
                                'data-'
                                + 'metric'
                                + '-id',
                            );
                        presenter
                            .removeMetric(
                                oid, mid,
                            );
                        mutateEdgePage(
                            ideaId,
                            presenter,
                        );
                    },
                );
        },
    );

    const saveBtn =
        document
            .querySelector<HTMLButtonElement>(
                '#edge-save-btn',
            );
    saveBtn?.addEventListener(
        'click',
        async () => {
            syncPresenter(presenter);
            if (
                !presenter
                    .computeCompletion()
                    .isComplete
            ) {
                showToast(
                    'Please complete all'
                    + ' required fields',
                    'error',
                );
                return;
            }
            saveBtn.disabled = true;
            saveBtn.textContent =
                'Saving...';
            try {
                await persistEdgeData(
                    ideaId,
                    presenter
                        .getEdgeDataForSave(),
                );
            } catch {
                showToast(
                    'Failed to save'
                    + ' Edge data',
                    'error',
                );
                saveBtn.disabled = false;
                saveBtn.textContent =
                    'Save & Continue';
                return;
            }
            showToast(
                'Edge data saved'
                + ' successfully',
                'success',
            );
            navigateTo(
                'approval-detail',
                { id: ideaId },
            );
        },
    );
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const ideaId = params?.ideaId;
    if (!ideaId) {
        navigateTo('ideas');
        return;
    }
    const container = $(
        '#edge-content', document,
    );
    if (!container) return;

    const idea = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => getIdeaForEdge(ideaId),
        () => init(params),
    );
    if (!idea) return;

    const saved =
        await getEdgeDataByIdeaId(ideaId);
    const edgeData: EdgeData =
        saved && saved.outcomes.length > 0
            ? {
                outcomes: saved.outcomes,
                impact: saved.impact,
                confidence:
                    saved.confidence,
                owner: saved.owner,
            }
            : {
                outcomes: [],
                impact: {
                    shortTerm: '',
                    midTerm: '',
                    longTerm: '',
                },
                confidence: 'medium',
                owner: '',
            };
    const presenter =
        new EdgeDetailPresenter(
            edgeData, idea,
        );
    mutateEdgePage(ideaId, presenter);
}
