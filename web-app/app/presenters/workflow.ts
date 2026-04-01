import { html, SafeHtml } from '../safe-html';
import {
    iconCircle,
    iconShare,
    iconChevronRight,
    iconFolderKanban,
} from '../icons';
import type {
    WorkflowSummary,
} from '../adapters/workflows';

export class WorkflowPresenter {
    readonly #id: string;
    readonly #name: string;
    readonly #description: string;
    readonly #nodeCount: number;
    readonly #edgeCount: number;
    readonly #projectName: string | null;

    constructor(wf: WorkflowSummary) {
        this.#id = wf.id;
        this.#name = wf.name;
        this.#description = wf.description;
        this.#nodeCount = wf.nodeCount;
        this.#edgeCount = wf.edgeCount;
        this.#projectName = wf.projectName;
    }

    buildCard(): SafeHtml {
        return html`
    <div class="card card-hover p-4"
        style="cursor:pointer"
        data-workflow-card="${this.#id}">
        <div class="${
            'flex items-start '
            + 'justify-between gap-4'
        }">
            <div style="${
                'flex:1;min-width:0'
            }">
                <div class="${
                    'flex flex-wrap '
                    + 'items-center'
                    + ' gap-2 mb-2'
                }">
                    ${this.#projectName
                        ? html`<span
                            class="${
                                'badge'
                                + ' badge-outline'
                                + ' text-xs'
                            }">${
                            iconFolderKanban(
                                12, '',
                            )
                        } ${
                            this.#projectName
                        }</span>`
                        : html``}
                </div>
                <h3 class="${
                    'font-semibold mb-1'
                }">${this.#name}</h3>
                <p class="${
                    'text-sm'
                    + ' text-muted mb-2'
                    + ' truncate'
                }">${
                    this.#description
                }</p>
                <div class="${
                    'flex flex-wrap '
                    + 'items-center'
                    + ' gap-3 '
                    + 'text-sm'
                    + ' text-muted'
                }">
                    <span class="${
                        'flex'
                        + ' items-center'
                        + ' gap-1'
                    }">${
                        iconCircle(14, '')
                    } ${
                        this.#nodeCount
                    } ${
                        this.#nodeCount === 1
                            ? 'state'
                            : 'states'
                    }</span>
                    <span class="${
                        'flex'
                        + ' items-center'
                        + ' gap-1'
                    }">${
                        iconShare(14, '')
                    } ${
                        this.#edgeCount
                    } ${
                        this.#edgeCount === 1
                            ? 'transition'
                            : 'transitions'
                    }</span>
                </div>
            </div>
            <div class="${
                'flex items-center'
            }">${
                iconChevronRight(
                    20,
                    'text-muted',
                )
            }</div>
        </div>
    </div>`;
    }
}
