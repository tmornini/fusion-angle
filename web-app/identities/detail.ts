import { $required } from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import {
    navigateTo, openDialog, closeDialog,
    handleDialogClick,
} from '../app/core.ts';
import {
    sessionContext,
    getIdentity,
    getMemberPii,
    getServiceFacet,
    deleteIdentityPii,
    getIdentityCredentialState,
    getClientRegistration,
    putClientRegistration,
    deleteClientRegistration,
    subscribeIdentityChanges,
    Identity,
    type MemberPii,
    type ServiceFacet,
    type IdentityCredentialKind,
    type ClientRegistration,
} from '../app/adapters/index.ts';
import {
    IdentityDetailPresenter,
    type IdentityDetailView,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

let pageContainer: HTMLElement | null = null;
let currentId: string | null = null;
let lastLoaded: LoadedIdentity | null = null;

interface LoadedIdentity {
    identity: Identity;
    pii: MemberPii;
    service: ServiceFacet;
    activeCredentialKinds:
        readonly IdentityCredentialKind[];
    registration: ClientRegistration;
}

async function loadIdentity(
    identityId: string,
): Promise<LoadedIdentity> {
    const ctx = sessionContext();
    const identity =
        await getIdentity(ctx, identityId);
    const pii = await getMemberPii(ctx, identityId);
    const service: ServiceFacet = identity.isService()
        ? await getServiceFacet(ctx, identityId)
        : { named: false };
    const activeCredentialKinds = identity.isService()
        ? (await getIdentityCredentialState(
            ctx, identityId,
        )).active
        : [];
    const registration: ClientRegistration =
        identity.isService()
            ? await getClientRegistration(ctx, identityId)
            : { registered: false };
    return {
        identity, pii, service, activeCredentialKinds,
        registration,
    };
}

function buildView(
    loaded: LoadedIdentity,
): IdentityDetailView {
    return {
        identity: loaded.identity,
        pii: loaded.pii,
        service: loaded.service,
        activeCredentialKinds:
            loaded.activeCredentialKinds,
        registration: loaded.registration,
    };
}

export async function init(
    params?: Record<string, string>,
): Promise<void> {
    const identityId = params?.identityId;
    if (!identityId) {
        navigateTo('identities');
        return;
    }
    currentId = identityId;

    const container = $required(
        '#identity-detail-content', document,
    );
    pageContainer = container;

    await loadInto({
        container,
        skeleton: buildSkeleton('detail', 4),
        fetch: () => loadIdentity(identityId),
        retry: () => init(params),
        onData: loaded => {
            lastLoaded = loaded;
            new IdentityDetailPresenter(
                buildView(loaded),
            ).renderShell(container);
            bindListeners(container);
            subscribeIdentityChanges(
                () => void refresh(),
            );
        },
    });
}

async function refresh(): Promise<void> {
    if (!currentId || !pageContainer) return;
    const loaded = await loadIdentity(currentId);
    lastLoaded = loaded;
    new IdentityDetailPresenter(buildView(loaded))
        .renderUpdate(pageContainer);
}

function bindListeners(container: HTMLElement): void {
    container.addEventListener(
        'click', e => void onClick(e),
        { signal },
    );
    // The erase dialog sits outside the page container, so its
    // cancel/backdrop clicks route through a document delegate —
    // one voice with every other dialog surface.
    document.addEventListener(
        'click',
        e => {
            const target = e.target;
            if (target instanceof Element) {
                handleDialogClick(target, e);
            }
        },
        { signal },
    );
    $required(
        '[data-action="confirm-erase"]',
        document,
    ).addEventListener(
        'click',
        () => {
            closeDialog('confirm-erase');
            void performErase();
        },
        { signal },
    );
    $required(
        '#client-registration-submit', document,
    ).addEventListener(
        'click', () => void saveRegistration(), { signal },
    );
    $required(
        '#client-registration-deregister', document,
    ).addEventListener(
        'click', () => void deregisterClient(), { signal },
    );
}

async function onClick(e: MouseEvent): Promise<void> {
    const target = e.target as Element | null;
    if (!target) return;

    const linkEl = target.closest('[data-identity-link]');
    const link = linkEl?.getAttribute(
        'data-identity-link',
    );
    if (link === 'providers' && currentId) {
        navigateTo('identity-providers', {
            identityId: currentId,
        });
        return;
    }
    if (link === 'tokens' && currentId) {
        navigateTo('identity-tokens', {
            identityId: currentId,
        });
        return;
    }

    const actionEl = target.closest(
        '[data-identity-action]',
    );
    const action = actionEl?.getAttribute(
        'data-identity-action',
    );
    if (action === 'back') {
        navigateTo('identities');
        return;
    }
    if (action === 'erase') {
        openDialog('confirm-erase');
        return;
    }
    if (action === 'registration') {
        prefillRegistrationDialog();
        openDialog('client-registration');
    }
}

async function performErase(): Promise<void> {
    if (!currentId || !pageContainer) return;
    try {
        await deleteIdentityPii(
            sessionContext(), currentId,
        );
    } catch (err) {
        log.error(
            'deleteIdentityPii failed',
            'identities', err,
        );
        showToast('Failed to erase PII', 'error');
        return;
    }
    showToast('Personal information erased', 'success');
    await refresh();
}

function registrationField(
    selector: string,
): HTMLInputElement {
    return $required(
        selector, document,
    ) as HTMLInputElement;
}

function prefillRegistrationDialog(): void {
    const registration = lastLoaded?.registration;
    const filled = registration?.registered === true
        ? registration
        : undefined;
    registrationField('#reg-grant-types').value =
        filled?.grantTypes ?? '';
    registrationField('#reg-redirect-uris').value =
        filled?.redirectUris ?? '';
    registrationField('#reg-aud').value =
        filled?.aud ?? '';
    registrationField('#reg-jwks').value =
        filled?.jwks ?? '';
    registrationField('#reg-status').value =
        filled?.status ?? 'active';
    $required(
        '#client-registration-deregister', document,
    ).classList.toggle('hidden', filled === undefined);
}

async function saveRegistration(): Promise<void> {
    if (!currentId) return;
    const grantTypes =
        registrationField('#reg-grant-types').value.trim();
    const aud = registrationField('#reg-aud').value.trim();
    const jwks = registrationField('#reg-jwks').value.trim();
    if (grantTypes === '' || aud === '' || jwks === '') {
        showToast(
            'Grant types, audience, and JWKS are required',
            'error',
        );
        return;
    }
    try {
        await putClientRegistration(
            sessionContext(), currentId, {
                grantTypes,
                redirectUris: registrationField(
                    '#reg-redirect-uris',
                ).value.trim(),
                jwks,
                aud,
                status: registrationField('#reg-status')
                    .value as 'active' | 'disabled',
            },
        );
    } catch (err) {
        log.error(
            'putClientRegistration failed',
            'identities', err,
        );
        showToast('Failed to save registration', 'error');
        return;
    }
    showToast('Client registration saved', 'success');
    closeDialog('client-registration');
    await refresh();
}

async function deregisterClient(): Promise<void> {
    if (!currentId) return;
    try {
        await deleteClientRegistration(
            sessionContext(), currentId,
        );
    } catch (err) {
        log.error(
            'deleteClientRegistration failed',
            'identities', err,
        );
        showToast('Failed to deregister client', 'error');
        return;
    }
    showToast('Client registration removed', 'success');
    closeDialog('client-registration');
    await refresh();
}
