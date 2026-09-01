import { $, $$ } from './dom.ts';
import { setHtml } from './safe-html.ts';
import { navigateTo } from './navigation.ts';
import {
    organizationSwitcherHtml, wireOrganizationSwitcher,
} from './organization-switcher.ts';
import {
    shouldShowOrganizationSwitcher,
} from './adapters/organization-session.ts';
import {
    RequestError, HTTP_FORBIDDEN,
} from '../../api/http-errors.ts';
import type {
    OrganizationEntity,
} from '../../api/types.ts';

const SIDEBAR_MEMBER_NAME_IDS = [
    'sidebar-member-name',
    'mobile-sidebar-member-name',
] as const;

const SIDEBAR_MEMBER_ORGANIZATION_IDS = [
    'sidebar-member-org',
    'mobile-sidebar-member-org',
] as const;

const SIDEBAR_ORGANIZATION_SWITCHER_IDS = [
    'sidebar-org-switcher',
    'mobile-sidebar-org-switcher',
] as const;

interface SidebarMember {
    id: string;
    name: string;
    organization: string;
    organizations: ReadonlyArray<{ id: string; name: string }>;
    activeOrganizationId: string;
}

async function getSidebarMember(
    bootOrganizations:
        readonly OrganizationEntity[] | null = null,
): Promise<SidebarMember> {
    const { sessionContext } = await import('./adapters/index.ts');
    const ctx = sessionContext();
    // The chip is the caller's own row, drawn from role-independent
    // sources: id + display name from the verified token
    // (member.id === identity.id, name resolved per identity kind
    // at mint). The org enumeration is best-effort enrichment — a
    // zero-membership identity has no org claim and resolves no
    // org context (a 403), so the chip still renders its name
    // while the org line and switcher stay empty. Never call
    // activeOrganization here: it throws without an org claim.
    // When boot already fetched organizations, pass them down
    // (identity-scoped pre/post-exchange — no second GET).
    // Self-fetch only for the null degraded edge.
    let organizations: readonly OrganizationEntity[] = [];
    if (bootOrganizations !== null) {
        organizations = bootOrganizations;
    } else {
        try {
            const { getOrganizations } =
                await import(
                    './adapters/organizations.ts'
                );
            organizations = await getOrganizations(ctx);
        } catch (err) {
            if (!(err instanceof RequestError
                && err.status === HTTP_FORBIDDEN)) {
                throw err;
            }
        }
    }
    const activeOrganizationId =
        ctx.identity.organization ?? '';
    const active = activeOrganizationId === ''
        ? undefined
        : organizations.find(
            o => o.id === activeOrganizationId,
        );
    return {
        id: ctx.identity.id,
        name: ctx.identity.name,
        organization: active ? active.name : '',
        organizations: organizations.map(
            o => ({ id: o.id, name: o.name }),
        ),
        activeOrganizationId,
    };
}

export async function mutateSidebarMember(
    bootOrganizations:
        readonly OrganizationEntity[] | null = null,
): Promise<void> {
    const sidebarMember = await getSidebarMember(
        bootOrganizations,
    );
    const multiOrganization = shouldShowOrganizationSwitcher(
        sidebarMember.organizations,
    );
    for (const id of SIDEBAR_MEMBER_NAME_IDS) {
        const el = $(`#${id}`, document);
        if (el) el.textContent = sidebarMember.name;
    }
    // Single-org members read the org as plain text; multi-org
    // members get the switcher below, so the line is cleared to
    // avoid naming the org twice.
    for (const id of SIDEBAR_MEMBER_ORGANIZATION_IDS) {
        const el = $(`#${id}`, document);
        if (el) {
            el.textContent = multiOrganization
                ? ''
                : sidebarMember.organization;
        }
    }
    const switcher = organizationSwitcherHtml(sidebarMember.organizations);
    for (const id of SIDEBAR_ORGANIZATION_SWITCHER_IDS) {
        const el = $(`#${id}`, document);
        if (el) setHtml(el, switcher);
    }
    wireOrganizationSwitcher(sidebarMember.activeOrganizationId);
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
