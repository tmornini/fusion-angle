import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import {
    iconClock,
    iconDollarSign,
    iconGripVertical,
    iconCheckCircle2,
    iconXCircle,
    iconLightbulb,
    iconClipboardCheck,
    iconArrowLeft,
    iconTrendingUp,
} from '../icons.ts';
import {
    toggleStatusFilter,
} from './list-filter.ts';
import {
    type Project,
    type ProjectState,
    PROJECT_STATE_CONFIG,
    COST_DIVISOR,
    MS_PER_DAY,
} from '../adapters/index.ts';
import {
    orderedKeys,
} from './ordered-keys.ts';
import {
    formatSigned, toneForScore,
} from '../scoring-format.ts';
import { DISPLAY_ABSENT } from '../format.ts';

type ScoreRow = {
    projectId: string;
    baselineAvg: number | undefined;
    latestActualAvg: number | undefined;
    baselineCount: number;
    totalActiveObjectives: number;
};

const STATE_ICONS: Record<
    ProjectState,
    (
        size: number,
        cssClass: string,
    ) => SafeHtml
> = {
    'submitted': iconClock,
    'under-review': iconClipboardCheck,
    'sent-back': iconArrowLeft,
    'approved': iconCheckCircle2,
    'declined': iconXCircle,
    'completed': iconLightbulb,
    'deleted': iconXCircle,
};

export class ProjectPresenter {
    readonly #project: Project;

    constructor(project: Project) {
        this.#project = project;
    }

    idForLink(): string {
        return this.#project.idForLink();
    }

    positionSortKey(): number {
        return this.#project
            .positionSortKey();
    }

    stateGroup(): ProjectState {
        return this.#project
            .stateValue();
    }

    buildStateBadge(
        isActive: boolean | null,
    ): SafeHtml {
        const s =
            this.#project.stateValue();
        const cfg =
            PROJECT_STATE_CONFIG[s]!;
        const icon = STATE_ICONS[s]!;
        const dimmed = isActive === false
            ? 'true'
            : 'false';
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs badge-fixed-w'
            + ' cursor-pointer'
        }" data-state="${s}" data-dimmed="${
            dimmed
        }">${
            icon(14, '')
        } ${cfg.label}</span>`;
    }

    buildCard(
        view: string,
        showGrip: boolean,
        score?: ScoreRow,
    ): SafeHtml {
        const stateIcon = STATE_ICONS[
            this.#project.stateValue()
        ]!;
        return html`
    <div class="card card-hover p-5"
        data-project-card="${
            this.#project.idForLink()
        }"
        data-position="${
            this.#project.positionSortKey()
        }">
        <div class="${
            'flex items-center gap-4'
        }">
            ${showGrip ? html`<div class="${
                'hidden-mobile text-muted'
                + ' drag-handle'
            }">${
                iconGripVertical(20, '')
            }</div>` : html``}
            <div class="flex-fill">
                <h3 class="${
                    'font-display '
                    + 'font-semibold truncate'
                }">${
                    this.#project
                        .titleText()
                }</h3>
                <span class="${
                    'badge '
                    + this.#project
                        .stateClassName()
                    + ' text-xs'
                    + ' badge-fixed-w mt-1'
                }">${
                    stateIcon(
                        14, '',
                    )
                } ${
                    this.#project
                        .stateLabel()
                }</span>
            </div>
            ${this.#buildMetrics(score)}
            ${this.#buildScoreCell(score)}
            ${this.#buildProgressRing()}
        </div>
    </div>`;
    }

    #buildScoreCell(
        score: ScoreRow | undefined,
    ): SafeHtml {
        const projected = score?.baselineAvg;
        const hasScore = projected !== undefined;
        const tone = hasScore
            ? toneForScore(projected)
            : 'muted';
        const display = hasScore
            ? formatSigned(projected)
            : DISPLAY_ABSENT;
        return html`
    <div class="projected-impact-cell"
        data-score-present="${hasScore}"
        data-score-value="${
            hasScore ? projected : ''
        }">
        <strong data-tone="${tone}">${
            display
        }</strong>${score ? html`
        <span class="meta">${
            score.baselineCount
        }/${
            score.totalActiveObjectives
        }</span>` : html``}
    </div>`;
    }

    #buildProgressRing(): SafeHtml {
        const percent = this.#project.timelineProgress();
        const radius = 20;
        const center = 24;
        const circumference =
            2 * Math.PI * radius;
        return html`
    <div class="progress-ring">
        <svg width="48" height="48"
            class="progress-ring-svg">
            <circle
                cx="${center}"
                cy="${center}"
                r="${radius}"
                stroke="${
                    'hsl(var(--muted))'
                }"
                stroke-width="4"
                fill="none"/>
            <circle
                cx="${center}"
                cy="${center}"
                r="${radius}"
                stroke="${
                    'hsl(var(--primary))'
                }"
                stroke-width="4"
                fill="none"
                stroke-dasharray="${
                    percent
                    * circumference / 100
                } ${circumference}"/>
        </svg>
        <span class="progress-ring-text"
            >${percent}%</span>
    </div>`;
    }

    #buildMetrics(score?: ScoreRow): SafeHtml {
        const project = this.#project;
        const startDateMs = new Date(
            project.startDateValue(),
        ).getTime();
        const endDateMs = new Date(
            project.targetEndDateValue(),
        ).getTime();
        const timeBaseline =
            isNaN(startDateMs) || isNaN(endDateMs)
                ? 0
                : Math.max(0, Math.ceil(
                    (endDateMs - startDateMs)
                    / MS_PER_DAY,
                ));
        const timeElapsed = isNaN(startDateMs)
            ? 0
            : Math.max(0, Math.floor(
                (Date.now() - startDateMs)
                / MS_PER_DAY,
            ));
        const costBaseline =
            project.estimatedCostAmount()
            / COST_DIVISOR;
        const costActual =
            project.actualCostAmount()
            / COST_DIVISOR;
        const impactBaseline = score?.baselineAvg;
        const impactActual = score?.latestActualAvg;
        const metricLabelClasses = 'text-xs text-muted';
        return html`
    <div class="project-metric-grid">
        <div class="${
            'flex items-center gap-2'
        }">
            <div class="metric-icon-box">${
                iconClock(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${
                    metricLabelClasses
                }">Time</p>
                <p class="${
                    'text-sm font-medium'
                }">${timeBaseline
                    ? html`${timeElapsed}d <span
                        class="${metricLabelClasses}"
                        >/ ${timeBaseline}d</span>`
                    : html`&mdash;`
                }</p>
            </div>
        </div>
        <div class="${
            'flex items-center gap-2'
        }">
            <div class="metric-icon-box">${
                iconDollarSign(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${
                    metricLabelClasses
                }">Cost</p>
                <p class="${
                    'text-sm font-medium'
                }">${costBaseline
                    ? html`${'$' + costActual}k
                        <span class="${
                            metricLabelClasses
                        }">/ ${'$'
                        + costBaseline}k</span>`
                    : html`&mdash;`
                }</p>
            </div>
        </div>
        <div class="${
            'flex items-center gap-2'
        }">
            <div class="metric-icon-box">${
                iconTrendingUp(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${
                    metricLabelClasses
                }">Impact</p>
                <p class="${
                    'text-sm font-medium'
                }">${impactBaseline !== undefined
                    ? html`${impactActual ?? '—'}
                        <span class="${
                            metricLabelClasses
                        }">/ ${impactBaseline} pts</span>`
                    : html`&mdash;`
                }</p>
            </div>
        </div>
    </div>`;
    }
}

export type ProjectListFilter =
    | { kind: 'all' }
    | { kind: 'filtered'; status: ProjectState };

export type ProjectListSort =
    | { kind: 'position' }
    | { kind: 'projected-impact-desc' };

export type ProjectListState = {
    projects: Project[];
    filter: ProjectListFilter;
    sort: ProjectListSort;
};

export function buildInitialProjectListState(
    projects: Project[],
): ProjectListState {
    return {
        projects,
        filter: { kind: 'all' },
        sort: { kind: 'position' },
    };
}

export function applyProjectListUpdate(
    state: ProjectListState,
    projects: Project[],
): ProjectListState {
    return { ...state, projects };
}

export function applyProjectFilterToggle(
    listState: ProjectListState,
    projectState: ProjectState,
): ProjectListState {
    const next: ProjectListFilter =
        toggleStatusFilter(
            listState.filter, projectState,
        );
    return { ...listState, filter: next };
}

export function applyProjectSortToggle(
    state: ProjectListState,
): ProjectListState {
    const next: ProjectListSort =
        state.sort.kind === 'position'
            ? { kind: 'projected-impact-desc' }
            : { kind: 'position' };
    return { ...state, sort: next };
}

export class ProjectListPresenter {
    #projects: ProjectPresenter[];
    #filter: ProjectListFilter;
    #sort: ProjectListSort;
    readonly #scoreMap: ReadonlyMap<
        string, ScoreRow
    >;

    constructor(
        state: ProjectListState,
        scoreMap: ReadonlyMap<
            string, ScoreRow
        > = new Map(),
    ) {
        this.#projects = state.projects.map(
            p => new ProjectPresenter(p),
        );
        this.#filter = state.filter;
        this.#sort = state.sort;
        this.#scoreMap = scoreMap;
    }

    activeFilter():
        ProjectState | null {
        return this.#filter.kind
            === 'filtered'
            ? this.#filter.status
            : null;
    }

    activeSort(): ProjectListSort {
        return this.#sort;
    }

    renderBadges(
        container: HTMLElement,
    ): void {
        setHtml(
            container, this.#buildBadges(),
        );
    }

    renderSortControls(
        container: HTMLElement,
    ): void {
        setHtml(
            container, this.#buildSortToggle(),
        );
    }

    renderList(
        container: HTMLElement,
    ): void {
        setHtml(container, this.#buildList());
    }

    #buildBadges(): SafeHtml {
        const active = this.activeFilter();
        const groups = Object.groupBy(
            this.#projects,
            p => p.stateGroup(),
        );
        const order: ProjectState[] = [
            'completed', 'under-review',
            'sent-back', 'approved',
        ];
        const badges = orderedKeys(
            groups, order,
        )
            .map(s => ({
                status: s,
                items: groups[s],
            }))
            .filter(
                g => g.items
                    && g.items.length > 0,
            )
            .map(g => g.items![0]!
                .buildStateBadge(
                    active === null
                        ? null
                        : g.status === active,
                ));
        return html`${badges}`;
    }

    #buildList(): SafeHtml {
        const f = this.#filter;
        const filtered =
            f.kind === 'filtered'
                ? this.#projects.filter(
                    p => p.stateGroup()
                        === f.status,
                )
                : this.#projects;
        const sorted = this.#sortProjects(filtered);
        const hasGrip =
            f.kind === 'all'
            && this.#sort.kind === 'position';
        return html`${sorted.map(
            p => p.buildCard(
                'position',
                hasGrip,
                this.#scoreMap.get(
                    p.idForLink(),
                ),
            ),
        )}`;
    }

    #sortProjects(
        items: ProjectPresenter[],
    ): ProjectPresenter[] {
        if (this.#sort.kind === 'position') {
            return [...items].sort(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            );
        }
        const scoreOf = (
            p: ProjectPresenter,
        ): number | undefined =>
            this.#scoreMap.get(
                p.idForLink(),
            )?.baselineAvg;
        return [...items].sort((a, b) => {
            const av = scoreOf(a);
            const bv = scoreOf(b);
            if (av === undefined && bv === undefined) {
                return a.positionSortKey()
                    - b.positionSortKey();
            }
            if (av === undefined) return 1;
            if (bv === undefined) return -1;
            if (av !== bv) return bv - av;
            return a.positionSortKey()
                - b.positionSortKey();
        });
    }

    #buildSortToggle(): SafeHtml {
        const active =
            this.#sort.kind
            === 'projected-impact-desc';
        return html`<button type="button"
            class="badge badge-default
                cursor-pointer text-xs
                badge-fixed-w"
            data-sort-toggle="projected-impact-desc"
            aria-pressed="${active}"
            data-active="${active}">${
                active
                    ? 'Most impactful first ↓'
                    : 'Sort by projected impact'
            }</button>`;
    }
}
