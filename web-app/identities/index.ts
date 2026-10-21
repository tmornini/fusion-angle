import { $required } from '../app/dom.ts';
import { createPageAbort } from '../app/page-lifecycle.ts';
import {
    buildSkeleton, loadInto,
} from '../app/loading-states.ts';
import { navigateTo } from '../app/navigation.ts';
import {
    getIdentityRoster,
    subscribeIdentityChanges,
    type IdentityRosterRow,
    type RequestContext,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import {
    IdentityRosterPresenter,
} from '../app/presenters/index.ts';

const { signal } = createPageAbort();

let identityListEl: HTMLElement | null = null;

export async function init(): Promise<void> {
    const list = $required(
        '#identity-list', document,
    );

    const ctx = sessionContext();
    await loadInto({
        container: list,
        skeleton: buildSkeleton('table', 5),
        fetch: () => getIdentityRoster(ctx),
        retry: init,
        onData: roster => {
            identityListEl = list;
            renderRoster(roster);
            identityListEl.addEventListener(
                'click', onListClick,
                { signal },
            );
            subscribeIdentityChanges(
                () => void refresh(
                    sessionContext(),
                ),
            );
        },
    });
}

function renderRoster(
    roster: IdentityRosterRow[],
): void {
    if (!identityListEl) return;
    new IdentityRosterPresenter(roster)
        .render(identityListEl);
}

async function refresh(
    ctx: RequestContext,
): Promise<void> {
    if (!identityListEl) return;
    const roster = await getIdentityRoster(ctx);
    renderRoster(roster);
}

function onListClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Real links navigate themselves; the
    // delegate must not double-fire.
    if (target.closest('a[href]')) return;
    const row = target.closest('[data-identity-id]');
    if (!row) return;
    const identityId = row.getAttribute(
        'data-identity-id',
    );
    if (identityId) {
        navigateTo('identity-detail', { identityId });
    }
}
