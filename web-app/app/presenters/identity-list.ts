import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { initials } from '../core.ts';
import { DISPLAY_ABSENT } from '../format.ts';
import { buildPageUrl } from '../navigation.ts';
import { mutedEmptyNote } from './empty-note.ts';
import { ICON_SIZE, iconShield } from '../icons.ts';
import {
    IDENTITY_WITHOUT_PII_NAME,
    UNNAMED_SERVICE_NAME,
    type IdentityRosterRow,
} from '../adapters/index.ts';

const KIND_LABEL: Readonly<
    Record<IdentityRosterRow['kind'], string>
> = {
    person: 'Person',
    service: 'Service',
};

function buildPersonAvatar(name: string): SafeHtml {
    return html`
        <div class="avatar avatar-tinted">
            <span class="${
                'text-sm font-bold text-primary'
            }">${initials(name)}</span>
        </div>`;
}

function buildServiceAvatar(): SafeHtml {
    return html`
        <div class="avatar avatar-tinted">
            ${iconShield(ICON_SIZE.base, 'text-primary')}
        </div>`;
}

function buildRow(row: IdentityRosterRow): SafeHtml {
    const isPerson = row.kind === 'person';
    const name = row.kind === 'person'
        ? (row.pii.erased
            ? IDENTITY_WITHOUT_PII_NAME
            : row.pii.name)
        : (row.service.named
            ? row.service.name
            : UNNAMED_SERVICE_NAME);
    const sub = row.kind === 'person'
        ? (row.pii.erased
            ? DISPLAY_ABSENT
            : row.pii.email)
        : (row.service.named
            ? row.service.detail
            : DISPLAY_ABSENT);
    return html`
        <div class="${
            'card card-hover p-4 cursor-pointer'
            + ' flex items-center gap-4'
        }"
            data-identity-id="${row.id}">
            ${
                isPerson
                    ? buildPersonAvatar(name)
                    : buildServiceAvatar()
            }
            <div class="flex-fill min-w-0">
                <p class="font-medium truncate">
                    <a href="${
                        buildPageUrl(
                            'identity-detail',
                            {
                                identityId:
                                    row.id,
                            },
                        )
                    }">${name}</a>
                </p>
                <p class="${
                    'text-xs text-muted truncate'
                }">${sub}</p>
            </div>
            <div class="${
                'flex flex-col items-end gap-2 ml-6'
            }">
                <span class="${
                    'badge badge-secondary'
                }">${KIND_LABEL[row.kind]}</span>
            </div>
        </div>`;
}

export class IdentityRosterPresenter {
    readonly #rows: readonly IdentityRosterRow[];

    constructor(rows: readonly IdentityRosterRow[]) {
        this.#rows = rows;
    }

    render(container: HTMLElement): void {
        setHtml(container, html`${
            this.#rows.length === 0
                ? mutedEmptyNote('No identities yet.')
                : html`${this.#rows.map(buildRow)}`
        }`);
    }
}
