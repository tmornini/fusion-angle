import { html } from '../safe-html.ts';
import type { SafeHtml } from '../safe-html.ts';
import { iconPlus } from '../icons.ts';
import type {
    RecordEntity,
    RecordId,
} from '../adapters/index.ts';

export interface RecordListRow {
    readonly record: RecordEntity;
    readonly attributeCount: number;
    readonly boundFlowCount: number;
}

export class RecordListPresenter {
    readonly #rows: readonly RecordListRow[];

    constructor(rows: readonly RecordListRow[]) {
        this.#rows = [...rows].toSorted(
            (a, b) =>
                a.record.name.localeCompare(
                    b.record.name,
                ),
        );
    }

    buildPage(): SafeHtml {
        return html`<div class="entity">
            <div class="${
                'flex items-center'
                + ' justify-between mb-6'
            }">
                <h1 class="${
                    'text-2xl font-display'
                    + ' font-bold'
                }">Records</h1>
                <button
                    id="record-add-btn"
                    class="${
                        'btn btn-primary'
                    }">
                    ${iconPlus(16, '')}
                    Add Record
                </button>
            </div>
            ${this.#buildTable()}
            ${this.#buildAddDialog()}
        </div>`;
    }

    #buildTable(): SafeHtml {
        if (this.#rows.length === 0) {
            return html`<div
                class="${
                    'card p-6 text-muted'
                }">
                No Records yet. Add one to
                bind data shapes to flows.
            </div>`;
        }
        return html`<div class="card">
            <div class="record-list-row
                record-list-row-head">
                <span>Name</span>
                <span>Description</span>
                <span>Attributes</span>
                <span>Bound flows</span>
            </div>
            ${this.#rows.map(
                r => this.#buildRow(r),
            )}
        </div>`;
    }

    #buildRow(
        r: RecordListRow,
    ): SafeHtml {
        return html`<a
            class="record-list-row"
            data-record-id="${r.record.id}"
            href="javascript:void(0)">
            <span class="font-medium"
                >${r.record.name}</span>
            <span class="text-muted text-sm"
                >${r.record.description}</span>
            <span class="text-sm"
                >${String(r.attributeCount)}</span>
            <span class="text-sm"
                >${String(r.boundFlowCount)}</span>
        </a>`;
    }

    #buildAddDialog(): SafeHtml {
        return html`
<div id="record-add-backdrop"
    class="dialog-backdrop hidden"></div>
<div id="record-add-dialog"
    class="dialog hidden"
    aria-hidden="true">
<div class="dialog-content">
<h2 class="text-lg font-semibold mb-4"
    >Add Record</h2>
<div class="mb-3">
<label class="label">Name</label>
<input type="text"
    class="input"
    id="record-add-name"
    placeholder="Record name" />
</div>
<div class="mb-3">
<label class="label">Description</label>
<textarea
    class="input"
    id="record-add-description"
    placeholder="What this Record describes"
    rows="3"></textarea>
</div>
<div class="${
    'flex justify-end gap-2'
}">
<button class="btn btn-ghost"
    id="record-add-cancel-btn"
    >Cancel</button>
<button class="btn btn-primary"
    id="record-add-save-btn"
    >Create</button>
</div>
</div>
</div>`;
    }

    boundRecordIds(): RecordId[] {
        return this.#rows.map(r => r.record.id);
    }
}
