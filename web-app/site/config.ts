// ============================================
// FUSION AI — Shared Configuration
// Status display configs used across pages.
// ============================================

import type { EdgeStatus } from '../../api/types';

export const edgeStatusConfig: Record<EdgeStatus | 'incomplete', { label: string; className: string }> = {
  missing:    { label: 'Edge Missing',  className: 'badge-error' },
  incomplete: { label: 'Edge Missing',  className: 'badge-error' },
  draft:      { label: 'Edge Draft',    className: 'badge-warning' },
  complete:   { label: 'Edge Complete', className: 'badge-success' },
};
