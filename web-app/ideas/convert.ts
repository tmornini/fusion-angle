import {
    $, $$, $required, bindEnterToClick,
    isFormField,
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
    ICON_SIZE,
    iconArrowRight, iconLoader,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    getIdea,
    getProjectEntities,
    postIdeaConversion,
    createRequestContext,
    sessionContext,
    generateCryptoSafeBase62,
    type IdeaEntity,
} from '../app/adapters/index.ts';
import {
    getActiveObjectives,
    getCurrentObjectiveDefinitions,
} from '../app/adapters/objectives.ts';
import { MS_PER_DAY } from '../../api/types.ts';
import type {
    ObjectiveEntity,
    ObjectiveId,
} from '../../api/types.ts';
import {
    nextPosition,
} from '../app/drag-reorder-positions.ts';
import {
    IdeaConversionPresenter,
    buildInitialConversionDraft,
    conversionRequiredCount,
    conversionCompletedCount,
    conversionIsReady,
    conversionFieldIsReady,
    ALL_CONVERSION_FIELDS,
} from '../app/presenters/index.ts';
import type {
    ConversionDraft,
    ObjectiveDefinition,
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

    const root = $required(
        '#convert-content', document,
    );
    setHtml(
        root,
        buildSkeleton('detail', 4),
    );

    const ctx = sessionContext();
    // Two distinct error bodies preserved via allSettled:
    // idea chain vs objectives→defs chain.
    type IdeaTuple = Awaited<
        ReturnType<typeof getIdea>
    >;
    type ObjectivesBundle = {
        active: readonly ObjectiveEntity[];
        defs: ReadonlyMap<
            ObjectiveId, ObjectiveDefinition
        >;
    };
    const [ideaResult, objectivesResult] =
        await Promise.allSettled([
            getIdea(ctx, ideaId),
            (async (): Promise<ObjectivesBundle> => {
                const active =
                    await getActiveObjectives(ctx);
                const defs =
                    await getCurrentObjectiveDefinitions(
                        ctx,
                        active.map(o => o.id),
                    );
                return { active, defs };
            })(),
        ]);
    if (ideaResult.status === 'rejected') {
        log.error(
            'getIdea failed',
            'ideas',
            ideaResult.reason,
        );
        setHtml(
            root,
            buildErrorState(
                'Failed to load idea'
                + ' for conversion.',
                'Try Again',
            ),
        );
        $required(
            '[data-retry-btn]', root,
        ).addEventListener(
            'click',
            () => init(),
        );
        return;
    }
    if (objectivesResult.status === 'rejected') {
        log.error(
            'objectives load failed',
            'ideas',
            objectivesResult.reason,
        );
        setHtml(
            root,
            buildErrorState(
                'Failed to load organization'
                + ' objectives.',
                'Try Again',
            ),
        );
        $required(
            '[data-retry-btn]', root,
        ).addEventListener(
            'click',
            () => init(),
        );
        return;
    }
    const tuple: IdeaTuple = ideaResult.value;
    const activeObjectives =
        objectivesResult.value.active;
    const defs = objectivesResult.value.defs;

    const presenter:
        IdeaConversionPresenter =
        new IdeaConversionPresenter(
            tuple.idea,
            buildInitialConversionDraft(
                tuple.idea,
            ),
            activeObjectives,
            defs,
        );

    function readDraftFromDom(
    ): ConversionDraft {
        const next =
            buildInitialConversionDraft(
                tuple.idea,
            );
        for (
            const field of ALL_CONVERSION_FIELDS
        ) {
            const el = $(
                `#convert-${field}`,
                document,
            );
            if (isFormField(el)) {
                next.fields[field] =
                    el.value.trim();
            }
        }
        const baselines =
            new Map<ObjectiveId, number>();
        $$(
            '#convert-scores-section'
            + ' .baseline-slider',
            document,
        ).forEach(slider => {
            if (
                !(slider instanceof
                    HTMLInputElement)
            ) return;
            const row = slider.closest(
                '.convert-scores-row',
            );
            if (!row) return;
            const objId =
                slider.dataset['objectiveId'];
            if (!objId) return;
            const touched = row.getAttribute(
                'data-touched',
            );
            if (touched !== 'true') return;
            const v = Number(slider.value);
            if (Number.isFinite(v)) {
                baselines.set(objId, v);
            }
        });
        return {
            fields: next.fields,
            baselines,
        };
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
        draft: ConversionDraft,
    ): void {
        for (
            const field of ALL_CONVERSION_FIELDS
        ) {
            const chk = $(
                `#check-${field}`, document,
            );
            if (chk) {
                chk.setAttribute(
                    'data-ready',
                    conversionFieldIsReady(
                        draft, field,
                    )
                        ? 'true'
                        : 'false',
                );
            }
        }
        for (const obj of activeObjectives) {
            const chk = $(
                `#check-baseline-${obj.id}`,
                document,
            );
            if (chk) {
                chk.setAttribute(
                    'data-ready',
                    draft.baselines.has(obj.id)
                        ? 'true'
                        : 'false',
                );
            }
        }
        const count =
            conversionCompletedCount(draft);
        const total =
            conversionRequiredCount(
                activeObjectives.length,
            );
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
            pFill.style.setProperty(
                '--convert-progress',
                `${pct}%`,
            );
        }
        const isReady =
            conversionIsReady(
                draft, activeObjectives,
            );
        const remaining =
            total - count;
        const section = $(
            '#convert-confirm-section',
            document,
        );
        if (section) {
            section.setAttribute(
                'data-ready',
                isReady ? 'true' : 'false',
            );
        }
        const icon = $(
            '#convert-confirm-icon',
            document,
        );
        if (icon) {
            icon.setAttribute(
                'data-ready',
                isReady ? 'true' : 'false',
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
        $$(
            '.card input,'
            + ' .card select,'
            + ' .card textarea',
            document,
        )
            .forEach(el => {
                const handler = () => {
                    mutateValidation(
                        readDraftFromDom(),
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
            submitSel, document,
        );
        bindEnterToClick(
            '#convert-time-days', submitSel,
            document,
        );
        bindEnterToClick(
            '#convert-cost', submitSel,
            document,
        );

        const scoresSection = $(
            '#convert-scores-section',
            document,
        );
        if (scoresSection) {
            scoresSection.addEventListener(
                'input',
                (e) => {
                    const target =
                        e.target as HTMLElement;
                    if (!target.matches(
                        '.baseline-slider',
                    )) return;
                    const row = target.closest(
                        '.convert-scores-row',
                    );
                    if (!row) return;
                    const valueEl = $(
                        '.slider-value', row,
                    );
                    if (valueEl) {
                        const v = Number(
                            (target as
                                HTMLInputElement)
                                .value,
                        );
                        const sign =
                            v > 0 ? '+' : '';
                        valueEl.textContent =
                            sign + String(v);
                    }
                    row.setAttribute(
                        'data-touched', 'true',
                    );
                    mutateValidation(
                        readDraftFromDom(),
                    );
                },
            );
        }

        $(
            '#convert-open-organization',
            document,
        )?.addEventListener(
            'click',
            () => navigateTo('organization'),
        );

        $required(
            '#convert-submit-btn',
            document,
        ).addEventListener(
            'click',
            async () => {
                const submitted =
                    readDraftFromDom();
                if (
                    !conversionIsReady(
                        submitted,
                        activeObjectives,
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
                        iconLoader(ICON_SIZE.base, '')
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
                        activeObjectives,
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
                                ICON_SIZE.base, '',
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
        $required(
            '#convert-back-to-ideas',
            document,
        ).addEventListener(
            'click', goBack,
        );
        $required(
            '#convert-back-to-ideas-2',
            document,
        ).addEventListener(
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

function isoDateOnly(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

async function performConversion(
    ctx: ReturnType<typeof createRequestContext>,
    ideaId: string,
    projectId: string,
    draft: ConversionDraft,
    ideaEntity: IdeaEntity,
    activeObjectives: readonly ObjectiveEntity[],
): Promise<void> {
    const fields = draft.fields;
    const projects = await getProjectEntities(ctx);
    const position = nextPosition(
        projects.map(p => p.position),
    );
    const days = parseFiniteNumber(
        'time-days', fields['time-days'],
    );
    const startMs = Date.now();
    const endMs = startMs + days * MS_PER_DAY;
    const baselines = Array.from(
        draft.baselines.entries(),
        ([objectiveId, score]) => ({
            objectiveId, score,
        }),
    );
    // Strip server-stamped keys: postIdeaConversion's
    // promotedIdea is entity fields only (no id, org, or GET
    // lifecycle trio). Passing the full entity through a
    // variable bypasses excess-property checks and 400s at
    // the validator.
    const {
        id: _id,
        organization_id: _organizationId,
        state: _state,
        ...promotedIdea
    } = ideaEntity;
    void _id;
    void _organizationId;
    void _state;
    await postIdeaConversion(
        ctx,
        ideaId,
        projectId,
        {
            title:
                fields['project-name'],
            description:
                fields['success-criteria'],
            progress: 0,
            start_date: isoDateOnly(startMs),
            target_end_date: isoDateOnly(endMs),
            estimated_cost: parseFiniteNumber(
                'cost',
                fields['cost'],
            ),
            actual_cost: 0,
            position,
        },
        'submitted',
        promotedIdea,
        baselines,
        activeObjectives.map(o => o.id),
    );
}
