import { html, SafeHtml } from '../safe-html';
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
    SECONDS_PER_DAY,
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
    readonly #id: string;
    readonly #title: string;
    readonly #status: ProjectStatus;
    readonly #statusClassName: string;
    readonly #statusLabel: string;
    readonly #position: number;
    readonly #progress: number;
    readonly #timeCurrentDays: number;
    readonly #timeBaselineDays: number;
    readonly #costCurrentK: number;
    readonly #costBaselineK: number;
    readonly #impactCurrent: number;
    readonly #impactBaseline: number;

    constructor(project: Project) {
        this.#id = project.id;
        this.#title = project.title;
        this.#status = project.status;
        this.#statusClassName =
            project.statusClassName();
        this.#statusLabel =
            project.statusLabel();
        this.#position = project.position;
        this.#progress =
            project.timelineProgress();
        const start = new Date(
            project.startDate,
        ).getTime();
        const end = new Date(
            project.targetEndDate,
        ).getTime();
        const msPerDay =
            SECONDS_PER_DAY * 1000;
        this.#timeCurrentDays =
            isNaN(start)
                ? 0
                : Math.max(0, Math.floor(
                    (Date.now() - start)
                    / msPerDay,
                ));
        this.#timeBaselineDays =
            isNaN(start) || isNaN(end)
                ? 0
                : Math.max(0, Math.ceil(
                    (end - start)
                    / msPerDay,
                ));
        this.#costCurrentK =
            project.actualCost
            / COST_DIVISOR;
        this.#costBaselineK =
            project.estimatedCost
            / COST_DIVISOR;
        this.#impactCurrent =
            project.actualImpact;
        this.#impactBaseline =
            project.estimatedImpact;
    }

    idForLink(): string {
        return this.#id;
    }

    positionSortKey(): number {
        return this.#position;
    }

    statusGroup(): ProjectStatus {
        return this.#status;
    }

    buildStatusBadge(): SafeHtml {
        const cfg = PROJECT_STATUS_CONFIG[
            this.#status
        ]!;
        const icon = STATUS_ICONS[
            this.#status
        ]!;
        return html`<span class="${
            'badge '
            + cfg.className
            + ' text-xs'
        }" data-status="${
            this.#status
        }" style="${
            'cursor:pointer;'
            + 'min-width:6rem;'
            + 'justify-content:center'
        }">${
            icon(14, '')
        } ${cfg.label}</span>`;
    }

    buildCard(
        view: string,
        showGrip: boolean,
    ): SafeHtml {
        const statusIcon = STATUS_ICONS[
            this.#status
        ]!;
        const metricBoxStyle =
            'width:2rem;height:2rem;'
            + 'border-radius:0.5rem;'
            + 'background:'
            + 'hsl(var(--primary)/0.1);'
            + 'display:flex;'
            + 'align-items:center;'
            + 'justify-content:center';
        return html`
    <div class="card card-hover"
        style="padding:1.25rem"
        data-project-card="${this.#id}"
        data-position="${this.#position}">
        <div class="${
            'flex items-center gap-4'
        }">
            ${showGrip ? html`<div class="${
                'hidden-mobile text-muted'
            }" style="cursor:grab">${
                iconGripVertical(20, '')
            }</div>` : html``}
            <div style="${
                'flex:1;min-width:0'
            }">
                <h3 class="${
                    'font-display '
                    + 'font-semibold'
                }" style="${
                    'white-space:'
                    + 'nowrap;'
                    + 'overflow:'
                    + 'hidden;'
                    + 'text-overflow'
                    + ':ellipsis'
                }">${
                    this.#title
                }</h3>
                <span class="${
                    'badge '
                    + this
                        .#statusClassName
                    + ' text-xs'
                }" style="${
                    'justify-content:'
                    + 'center;'
                    + 'min-width:6rem;'
                    + 'margin-top:'
                    + '0.25rem'
                }">${
                    statusIcon(
                        14, '',
                    )
                } ${
                    this
                        .#statusLabel
                }</span>
            </div>
            ${this.#buildMetrics(
                metricBoxStyle,
            )}
            ${this.#buildProgressRing()}
        </div>
    </div>`;
    }

    #buildProgressRing(): SafeHtml {
        const percent = this.#progress;
        const radius = 20;
        const center = 24;
        const circumference =
            2 * Math.PI * radius;
        return html`
    <div style="${
        'position:relative;'
        + 'width:3rem;height:3rem'
    }">
        <svg width="48" height="48"
            style="${
                'transform:rotate(-90deg)'
            }">
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
        <span style="${
            'position:absolute;inset:0;'
            + 'display:flex;'
            + 'align-items:center;'
            + 'justify-content:center;'
            + 'font-size:0.625rem;'
            + 'font-weight:700'
        }">${percent}%</span>
    </div>`;
    }

    #buildMetrics(
        boxStyle: string,
    ): SafeHtml {
        const tb = this.#timeBaselineDays;
        const tc = this.#timeCurrentDays;
        const cb = this.#costBaselineK;
        const cc = this.#costCurrentK;
        const ib = this.#impactBaseline;
        const ic = this.#impactCurrent;
        const m = 'text-xs text-muted';
        return html`
    <div class="${
        'hidden-mobile flex'
        + ' items-center gap-4'
    }" style="flex-shrink:0">
        <div class="${
            'flex items-center gap-2'
        }">
            <div style="${boxStyle}">${
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
            <div style="${boxStyle}">${
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
            <div style="${boxStyle}">${
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
    readonly #statusBadges: SafeHtml;
    #filterStatus: ProjectStatus | null =
        null;

    constructor(projects: Project[]) {
        this.#projects = projects.map(
            p => new ProjectPresenter(p),
        );
        const groups = Object.groupBy(
            this.#projects,
            p => p.statusGroup(),
        );
        const order: ProjectStatus[] = [
            'completed', 'under-review',
            'sent-back', 'approved',
        ];
        const badges =
            orderedKeys(groups, order)
                .map(s => groups[s])
                .filter(
                    items =>
                        items
                        && items.length > 0,
                )
                .map(items =>
                    items![0]!
                        .buildStatusBadge(),
                );
        this.#statusBadges =
            html`${badges}`;
    }

    update(projects: Project[]): void {
        this.#projects = projects.map(
            p => new ProjectPresenter(p),
        );
    }

    renderStatusBadges(): SafeHtml {
        return this.#statusBadges;
    }

    toggleFilter(
        status: ProjectStatus | null,
    ): void {
        this.#filterStatus =
            this.#filterStatus === status
                ? null
                : status;
    }

    activeFilter():
        ProjectStatus | null {
        return this.#filterStatus;
    }

    renderList(): SafeHtml {
        const filtered =
            this.#filterStatus
                ? this.#projects.filter(
                    p => p.statusGroup()
                        === this
                            .#filterStatus,
                )
                : this.#projects;
        const sorted =
            [...filtered].sort(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            );
        const hasGrip =
            !this.#filterStatus;
        return html`${sorted.map(
            p => p.buildCard(
                'position', hasGrip,
            ),
        )}`;
    }
}
