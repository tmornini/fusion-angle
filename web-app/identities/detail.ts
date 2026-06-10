import { $required } from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import { showToast } from '../app/toast.ts';
import { log } from '../app/logger.ts';
import {
    buildSkeleton, withLoadingState,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/core.ts';
import {
    sessionContext,
    getIdentity,
    getMemberPii,
    getServiceFacet,
    deleteIdentityPii,
    getIdentityCredentialState,
    Identity,
    type MemberPii,
    type ServiceFacet,
    type IdentityCredentialKind,
} from '../app/adapters/index.ts';
import {
    IdentityDetailPresenter,
    type IdentityDetailView,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

let pageContainer: HTMLElement | null = null;
let currentId: string | null = null;

interface LoadedIdentity {
    identity: Identity;
    pii: MemberPii;
    service: ServiceFacet;
    activeCredentialKinds:
        readonly IdentityCredentialKind[];
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
    return {
        identity, pii, service, activeCredentialKinds,
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

    const loaded = await withLoadingState(
        container,
        buildSkeleton('detail', 4),
        () => loadIdentity(identityId),
        () => init(params),
    );
    if (!loaded) {
        // a load fault already rendered the
        // error-with-retry state in place
        return;
    }

    new IdentityDetailPresenter(buildView(loaded))
        .renderShell(container);
    bindListeners(container);
}

function bindListeners(container: HTMLElement): void {
    container.addEventListener(
        'click', e => void onClick(e),
        { signal },
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
        await handleErase();
    }
}

async function handleErase(): Promise<void> {
    if (!currentId || !pageContainer) return;
    const confirmed = window.confirm(
        'Erase this identity\'s personal information?'
        + ' The identity itself survives.',
    );
    if (!confirmed) return;
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
    const loaded = await loadIdentity(currentId);
    new IdentityDetailPresenter(buildView(loaded))
        .renderUpdate(pageContainer);
}
