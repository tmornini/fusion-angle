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
            'flex items-center '
            + 'gap-4 p-4 worker-row '
            + 'worker-row-divider '
            + (this.#worker.isArchived()
                ? 'opacity-50' : '')
        }"
            data-self="${isSelf ? 'true' : 'false'}"
            data-worker-id="${
                this.#worker.idForLink()
            }">
            <div class="${
                'flex items-center'
                + ' gap-3 flex-2 min-w-0'
            }">
                <div class="${
                    'avatar avatar-tinted'
                }">
                    <span
                        class="${
                            'text-sm '
                            + 'font-bold '
                            + 'text-primary'
                        }">
                        ${initials(
                            this.#worker.fullName(),
                        )}
                    </span>
                </div>
                <div class="${
                    'min-w-0'
                }">
                    <p class="${
                        'font-medium '
                        + 'truncate'
                    }">
                        ${this.#worker.fullName()}
                    </p>
                    <p
                        class="${
                            'text-xs '
                            + 'text-muted '
                            + 'truncate'
                        }">
                        ${this.#worker.emailAddress()}
                    </p>
                </div>
            </div>
            <div class="flex-1">
                ${this.#buildTitleBadge()}
            </div>
            <div class="${
                'flex-1'
                + ' text-sm text-muted'
            }">
                ${this.#worker.departmentLabel()}
            </div>
            <div class="flex-1">
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
            'flex items-center '
            + 'gap-4 p-4 worker-row '
            + 'worker-row-divider'
        }"
            data-worker-id="${
                this.#worker.idForLink()
            }">
            <div class="${
                'flex items-center'
                + ' gap-3 flex-2 min-w-0'
            }">
                <div class="${
                    'avatar avatar-tinted'
                }">
                    ${iconBrain(
                        16,
                        'text-primary',
                    )}
                </div>
                <div class="${
                    'min-w-0'
                }">
                    <p class="${
                        'font-medium '
                        + 'truncate'
                    }">
                        ${this.#worker.nameText()}
                    </p>
                    <p
                        class="${
                            'text-xs '
                            + 'text-muted '
                            + 'truncate'
                        }">
                        ${
                            this.#worker
                                .descriptionText()
                        }
                    </p>
                </div>
            </div>
            <div class="flex-1">
                <span class="${
                    'badge badge-secondary'
                }">
                    ${this.#worker.providerText()}
                </span>
            </div>
            <div class="${
                'flex-1'
                + ' text-sm text-muted'
                + ' font-mono'
            }">
                ${this.#worker.maskedToken()}
            </div>
            <div class="flex-1"></div>
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
            this.#kind === 'ai'
                ? html``
                : this.#buildHumansSection()
        }${
            this.#kind === 'human'
                ? html``
                : this.#buildAIsSection()
        }`);
    }

    #buildHumansSection(): SafeHtml {
        const filtered = this.#humans.filter(
            p => p.matchesSearch(this.#search),
        );
        const self = filtered.find(
            p => p.idForLink()
                === this.#currentWorkerId,
        );
        const others = filtered.filter(
            p => p.idForLink()
                !== this.#currentWorkerId,
        );
        return html`
            <div class="${
                'worker-section-header p-3'
                + ' text-xs font-semibold'
                + ' text-muted'
            }">HUMANS</div>
            ${
                filtered.length === 0
                    ? this.#buildEmptyRow(
                        'No humans match'
                        + ' your filter.',
                    )
                    : html`${
                        self
                            ? self.buildRow(true)
                            : html``
                    }${others.map(
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
                'worker-section-header p-3'
                + ' text-xs font-semibold'
                + ' text-muted'
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
