import { html, type SafeHtml } from './safe-html.ts';

const NONE_AVAILABLE =
    'no active organization memberships';

interface OrganizationChoice {
    readonly id: string;
    readonly name: string;
}

function defaultOrganizationCard(
    control: SafeHtml,
): SafeHtml {
    return html`<div class="card p-6">
<h3 class="${
    'font-display font-semibold mb-4'
}">Default organization</h3>
${control}
</div>`;
}

export function defaultOrganizationSelectHtml(
    organizations: readonly OrganizationChoice[],
    storedId: string | null,
): SafeHtml {
    if (organizations.length === 0) {
        return defaultOrganizationCard(html`<select
    id="default-organization"
    class="input"
    aria-label="Default organization"
    disabled
><option value="" disabled>${
            NONE_AVAILABLE
        }</option></select>`);
    }
    const options = organizations.map(organization =>
        organization.id === storedId
            ? html`<option value="${
                organization.id
            }" selected>${
                organization.name
            }</option>`
            : html`<option value="${
                organization.id
            }">${organization.name}</option>`,
    );
    return defaultOrganizationCard(html`<select
    id="default-organization"
    class="input"
    aria-label="Default organization"
    data-previous="${storedId ?? ''}"
>${options}</select>`);
}

// Only the session identity's own page gets a field.
// readStored resolves null when the default was never
// set, which is how the client maps that 404. A throw
// from either read omits the field and warns.
export async function readDefaultOrganizationField(
    pageIdentityId: string,
    sessionIdentityId: string,
    readOrganizations: () => Promise<
        readonly OrganizationChoice[]
    >,
    readStored: () => Promise<string | null>,
    warn: (err: unknown) => void,
): Promise<SafeHtml> {
    if (pageIdentityId !== sessionIdentityId) {
        return html``;
    }
    let organizations: readonly OrganizationChoice[];
    try {
        organizations = await readOrganizations();
    } catch (err) {
        warn(err);
        return html``;
    }
    let storedId: string | null;
    try {
        storedId = await readStored();
    } catch (err) {
        warn(err);
        return html``;
    }
    return defaultOrganizationSelectHtml(
        organizations,
        storedId,
    );
}

export interface DefaultOrganizationSelect {
    value: string;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
}

const SUCCESS_TOAST =
    'Set as your default organization.';
const FAILURE_TOAST =
    'Could not set the default organization.';

export async function commitDefaultOrganization(
    select: DefaultOrganizationSelect,
    put: (organization: string) => Promise<void>,
    toast: (
        message: string,
        tone: 'success' | 'error',
    ) => void,
): Promise<void> {
    const previous = select.getAttribute(
        'data-previous',
    ) ?? '';
    const next = select.value;
    if (next === '') {
        select.value = previous;
        return;
    }
    try {
        await put(next);
    } catch {
        select.value = previous;
        toast(FAILURE_TOAST, 'error');
        return;
    }
    select.setAttribute('data-previous', next);
    toast(SUCCESS_TOAST, 'success');
}
