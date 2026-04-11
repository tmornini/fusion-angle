import {
    $, bindEnterToClick,
} from '../app/dom';
import {
    html, setHtml,
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
    getIdeaForConversion,
    getManagedUsers,
    getIdea,
    putIdea,
    putProject,
    putProjectTeamMember,
    jsonObjectField,
} from '../app/adapters';
import {
    IdeaConversionPresenter,
} from '../app/presenters/idea-conversion';

type ConversionField =
    | 'project-name'
    | 'project-lead'
    | 'start-date'
    | 'target-end-date'
    | 'budget'
    | 'impact'
    | 'success-criteria';

const ALL_FIELDS:
    ConversionField[] = [
    'project-name',
    'project-lead',
    'start-date',
    'target-end-date',
    'budget',
    'impact',
    'success-criteria',
];

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

    let presenter:
        IdeaConversionPresenter;
    try {
        const [idea, users] =
            await Promise.all([
                getIdeaForConversion(
                    ideaId,
                ),
                getManagedUsers(),
            ]);
        presenter =
            new IdeaConversionPresenter(
                idea,
                users,
            );
    } catch (err) {
        log.error(
            'getIdeaForConversion'
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

    function syncFormFields(): void {
        const fields: Partial<Record<
            ConversionField, string
        >> = {};
        for (const field of ALL_FIELDS) {
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
                fields[field] =
                    el.value.trim();
            }
        }
        presenter.syncFields(fields);
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

    function mutateValidation(): void {
        for (
            const field of ALL_FIELDS
        ) {
            const chk =
                document.getElementById(
                    `check-${field}`,
                );
            if (chk) {
                chk.style.display =
                    presenter.fieldReady(
                        field,
                    )
                        ? ''
                        : 'none';
            }
        }
        const count =
            presenter.completedCount();
        const total =
            presenter.requiredCount();
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
            presenter.isReady();
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
                    !presenter.isReady()
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
                    crypto.randomUUID();
                try {
                    await performConversion(
                        ideaId,
                        projectId,
                        presenter
                            .projectDetails(),
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

async function performConversion(
    ideaId: string,
    projectId: string,
    pd: Record<string, string>,
): Promise<void> {
    const leadUserId =
        pd['project-lead']!;
    await putProject(
        projectId,
        {
            title:
                pd['project-name']!,
            description:
                pd[
                    'success-criteria'
                ]!,
            status: 'submitted',
            progress: 0,
            start_date:
                pd['start-date']!,
            target_end_date:
                pd[
                    'target-end-date'
                ]!,
            estimated_duration: 0,
            actual_duration: 0,
            estimated_cost:
                Number(
                    pd['budget']!,
                ) || 0,
            actual_cost: 0,
            estimated_impact:
                Number(
                    pd['impact']!,
                ) || 0,
            actual_impact: 0,
            position: 0,
            business_context:
                jsonObjectField({}),
            timeline_label: '',
            budget_label:
                pd['budget']!,
        },
    );
    await putProjectTeamMember({
        projectId,
        userId: leadUserId,
        role: 'lead',
        type: 'internal',
    });
    const existingIdea =
        await getIdea(ideaId);
    await putIdea(ideaId, {
        ...existingIdea,
        status: 'promoted',
    });
}
