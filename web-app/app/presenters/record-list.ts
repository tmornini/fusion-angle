import { html, setHtml, SafeHtml } from '../safe-html.ts';
import {
    toggleStatusFilter,
} from './list-filter.ts';
import { stateBadge } from './state-badge.ts';
import {
    buildStateFilterBadges,
    filteredSortedList,
} from './list-choreography.ts';
import {
    type IconSize,
    ICON_SIZE,
    iconGripVertical,
    iconCheckCircle2,
    iconClock,
} from '../icons.ts';
import { buildPageUrl } from '../navigation.ts';
import type { RecordWithCounts } from '../../../client/index.ts';
import type {
    RecordModel,
    RecordState,
} from '../../../shared/types.ts';
import {
    RECORD_STATE_CONFIG,
} from './state-display.ts';

const STATE_ICONS: Record<
    RecordState,
    (
        size: IconSize,
        cssClass: string,
    ) => SafeHtml
> = {
    active: iconCheckCircle2,
    archived: iconClock,
    deleted: iconClock,
};

export type RecordListFilter =
    | { kind: 'all' }
    | { kind: 'filtered'; status: RecordState };

export type RecordListState = {
    records: RecordWithCounts[];
    filter: RecordListFilter;
};

export function buildInitialRecordListState(
    records: RecordWithCounts[],
): RecordListState {
    return {
        records,
        filter: { kind: 'all' },
    };
}

export function applyRecordListUpdate(
    state: RecordListState,
    records: RecordWithCounts[],
): RecordListState {
    return { ...state, records };
}

export function applyRecordFilterToggle(
    listState: RecordListState,
    recordState: RecordState,
): RecordListState {
    const next: RecordListFilter =
        toggleStatusFilter(
            listState.filter, recordState,
        );
    return { ...listState, filter: next };
}

export class RecordPresenter {
    readonly #record: RecordModel;
    readonly #attributeCount: number;
    readonly #boundFlowCount: number;

    constructor(
        record: RecordModel,
        attributeCount: number,
        boundFlowCount: number,
    ) {
        this.#record = record;
        this.#attributeCount = attributeCount;
        this.#boundFlowCount = boundFlowCount;
    }

    idForLink(): string {
        return this.#record.idForLink();
    }

    positionSortKey(): number {
        return this.#record.positionSortKey();
    }

    stateGroup(): RecordState {
        return this.#record.stateValue();
    }

    matchesState(s: RecordState): boolean {
        return this.stateGroup() === s;
    }

    buildStateBadge(
        isActive: boolean | null,
    ): SafeHtml {
        const s = this.#record.stateValue();
        return stateBadge(
            s, RECORD_STATE_CONFIG[s]!,
            STATE_ICONS[s]!, isActive,
        );
    }

    buildCard(showGrip: boolean): SafeHtml {
        return html`
    <div class="${
        'card card-hover p-5 cursor-pointer'
    }"
        data-record-card="${
            this.#record.idForLink()
        }"
        data-position="${
            this.#record.positionSortKey()
        }">
        <div class="${
            'flex items-center gap-4'
        }">
            ${showGrip ? html`<button
                type="button"
                class="${
                    'hidden-mobile text-muted'
                    + ' drag-handle'
                }"
                aria-label="${
                    'Reorder '
                    + this.#record.nameText()
                }">${
                iconGripVertical(ICON_SIZE.xl, '')
            }</button>` : html``}
            <div class="flex-fill min-w-0">
                ${this.#buildHeading()}
                ${this.#buildMetadata()}
            </div>
        </div>
    </div>`;
    }

    #buildHeading(): SafeHtml {
        const cfg = RECORD_STATE_CONFIG[
            this.#record.stateValue()
        ];
        return html`
        <h3 class="${
            'font-display'
            + ' font-semibold'
            + ' truncate'
        }">
            <a href="${
                buildPageUrl(
                    'records',
                    {
                        id: this.#record
                            .idForLink(),
                    },
                )
            }">${this.#record.nameText()}</a>
        </h3>
        <p class="${
            'text-sm text-muted truncate'
            + ' mt-1'
        }">
            ${this.#record.descriptionText()}
        </p>
        <span class="${
            'badge '
            + cfg.className
            + ' text-xs badge-fixed-w mt-2'
        }">${
            STATE_ICONS[
                this.#record.stateValue()
            ]!(14, '')
        } ${cfg.label}</span>`;
    }

    #buildMetadata(): SafeHtml {
        return html`
        <div class="${
            'flex flex-wrap gap-3'
            + ' text-xs text-muted mt-2'
        }">
            <span>${String(this.#attributeCount)}
            attribute${
                this.#attributeCount === 1
                    ? ''
                    : 's'
            }</span>
            <span>${String(this.#boundFlowCount)}
            bound flow${
                this.#boundFlowCount === 1
                    ? ''
                    : 's'
            }</span>
        </div>`;
    }
}

export class RecordListPresenter {
    #records: RecordPresenter[];
    #filter: RecordListFilter;

    constructor(state: RecordListState) {
        this.#records = state.records.map(
            r => new RecordPresenter(
                r.record,
                r.attributeCount,
                r.boundFlowCount,
            ),
        );
        this.#filter = state.filter;
    }

    activeFilter(): RecordState | null {
        return this.#filter.kind === 'filtered'
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

    // The card the list draws first: none when the pressed
    // badge leaves no card.
    firstId(): string | null {
        const filter = this.#filter;
        const [first] = this.#records
            .filter((r) => filter.kind === 'all'
                || r.matchesState(filter.status))
            .toSorted(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            );
        return first === undefined ? null : first.idForLink();
    }

    #buildBadges(): SafeHtml {
        return buildStateFilterBadges(
            this.#records,
            r => r.stateGroup(),
            ['active', 'archived'],
            this.activeFilter(),
            (item, isActive) =>
                item.buildStateBadge(isActive),
        );
    }

    #buildList(): SafeHtml {
        const hasGrip = this.#filter.kind === 'all';
        return filteredSortedList(
            this.#records,
            this.#filter,
            (r, status) => r.matchesState(status),
            items => items.toSorted(
                (a, b) =>
                    a.positionSortKey()
                    - b.positionSortKey(),
            ),
            r => r.buildCard(hasGrip),
        );
    }
}
