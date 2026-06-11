import type {
    MemberState,
    IdeaState,
    RecordState,
    ProjectState,
    InvitationState,
} from '../../../api/types.ts';

// The badge vocabulary for entity states: what each state is
// called on screen and which design-system badge class it
// wears. Presentation truth lives beside the presenters that
// render it; the schema of record (api/types.ts) keeps only
// the state alphabets.
export interface StatusDisplay {
    label: string;
    className: string;
}

export const MEMBER_STATE_CONFIG: Record<
    MemberState,
    StatusDisplay
> = {
    active: {
        label: 'Active',
        className: 'badge-success',
    },
    pending: {
        label: 'Pending',
        className: 'badge-warning',
    },
    archived: {
        label: 'Archived',
        className: 'badge-default',
    },
};

export const IDEA_STATE_CONFIG: Record<
    IdeaState,
    StatusDisplay
> = {
    'active': {
        label: 'Active',
        className: 'badge-success',
    },
    'in-review': {
        label: 'In Review',
        className: 'badge-warning',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-success',
    },
    'promoted': {
        label: 'Promoted',
        className: 'badge-primary',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-error',
    },
    'archived': {
        label: 'Archived',
        className: 'badge-default',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const RECORD_STATE_CONFIG: Record<
    RecordState,
    StatusDisplay
> = {
    active: {
        label: 'Active',
        className: 'badge-success',
    },
    archived: {
        label: 'Archived',
        className: 'badge-default',
    },
    deleted: {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const PROJECT_STATE_CONFIG: Record<
    ProjectState,
    StatusDisplay
> = {
    'submitted': {
        label: 'Submitted',
        className: 'badge-default',
    },
    'under-review': {
        label: 'In Review',
        className: 'badge-warning',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-error',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-success',
    },
    'declined': {
        label: 'Declined',
        className: 'badge-error',
    },
    'archived': {
        label: 'Archived',
        className: 'badge-success',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const INVITATION_STATE_CONFIG: Record<
    InvitationState,
    StatusDisplay
> = {
    pending: {
        label: 'Pending',
        className: 'badge-warning',
    },
    accepted: {
        label: 'Accepted',
        className: 'badge-success',
    },
    declined: {
        label: 'Declined',
        className: 'badge-default',
    },
    revoked: {
        label: 'Revoked',
        className: 'badge-error',
    },
};
