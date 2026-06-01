import {
    html, setHtml, SafeHtml, trusted,
} from '../safe-html.ts';
import { $required } from '../dom.ts';
import { initials } from '../core.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import {
    iconArrowLeft,
    iconEdit,
    iconSave,
    iconX,
    iconMail,
    iconPhone,
    iconBriefcase,
    iconStar,
    iconCheckCircle2,
} from '../icons.ts';
import {
    HumanWorker,
    WORKER_STATE_CONFIG,
    type WorkerState,
    type HumanWorkerDraft,
    isWorkerState,
    jsonArrayField,
} from '../adapters/index.ts';
import {
    WorkingStylesPresenter,
} from './working-styles.ts';

const ALL_STRENGTHS: readonly string[] = [
    'Strategic Planning',
    'Data Analysis',
    'Stakeholder Management',
    'Agile Methods',
    'Team Leadership',
    'Risk Management',
    'Budget Planning',
    'Technical Writing',
    'User Research',
    'Prototyping',
];

const DEPARTMENTS: readonly string[] = [
    'Product',
    'Engineering',
    'Design',
    'Sales',
    'Operations',
    'Analytics',
];

export interface HumanWorkerDraftFields {
    name: string;
    email: string;
    phone: string;
    title: string;
    department: string;
    state: WorkerState;
    bio: string;
    strengths: readonly string[];
}

export type HumanWorkerFieldKey =
    | 'name'
    | 'email'
    | 'phone'
    | 'title'
    | 'department'
    | 'state'
    | 'bio';

const FIELD_KEYS:
    ReadonlySet<HumanWorkerFieldKey> =
    new Set([
        'name', 'email',
        'phone', 'title', 'department',
        'state', 'bio',
    ]);

export function isHumanWorkerFieldKey(
    s: string | null,
): s is HumanWorkerFieldKey {
    return s !== null
        && FIELD_KEYS.has(
            s as HumanWorkerFieldKey,
        );
}

export function humanWorkerDraftFromWorker(
    worker: HumanWorker,
): HumanWorkerDraftFields {
    return {
        name: worker.name(),
        email: worker.emailAddress(),
        phone: worker.phoneNumber(),
        title: worker.titleLabel(),
        department: worker.departmentLabel(),
        state: worker.stateValue(),
        bio: worker.bioText(),
        strengths: worker.parsedStrengths(),
    };
}

export function humanWorkerPatchFromDraft(
    draft: HumanWorkerDraftFields,
): Omit<HumanWorkerDraft, 'team_dimensions'> {
    return {
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        title: draft.title,
        department: draft.department,
        bio: draft.bio,
        strengths: jsonArrayField(
            [...draft.strengths],
        ),
    };
}

function buildShell(
    container: HTMLElement,
): void {
    setHtml(container, html`
<div class="worker-detail-host">
    <div class="entity">
        <div class="${
            'flex items-start'
            + ' justify-between gap-4 mb-6'
        }">
            <div class="${
                'flex items-center gap-4'
            }">
                <button
                    class="${
                        'btn btn-ghost btn-icon'
                    }"
                    id="worker-back-btn"
                    data-worker-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(20, '')}
                </button>
                <div class="worker-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
                + ' worker-actions-slot'
            }"></div>
        </div>
        <div class="${
            'stack-lg worker-cards-slot'
        }"></div>
    </div>
</div>`);
}

function mutateSlot(
    container: HTMLElement,
    cls: string,
    markup: SafeHtml,
): void {
    setHtml($required(cls, container), markup);
}

function buildAvatar(
    initialsStr: string,
): SafeHtml {
    return html`
        <div class="worker-avatar">
            <span class="${
                'text-3xl font-bold'
                + ' text-primary'
            }">${initialsStr}</span>
        </div>`;
}

function buildReadonlyTitleSection(
    worker: HumanWorker,
): SafeHtml {
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl'
                + ' font-display'
                + ' font-bold'
            }">
                ${worker.name()}
            </h1>
            <span class="${
                'badge '
                + worker.stateClassName()
                + ' text-xs'
            }">
                ${worker.stateLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${worker.titleLabel()}
            •
            ${worker.departmentLabel()}
        </p>`;
}

function buildEditableTitleSection(
    worker: HumanWorker,
    draft: HumanWorkerDraftFields,
): SafeHtml {
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl'
                + ' font-display'
                + ' font-bold'
            }">
                ${worker.name()}
            </h1>
            <span class="${
                'badge '
                + worker.stateClassName()
                + ' text-xs'
            }">
                ${worker.stateLabel()}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${draft.title}
            • ${draft.department}
        </p>`;
}

function buildReadonlyField(
    label: string,
    value: string,
    icon?: SafeHtml,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }">${
                icon ?? html``
            } ${label}</p>
            <p class="text-sm">
                ${value === '' ? DISPLAY_ABSENT : value}
            </p>
        </div>`;
}

function buildEditableField(
    id: string,
    field: HumanWorkerFieldKey,
    label: string,
    value: string,
    inputType: string,
    icon?: SafeHtml,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 flex'
                + ' items-center gap-2'
            }" for="${id}">${
                icon ?? html``
            } ${label}</label>
            <input class="input"
                id="${id}"
                type="${inputType}"
                data-worker-field="${field}"
                value="${value}" />
        </div>`;
}

function buildEditableDepartment(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="worker-department"
            >Department</label>
            <select class="input"
                id="worker-department"
                data-worker-field="department"
            >${DEPARTMENTS.map(d =>
                html`<option
                    value="${d}"
                    ${trusted(
                        value === d
                            ? 'selected'
                            : '',
                    )}
                >${d}</option>`)
            }</select>
        </div>`;
}

function buildEditableState(
    value: WorkerState,
): SafeHtml {
    const options = (
        Object.keys(
            WORKER_STATE_CONFIG,
        ) as WorkerState[]
    ).filter(isWorkerState);
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="worker-state"
            >State</label>
            <select class="input"
                id="worker-state"
                data-worker-field="state"
            >${options.map(s =>
                html`<option
                    value="${s}"
                    ${trusted(
                        value === s
                            ? 'selected'
                            : '',
                    )}
                >${
                    WORKER_STATE_CONFIG[s].label
                }</option>`)
            }</select>
        </div>`;
}

function buildReadonlyBio(
    value: string,
): SafeHtml {
    return html`
        <div>
            <p class="${
                'label mb-2 block'
            }">Bio</p>
            <p class="text-sm">
                ${value === '' ? DISPLAY_ABSENT : value}
            </p>
        </div>`;
}

function buildEditableBio(
    value: string,
): SafeHtml {
    return html`
        <div>
            <label class="${
                'label mb-2 block'
            }" for="worker-bio">Bio</label>
            <textarea class="textarea"
                rows="3"
                id="worker-bio"
                data-worker-field="bio"
            >${value}</textarea>
        </div>`;
}

function buildPersonalInfoCard(
    body: SafeHtml,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display'
                + ' font-semibold mb-4'
            }">Personal Information</h3>
            ${body}
        </div>`;
}

function buildReadonlyPersonalInfoBody(
    worker: HumanWorker,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar(
                initials(worker.name()),
            )}
            <div class="flex-1">
                ${buildReadonlyField(
                    'Name',
                    worker.name(),
                )}
            </div>
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildReadonlyField(
                'Email',
                worker.emailAddress(),
                iconMail(16, ''),
            )}
            ${buildReadonlyField(
                'Phone',
                worker.phoneNumber(),
                iconPhone(16, ''),
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildReadonlyField(
                'Title',
                worker.titleLabel(),
                iconBriefcase(16, ''),
            )}
            ${buildReadonlyField(
                'Department',
                worker.departmentLabel(),
            )}
        </div>
        ${buildReadonlyBio(worker.bioText())}`;
}

function buildEditablePersonalInfoBody(
    worker: HumanWorker,
    draft: HumanWorkerDraftFields,
): SafeHtml {
    return html`
        <div class="${
            'flex items-start gap-6 mb-6'
        }">
            ${buildAvatar(
                initials(worker.name()),
            )}
            <div class="flex-1">
                ${buildEditableField(
                    'worker-name',
                    'name',
                    'Name',
                    draft.name,
                    'text',
                )}
            </div>
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableField(
                'worker-email',
                'email',
                'Email',
                draft.email,
                'email',
                iconMail(16, ''),
            )}
            ${buildEditableField(
                'worker-phone',
                'phone',
                'Phone',
                draft.phone,
                'text',
                iconPhone(16, ''),
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableField(
                'worker-title',
                'title',
                'Title',
                draft.title,
                'text',
                iconBriefcase(16, ''),
            )}
            ${buildEditableDepartment(
                draft.department,
            )}
        </div>
        <div class="${
            'grid grid-cols-2 gap-4 mb-4'
        }">
            ${buildEditableState(draft.state)}
        </div>
        ${buildEditableBio(draft.bio)}`;
}

function buildStrengthsCard(
    chips: SafeHtml,
): SafeHtml {
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold'
                + ' mb-4 flex items-center gap-2'
            }">${
                iconStar(20, 'text-primary')
            } Strengths</h3>
            <div class="${
                'flex flex-wrap gap-2'
            }" id="worker-strengths">
                ${chips}
            </div>
        </div>`;
}

function buildSelectedStrengthChips(
    strengths: readonly string[],
): SafeHtml {
    return html`${strengths.map(
        name => html`<span class="${
            'pill-tag'
            + ' pill-tag-strength'
        }">${
            iconStar(10, '')
        } ${name}</span>`,
    )}`;
}

function buildEditableStrengthChips(
    strengths: readonly string[],
): SafeHtml {
    const draftSet = new Set(strengths);
    return html`${ALL_STRENGTHS.map(name => {
        const isActive = draftSet.has(name);
        const variant = isActive
            ? 'btn-primary'
            : 'btn-secondary';
        return html`<button class="${
            'strength-chip btn '
            + variant
            + ' btn-sm'
        }" data-strength="${name}">${
            isActive
                ? html`${
                    iconCheckCircle2(12, '')
                } `
                : html``
        }${name}</button>`;
    })}`;
}

function buildReadonlyActionButtons(
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="worker-edit-btn"
            data-worker-action="edit">
            ${iconEdit(16, '')} Edit
        </button>`;
}

function buildEditableActionButtons(
): SafeHtml {
    return html`
        <button
            class="${
                'btn btn-outline gap-2'
            }"
            id="worker-cancel-btn"
            data-worker-action="cancel">
            ${iconX(16, '')} Cancel
        </button>
        <button
            class="${
                'btn btn-primary gap-2'
            }"
            id="worker-save-btn"
            data-worker-action="save">
            ${iconSave(16, '')} Save
        </button>`;
}

function buildTeamDimensionsCard(
    worker: HumanWorker,
): SafeHtml {
    return new WorkingStylesPresenter(
        worker.parsedTeamDimensions(),
    ).buildCard();
}

export class HumanWorkerDetailPresenter {
    readonly #worker: HumanWorker;

    constructor(worker: HumanWorker) {
        this.#worker = worker;
    }

    idForLink(): string {
        return this.#worker.idForLink();
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateSlot(
            container,
            '.worker-title-slot',
            buildReadonlyTitleSection(
                this.#worker,
            ),
        );
        mutateSlot(
            container,
            '.worker-actions-slot',
            buildReadonlyActionButtons(),
        );
        mutateSlot(
            container,
            '.worker-cards-slot',
            html`
                ${buildPersonalInfoCard(
                    buildReadonlyPersonalInfoBody(
                        this.#worker,
                    ),
                )}
                ${buildTeamDimensionsCard(
                    this.#worker,
                )}
                ${buildStrengthsCard(
                    buildSelectedStrengthChips(
                        this.#worker
                            .parsedStrengths(),
                    ),
                )}`,
        );
    }
}

export class HumanWorkerDetailEditPresenter {
    readonly #worker: HumanWorker;
    readonly #draft: HumanWorkerDraftFields;

    constructor(
        worker: HumanWorker,
        draft: HumanWorkerDraftFields,
    ) {
        this.#worker = worker;
        this.#draft = draft;
    }

    idForLink(): string {
        return this.#worker.idForLink();
    }

    draft(): HumanWorkerDraftFields {
        return this.#draft;
    }

    renderShell(
        container: HTMLElement,
    ): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(
        container: HTMLElement,
    ): void {
        mutateSlot(
            container,
            '.worker-title-slot',
            buildEditableTitleSection(
                this.#worker, this.#draft,
            ),
        );
        mutateSlot(
            container,
            '.worker-actions-slot',
            buildEditableActionButtons(),
        );
        mutateSlot(
            container,
            '.worker-cards-slot',
            html`
                ${buildPersonalInfoCard(
                    buildEditablePersonalInfoBody(
                        this.#worker,
                        this.#draft,
                    ),
                )}
                ${buildTeamDimensionsCard(
                    this.#worker,
                )}
                ${buildStrengthsCard(
                    buildEditableStrengthChips(
                        this.#draft.strengths,
                    ),
                )}`,
        );
    }
}
