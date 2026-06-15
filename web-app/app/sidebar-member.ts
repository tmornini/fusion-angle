import { $, $$ } from './dom.ts';
import { setHtml } from './safe-html.ts';
import { navigateTo } from './navigation.ts';
import {
    orgSwitcherHtml, wireOrgSwitcher,
} from './org-switcher.ts';
import {
    shouldShowOrgSwitcher,
} from './adapters/org-session.ts';
import {
    RequestError, HTTP_FORBIDDEN,
} from '../../api/api.ts';
import type {
    OrganizationEntity,
} from '../../api/types.ts';

const SIDEBAR_MEMBER_NAME_IDS = [
    'sidebar-member-name',
    'mobile-sidebar-member-name',
] as const;

const SIDEBAR_MEMBER_ORG_IDS = [
    'sidebar-member-org',
    'mobile-sidebar-member-org',
] as const;

const SIDEBAR_ORG_SWITCHER_IDS = [
    'sidebar-org-switcher',
    'mobile-sidebar-org-switcher',
] as const;

interface SidebarMember {
    id: string;
    name: string;
    organization: string;
    orgs: ReadonlyArray<{ id: string; name: string }>;
    activeOrgId: string;
}

async function getSidebarMember(
): Promise<SidebarMember> {
    const { sessionContext } = await import('./adapters');
    const { getOrganizations } =
        await import('./adapters/organizations.ts');
    const { activeOrg } =
        await import('./adapters/shared.ts');
    const ctx = sessionContext();
    // The chip is the caller's own row, drawn from role-independent
    // sources: id + display name from the verified token
    // (member.id === identity.id, name resolved per identity kind
    // at mint). The org enumeration is best-effort enrichment — a
    // zero-membership identity resolves no org context (a 403), so
    // the chip still renders its name while the org line and
    // switcher stay empty.
    let orgs: OrganizationEntity[] = [];
    try {
        orgs = await getOrganizations(ctx);
    } catch (err) {
        if (!(err instanceof RequestError
            && err.status === HTTP_FORBIDDEN)) {
            throw err;
        }
    }
    const activeOrgId = activeOrg(ctx);
    const active = orgs.find(o => o.id === activeOrgId);
    return {
        id: ctx.identity.id,
        name: ctx.identity.name,
        organization: active ? active.name : '',
        orgs: orgs.map(o => ({ id: o.id, name: o.name })),
        activeOrgId,
    };
}

export async function mutateSidebarMember(
): Promise<void> {
    const sidebarMember = await getSidebarMember();
    const multiOrg = shouldShowOrgSwitcher(sidebarMember.orgs);
    for (const id of SIDEBAR_MEMBER_NAME_IDS) {
        const el = $(`#${id}`, document);
        if (el) el.textContent = sidebarMember.name;
    }
    // Single-org members read the org as plain text; multi-org
    // members get the switcher below, so the line is cleared to
    // avoid naming the org twice.
    for (const id of SIDEBAR_MEMBER_ORG_IDS) {
        const el = $(`#${id}`, document);
        if (el) {
            el.textContent = multiOrg
                ? ''
                : sidebarMember.organization;
        }
    }
    const switcher = orgSwitcherHtml(sidebarMember.orgs);
    for (const id of SIDEBAR_ORG_SWITCHER_IDS) {
        const el = $(`#${id}`, document);
        if (el) setHtml(el, switcher);
    }
    wireOrgSwitcher(sidebarMember.activeOrgId);
    const chips = $$('.sidebar-member', document);
    for (const chip of chips) {
        chip.addEventListener(
            'click',
            () => navigateTo(
                'member-detail',
                { memberId: sidebarMember.id },
            ),
        );
    }
}
