import {
    html, setHtml, SafeHtml,
} from '../safe-html.ts';
import { mutateSlot } from '../dom.ts';
import { initials } from '../format.ts';
import { displayText } from '../format.ts';
import {
    ICON_SIZE,
    iconArrowLeft,
    iconExternalLink,
    iconMail,
    iconPhone,
    iconShield,
} from '../icons.ts';
import {
    Identity,
    IDENTITY_WITHOUT_PII_NAME,
    UNNAMED_SERVICE_NAME,
    type MemberPii,
    type ServiceFacet,
    type IdentityCredentialKind,
    type IdentityKind,
    type ClientRegistration,
    type ClientStatus,
} from '../adapters/index.ts';
import { buildReadonlyField } from './detail-field.ts';

const KIND_LABEL: Readonly<
    Record<IdentityKind, string>
> = {
    person: 'Person',
    service: 'Service',
};

export interface IdentityDetailView {
    readonly identity: Identity;
    readonly pii: MemberPii;
    readonly service: ServiceFacet;
    readonly activeCredentialKinds:
        readonly IdentityCredentialKind[];
    readonly registration: ClientRegistration;
}

function buildShell(container: HTMLElement): void {
    setHtml(container, html`
<div class="identity-detail-host">
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
                    id="identity-back-btn"
                    data-identity-action="back"
                    aria-label="Back">
                    ${iconArrowLeft(ICON_SIZE.xl, '')}
                </button>
                <div class="identity-title-slot">
                </div>
            </div>
            <div class="${
                'flex items-center gap-2'
                + ' identity-actions-slot'
            }"></div>
        </div>
        <div class="${
            'stack-lg identity-cards-slot'
        }"></div>
    </div>
</div>`);
}

function buildAvatar(initialsStr: string): SafeHtml {
    return html`
        <div class="identity-avatar">
            <span class="${
                'text-3xl font-bold'
                + ' text-primary'
            }">${initialsStr}</span>
        </div>`;
}

function buildTitleSection(
    view: IdentityDetailView,
): SafeHtml {
    const kind = view.identity.kindValue();
    const name = view.identity.isPerson()
        ? (view.pii.erased
            ? IDENTITY_WITHOUT_PII_NAME
            : view.pii.name)
        : (view.service.named
            ? view.service.name
            : UNNAMED_SERVICE_NAME);
    return html`
        <div class="${
            'flex flex-wrap items-center'
            + ' gap-3 mb-2'
        }">
            <h1 class="${
                'text-xl font-display font-bold'
            }">
                ${name}
            </h1>
            <span class="badge badge-secondary text-xs">
                ${KIND_LABEL[kind]}
            </span>
        </div>
        <p class="text-sm text-muted">
            ${view.identity.idForLink()}
        </p>`;
}

function buildBio(value: string): SafeHtml {
    return html`
        <div>
            <p class="label mb-2 block">Bio</p>
            <p class="text-sm">
                ${displayText(value)}
            </p>
        </div>`;
}

function buildPersonalInfoCard(
    view: IdentityDetailView,
): SafeHtml {
    const name = view.pii.erased
        ? IDENTITY_WITHOUT_PII_NAME
        : view.pii.name;
    const email = view.pii.erased ? '' : view.pii.email;
    const phone = view.pii.erased ? '' : view.pii.phone;
    const bio = view.pii.erased ? '' : view.pii.bio;
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold mb-4'
            }">Personal Information</h3>
            <div class="${
                'flex items-start gap-6 mb-6'
            }">
                ${buildAvatar(initials(name))}
                <div class="flex-1">
                    ${buildReadonlyField('Name', name)}
                </div>
            </div>
            <div class="${
                'grid grid-cols-2 gap-4 mb-4'
            }">
                ${buildReadonlyField(
                    'Email', email, iconMail(ICON_SIZE.base, ''),
                )}
                ${buildReadonlyField(
                    'Phone', phone, iconPhone(ICON_SIZE.base, ''),
                )}
            </div>
            ${buildBio(bio)}
        </div>`;
}

const REGISTRATION_TONE: Readonly<
    Record<ClientStatus, string>
> = {
    active: 'success',
    disabled: 'warning',
};

function buildRegistrationFields(
    registration: Extract<
        ClientRegistration, { registered: true }
    >,
): SafeHtml {
    return html`
        <div class="flex items-center gap-2 mb-4">
            <span class="pill" data-tone="${
                REGISTRATION_TONE[registration.status]
            }">${registration.status}</span>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
            ${buildReadonlyField(
                'Grant types', registration.grantTypes,
            )}
            ${buildReadonlyField(
                'Redirect URIs',
                registration.redirectUris,
            )}
            ${buildReadonlyField(
                'Audience', registration.aud,
            )}
            ${buildReadonlyField(
                'JWKS', registration.jwks,
            )}
        </div>`;
}

function buildRegistrationCard(
    view: IdentityDetailView,
): SafeHtml {
    const registration = view.registration;
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold mb-4'
            }">Client registration</h3>
            ${
                registration.registered
                    ? buildRegistrationFields(registration)
                    : html`<p class="${
                        'text-sm text-muted mb-4'
                    }">Not registered.</p>`
            }
            <button
                class="btn btn-outline"
                data-identity-action="registration">
                ${
                    registration.registered
                        ? 'Manage registration'
                        : 'Register client'
                }
            </button>
        </div>`;
}

function buildCredentialsCard(
    view: IdentityDetailView,
): SafeHtml {
    const kinds = view.activeCredentialKinds;
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold mb-4'
                + ' flex items-center gap-2'
            }">${
                iconShield(ICON_SIZE.xl, 'text-primary')
            } Credentials</h3>
            ${
                kinds.length === 0
                    ? html`<p class="${
                        'text-sm text-muted'
                    }">No active credentials.</p>`
                    : html`<div class="${
                        'flex flex-wrap gap-2'
                    }">${kinds.map(k =>
                        html`<span class="${
                            'badge badge-secondary'
                        }">${k}</span>`,
                    )}</div>`
            }
        </div>`;
}

function buildLinksCard(
    view: IdentityDetailView,
): SafeHtml {
    const id = view.identity.idForLink();
    return html`
        <div class="card p-6">
            <h3 class="${
                'font-display font-semibold mb-4'
            }">Connections</h3>
            <div class="flex flex-col gap-3">
                <button
                    class="btn btn-outline gap-2"
                    data-identity-link="providers"
                    data-identity-id="${id}">
                    ${iconExternalLink(ICON_SIZE.base, '')}
                    Identity Providers
                </button>
                <button
                    class="btn btn-outline gap-2"
                    data-identity-link="tokens"
                    data-identity-id="${id}">
                    ${iconExternalLink(ICON_SIZE.base, '')}
                    Tokens
                </button>
            </div>
        </div>`;
}

function buildEraseButton(): SafeHtml {
    return html`
        <button
            class="btn btn-outline gap-2"
            id="identity-erase-btn"
            data-identity-action="erase">
            Erase PII
        </button>`;
}

export class IdentityDetailPresenter {
    readonly #view: IdentityDetailView;

    constructor(view: IdentityDetailView) {
        this.#view = view;
    }

    idForLink(): string {
        return this.#view.identity.idForLink();
    }

    renderShell(container: HTMLElement): void {
        buildShell(container);
        this.renderUpdate(container);
    }

    renderUpdate(container: HTMLElement): void {
        mutateSlot(
            container,
            '.identity-title-slot',
            buildTitleSection(this.#view),
        );
        mutateSlot(
            container,
            '.identity-actions-slot',
            this.#view.identity.isPerson()
                ? buildEraseButton()
                : html``,
        );
        mutateSlot(
            container,
            '.identity-cards-slot',
            this.#view.identity.isPerson()
                ? html`
                    ${buildPersonalInfoCard(this.#view)}
                    ${buildLinksCard(this.#view)}`
                : html`
                    ${buildRegistrationCard(this.#view)}
                    ${buildCredentialsCard(this.#view)}
                    ${buildLinksCard(this.#view)}`,
        );
    }
}
