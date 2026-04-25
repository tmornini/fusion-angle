import {
    html, setHtml, SafeHtml,
} from '../safe-html';
import {
    iconClock,
    iconDollarSign,
    iconTrendingUp,
    iconGripVertical,
    iconCheckCircle2,
    iconXCircle,
    iconLightbulb,
    iconClipboardCheck,
    iconArrowLeft,
} from '../icons';
import {
    type Project,
    type ProjectStatus,
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
    MS_PER_DAY,
} from '../adapters';
import {
    orderedKeys,
} from './ordered-keys';

const STATUS_ICONS: Record<
    ProjectStatus,
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

    statusGroup(): ProjectStatus {
        return this.#project
            .statusValue();
    }

    buildStatusBadge(
        isActive: boolean | null,
    ): SafeHtml {
        const s =
            this.#project.statusValue();
        const cfg =
            PROJECT_STATUS_CONFIG[s]!;
        const icon = STATUS_ICONS[s]!;
        const dimmed = isActive === false
            ? 'true'
            : 'false';
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs badge-fixed-w'
            + ' cursor-pointer'
        }" data-status="${s}" data-dimmed="${
            dimmed
        }">${
            icon(14, '')
        } ${cfg.label}</span>`;
    }

    buildCard(
        view: string,
        showGrip: boolean,
    ): SafeHtml {
        const statusIcon = STATUS_ICONS[
            this.#project.statusValue()
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
                + ' cursor-grab'
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
                        .statusClassName()
                    + ' text-xs'
                    + ' badge-fixed-w mt-1'
                }">${
                    statusIcon(
                        14, '',
                    )
                } ${
                    this.#project
                        .statusLabel()
                }</span>
            </div>
            ${this.#buildMetrics()}
            ${this.#buildProgressRing()}
        </div>
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

    #buildMetrics(): SafeHtml {
        const p = this.#project;
        const s = new Date(
            p.startDateValue(),
        ).getTime();
        const e = new Date(
            p.targetEndDateValue(),
        ).getTime();
        const tb = isNaN(s) || isNaN(e)
            ? 0
            : Math.max(0, Math.ceil(
                (e - s) / MS_PER_DAY,
            ));
        const tc = isNaN(s)
            ? 0
            : Math.max(0, Math.floor(
                (Date.now() - s)
                / MS_PER_DAY,
            ));
        const cb = p.estimatedCostAmount()
            / COST_DIVISOR;
        const cc = p.actualCostAmount()
            / COST_DIVISOR;
        const ib =
            p.estimatedImpactScore();
        const ic =
            p.actualImpactScore();
        const m = 'text-xs text-muted';
        return html`
    <div class="${
        'hidden-mobile project-metric-grid'
    }">
        <div class="${
            'flex items-center gap-2'
        }">
            <div class="metric-icon-box">${
                iconClock(
                    16, 'text-primary',
                )
            }</div>
            <div>
                <p class="${m}">Time</p>
                <p class="${
                    'text-sm font-medium'
                }">${tb
                    ? html`${tc}d <span
                        class="${m}"
                        >/ ${tb}d</span>`
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
                <p class="${m}">Cost</p>
                <p class="${
                    'text-sm font-medium'
                }">${cb
                    ? html`${'$' + cc}k
                        <span class="${m}"
                        >/ ${'$'
                        + cb}k</span>`
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
                <p class="${m}">Impact</p>
                <p class="${
                    'text-sm font-medium'
                }">${ib
                    ? html`${ic} <span
                        class="${m}"
                        >/ ${ib}</span>`
                    : html`&mdash;`
                }</p>
            </div>
        </div>
    </div>`;
    }
}

export class ProjectListPresenter {
    #projects: ProjectPresenter[];
    #filter:
        | { kind: 'all' }
        | {
            kind: 'filtered';
            status: ProjectStatus;
        } = { kind: 'all' };

    constructor(projects: Project[]) {
        this.#projects = projects.map(
            p => new ProjectPresenter(p),
        );
    }

    update(projects: Project[]): void {
        this.#projects = projects.map(
            p => new ProjectPresenter(p),
        );
    }

    toggleFilter(
        status: ProjectStatus,
    ): void {
        this.#filter =
            this.#filter.kind
                === 'filtered'
            && this.#filter.status
                === status
                ? { kind: 'all' }
                : {
                    kind: 'filtered',
                    status,
                };
    }

    activeFilter():
        ProjectStatus | null {
        return this.#filter.kind
            === 'filtered'
            ? this.#filter.status
            : null;
    }

    renderBadges(
        container: HTMLElement,
    ): void {
        setHtml(
            container, this.#buildBadges(),
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
            p => p.statusGroup(),
        );
        const order: ProjectStatus[] = [
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
                .buildStatusBadge(
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
                    p => p.statusGroup()
                        === f.status,
                )
                : this.#projects;
        const sorted =
            [...filtered].sort(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            );
        const hasGrip =
            f.kind === 'all';
        return html`${sorted.map(
            p => p.buildCard(
                'position', hasGrip,
            ),
        )}`;
    }
}
