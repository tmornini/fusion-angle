import {
    $, bindEnterToClick,
} from '../app/dom';
import {
    html, mutateHtml,
} from '../app/safe-html';
import { showToast } from '../app/toast';
import { log } from '../app/logger';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states';
import {
    iconArrowRight, iconLoader,
} from '../app/icons';
import { navigateTo } from '../app/core';
import {
    getIdea,
    getManagedUsers,
    getIdeaEntity,
    postActivity,
    putIdea,
    putProject,
    putProjectTeamMember,
    jsonObjectField,
    createFetchContext,
    generateId,
} from '../app/adapters';
import {
    IdeaConversionPresenter,
    buildInitialConversionFields,
    conversionRequiredCount,
    conversionCompletedCount,
    conversionIsReady,
    conversionFieldIsReady,
    ALL_CONVERSION_FIELDS,
} from '../app/presenters';
import type {
    ConversionField,
    ConversionFields,
} from '../app/presenters';

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const rawId = params?.['ideaId'];
    if (!rawId) {
        navigateTo('ideas');
        return;
    }
    const ideaId: string = rawId;

    const root = $(
        '#convert-content', document,
    );
    if (!root) return;
    mutateHtml(
        root,
        buildSkeleton('detail', 4),
    );

    let fields: ConversionFields;
    let presenter:
        IdeaConversionPresenter;
    try {
        const ctx = createFetchContext();
        const [idea, users] =
            await Promise.all([
                getIdea(ideaId, ctx),
                getManagedUsers(ctx),
            ]);
        fields =
            buildInitialConversionFields(idea);
        presenter =
            new IdeaConversionPresenter(
                idea,
                users,
                fields,
            );
    } catch (err) {
        log.error(
            'getIdea'
            + ' failed',
            'ideas',
            err,
        );
        mutateHtml(
            root,
            buildErrorState(
                'Failed to load idea'
                + ' for conversion.',
                'Try Again',
            ),
        );
        root.querySelector(
            '[data-retry-btn]',
        )?.addEventListener(
            'click',
            () => init(),
        );
        return;
    }

    function syncFormFields(): void {
        const next = {
            ...fields,
        } as ConversionFields;
        for (
            const field of ALL_CONVERSION_FIELDS
        ) {
            const el = $(
                `#convert-${field}`,
                document,
            );
            if (
                el instanceof
                    HTMLInputElement
                || el instanceof
                    HTMLSelectElement
                || el instanceof
                    HTMLTextAreaElement
            ) {
                next[field] =
                    el.value.trim();
            }
        }
        fields = next;
    }

    function renderPage(): void {
        const container = $(
            '#convert-content',
            document,
        );
        if (!container) return;
        mutateHtml(
            container,
            presenter.render(),
        );
        bindEvents();
    }

    function mutateValidation(): void {
        for (
            const field of ALL_CONVERSION_FIELDS
        ) {
            const chk = $(
                `#check-${field}`, document,
            );
            if (chk) {
                chk.style.display =
                    conversionFieldIsReady(
                        fields, field,
                    )
                        ? ''
                        : 'none';
            }
        }
        const count =
            conversionCompletedCount(fields);
        const total =
            conversionRequiredCount();
        const pct =
            (count / total) * 100;
        const pText = $(
            '#convert-progress-text',
            document,
        );
        if (pText) {
            pText.textContent =
                `${count}/${total}`
                + ' required fields';
        }
        const pFill = $(
            '#convert-progress-fill',
            document,
        );
        if (
            pFill instanceof
            HTMLElement
        ) {
            pFill.style.width =
                `${pct}%`;
        }
        const isReady =
            conversionIsReady(fields);
        const remaining =
            total - count;
        const section = $(
            '#convert-confirm-section',
            document,
        );
        if (
            section instanceof
            HTMLElement
        ) {
            section.style.border =
                '2px solid '
                + (isReady
                    ? 'hsl(var('
                        + '--success)'
                        + ' / 0.3)'
                    : 'transparent');
            section.style.background =
                isReady
                    ? 'hsl(var('
                        + '--success)'
                        + ' / 0.05)'
                    : '';
        }
        const icon = $(
            '#convert-confirm-icon',
            document,
        );
        if (
            icon instanceof
            HTMLElement
        ) {
            const bg = isReady
                ? 'background:'
                    + 'hsl(var('
                    + '--success));'
                    + 'color:'
                    + 'hsl(var('
                    + '--success-'
                    + 'foreground))'
                : 'background:'
                    + 'hsl(var('
                    + '--muted));'
                    + 'color:'
                    + 'hsl(var('
                    + '--muted-'
                    + 'foreground))';
            icon.setAttribute(
                'style',
                'width:3rem;'
                + 'height:3rem;'
                + 'border-radius:'
                + '0.75rem;'
                + 'display:flex;'
                + 'align-items:'
                + 'center;'
                + 'justify-content:'
                + 'center;'
                + bg,
            );
        }
        const heading = $(
            '#convert-confirm-heading',
            document,
        );
        if (heading) {
            heading.textContent =
                isReady
                    ? 'Ready to'
                        + ' Create'
                        + ' Project'
                    : 'Complete'
                        + ' Required'
                        + ' Fields';
        }
        const sub = $(
            '#convert-confirm-sub',
            document,
        );
        if (sub) {
            sub.textContent =
                isReady
                    ? 'All required'
                        + ' info has'
                        + ' been'
                        + ' provided.'
                        + ' Click below'
                        + ' to create'
                        + ' this'
                        + ' project.'
                    : `${remaining}`
                        + ' required'
                        + ' field'
                        + (remaining > 1
                            ? 's'
                            : '')
                        + ' remaining';
        }
        const btn = $(
            '#convert-submit-btn',
            document,
        );
        if (
            btn instanceof
            HTMLButtonElement
        ) {
            btn.disabled = !isReady;
        }
    }

    function bindEvents(): void {
        document
            .querySelectorAll<HTMLElement>(
                '.card input,'
                + ' .card select,'
                + ' .card textarea',
            )
            .forEach(el => {
                const handler = () => {
                    syncFormFields();
                    mutateValidation();
                };
                el.addEventListener(
                    'input', handler,
                );
                el.addEventListener(
                    'change', handler,
                );
            });

        const submitSel =
            '#convert-submit-btn';
        bindEnterToClick(
            '#convert-project-name',
            submitSel,
        );
        bindEnterToClick(
            '#convert-start-date',
            submitSel,
        );
        bindEnterToClick(
            '#convert-target-end-date',
            submitSel,
        );
        bindEnterToClick(
            '#convert-budget', submitSel,
        );
        bindEnterToClick(
            '#convert-impact', submitSel,
        );

        $(
            '#convert-submit-btn',
            document,
        )?.addEventListener(
            'click',
            async () => {
                syncFormFields();
                if (
                    !conversionIsReady(fields)
                ) return;
                const btn = $(
                    '#convert-submit-btn',
                    document,
                );
                if (!btn) return;
                mutateHtml(
                    btn,
                    html`${
                        iconLoader(16, '')
                    } Creating Project...`,
                );
                if (
                    btn instanceof
                    HTMLButtonElement
                ) {
                    btn.disabled = true;
                }

                const projectId =
                    generateId();
                try {
                    await performConversion(
                        ideaId,
                        projectId,
                        fields,
                    );
                } catch (err) {
                    log.error(
                        'performConversion'
                        + ' failed',
                        'ideas',
                        err,
                    );
                    showToast(
                        'Failed to create'
                        + ' project.'
                        + ' Please'
                        + ' try again.',
                        'error',
                    );
                    mutateHtml(
                        btn,
                        html`${'Create'
                            + ' Project'}
                            ${iconArrowRight(
                                16, '',
                            )}`,
                    );
                    if (
                        btn instanceof
                        HTMLButtonElement
                    ) {
                        btn.disabled =
                            false;
                    }
                    return;
                }
                const projectName =
                    fields['project-name'];
                await postActivity({
                    type: 'idea_converted',
                    action:
                        'converted idea to'
                        + ' project',
                    target: projectName,
                    status: '',
                    feedback: '',
                });
                await postActivity({
                    type: 'project_created',
                    action:
                        'created new project',
                    target: projectName,
                    status: '',
                    feedback: '',
                });
                showToast(
                    'Project created'
                    + ' successfully!',
                    'success',
                );
                navigateTo(
                    'project-detail',
                    { projectId },
                );
            },
        );

        const goBack =
            params?.['from'] === 'detail'
                ? () => navigateTo(
                    'idea-detail',
                    { ideaId },
                )
                : () => navigateTo(
                    'ideas',
                );
        $(
            '#convert-back-to-ideas',
            document,
        )?.addEventListener(
            'click', goBack,
        );
        $(
            '#convert-back-to-ideas-2',
            document,
        )?.addEventListener(
            'click', goBack,
        );
    }

    renderPage();
}

function parseFiniteNumber(
    field: string,
    value: string,
): number {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        throw new Error(
            `${field} must be a finite number,`
            + ` got ${JSON.stringify(value)}`,
        );
    }
    return n;
}

async function performConversion(
    ideaId: string,
    projectId: string,
    fields: ConversionFields,
): Promise<void> {
    const leadUserId =
        fields['project-lead'];
    await putProject(
        projectId,
        {
            title:
                fields['project-name'],
            description:
                fields['success-criteria'],
            status: 'submitted',
            progress: 0,
            start_date:
                fields['start-date'],
            target_end_date:
                fields['target-end-date'],
            estimated_duration: 0,
            actual_duration: 0,
            estimated_cost: parseFiniteNumber(
                'budget',
                fields['budget'],
            ),
            actual_cost: 0,
            estimated_impact: parseFiniteNumber(
                'impact',
                fields['impact'],
            ),
            actual_impact: 0,
            position: 0,
            business_context:
                jsonObjectField({}),
            timeline_label: '',
            budget_label:
                fields['budget'],
        },
    );
    await putProjectTeamMember({
        projectId,
        userId: leadUserId,
        role: 'lead',
        type: 'internal',
    });
    const existingIdea =
        await getIdeaEntity(ideaId);
    await putIdea(ideaId, {
        ...existingIdea,
        status: 'promoted',
    });
}
