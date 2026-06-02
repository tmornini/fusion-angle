import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { initials } from '../core.ts';
import {
    iconCheckCircle2,
    iconClock,
    iconPersonX,
    iconBrain,
} from '../icons.ts';
import {
    HumanWorker,
    AIWorker,
    type Worker,
    isHumanWorker,
    isAIWorker,
} from '../adapters/index.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import {
    findProviderModel,
} from '../../../api/provider-models.ts';

export type WorkerKindFilter =
    | 'all'
    | 'human'
    | 'ai';

export class HumanWorkerRowPresenter {
    readonly #worker: HumanWorker;

    constructor(worker: HumanWorker) {
        this.#worker = worker;
    }

    idForLink(): string {
        return this.#worker.idForLink();
    }

    matchesSearch(query: string): boolean {
        if (query === '') return true;
        return this.#worker
            .matchesSearch(query);
    }

    buildRow(isSelf: boolean = false): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
            + (this.#worker.isArchived()
                ? ' opacity-50' : '')
        }"
            data-self="${
                isSelf ? 'true' : 'false'
            }"
            data-worker-id="${
                this.#worker.idForLink()
            }">
            <div class="${
                'avatar avatar-tinted'
            }">
                <span class="${
                    'text-sm font-bold'
                    + ' text-primary'
                }">
                    ${initials(
                        this.#worker.name(),
                    )}
                </span>
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    ${this.#worker.name()}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${this.#worker.emailAddress()}
                </p>
                <div class="${
                    'flex items-center gap-2 mt-1'
                }">
                    ${this.#buildTitleBadge()}
                    <span class="${
                        'text-xs text-muted'
                    }">
                        ${this.#worker
                            .departmentLabel()}
                    </span>
                </div>
            </div>
            <div class="${
                'flex flex-col items-end gap-2'
                + ' ml-6'
            }">
                ${this.#buildStatusBadge()}
            </div>
        </div>`;
    }

    #buildStatusBadge(): SafeHtml {
        if (this.#worker.isActive())
            return html`<span
                class="${
                    'status-badge-success'
                }">
                ${iconCheckCircle2(14, '')}
                Active
            </span>`;
        if (this.#worker.isPending())
            return html`<span
                class="${
                    'status-badge-warning'
                }">
                ${iconClock(14, '')}
                Pending
            </span>`;
        return html`<span
            class="${
                'status-badge-error'
            }">
            ${iconPersonX(14, '')}
            Archived
        </span>`;
    }

    #buildTitleBadge(): SafeHtml {
        return html`<span
            class="${
                'badge badge-secondary'
            }">
            ${this.#worker.titleLabel()}
        </span>`;
    }
}

export class AIWorkerRowPresenter {
    readonly #worker: AIWorker;

    constructor(worker: AIWorker) {
        this.#worker = worker;
    }

    idForLink(): string {
        return this.#worker.idForLink();
    }

    matchesSearch(query: string): boolean {
        if (query === '') return true;
        return this.#worker
            .matchesSearch(query);
    }

    buildRow(): SafeHtml {
        return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
        }"
            data-worker-id="${
                this.#worker.idForLink()
            }">
            <div class="${
                'avatar avatar-tinted'
            }">
                ${iconBrain(
                    16,
                    'text-primary',
                )}
            </div>
            <div class="flex-fill min-w-0">
                <p class="${
                    'font-medium truncate'
                }">
                    ${this.#worker.nameText()}
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">
                    ${
                        this.#worker
                            .descriptionText()
                    }
                </p>
                <div class="${
                    'flex items-center gap-2 mt-1'
                }">
                    <span class="${
                        'badge badge-secondary'
                    }">
                        ${findProviderModel(
                            this.#worker.modelId(),
                        )?.name ?? DISPLAY_ABSENT}
                    </span>
                </div>
            </div>
        </div>`;
    }
}

export type ManagedWorkersState = {
    workers: Worker[];
    currentWorkerId: string;
    search: string;
    kind: WorkerKindFilter;
};

export function buildInitialManagedWorkersState(
    workers: Worker[],
    currentWorkerId: string,
): ManagedWorkersState {
    return {
        workers,
        currentWorkerId,
        search: '',
        kind: 'all',
    };
}

export function applyManagedWorkersSearch(
    state: ManagedWorkersState,
    query: string,
): ManagedWorkersState {
    return {
        ...state,
        search: query.toLowerCase(),
    };
}

export function applyManagedWorkersKind(
    state: ManagedWorkersState,
    kind: WorkerKindFilter,
): ManagedWorkersState {
    return { ...state, kind };
}

export class ManagedWorkersPresenter {
    readonly #humans: HumanWorkerRowPresenter[];
    readonly #ais: AIWorkerRowPresenter[];
    readonly #currentWorkerId: string;
    readonly #search: string;
    readonly #kind: WorkerKindFilter;

    constructor(state: ManagedWorkersState) {
        this.#humans = state.workers
            .filter(isHumanWorker)
            .map(
                w => new HumanWorkerRowPresenter(w),
            );
        this.#ais = state.workers
            .filter(isAIWorker)
            .map(
                w => new AIWorkerRowPresenter(w),
            );
        this.#currentWorkerId =
            state.currentWorkerId;
        this.#search = state.search;
        this.#kind = state.kind;
    }

    humanCount(): number {
        return this.#humans.length;
    }

    aiCount(): number {
        return this.#ais.length;
    }

    renderList(
        container: HTMLElement,
    ): void {
        setHtml(container, html`${
            this.#buildSelfSection()
        }${
            this.#kind === 'ai'
                ? html``
                : this.#buildHumansSection()
        }${
            this.#kind === 'human'
                ? html``
                : this.#buildAIsSection()
        }`);
    }

    #buildSelfSection(): SafeHtml {
        if (this.#kind === 'ai') return html``;
        const self = this.#humans.find(
            p => p.idForLink()
                === this.#currentWorkerId,
        );
        if (!self) return html``;
        if (!self.matchesSearch(this.#search)) {
            return html``;
        }
        return html`
            <div class="${
                'worker-section-header'
                + ' text-xs font-semibold'
                + ' text-muted'
            }">YOU</div>
            ${self.buildRow(true)}`;
    }

    #buildHumansSection(): SafeHtml {
        const others = this.#humans
            .filter(
                p => p.idForLink()
                    !== this.#currentWorkerId,
            )
            .filter(
                p => p.matchesSearch(this.#search),
            );
        return html`
            <div class="${
                'worker-section-header'
                + ' text-xs font-semibold'
                + ' text-muted mt-4'
            }">HUMANS</div>
            ${
                others.length === 0
                    ? this.#buildEmptyRow(
                        'No humans match'
                        + ' your filter.',
                    )
                    : html`${others.map(
                        p => p.buildRow(false),
                    )}`
            }`;
    }

    #buildAIsSection(): SafeHtml {
        const filtered = this.#ais.filter(
            p => p.matchesSearch(this.#search),
        );
        return html`
            <div class="${
                'worker-section-header'
                + ' text-xs font-semibold'
                + ' text-muted mt-4'
            }">AIs</div>
            ${
                filtered.length === 0
                    ? this.#buildEmptyRow(
                        'No AIs match your'
                        + ' filter.',
                    )
                    : html`${filtered.map(
                        p => p.buildRow(),
                    )}`
            }`;
    }

    #buildEmptyRow(message: string): SafeHtml {
        return html`<div class="${
            'p-4 text-sm text-muted'
            + ' text-center'
        }">${message}</div>`;
    }
}
