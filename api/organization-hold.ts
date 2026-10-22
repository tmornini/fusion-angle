import type { StatementBind } from
    '../shared/ledger-statement.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';
import { parsedMembershipName } from
    '../shared/membership-name.ts';
import { MEMBERSHIPS_PATH } from './memberships.ts';

// The organization's genesis row is where a flow write and
// a roster write of one organization meet: the flow write
// holds it shared for its whole transaction, the roster
// write — a PUT or DELETE of a seat, an AI, or a service —
// takes it exclusive before its statement, so a roster
// change lands before the flow's law read or after the
// flow's commit, never between. The ledger only appends, so
// the row never changes and the hold adds no data.

// Every organization's document: this path, name = its id.
export const ORGANIZATIONS_PATH = '/organizations/';

// The program families the flow law reads beside the seats;
// their documents live at /organizations/<org>/<family>/.
// One list serves the law's read and the roster lock, so a
// family added here is both read and locked, never one.
export const PROGRAM_FAMILIES: readonly string[] = [
    'ai-agents',
    'services',
];
const PROGRAM_FAMILY_SET: ReadonlySet<string> =
    new Set(PROGRAM_FAMILIES);

// A hold that found no row would be no hold at all.
export function noOrganizationDocument(
    organizationId: string,
): Error {
    return new Error(
        'no document for organization ' + organizationId,
    );
}

// The organizations whose rosters `rows` write: a PUT or
// DELETE row at MEMBERSHIPS_PATH names its organization in
// the first half of its name; one under a program family's
// path names it in the path. Distinct, in identifier order.
export function rosterOrganizationsOf(
    rows: readonly StatementBind[],
): string[] {
    const organizations = new Set<string>();
    for (const row of rows) {
        if (row.method !== 'PUT' && row.method !== 'DELETE') {
            continue;
        }
        if (row.path === MEMBERSHIPS_PATH) {
            const parsed = parsedMembershipName(row.name);
            if (parsed === undefined) {
                throw new Error(
                    'a roster row is named ' + row.name
                    + ', not <organization>:<identity>',
                );
            }
            organizations.add(parsed.organizationId);
            continue;
        }
        const organization = programOrganizationOf(row.path);
        if (organization !== undefined) {
            organizations.add(organization);
        }
    }
    return [...organizations].sort(compareIdentifiers);
}

// The organization of a program family's path,
// /organizations/<org>/<family>/; undefined for any other.
function programOrganizationOf(path: string): string | undefined {
    const segments = path.split('/');
    if (
        segments.length !== 5
        || segments[0] !== ''
        || segments[1] !== 'organizations'
        || segments[4] !== ''
    ) {
        return undefined;
    }
    const family = segments[3]!;
    if (!PROGRAM_FAMILY_SET.has(family)) {
        return undefined;
    }
    return segments[2]!;
}

// The organizations whose document `rows` itself PUTs. A
// roster write of one of these finds no genesis row only
// when this statement is the genesis — the seed's first
// batch — and then nothing else can see the organization,
// so that absence alone is no refusal. The latch cannot say
// which PUT creates: the seed's organization PUTs are blind.
export function ownOrganizationDocumentsOf(
    rows: readonly StatementBind[],
): ReadonlySet<string> {
    const own = new Set<string>();
    for (const row of rows) {
        if (
            row.path === ORGANIZATIONS_PATH
            && row.method === 'PUT'
        ) {
            own.add(row.name);
        }
    }
    return own;
}
