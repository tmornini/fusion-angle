import { isIdentifier } from './identifier.ts';
import type { Id } from './types.ts';

export const MEMBERSHIP_NAME_SEPARATOR = ':';

export type MembershipName = {
    readonly organizationId: Id;
    readonly identityId: Id;
};

export function membershipNameOf(
    organizationId: Id,
    identityId: Id,
): string {
    return organizationId
        + MEMBERSHIP_NAME_SEPARATOR
        + identityId;
}

// undefined: not two identifiers joined by one ':'.
export function parsedMembershipName(
    value: string,
): MembershipName | undefined {
    const halves = value.split(MEMBERSHIP_NAME_SEPARATOR);
    if (halves.length !== 2) return undefined;
    const organizationId = halves[0];
    const identityId = halves[1];
    if (
        organizationId === undefined
        || identityId === undefined
        || !isIdentifier(organizationId)
        || !isIdentifier(identityId)
    ) {
        return undefined;
    }
    return { organizationId, identityId };
}
