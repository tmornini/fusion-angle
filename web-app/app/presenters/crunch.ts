import {
    html, type SafeHtml, trusted,
} from '../safe-html';
import {
    iconUpload, iconFileSpreadsheet,
    iconFileText, iconHelpCircle,
    iconCheck, iconChevronRight,
    iconChevronDown, iconSparkles,
    iconMessageSquare, iconTable,
    iconHash, iconCalendar, iconType,
    iconToggleLeft,
} from '../icons';
import { displayText, formatDate } from '../core';
import type {
    CrunchColumn,
} from '../adapters';

type CrunchStep =
    | 'upload'
    | 'label'
    | 'review';

export class CrunchPresenter {
    #step: CrunchStep;
    #columns: CrunchColumn[];
    #expandedColumnId: string | null;
    #businessContext: string;
    #mockColumns: CrunchColumn[];

    constructor() {
        this.#step = 'upload';
        this.#columns = [];
        this.#expandedColumnId = null;
        this.#businessContext = '';
        this.#mockColumns = [];
    }

    loadMockData(
        columns: CrunchColumn[],
    ): void {
        this.#mockColumns = columns;
    }

    simulateUpload(): void {
        this.#columns =
            this.#mockColumns
                .map(c => ({ ...c }));
        this.#step = 'label';
    }

    goToUpload(): void {
        this.#step = 'upload';
        this.#columns = [];
    }

    goToReview(): void {
        this.#step = 'review';
    }

    goToLabel(): void {
        this.#step = 'label';
    }

    toggleColumn(id: string): void {
        this.#expandedColumnId =
            this.#expandedColumnId === id
                ? null
                : id;
    }

    syncFields(
        columns: CrunchColumn[],
        context: string,
    ): void {
        this.#columns = columns;
        this.#businessContext = context;
    }

    isUploadStep(): boolean {
        return this.#step === 'upload';
    }

    isLabelStep(): boolean {
        return this.#step === 'label';
    }

    isReviewStep(): boolean {
        return this.#step === 'review';
    }

    currentColumns():
        readonly CrunchColumn[] {
        return this.#columns;
    }

    buildPage(): SafeHtml {
        return html`
        <div
            style="max-width:56rem;
                   margin:0 auto"
        >
            <div style="margin-bottom:2rem">
                <div
                    class="badge badge-primary
                           text-sm mb-3"
                >${iconTable(14, '')
                    } Data Translation
                    Tool</div>
                <h1
                    class="text-2xl font-display
                           font-bold mb-1"
                >Crunch</h1>
                <p
                    class="${
                        'text-sm text-muted'
                    }"
                    style="max-width:32rem"
                >
                    ${'Upload your business'
                        + ' data'
                        + ' and help us'
                        + ' understand'
                        + ' it. We\'ll guide'
                        + ' you'
                        + ' through labeling'
                        + ' columns,'
                        + ' explaining'
                        + ' acronyms, and'
                        + ' defining'
                        + ' what everything'
                        + ' means'
                        + ' in plain language.'}
                </p>
            </div>

            <div
                class="flex items-center
                       justify-center gap-3
                       mb-8"
                style="overflow-x:auto;
                       padding-bottom:0.5rem"
            >
                ${this.#buildStepIndicator()}
            </div>

            ${this.#step === 'upload'
                ? CrunchPresenter
                    .#buildUploadStep()
                : this.#step === 'label'
                    ? this.#buildLabelStep()
                    : CrunchPresenter
                        .#buildReviewStep()}
        </div>`;
    }

    completionPercent(): number {
        const cols = this.#columns;
        if (!cols.length) return 0;
        const labeledCount =
            cols.filter(
                column =>
                    column.friendlyName
                    && column.description
                    && (!column.isAcronym
                        || column
                            .acronymExpansion),
            ).length;
        return Math.round(
            (labeledCount / cols.length)
                * 100,
        );
    }

    static #buildDataTypeIcon(
        type: string,
    ): SafeHtml {
        switch (type) {
            case 'number':
                return iconHash(
                    16, 'text-muted',
                );
            case 'date':
                return iconCalendar(
                    16, 'text-muted',
                );
            case 'boolean':
                return iconToggleLeft(
                    16, 'text-muted',
                );
            default:
                return iconType(
                    16, 'text-muted',
                );
        }
    }

    static #buildUploadStep(): SafeHtml {
        return html`
    <div
        style="display:flex;flex-direction:column;
               gap:1.5rem"
    >
        <div
            class="card"
            id="crunch-dropzone"
            style="padding:3rem;text-align:center;
                   border:2px dashed
                   hsl(var(--border));cursor:pointer"
        >
            <div
                style="width:4rem;height:4rem;
                       border-radius:1rem;
                       background:hsl(var(--primary)
                       /0.1);display:flex;
                       align-items:center;
                       justify-content:center;
                       margin:0 auto 1rem"
            >
                ${iconUpload(32, 'text-primary')}
            </div>
            <p class="${
                'text-lg font-medium mb-1'
            }">
                ${'Drop your file here'
                    + ' or click to browse'}
            </p>
            <p class="${
                'text-sm text-muted mb-4'
            }">
                ${'Supports Excel'
                    + ' (.xlsx, .xls), CSV,'
                    + ' and Google Sheets'
                    + ' exports'}
            </p>
            <div
                class="flex items-center
                       justify-center
                       gap-4 text-xs text-muted"
            >
                <span class="${
                    'flex items-center gap-1'
                }">
                    ${iconFileSpreadsheet(14, '')}
                    Spreadsheets
                </span>
                <span class="${
                    'flex items-center gap-1'
                }">
                    ${iconFileText(14, '')} CSV Files
                </span>
            </div>
        </div>
        <div
            class="card"
            style="padding:1.5rem;
                   background:hsl(var(--warning)
                   /0.05);border:1px solid
                   hsl(var(--warning)/0.2)"
        >
            <div class="${
                'flex items-start gap-3'
            }">
                <div
                    style="width:2.5rem;
                           height:2.5rem;
                           border-radius:0.75rem;
                           background:hsl(
                           var(--warning)
                           /0.1);display:flex;
                           align-items:center;
                           justify-content:
                           center;
                           flex-shrink:0"
                >
                    ${iconHelpCircle(
                        20, 'text-warning',
                    )}
                </div>
                <div>
                    <h3 class="${
                        'font-medium text-sm'
                        + ' mb-1'
                    }">
                        What happens next?
                    </h3>
                    <p class="${
                        'text-sm text-muted'
                    }">
                        ${'After upload, we\'ll'
                            + ' ask you'
                            + ' simple questions'
                            + ' about each'
                            + ' column in your'
                            + ' data. You\'ll'
                            + ' tell us what'
                            + ' abbreviations'
                            + ' mean, what the'
                            + ' data'
                            + ' represents, and'
                            + ' any'
                            + ' business rules.'}
                    </p>
                </div>
            </div>
        </div>
    </div>`;
    }

    static #buildReviewStep(): SafeHtml {
        return html`
    <div
        class="card"
        style="padding:2rem;text-align:center"
    >
        <div
            style="width:4rem;height:4rem;
                   border-radius:1rem;
                   background:hsl(var(--success)
                   / 0.1);display:flex;
                   align-items:center;
                   justify-content:center;
                   margin:0 auto 1.5rem"
        >
            ${iconCheck(32, 'text-success')}
        </div>
        <h2
            class="text-2xl font-display
                   font-bold mb-2"
        >Data Translation Complete</h2>
        <p
            class="text-sm text-muted mb-8"
            style="max-width:28rem;
                   margin-left:auto;
                   margin-right:auto"
        >
            ${'Your data has been processed'
                + ' and is'
                + ' ready to use. All columns'
                + ' have'
                + ' been labeled and'
                + ' documented.'}
        </p>
        <div
            class="flex items-center
                   justify-center gap-3"
        >
            <button
                class="btn btn-outline"
                id="crunch-edit-labels"
            >Edit Labels</button>
            <button
                class="btn btn-primary"
                id="crunch-to-dashboard"
            >Continue to Dashboard</button>
        </div>
    </div>`;
    }

    #buildStepIndicator(): SafeHtml {
        const steps = [
            {
                key: 'upload',
                label: 'Upload',
                icon: iconUpload,
            },
            {
                key: 'label',
                label: 'Label & Explain',
                icon: iconMessageSquare,
            },
            {
                key: 'review',
                label: 'Review',
                icon: iconCheck,
            },
        ];
        return html`${steps.map((s, i) => {
            const isActive =
                s.key === this.#step;
            const isComplete =
                (this.#step === 'label'
                    && i === 0)
                || (this.#step
                        === 'review'
                    && i <= 1);
            const activeStyle =
                'background:hsl(var(--primary));'
                + 'color:hsl(var('
                + '--primary-foreground))';
            const completeStyle =
                'background:hsl(var(--success)'
                + ' / 0.1);color:hsl(var('
                + '--success));'
                + 'border:1px solid hsl(var('
                + '--success) / 0.2)';
            const inactiveStyle =
                'background:hsl(var(--muted));'
                + 'color:hsl(var('
                + '--muted-foreground))';
            const stepStyle = isActive
                ? activeStyle
                : isComplete
                    ? completeStyle
                    : inactiveStyle;
            return html`
            <div
                class="flex items-center gap-2"
                style="flex-shrink:0"
            >
                <div
                    class="${
                        'flex items-center'
                        + ' gap-2'
                    }"
                    style="${trusted(
                        'padding:'
                        + '0.375rem 1rem;'
                        + 'border-radius:'
                        + '9999px;'
                        + stepStyle
                    )}"
                >
                    ${isComplete
                        ? iconCheck(16, '')
                        : s.icon(16, '')}
                    <span
                        class="${
                            'text-sm'
                            + ' font-medium'
                        }"
                    >
                        ${s.label}
                    </span>
                </div>
                ${i < 2
                    ? iconChevronRight(
                        16, 'text-muted',
                    )
                    : html``}
            </div>`;
        })}`;
    }

    #buildLabelStep(): SafeHtml {
        const percent =
            this.completionPercent();
        const cols = this.#columns;
        const labeled = cols.filter(
            column =>
                column.friendlyName
                && column.description,
        ).length;
        const colWord =
            cols.length === 1
                ? 'column'
                : 'columns';
        return html`
        <div
            style="display:flex;
                   flex-direction:column;
                   gap:1.5rem"
        >
            <div
                class="card"
                style="padding:1rem"
            >
                <div
                    class="flex items-center
                           justify-between gap-3"
                >
                    <div
                        class="${
                            'flex items-center'
                            + ' gap-3'
                        }"
                    >
                        <div
                            style="width:2.5rem;
                                   height:2.5rem;
                                   border-radius:
                                   0.5rem;
                                   background:
                                   hsl(var(
                                   --success)
                                   / 0.1);
                                   display:flex;
                                   align-items:
                                   center;
                                   justify-content:
                                   center"
                        >
                            ${iconFileSpreadsheet(
                                20, 'text-success',
                            )}
                        </div>
                        <div>
                            <p
                                class="${
                                    'font-medium'
                                    + ' text-sm'
                                }"
                            >
                                ${'Q4_Sales_'
                                    + 'Report.xlsx'}
                            </p>
                            <p
                                class="${
                                    'text-xs'
                                    + ' text-muted'
                                }"
                            >
                                ${'2.3 MB'
                                    + ' \u2022'
                                    + ' 1,247'
                                    + ' rows'
                                    + ' \u2022 '
                                    + cols.length
                                    + ' columns'}
                            </p>
                        </div>
                    </div>
                    <div
                        class="${
                            'flex items-center'
                            + ' gap-3'
                        }"
                    >
                        <div class="text-right">
                            <p
                                class="${
                                    'text-sm'
                                    + ' font-'
                                    + 'medium'
                                }"
                            >
                                ${percent
                                }% complete
                            </p>
                            <p
                                class="${
                                    'text-xs'
                                    + ' text-'
                                    + 'muted'
                                }"
                            >
                                ${labeled} of
                                ${cols.length}
                                ${colWord
                                } labeled
                            </p>
                        </div>
                        <div style="${
                            'width:6rem'
                        }">
                            <div
                                class="progress"
                                style="${
                                    'height:'
                                    + '0.5rem'
                                }"
                            >
                                <div
                                    class="${
                                        'progress'
                                        + '-fill'
                                    }"
                                    style="${
                                        'width:'
                                        + percent
                                        + '%'
                                    }"
                                ></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div
                class="card"
                style="padding:1.5rem"
            >
                <div
                    class="flex items-start
                           gap-3
                           mb-4"
                >
                    ${iconSparkles(
                        20, 'text-primary',
                    )}
                    <div>
                        <h3
                            class="${
                                'font-medium'
                                + ' text-sm'
                            }"
                        >
                            ${'What is this'
                                + ' data about?'}
                        </h3>
                        <p
                            class="${
                                'text-xs'
                                + ' text-muted'
                            }"
                        >
                            ${'Give us some'
                                + ' context to'
                                + ' help'
                                + ' understand'
                                + ' your'
                                + ' business'
                                + ' data better.'}
                        </p>
                    </div>
                </div>
                <textarea
                    class="textarea"
                    id="crunch-context"
                    placeholder="${
                        'Example: This'
                        + ' is our quarterly'
                        + ' sales'
                        + ' report...'}"
                    style="min-height:5rem;
                           resize:none"
                >${this.#businessContext
                }</textarea>
            </div>

            <div
                style="display:flex;
                       flex-direction:column;
                       gap:0.75rem"
            >
                <h3 class="font-medium">
                    ${'Help us understand'
                        + ' each column'}
                </h3>
                ${cols.map(column => {
                    const isExpanded =
                        this
                            .#expandedColumnId
                            === column.id;
                    const isLabeled =
                        column.friendlyName
                        && column.description
                        && (!column.isAcronym
                            || column
                                .acronymExpansion);
                    return this.#buildColumnCard(
                        column,
                        isExpanded,
                        !!isLabeled,
                    );
                })}
            </div>

            <div
                class="flex items-center
                       justify-between"
                style="padding-top:1rem"
            >
                <button
                    class="btn btn-ghost"
                    id="crunch-back-upload"
                >Upload Different File</button>
                <button
                    class="${
                        'btn btn-primary gap-2'
                    }"
                    id="crunch-to-review"
                    ${trusted(
                        percent < 100
                            ? 'disabled' : ''
                    )}
                >
                    Continue to Review
                    ${iconChevronRight(16, '')}
                </button>
            </div>
        </div>`;
    }

    #buildColumnCard(
        column: CrunchColumn,
        isExpanded: boolean,
        isLabeled: boolean,
    ): SafeHtml {
        const borderStyle =
            isLabeled
                ? 'border-color:hsl('
                  + 'var(--success)'
                  + ' / 0.3);'
                  + 'background:hsl('
                  + 'var(--success)'
                  + ' / 0.03)'
                : '';
        const iconBg =
            isLabeled
                ? 'background:hsl('
                  + 'var(--success)'
                  + ' / 0.1)'
                : 'background:hsl('
                  + 'var(--muted))';
        return html`
        <div
            class="card"
            style="${trusted(
                borderStyle,
            )};overflow:hidden"
        >
            <div
                style="padding:1rem;
                       cursor:pointer"
                data-column-toggle="${
                    column.id}"
            >
                <div
                    class="${
                        'flex'
                        + ' items-center'
                        + ' gap-3'
                    }"
                >
                    <div
                        style="${
                            'width:'
                            + '2.5rem;'
                            + 'height:'
                            + '2.5rem;'
                            + 'border-'
                            + 'radius:'
                            + '0.5rem;'
                            + 'display:'
                            + 'flex;'
                            + 'align-'
                            + 'items:'
                            + 'center;'
                            + 'justify-'
                            + 'content:'
                            + 'center;'
                        }${trusted(
                            iconBg,
                        )}"
                    >
                        ${isLabeled
                            ? iconCheck(
                                20,
                                'text-'
                                + 'success',
                            )
                            : CrunchPresenter
                                .#buildDataTypeIcon(
                                    column
                                        .dataType,
                                )}
                    </div>
                    <div
                        style="${
                            'flex:1;'
                            + 'min-'
                            + 'width:0'
                        }"
                    >
                        <div
                            class="${
                                'flex'
                                + ' flex-'
                                + 'wrap'
                                + ' items-'
                                + 'center'
                                + ' gap-2'
                            }"
                        >
                            <code
                                style="${
                                    trusted(
                                    'font-'
                                    + 'size:'
                                    + '0.75'
                                    + 'rem;'
                                    + 'back'
                                    + 'grou'
                                    + 'nd:'
                                    + 'hsl('
                                    + 'var('
                                    + '--mu'
                                    + 'ted'
                                    + '));'
                                    + 'padd'
                                    + 'ing:'
                                    + '0.12'
                                    + '5rem'
                                    + ' '
                                    + '0.5'
                                    + 'rem;'
                                    + 'bord'
                                    + 'er-'
                                    + 'radi'
                                    + 'us:'
                                    + '0.25'
                                    + 'rem'
                                )}"
                            >${
                                column
                                    .originalName
                            }</code>
                            ${column
                                .isAcronym
                                ? html`<span
                                    class="pill"
                                    style="${
                                        trusted(
                                        'background'
                                        + ':hsl(var'
                                        + '(--warning'
                                        + ')/0.1);'
                                        + 'color:'
                                        + 'hsl(var'
                                        + '(--warning'
                                        + '));border'
                                        + ':1px '
                                        + 'solid '
                                        + 'hsl(var'
                                        + '(--warning'
                                        + ')/0.2)'
                                    )}"
                                >Acronym</span>`
                                : html``}
                        </div>
                        <p
                            class="${
                                'text-sm'
                                + ' text-'
                                + 'muted'
                            }"
                            style="${
                                'margin-'
                                + 'top:'
                                + '0.25'
                                + 'rem'
                            }"
                        >
                            ${displayText(
                                column
                                .friendlyName,
                            )}
                        </p>
                    </div>
                    <div
                        class="${
                            'flex'
                            + ' items-'
                            + 'center'
                            + ' gap-3'
                        }"
                    >
                        <div
                            class="${
                                'text-'
                                + 'right'
                                + ' hidden'
                                + '-mobile'
                            }"
                        >
                            <p
                                class="${
                                    'text'
                                    + '-xs'
                                    + ' text'
                                    + '-muted'
                                }"
                            >Sample values</p>
                            <p class="${
                                'text-sm'
                            }">
                                ${column
                                    .sampleValues
                                    .slice(
                                        0,
                                        2,
                                    )
                                    .map(v =>
                                        column
                                            .dataType
                                            === 'date'
                                            ? formatDate(
                                                v,
                                            )
                                            : v,
                                    )
                                    .join(
                                        ', ',
                                    )}
                            </p>
                        </div>
                        ${isExpanded
                            ? iconChevronDown(
                                20,
                                'text-muted',
                            )
                            : iconChevronRight(
                                20,
                                'text-muted',
                            )}
                    </div>
                </div>
            </div>
            ${isExpanded
                ? this.#buildExpandedPanel(
                    column,
                )
                : html``}
        </div>`;
    }

    #buildExpandedPanel(
        column: CrunchColumn,
    ): SafeHtml {
        return html`
        <div
            style="${
                'padding:'
                + '0 1rem'
                + ' 1rem;'
                + 'border-top:'
                + '1px solid '
                + 'hsl('
                + 'var(--border'
                + '));'
                + 'padding-top:'
                + '1rem;'
                + 'background:'
                + 'hsl('
                + 'var(--muted)'
                + '/0.2)'
            }"
        >
            <div
                class="${
                    'convert-grid'
                }"
                style="gap:1rem"
            >
                <div>
                    <label
                        class="${
                            'label'
                            + ' mb-1'
                            + ' text'
                            + '-xs'
                        }"
                    >
                        ${'What'
                            + ' would'
                            + ' you'
                            + ' call'
                            + ' this'
                            + ' column?'}
                    </label>
                    <input
                        class="input"
                        data-column-id="${
                            column.id}"
                        data-field-name="${
                            'friendlyName'
                        }"
                        placeholder="${
                            'e.g.,'
                            + ' Customer'
                            + ' ID'}"
                        value="${
                            column
                            .friendlyName}"
                    />
                </div>
                <div>
                    <label
                        class="${
                            'label'
                            + ' mb-1'
                            + ' text'
                            + '-xs'
                        }"
                    >Data type</label>
                    <select
                        class="input"
                        data-column-id="${
                            column.id}"
                        data-field-name="${
                            'dataType'}"
                    >
                        <option
                            value="text"
                            ${trusted(
                                column
                                    .dataType
                                === 'text'
                                ? 'selected'
                                : ''
                            )}
                        >Text</option>
                        <option
                            value="${
                                'number'
                            }"
                            ${trusted(
                                column
                                    .dataType
                                === 'number'
                                ? 'selected'
                                : ''
                            )}
                        >Number</option>
                        <option
                            value="date"
                            ${trusted(
                                column
                                    .dataType
                                === 'date'
                                ? 'selected'
                                : ''
                            )}
                        >Date</option>
                        <option
                            value="${
                                'boolean'
                            }"
                            ${trusted(
                                column
                                    .dataType
                                === 'boolean'
                                ? 'selected'
                                : ''
                            )}
                        >Yes/No</option>
                    </select>
                </div>
            </div>
            ${column.isAcronym
                ? html`
            <div
                style="${
                    'margin-top:'
                    + '1rem'
                }"
            >
                <label
                    class="${
                        'label'
                        + ' mb-1'
                        + ' text'
                        + '-xs'
                    }"
                >
                    What does
                    "${column
                        .originalName}"
                    stand for?
                </label>
                <input
                    class="input"
                    data-column-id="${
                        column.id}"
                    data-field-name="${
                        'acronym'
                        + 'Expansion'}"
                    placeholder="${
                        'e.g.,'
                        + ' Customer'
                        + ' Identifier'
                    }"
                    value="${
                        column
                        .acronymExpansion}"
                />
            </div>
            ` : html``}
            <div
                style="${
                    'margin-top:'
                    + '1rem'
                }"
            >
                <label
                    class="${
                        'label'
                        + ' mb-1'
                        + ' text'
                        + '-xs'
                    }"
                >
                    ${'Describe'
                        + ' what'
                        + ' this'
                        + ' column'
                        + ' contains'}
                </label>
                <textarea
                    class="textarea"
                    data-column-id="${
                        column.id}"
                    data-field-name="${
                        'description'}"
                    placeholder="${
                        'e.g., A'
                        + ' unique'
                        + ' identifier'
                        + ' assigned'
                        + ' to'
                        + ' each'
                        + ' customer'
                        + '...'
                    }"
                    style="${
                        'resize:none'
                    }"
                    rows="2"
                >${
                    column
                        .description
                }</textarea>
            </div>
        </div>`;
    }
}
