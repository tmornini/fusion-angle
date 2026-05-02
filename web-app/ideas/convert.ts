import {
    $, bindEnterToClick,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    buildSkeleton, buildErrorState,
} from '../app/loading-states.ts';
import {
    iconArrowRight, iconLoader,
} from '../app/icons.ts';
import { navigateTo } from '../app/core.ts';
import {
    getIdea,
    getManagedUsers,
    postActivity,
    postIdeaConversion,
    jsonObjectField,
    createFetchContext,
    generateCryptoSafeBase62,
    type IdeaEntity,
} from '../app/adapters/index.ts';
import {
    IdeaConversionPresenter,
    buildInitialConversionFields,
    conversionRequiredCount,
    conversionCompletedCount,
    conversionIsReady,
    conversionFieldIsReady,
    ALL_CONVERSION_FIELDS,
} from '../app/presenters/index.ts';
import type {
    ConversionField,
    ConversionFields,
} from '../app/presenters/index.ts';

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
    setHtml(
        root,
        buildSkeleton('detail', 4),
    );

    const ctx = createFetchContext();
    let tuple: Awaited<
        ReturnType<typeof getIdea>
    >;
    let users: Awaited<
        ReturnType<typeof getManagedUsers>
    >;
    try {
        [tuple, users] = await Promise.all([
            getIdea(ctx, ideaId),
            getManagedUsers(ctx),
        ]);
    } catch (err) {
        log.error(
            'getIdea or getManagedUsers'
            + ' failed',
            'ideas',
            err,
        );
        setHtml(
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
    const presenter:
        IdeaConversionPresenter =
        new IdeaConversionPresenter(
            tuple.idea,
            users,
            buildInitialConversionFields(
                tuple.idea,
            ),
        );

    function readFieldsFromDom(
    ): ConversionFields {
        const next =
            buildInitialConversionFields(
                tuple.idea,
            );
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
        return next;
    }

    function renderPage(): void {
        const container = $(
            '#convert-content',
            document,
        );
        if (!container) return;
        setHtml(
            container,
            presenter.render(),
        );
        bindEvents();
    }

    function mutateValidation(
        fields: ConversionFields,
    ): void {
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
                    mutateValidation(
                        readFieldsFromDom(),
                    );
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
                const submitted =
                    readFieldsFromDom();
                if (
                    !conversionIsReady(
                        submitted,
                    )
                ) return;
                const btn = $(
                    '#convert-submit-btn',
                    document,
                );
                if (!btn) return;
                setHtml(
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
                    generateCryptoSafeBase62();
                try {
                    await performConversion(
                        ctx,
                        ideaId,
                        projectId,
                        submitted,
                        tuple.entity,
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
                    setHtml(
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
                    submitted['project-name'];
                await postActivity(ctx, {
                    type: 'idea_converted',
                    action:
                        'converted idea to'
                        + ' project',
                    target: projectName,
                    status: '',
                    feedback: '',
                });
                await postActivity(ctx, {
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
    ctx: ReturnType<typeof createFetchContext>,
    ideaId: string,
    projectId: string,
    fields: ConversionFields,
    ideaEntity: IdeaEntity,
): Promise<void> {
    await postIdeaConversion(
        ctx,
        ideaId,
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
        fields['project-lead'],
        { ...ideaEntity, status: 'promoted' },
    );
}
