# Idea Detail Page — Design Spec

## Problem

Clicking an idea in the ideas list navigates directly to the idea-convert page. Users need a dedicated idea detail/show page for viewing and editing idea information, with a Convert button available for approved ideas.

## Solution

Create a new `idea-detail/` sidebar-layout page following the `project-detail/` pattern. The ideas list navigates to this page instead of idea-convert. The idea-detail page includes contextual action buttons (Convert, Define Edge, Review) based on idea status.

## Page: `idea-detail`

**Layout**: Sidebar (composed with `components-layout.html`)
**URL parameter**: `?ideaId=X`
**Back navigation**: Ideas list

### Header

- Back button (navigates to `ideas`)
- Title (editable in edit mode)
- Status badge (read-only, uses `ideaStatusConfig`)
- Edge status badge (read-only, uses `edgeStatusConfig`)
- Score badge (read-only)
- Edit/Save/Cancel buttons (toggle `isEditing`)
- Contextual action buttons:
  - **Convert** — shown when `status === 'approved'`, navigates to `idea-convert?ideaId=X`
  - **Define Edge** — shown when `status === 'active'` and `edgeStatus !== 'complete'`, navigates to `edge?ideaId=X`
  - **Review** — shown when `status === 'in-review'` and `edgeStatus === 'complete'`, navigates to `approval-detail?id=X`

### Content Sections

#### Overview Card
- **Description** (editable) — textarea
- **Category** (editable) — text input
- **Submitted by** (read-only) — resolved user name
- **Submitted at** (read-only) — date string

#### Problem & Solution Card
- **Problem Statement** (editable) — textarea
- **Proposed Solution** (editable) — textarea
- **Expected Outcome** (editable) — textarea

#### Estimates Card
Three metric tiles (similar to project-detail baseline comparison):
- **Impact** (editable) — number input, displayed as score value
- **Duration** (editable) — number input in days, stored as seconds via `* 86400`
- **Cost** (editable) — number input in dollars

### Module-Level State

```typescript
let isEditing = false;
```

### Data Flow

**New adapter function** `getIdeaDetail(ideaId)` in `adapters/ideas.ts`:
- Fetches `IdeaEntity` via existing `GET(`ideas/${ideaId}`)`
- Resolves user name via `buildUserMap()`
- Returns `IdeaDetail` interface with camelCase fields

**Save** uses existing `putIdea(id, entity)` with this camelCase → snake_case mapping:
- `title` → `title`
- `description` → `description`
- `category` → `category`
- `problemStatement` → `problem_statement`
- `proposedSolution` → `proposed_solution`
- `expectedOutcome` → `expected_outcome`
- `estimatedImpact` → `estimated_impact`
- `estimatedDuration` (days) → `estimated_duration` (seconds, multiply by `86400`)
- `estimatedCost` → `estimated_cost`

### IdeaDetail Interface

```typescript
export interface IdeaDetail {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  edgeStatus: EdgeStatus | 'incomplete';
  score: number;
  category: string;
  submittedBy: string;
  submittedAt: string;
  problemStatement: string;
  proposedSolution: string;
  expectedOutcome: string;
  estimatedImpact: number;
  estimatedDuration: number; // days (converted from seconds)
  estimatedCost: number;
}
```

## Files to Create

1. **`web-app/idea-detail/index.html`** — Single container div: `<div id="idea-detail-content"></div>`
2. **`web-app/idea-detail/index.ts`** — Page module following build/bind/mutate pattern

## Files to Modify

1. **`web-app/app/page-registry.ts`** — Add `'idea-detail': { title: 'Idea Detail', layout: 'sidebar' }`
2. **`web-app/app/core.ts`** — Add `'idea-detail': () => import('../idea-detail/index')` to `pageModules`
3. **`web-app/app/adapters/ideas.ts`** — Add `IdeaDetail` interface and `getIdeaDetail()` function
4. **`web-app/ideas/index.ts`** — Change navigation targets:
   - Card click: `idea-convert` → `idea-detail`
   - View button: `idea-convert` → `idea-detail`
   - Convert button: stays `idea-convert` (unchanged)

## Navigation Flow (After)

```
Ideas List
  ├── Click card / "View" → idea-detail?ideaId=X
  │     ├── "Convert" button → idea-convert?ideaId=X
  │     ├── "Define Edge" button → edge?ideaId=X
  │     ├── "Review" button → approval-detail?id=X
  │     └── Back button → ideas
  ├── "Convert" button → idea-convert?ideaId=X (unchanged)
  ├── "Define Edge" button → edge?ideaId=X (unchanged)
  └── "Review" button → approval-detail?id=X (unchanged)
```

## Intentionally Excluded Fields

These `IdeaEntity` fields are not shown on the detail page because they are either computed, workflow-managed, or only relevant in specialized views (approval-detail, review queue):

- `priority` — computed from score, displayed as score badge instead
- `readiness`, `waiting_days` — review queue metadata
- `impact_label`, `effort_label` — review queue display labels
- `risks`, `assumptions`, `alignments` — JSON arrays shown on approval-detail page
- `effort_duration_estimate`, `effort_team_size`, `cost_estimate`, `cost_breakdown` — detailed breakdown fields shown on approval-detail page

## Import Notes

- **Page module** (`idea-detail/index.ts`): imports `durationInDays` from `'../app/core'` (re-exported)
- **Adapter** (`adapters/ideas.ts`): imports `durationInDays` from `'../format'` directly (existing pattern)
- **Barrel export** (`adapters/index.ts`): no change needed — `export * from './ideas'` already re-exports all new exports

## Reusable Existing Code

- `buildSkeleton('detail')`, `buildErrorState()` from `loading-states.ts`
- `ideaStatusConfig`, `edgeStatusConfig` from `config.ts`
- `navigateTo()`, `initials()` from `core.ts`
- `$`, `$input`, `$textarea` from `dom.ts`
- `html`, `setHtml`, `SafeHtml` from `safe-html.ts`
- `showToast()` from `toast.ts`
- `iconArrowLeft`, `iconEdit`, `iconSave`, `iconX`, `iconClock`, `iconDollarSign`, `iconTrendingUp`, `iconStar`, `iconTarget`, `iconArrowRight`, `iconEye`, `iconClipboardCheck` from `icons.ts`
- `putIdea()`, `buildUserMap()`, `userName()` from adapters
- `durationInDays()` from `format.ts`
- `SCORE_BADGE_HIGH`, `SCORE_BADGE_MEDIUM` from `api/types.ts`

## Verification

1. Run `./build` — should compose the new page and produce a clean build
2. Open ideas list, click an idea card → should navigate to idea-detail page
3. Verify all fields display correctly (title, status badges, description, problem/solution/outcome, estimates)
4. Click Edit → fields become editable inputs/textareas
5. Modify fields, click Save → toast "Idea saved", fields update to new values
6. Click Cancel → reverts to view mode without saving
7. Verify contextual action buttons appear based on idea status:
   - Active idea with incomplete edge → "Define Edge" button visible
   - In-review idea with complete edge → "Review" button visible
   - Approved idea → "Convert" button visible
8. Click action buttons → navigate to correct pages
9. Back button → returns to ideas list
10. Verify duration save round-trip: edit duration to 10 days, save, reload — should still show 10 days (not 864000)
11. Verify ideas with `promoted`/`archived` status show no action buttons (only Edit)
12. Verify ideas with `in-review` status and incomplete edge show no action buttons (consistent with ideas list dead-end state)
