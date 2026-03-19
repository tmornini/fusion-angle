import type {
    EdgeStatus,
    IdeaStatus,
    ProjectStatus,
    ConfidenceLevel,
} from '../../api/types';

export const edgeStatusConfig: Record<
    EdgeStatus | 'incomplete',
    { label: string; className: string }
> = {
    missing: {
        label: 'Edge Missing',
        className: 'badge-error',
    },
    incomplete: {
        label: 'Edge Missing',
        className: 'badge-error',
    },
    draft: {
        label: 'Edge Draft',
        className: 'badge-warning',
    },
    complete: {
        label: 'Edge Complete',
        className: 'badge-success',
    },
};

export const ideaStatusConfig: Record<
    IdeaStatus,
    { label: string; className: string }
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
        className: 'badge-primary',
    },
    'promoted': {
        label: 'Promoted',
        className: 'badge-primary',
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

export const projectStatusConfig: Record<
    ProjectStatus,
    { label: string; className: string }
> = {
    'submitted': {
        label: 'Submitted',
        className: 'badge-default',
    },
    'under-review': {
        label: 'Under Review',
        className: 'badge-warning',
    },
    'sent-back': {
        label: 'Sent Back',
        className: 'badge-warning',
    },
    'approved': {
        label: 'Approved',
        className: 'badge-success',
    },
    'declined': {
        label: 'Declined',
        className: 'badge-error',
    },
    'completed': {
        label: 'Completed',
        className: 'badge-primary',
    },
    'deleted': {
        label: 'Deleted',
        className: 'badge-default',
    },
};

export const confidenceLevelConfig: Record<
    ConfidenceLevel,
    { label: string; className: string }
> = {
    high: {
        label: 'High',
        className: 'text-success',
    },
    medium: {
        label: 'Medium',
        className: 'text-warning',
    },
    low: {
        label: 'Low',
        className: 'text-error',
    },
};

export const UNKNOWN_STATUS = {
    label: 'Unknown',
    className: 'badge-default',
} as const;

export const UNKNOWN_EDGE_STATUS = {
    label: 'Unknown',
    className: 'badge-default',
} as const;

export const UNKNOWN_CONFIDENCE = {
    label: 'Unknown',
    className: 'text-muted',
} as const;
