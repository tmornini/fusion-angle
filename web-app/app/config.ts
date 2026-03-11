// ============================================
// FUSION AI — Shared Configuration
// Status display configs used across pages.
// ============================================

import type { EdgeStatus, IdeaStatus, ConfidenceLevel } from '../../api/types';

export const edgeStatusConfig: Record<EdgeStatus | 'incomplete', { label: string; className: string }> = {
  missing:    { label: 'Edge Missing',  className: 'badge-error' },
  incomplete: { label: 'Edge Missing',  className: 'badge-error' },
  draft:      { label: 'Edge Draft',    className: 'badge-warning' },
  complete:   { label: 'Edge Complete', className: 'badge-success' },
};

export const ideaStatusConfig: Record<IdeaStatus, { label: string; className: string }> = {
  draft:          { label: 'Draft',          className: 'badge-default' },
  scored:         { label: 'Scored',         className: 'badge-primary' },
  pending_review: { label: 'Pending Review', className: 'badge-warning' },
  approved:       { label: 'Approved',       className: 'badge-success' },
  rejected:       { label: 'Sent Back',      className: 'badge-error' },
};

export const projectStatusConfig: Record<string, { label: string; className: string }> = {
  approved:     { label: 'Approved',     className: 'badge-success' },
  completed:    { label: 'Completed',    className: 'badge-primary' },
  under_review: { label: 'Under Review', className: 'badge-warning' },
  sent_back:    { label: 'Sent Back',    className: 'badge-error' },
};

export const confidenceLevelConfig: Record<ConfidenceLevel, { label: string; className: string }> = {
  high:   { label: 'High',   className: 'text-success' },
  medium: { label: 'Medium', className: 'text-warning' },
  low:    { label: 'Low',    className: 'text-error' },
};

// ── Config fallback constants ───────────────
// Used when a status/config key doesn't match known values.

export const UNKNOWN_STATUS = { label: 'Unknown', className: 'badge-default' } as const;
export const UNKNOWN_EDGE_STATUS = { label: 'Unknown', className: 'badge-default' } as const;
export const UNKNOWN_CONFIDENCE = { label: 'Unknown', className: 'text-muted' } as const;
