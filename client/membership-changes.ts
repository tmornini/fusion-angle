import {
    createSubscriptionChannel,
} from './channels.ts';

// A membership write is one fact the invitations
// surface and the roster both show. The channels live
// here so neither client module imports the other.
const invitationChanges = createSubscriptionChannel();
const humanMemberChanges = createSubscriptionChannel();
const aiMemberChanges = createSubscriptionChannel();
const serviceMemberChanges = createSubscriptionChannel();

export function subscribeInvitationChanges(
    fn: () => void,
): () => void {
    return invitationChanges.subscribe(fn);
}

export function subscribeHumanMemberChanges(
    fn: () => void,
): () => void {
    return humanMemberChanges.subscribe(fn);
}

export function subscribeAIMemberChanges(
    fn: () => void,
): () => void {
    return aiMemberChanges.subscribe(fn);
}

export function subscribeServiceMemberChanges(
    fn: () => void,
): () => void {
    return serviceMemberChanges.subscribe(fn);
}

export function notifyMembershipChanges(): void {
    invitationChanges.notify();
    humanMemberChanges.notify();
}

export function notifyHumanMemberChanges(): void {
    humanMemberChanges.notify();
}

export function notifyAIMemberChanges(): void {
    aiMemberChanges.notify();
}

export function notifyServiceMemberChanges(): void {
    serviceMemberChanges.notify();
}
