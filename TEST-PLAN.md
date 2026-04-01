# Fusion AI — Test Plan

> **Encoding:** `- [ ]` = pending, `- [x]` = PASS, `- [FAIL]` = failure (add note)

### Protocol

All sections are executed over HTTP — serve the unzipped build via
a local HTTP server (e.g. `python3 -m http.server 8080`).

### Execution Order

Sections A through AA establish a pristine environment and populate
it with data through the UI. Sections B through J then verify every
page renders correctly against that data. The plan is designed to
run as a single continuous regression pass.

## Summary

| Section | Tests |
|---|--:|
| A. Build & Setup | 5 |
| AA. Data Entry Workflow | 54 |
| B. Entry Pages | 16 |
| C. Core: Dashboard | 7 |
| D. Core: Ideas Workflow | 52 |
| E. Core: Projects | 17 |
| F. Tools | 38 |
| G. Admin Pages | 34 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 21 |
| J. Teardown | 3 |
| **Total** | **249** |

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Unzip the archive into a temp directory (e.g. `/tmp/fusion-test`). PASS: directory contains `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), `index.html`, and 14 page directories containing 27 HTML page files total.
- [ ] **A3** Start an HTTP server from the unzipped directory (e.g. `python3 -m http.server 8080`). PASS: server starts without errors.
- [ ] **A4** Open `http://localhost:8080/` in the test browser. PASS: redirects to `snapshots/index.html` when no data exists, or `landing/index.html` (which auto-redirects to `dashboard/index.html` after ~2 seconds) when data has been loaded.
- [ ] **A5** Open DevTools Console and confirm no JavaScript errors on initial load. PASS: console is clean (warnings from browser extensions are acceptable).

---

## AA. Data Entry Workflow

This section populates a pristine environment with all data
through the UI. Each step creates data that later steps depend
on. Run these in order.

### AA1. Create Pristine Environment

- [ ] **AA1** Navigate to `snapshots/`. Click "Create Pristine Environment" and confirm the wipe dialog. PASS: redirects to dashboard. Dashboard shows empty/minimal state.
- [ ] **AA2** Open DevTools, verify localStorage has `fusion-ai:*` keys (49 tables as empty arrays plus bootstrap data).
- [ ] **AA3** Verify bootstrap data exists: user "Tony Stark" (id: `current`), company "Stark Industries" with "Business" plan.

### AA2. Create Users

- [ ] **AA4** Navigate to Organization > Users. Click "Invite User". PASS: invite dialog opens with fields for First Name, Last Name, Email, Role, Department, Status, Availability, Performance Score, Strengths, Team Dimensions, Phone, and Bio.
- [ ] **AA5** Fill all fields for user "Sarah Chen" (Engineering Manager, Engineering dept, active status). Submit. PASS: toast confirms creation, user appears in the list.
- [ ] **AA6** Repeat for all 10 users: Sarah Chen, Mike Thompson, Jessica Park, David Martinez, Emily Rodriguez (pending), Alex Kim, Marcus Johnson, David Kim, Lisa Wang, James Miller (deactivated). PASS: all 10 appear on Users page with correct name, email, role, and status badge.
- [ ] **AA7** Navigate to Teams page. PASS: users display with correct availability color coding and performance stats.

### AA3. Profile & Company Settings

- [ ] **AA8** Navigate to Profile. Edit fields (phone, bio, strengths). Click "Save Changes". PASS: toast "Profile saved successfully" appears.
- [ ] **AA9** Navigate away, return to Profile. PASS: edited fields persist with saved values.
- [ ] **AA10** Navigate to Company Settings. Edit a field (e.g. timezone). Click save. PASS: success toast appears.
- [ ] **AA11** Navigate away, return to Settings. PASS: edited field persists with saved value.

### AA4. Create Ideas

- [ ] **AA12** Navigate to Ideas. Click "Create Idea". Complete the 3-step wizard for "AI-Powered Customer Segmentation" (title, problem, solution, outcome, metrics). PASS: idea appears on ideas list.
- [ ] **AA13** Navigate to the new idea's detail page. Click "Edit". Set remaining fields: category, estimated impact, duration (days), cost. Click "Save". PASS: toast confirms save, all fields persist.
- [ ] **AA14** Repeat creation and field entry for all 11 ideas matching mock data titles. PASS: ideas list shows all 11 with correct titles.

### AA5. Score Ideas

- [ ] **AA15** Navigate to idea #1 detail. Locate the score editing section. PASS: score input is visible showing current score (0).
- [ ] **AA16** Enter score 92 for idea #1. Click save. PASS: toast confirms, score displays with correct color-coded styling.
- [ ] **AA17** Set scores for all 11 ideas (92, 87, 84, 81, 78, 74, 87, 72, 81, 45, 91). PASS: ideas list shows correct scores with priority badges and color coding.

### AA6. Submit Ideas for Review

- [ ] **AA18** Navigate to idea #1 detail (status: active). Click "Submit for Review". PASS: status changes to "In Review", button disappears.
- [ ] **AA19** Submit ideas 1, 4, 7, 8, 9, 10, 11 for review (matching mock data statuses). PASS: each transitions from active to in-review.
- [ ] **AA20** Navigate to Review Queue. PASS: the 7 submitted ideas appear with priority badges and readiness status.

### AA7. Define Edges

- [ ] **AA21** Navigate to idea #1 detail. Click "Define Edge". PASS: navigates to edge detail page with correct ideaId.
- [ ] **AA22** Set confidence to "High". Enter impact text (short-term, mid-term, long-term). Set edge owner. PASS: fields accept input.
- [ ] **AA23** Click "Add Outcome". Enter outcome name "Reduce customer churn rate". Click "Add Metric" within that outcome. Enter metric fields (Name, Target, Unit, Current). PASS: outcome and metric rows appear.
- [ ] **AA24** Add second outcome with its metrics. Click "Save". PASS: toast "Edge saved" appears.
- [ ] **AA25** Navigate away and back to edge detail. PASS: all edge data persists (confidence, impact, outcomes, metrics, owner).
- [ ] **AA26** Repeat edge creation for all 9 ideas that have edges. PASS: each edge saves with outcomes and metrics.
- [ ] **AA27** Navigate to Edges list. PASS: shows all 9 edges with correct status, confidence, owner, and outcome/metric counts.

### AA8. Approve Ideas & Convert to Projects

- [ ] **AA28** Navigate to Review Queue. Click idea #1. PASS: navigates to approval detail.
- [ ] **AA29** Click "Approve". PASS: idea status changes to approved, confirmation shown.
- [ ] **AA30** Approve idea #2 as well. Leave others in their current status. PASS: statuses match mock data (2 approved, rest in-review/active).
- [ ] **AA31** Navigate to approved idea #1. Click "Convert to Project". PASS: conversion form loads with 6 required fields (Project Name, Lead, Start Date, End Date, Budget, Priority).
- [ ] **AA32** Fill all fields. Select "Sarah Chen" as project lead. Enter first milestone "Data Pipeline Setup". Click "Create Project". PASS: navigates to project detail for the new project.
- [ ] **AA33** On project detail, click "Edit". Set progress, priority_score, and other fields to match mock data. Save. PASS: project data persists.
- [ ] **AA34** Repeat conversion for all 6 projects. PASS: Projects list shows all 6 with correct status, progress, and priority.

### AA9. Create Workflows

- [ ] **AA35** Navigate to Projects. Click into
  project #1 detail. PASS: a "Workflows" section
  is visible showing "No workflows yet" empty
  state and a "New Workflow" button.
- [ ] **AA36** Click "New Workflow". PASS: navigates
  to the workflow designer page. The SVG canvas
  shows two nodes: "New" (start, top-left with
  green border) and "Complete" (end, bottom-right
  with double green border) connected by no edges.
  Toolbar shows "+ Add State", "Re-layout", zoom
  controls, and "Save".
- [ ] **AA37** Click "+ Add State". PASS: a new node
  named "New State" appears between the start and
  complete nodes on the canvas. The node has a blue
  border and connection ports.
- [ ] **AA38** Click the new node to select it. PASS:
  properties panel appears showing State Name
  input, Description input, empty Fields list, and
  outgoing transitions. The node gets a blue glow
  effect on the canvas.
- [ ] **AA39** Rename the state to "Data Capture"
  using the properties panel name input. PASS: the
  node label updates on the canvas immediately.
- [ ] **AA40** Drag from the right port of "New" to
  the left port of "Data Capture". PASS: a new edge
  appears connecting the two nodes with a default
  name. A dashed preview line shows during the
  drag.
- [ ] **AA41** Select the new edge by clicking its
  label. PASS: edge properties panel shows
  Transition Name, Description, From/To states.
  Rename it to "begin".
- [ ] **AA42** Repeat: add a "Review" state, connect
  "Data Capture" to "Review" (name: "submit"),
  connect "Review" to "Data Capture" (name: "needs
  revision", should appear as dashed orange cycle
  edge), connect "Review" to "Complete" (name:
  "approve").
- [ ] **AA43** In the "Data Capture" properties
  panel, click "+ Add Field". Enter name "Company
  Name", type "text", check "Required". PASS:
  field appears in the fields list with a TEXT
  badge and "required" indicator.
- [ ] **AA44** Add more fields to "Data Capture":
  Contact Email (email, required), Industry (select
  with options "Technology, Finance, Healthcare"),
  Company Logo (image). PASS: all fields appear
  with correct type badges.
- [ ] **AA45** Click "Save". PASS: toast confirms
  save. Navigate away and back. PASS: all nodes,
  edges, and fields persist.

### AA10. Verify Dashboard

- [ ] **AA46** Navigate to Dashboard. PASS: gauge
  cards (Time, Cost, Impact) show aggregated values
  computed from the entered project data.
- [ ] **AA47** Header stats reflect entered data
  counts (ideas, projects, workflows). PASS:
  counts are non-zero and match.

### AA11. Edit & Verify Cycle

- [ ] **AA48** Edit idea #1: change title. Save,
  navigate to ideas list, return to detail. PASS:
  changed title persists.
- [ ] **AA49** Edit project #1: change description.
  Save, navigate away, return. PASS: changed
  description persists.
- [ ] **AA50** Edit edge #1: change confidence level.
  Save, navigate away, return. PASS: changed
  confidence persists.
- [ ] **AA51** Edit workflow: navigate to workflow
  designer, rename a state, click Save. Navigate
  away, return. PASS: changed state name persists.
- [ ] **AA52** Edit profile: change phone number.
  Save, navigate away, return. PASS: changed phone
  persists.
- [ ] **AA53** Edit company settings: change
  timezone. Save, navigate away, return. PASS:
  changed timezone persists.

### AA12. Snapshot Round-Trip

- [ ] **AA54** Navigate to Snapshots. Click
  "Download Snapshot". PASS: JSON file downloads
  with all manually-entered data. Click "Create
  Pristine Environment", confirm. PASS: all data
  wiped. Click "Upload Snapshot", select the
  downloaded file. PASS: all data restored.
  Spot-check 3 pages to confirm data matches.

---

## B. Entry Pages

### Landing Page (`landing/`)

- [ ] **B1** Page renders with marketing hero content, feature sections, and call-to-action buttons, then auto-redirects to `dashboard/index.html` after ~2 seconds. PASS: layout renders briefly, redirect occurs.
- [ ] **B2** "Get Started" (or primary CTA) is present and navigates to `auth/index.html` if clicked before the auto-redirect. PASS: button exists with correct target.
- [ ] **B3** "Sign In" link is present and navigates to `auth/index.html` if clicked before the auto-redirect. PASS: link exists with correct target.

### Auth Page (`auth/`)

- [ ] **B4** Page loads in **Sign In** mode by default. PASS: title is "Welcome back", submit button reads "Sign in →".
- [ ] **B5** On desktop (≥1024px), left panel shows branded marketing stats (10K+ Active Users, 98% Satisfaction, 50+ Integrations). PASS: two-column layout visible.
- [ ] **B6** Submit with empty fields. PASS: "Email is required" error appears below email input; input gets error styling.
- [ ] **B7** Enter `notanemail` in email, leave password empty. PASS: "Please enter a valid email address" error on email.
- [ ] **B8** Enter `test@example.com`, password `123`. PASS: "Password must be at least 6 characters" error on password.
- [ ] **B9** Enter `test@example.com`, password `password123`, click "Sign in →". PASS: button shows spinner briefly, then navigates to `dashboard/index.html`.
- [ ] **B10** Click "Don't have an account?" toggle. PASS: switches to Sign Up mode — title changes to "Get started", "Company Name" field appears, submit reads "Create account →".
- [ ] **B11** Fill valid email + password (≥6 chars) in Sign Up mode, click "Create account →". PASS: toast "Welcome to Fusion AI! Your account has been created." appears, then navigates to `onboarding/index.html`.

### Onboarding Page (`onboarding/`)

- [ ] **B12** Page renders centered welcome section with sparkle icon, "Welcome to Fusion AI" heading, and descriptive text. PASS: layout is complete, no console errors.
- [ ] **B13** Click "Go to Dashboard" button. PASS: navigates to `dashboard/index.html`.

### Auth Validation Edge Cases

- [ ] **B14** In Sign In mode, enter valid email, valid password, then clear email and submit. PASS: email error reappears.
- [ ] **B15** Toggle between Sign In and Sign Up modes multiple times. PASS: form resets cleanly each time, no layout glitches.
- [ ] **B16** Footer shows "Terms of Service and Privacy Policy" text. PASS: text is visible.

---

## C. Core: Dashboard

- [ ] **C1** Navigate to `dashboard/`. PASS: page loads with sidebar, header, and main content area.
- [ ] **C2** Sidebar shows navigation links grouped under Journey (Dashboard, Ideas, Projects, Teams), Tools (Edge, Crunch, Workflows), and Settings (Organization, Snapshots, Design System). PASS: all links present and styled.
- [ ] **C3** Header shows search bar, greeting ("Good {morning/afternoon/evening}, Tony Stark" — varies by time of day), company stats ("Stark Industries · 11 Ideas · 6 Projects · 1 Workflows"), and theme toggle. PASS: elements visible and styled.
- [ ] **C4** Dashboard displays 3 gauge/metric cards (Time, Cost, Impact) with baseline and current values. PASS: cards render with non-zero values and concentric arc gauges.
- [ ] **C6** Sidebar navigation links all function correctly. PASS: clicking a sidebar link navigates to the expected page.
- [ ] **C7** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C8** Check that seed data populates all dashboard widgets. PASS: no "No data" empty states on initial load (seed data provides content for all widgets).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: table/list shows 11 seeded ideas with title, score, priority, status, and Time/Cost/Impact stats. Ideas without estimates show "—" (em-dash) instead of zero values.
- [ ] **D1b** Click the "Performance" view toggle. PASS: cards reorder by score descending, toggle button highlights. Click "Priority" toggle. PASS: cards return to priority rank order.
- [ ] **D1c** "Idea Flow" workflow banner is visible showing the 4 stages: Create → Edge → Review → Convert. PASS: banner renders with labeled steps.
- [ ] **D2** Each idea row shows a status badge (In Review, Promoted, Active, Approved, or Archived) and an edge status badge (Edge Complete, Edge Draft, or Edge Missing). PASS: badges render with distinct colors.
- [ ] **D3** Click an idea row/title. PASS: navigates to the idea's detail or scoring page with the correct `ideaId` parameter.
- [ ] **D4** "New Idea" or "Create Idea" button is visible. PASS: clicking it navigates to `idea-create/index.html`.

### Idea Create Wizard (`idea-create/`)

- [ ] **D5** Page loads showing Step 1 of 3 ("The Problem") with a progress bar. PASS: step indicator shows step 1 active, steps 2 and 3 inactive.
- [ ] **D6** "Continue" button is disabled when Title and Problem Statement are empty. PASS: button is visually disabled and not clickable.
- [ ] **D7** Enter a Title and Problem Statement. PASS: "Continue" button becomes enabled.
- [ ] **D8** Click "Continue". PASS: advances to Step 2 ("The Solution"), progress bar updates.
- [ ] **D9** Step 2 shows "Proposed Solution" textarea (required). "Continue" is disabled until text is entered. PASS: button enables after typing.
- [ ] **D10** Click "Continue". PASS: advances to Step 3 ("The Impact"), button label changes to "Submit Idea".
- [ ] **D11** Step 3 shows "Expected Outcome" (required) and "Success Metrics" (optional). "Submit Idea" disabled until Expected Outcome is filled. PASS: button enables after typing in Expected Outcome.
- [ ] **D12** Click "Submit Idea". PASS: navigates to `ideas/index.html`.
- [ ] **D13** On Step 2, click "Back". PASS: returns to Step 1 with previously entered data preserved.
- [ ] **D14** On Step 1, click "Cancel" (or "Back"). PASS: navigates to `ideas/` list.
- [ ] **D15** "Generate with AI" button is present in the header. PASS: button is visible (no action expected — UI placeholder).

### Idea Detail (`ideas/detail.html?ideaId=1`)

- [ ] **D16** Navigate to `ideas/detail.html?ideaId=1`. PASS: page loads with idea title, status badge, score (with score-based styling), "Submitted by" name, and submission date.
- [ ] **D17** Page displays Problem & Solution card (Problem Statement, Target Users, Proposed Solution, Expected Outcome, Success Metrics) and Estimates card (Impact, Duration in days, Cost). PASS: all fields populated from seed data.
- [ ] **D18** Click "Edit" button. PASS: text fields become editable inputs/textareas, Save and Cancel buttons appear, Edit button hides.
- [ ] **D19** Modify a field (e.g. title), click "Save". PASS: toast "Idea saved" appears, page returns to view mode with updated data.

### Idea Detail — Edit & Actions

- [ ] **D19b** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
- [ ] **D19c** For an idea with edge_status "missing": "Define Edge" action button is visible. PASS: clicking it navigates to edge detail page with correct `ideaId`.
- [ ] **D19d** For an idea in "in_review" status: "Review" action button is visible. PASS: clicking it navigates to `approval-detail/` page.
- [ ] **D19e** For a convertible idea: "Convert" action button is visible. PASS: clicking it navigates to `idea-convert/` page.
- [ ] **D19f** Navigate to `ideas/detail.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows error state, no unhandled JS exception.

### Idea Detail — Score Editing

- [ ] **D19g** Navigate to idea detail. Score editing section is visible with the current score value displayed. PASS: score input renders with current value.
- [ ] **D19h** Enter a new score value (e.g. 85). Click save. PASS: toast confirms save, score updates with correct color-coded styling (green for high, yellow for medium, red for low).
- [ ] **D19i** Navigate to ideas list. PASS: updated score is reflected on the idea's row with correct priority badge.
- [ ] **D19j** Return to idea detail. PASS: score value persists at the saved value.

### Idea Detail — Submit for Review

- [ ] **D19k** Navigate to an idea with status "active". PASS: "Submit for Review" button is visible in the header area.
- [ ] **D19l** Click "Submit for Review". PASS: status changes to "In Review", button disappears, status badge updates.

### Idea Convert (`idea-convert/`)

- [ ] **D20** Navigate to `idea-convert/?ideaId=<id>` for a convertible idea. PASS: page loads with conversion form showing 6 required fields: Project Name, Project Lead (dropdown of active users), Start Date, Target End Date, Budget (select), Priority (select). Sticky sidebar shows idea summary (problem, solution, outcome).
- [ ] **D21** Fill all required fields (progress bar reaches 100%), click "Create Project". PASS: navigates to project detail page for the newly created project.

### Idea Review Queue (`idea-review-queue/`)

- [ ] **D22** Navigate to `idea-review-queue/`. PASS: page shows stats cards (Pending Review, Ready to Decide, High Priority, Avg. Wait Time) and a list of ideas pending review.
- [ ] **D22b** Each review card shows priority badge (High Priority/Medium), readiness status (Ready for Review/Needs Info/Unknown), edge status badge, title, submitter, category, days waiting, score, impact, and effort. PASS: all fields render with data.
- [ ] **D23** At least one idea with `in-review` status appears in the queue. PASS: idea 7 ("AI-Powered Customer Support Chatbot") or similar is listed.
- [ ] **D23b** Type a search term in the search input. PASS: review cards filter by title or submitter name in real-time.
- [ ] **D23c** Select "High" from the priority filter dropdown. PASS: list shows only high-priority items. Reset to "All Priority" → full list returns.
- [ ] **D23d** Select "Ready for Review" from the readiness filter dropdown. PASS: list shows only ready items. Reset to "All Status" → full list returns.
- [ ] **D23e** Apply search + filter that matches no items. PASS: empty state shows "No ideas match your filters" message.
- [ ] **D24** Click a review item. PASS: navigates to `approval-detail/?id=<ideaId>`.

### Approval Detail (`ideas/approval-detail.html`)

- [ ] **D25** Navigate to `approval-detail/?id=7`. PASS: page loads with full idea details for idea 7.
- [ ] **D26** Page shows the idea title, problem statement, proposed solution, and expected outcome. PASS: all text fields populated.
- [ ] **D27** Edge/business case information is displayed (outcomes, metrics from edge 6). PASS: at least 2 outcomes and 4 metrics visible.
- [ ] **D28** "Approve" action is available. PASS: clicking it shows confirmation or success feedback.
- [ ] **D29** "Reject" or "Send Back" action is available. PASS: clicking it shows confirmation or reason dialog.
- [ ] **D30** Clarification questions are displayed if applicable. PASS: section renders (may show empty state if no clarifications for this idea).

### Ideas Workflow Integration

- [ ] **D31** After completing the idea-create wizard through to idea-convert, navigate back to `ideas/`. PASS: the ideas list still loads correctly with seed data.
- [ ] **D32** Navigate from ideas list → idea convert → back button. PASS: navigates to ideas list.
- [ ] **D33** Navigate to `idea-convert/?ideaId=999` (non-existent). PASS: page handles gracefully — shows empty/error state, no unhandled JS exception.
- [ ] **D34** Navigate to `approval-detail/` with no `id` parameter. PASS: page handles gracefully — no crash.

---

## E. Core: Projects

### Projects List (`projects/`)

- [ ] **E1** Navigate to `projects/`. PASS: table/list shows 6 seeded projects with title, status, progress, and priority. Project cards show "—" (em-dash) for missing/zero metric values (time, cost, impact). Footer count uses correct singular/plural grammar (e.g. "1 project", "6 projects").
- [ ] **E1b** Click the table/grid view toggle. PASS: layout switches between card grid and table row format. Toggle button highlights for the active view.
- [ ] **E2** Click a project row. PASS: navigates to `project-detail/?projectId=<id>`.

### Project Detail (`project-detail/?projectId=1`)

- [ ] **E3** Page loads with project summary card (description, dates, progress bar), baseline vs. current metrics, and Edge KPI card. PASS: all cards render with data. Baseline/current metrics show "—" (em-dash) when values are zero or missing.
- [ ] **E4** Four quick-action cards visible (Engineering, Team, Workflows, Crunch). PASS: clicking "Engineering" navigates to `engineering-requirements/?projectId=1`.
- [ ] **E5** **Tasks tab** (default): shows 5 task cards with priority badges, skill tags, and days. Assigned/unassigned count is dynamically computed from task data (seed data: 1 assigned, 4 unassigned). PASS: "Save Assignments" button visible.
- [ ] **E6** **Discussion tab**: shows 3 seeded comments with author avatars/names. Comment composer textarea + "Post Comment" button (disabled when empty, enabled when text entered). PASS: all elements render.
- [ ] **E6b** Type a comment in the composer textarea, click "Post Comment". PASS: toast "Comment posted" appears, comment appears in the list.
- [ ] **E7** **History tab**: shows 3 version entries (v1.0, v1.1, v1.2) with latest highlighted. PASS: version list renders in order.
- [ ] **E8** **Linked Data tab**: shows empty state "No linked data yet" with "Link Data Source" button. PASS: empty state renders cleanly.
- [ ] **E9** Right sidebar shows Team card (4 members with roles) and Milestones card (5 milestones: 2 completed, 1 in progress, 2 pending). PASS: both cards render with correct data.

### Project Detail — Edit Mode

- [ ] **E9b** Click "Edit" button on project detail. PASS: fields become editable inputs/textareas, Save and Cancel buttons appear.
- [ ] **E9c** Modify a field, click "Save". PASS: project saves successfully, returns to view mode with updated data.
- [ ] **E9d** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.

### Engineering Requirements (`engineering-requirements/?projectId=1`)

- [ ] **E10** Navigate to `engineering-requirements/?projectId=1`. PASS: page renders with engineering specifications content.
- [ ] **E10b** Clarification questions section displays question cards with asker name, timestamp, question text, and status (pending/answered). PASS: at least one clarification visible with correct styling.
- [ ] **E10c** Pending clarifications show warning-colored status badge. Answered clarifications show answer text. PASS: visual distinction between pending and answered states.

---

## F. Tools

### Edge Definition (`edge/?ideaId=1`)

- [ ] **F1** Navigate to `edge/?ideaId=1`. PASS: left panel shows idea 1's summary (title, score, problem statement); right panel shows the Edge form.
- [ ] **F2** Business Outcomes section shows 2 seeded outcomes with metrics. Completion progress bar reflects current state. PASS: outcomes and metrics render with input fields.
- [ ] **F3** Click "Add Outcome". PASS: a new empty outcome row appears with "Add Metric" button.
- [ ] **F3b** Within an outcome, click "Add Metric". PASS: new metric row appears with Name, Target, Unit, and Current input fields.
- [ ] **F4** Delete an outcome. PASS: outcome is removed, progress bar updates.
- [ ] **F4b** Delete a metric within an outcome. PASS: metric row is removed.
- [ ] **F5** Expected Impact section shows 3 textareas (Short-term, Mid-term, Long-term). Confidence select and Edge Owner fields are visible. PASS: all fields render with seeded data.
- [ ] **F5b** Modify edge fields (e.g. outcome description, confidence level) and click "Save". PASS: toast "Edge saved" appears, data persists on page reload.

### Edge List (`edges/`)

- [ ] **F6** Navigate to `edges/`. PASS: shows stats cards (Total Ideas, Complete, In Draft, Missing) and edge cards with status badges (Edge Complete, Edge Draft, Edge Missing), confidence level (High/Medium/Low Confidence), owner, outcome/metric counts, and idea titles.
- [ ] **F6b** Type in the search input. PASS: filters edge cards by idea title or owner name in real-time.
- [ ] **F6c** Select a status from the filter dropdown (e.g. "Complete"). PASS: list shows only edges with that status. Reset to "All Status" → full list returns.
- [ ] **F6d** Apply search + filter that matches no items. PASS: empty state shows "No Edge definitions found" with "Try adjusting your search or filter criteria".
- [ ] **F6e** Click an edge card. PASS: navigates to `edges/detail.html?ideaId=<id>`.

### Crunch (`crunch/`)

- [ ] **F7** Navigate to `crunch/`. PASS: Step 1 (Upload) shows drop zone with "Drop your file here or click to browse" and supported-format info.
- [ ] **F8** Click the drop zone. PASS: advances to Step 2 (Label & Explain) — shows mock file info ("Q4_Sales_Report.xlsx", 1,247 rows, 6 columns) and per-column accordion cards.
- [ ] **F9** Expand a column card (e.g. CUST_ID). PASS: reveals Friendly Name input, Data Type select, Acronym Expansion input (for acronym columns), and Description textarea. Fill all fields — completion icon changes to green check.
- [ ] **F10** Fill all 6 columns to 100% completion, click "Continue to Review". PASS: advances to Step 3 — shows "Data Translation Complete" with "Edit Labels" and "Continue to Dashboard" buttons.

### Workflow List (`flow/`)

- [ ] **F11** Navigate to `flow/`. PASS: page shows
  workflow cards with name, description, project
  name badge, and state/transition counts.
- [ ] **F12** Type in the search input (if present).
  PASS: filters workflow cards by name or
  description in real-time.
- [ ] **F13** Click a workflow card. PASS: navigates
  to `flow/detail.html?workflowId=<id>`.

### Workflow Designer (`flow/detail.html?workflowId=...`)

- [ ] **F14** Navigate to a workflow designer page.
  PASS: toolbar at top with Add State, Re-layout,
  Zoom +/-, Fit, stats, and Save. SVG canvas below
  with dot grid background showing the workflow
  graph.
- [ ] **F15** Nodes display correctly: start node
  has green border with "Start state" subtitle,
  standard nodes have blue border with field count,
  complete node has double green border with "End
  state" subtitle.
- [ ] **F16** Edges display correctly: forward edges
  are solid blue lines with arrow markers and named
  labels. Cycle edges (pointing backward in the
  graph) are dashed orange.
- [ ] **F17** Connection ports (small circles) are
  visible on node edges. Hover over a port. PASS:
  cursor changes to crosshair.
- [ ] **F18** Click a node. PASS: node gets blue
  glow selection effect. Properties panel appears
  showing state name, description, form fields
  list, and outgoing transitions.
- [ ] **F19** Click "+ Add State" in toolbar. PASS:
  new node appears on the canvas between existing
  nodes. Auto-layout places it along the diagonal
  flow.
- [ ] **F19b** Drag a non-pinned node to a new
  position. PASS: node follows the pointer. It
  cannot be dragged higher/lefter than the start
  node or lower/righter than the complete node.
- [ ] **F19c** Attempt to drag the start or complete
  node. PASS: they remain pinned at their positions
  and do not move.
- [ ] **F19d** Click "Re-layout" in toolbar. PASS:
  all non-pinned nodes reposition along the
  top-left to bottom-right diagonal. Start stays
  top-left, complete stays bottom-right.
- [ ] **F20** Drag from one node's port to another
  node's port. PASS: a dashed preview line appears
  during drag. On release over a valid port, a new
  edge is created with a default name.
- [ ] **F21** Select a node, edit its name in the
  properties panel. PASS: the node label updates on
  the SVG canvas immediately.
- [ ] **F22** Select a node, click "+ Add Field".
  Enter field name, select type from dropdown,
  toggle required. PASS: field appears in the
  fields list with correct type badge and required
  indicator.
- [ ] **F23** Select an edge by clicking its label or
  path. PASS: edge properties panel shows
  transition name, description, from/to state
  names. Edit the name. PASS: label updates on the
  canvas.
- [ ] **F24** Select a non-start/non-complete node,
  click "Delete State". PASS: node and all its
  connected edges are removed from the canvas.
- [ ] **F25** Select an edge, click "Delete
  Transition". PASS: edge is removed from the
  canvas.
- [ ] **F26** Click "Zoom +" and "Zoom -" in
  toolbar. PASS: canvas zooms in and out smoothly.
  Click "Fit". PASS: canvas adjusts to show all
  nodes.
- [ ] **F27** Click "Save". PASS: success toast
  appears. Navigate away and return to the
  designer. PASS: all nodes, edges, fields, and
  positions persist.
- [ ] **F28** Navigate to
  `flow/detail.html?workflowId=nonexistent`. PASS:
  page handles gracefully — redirects to flow list
  or shows error state, no unhandled JS exception.

---

## G. Admin Pages

### Team (`teams/`)

- [ ] **G1** Navigate to `teams/`. PASS: shows roster of seeded team members with initials avatars, names, roles, departments, availability percentage badges, strength chips, performance stats (percentage, active count, completed count), and status dots (green=available, yellow=busy, red=limited). Search input and "Activity Feed" / "Add Member" buttons visible.
- [ ] **G1b** Click a team member card. PASS: right-side detail panel populates with member name, role, email, and large avatar with initials.
- [ ] **G1c** Detail panel shows two tabs (Dimensions, Performance). Click between tabs. PASS: tab content switches — Dimensions shows Driver/Analytical/Expressive/Amiable scores with progress bars.
- [ ] **G1d** Click a different team member card. PASS: detail panel updates to show the newly selected member's information.
- [ ] **G1e** Type a name in the search input. PASS: team member cards filter in real-time by name, role, or department.
- [ ] **G2** Member status dots render with distinct colors (green for available, yellow for busy, red for limited). PASS: at least 2 different statuses visible.

### Account (`account/`)

- [ ] **G3** Navigate to `account/`. PASS: shows account overview with plan info (Business plan), billing date, seat usage (18/25), and resource usage bars.
- [ ] **G4** Health score (92, "excellent") is displayed. PASS: score and label visible.

### Profile (`profile/`)

- [ ] **G5** Navigate to `profile/`. PASS: shows profile form with avatar (initials), First Name, Last Name, Email, Phone, Role, Department (dropdown), and Bio fields for the current user (Tony Stark / demo@example.com).
- [ ] **G5b** Strength chips are displayed with pre-selected strengths shown in primary style with checkmark icons. Click an unselected chip. PASS: chip toggles to primary/selected style. Click a selected chip. PASS: chip toggles to secondary/unselected style.
- [ ] **G6** Edit a field (e.g. phone), toggle strengths, and click "Save Changes". PASS: toast "Profile saved successfully" appears.
- [ ] **G6b** Navigate away from Profile (e.g. to Dashboard), then return to Profile. PASS: the edited field retains the saved value — data was persisted to the database, not just displayed via toast.

### Company Settings (`settings/`)

- [ ] **G7** Navigate to `settings/`. PASS: shows company info (Stark Industries, acmecorp.com, Technology, 51-200).
- [ ] **G8** Security settings visible: SSO (off), 2FA (on), IP Whitelist (off). PASS: toggle/indicator states match seed data.
- [ ] **G9** Edit a setting (e.g. timezone or language) and save. PASS: success toast or save completes without error.
- [ ] **G9b** Navigate away from Settings, then return. PASS: the edited setting retains the saved value — data was persisted to the database.

### Manage Users (`manage-users/`)

- [ ] **G10** Navigate to `manage-users/`. PASS: shows user table with avatar, name, email, role badge (job title), department, status badge (Active/Pending/Deactivated), and last active time. Header shows active/pending user counts. Search input and two filter dropdowns (All Roles, All Status) visible.
- [ ] **G10b** Type in the search input. PASS: filters user list by name or email in real-time. Role and status dropdowns also filter the list.
- [ ] **G11** Deactivated user (James Miller) is visually distinguished with "Deactivated" badge (X icon), strikethrough or opacity styling. PASS: clearly different from active users.
- [ ] **G11b** Pending users show "Pending" badge with clock icon and "Invite sent" text. PASS: visually distinct from active users.
- [ ] **G12** "Invite User" button is visible. PASS: clicking it opens the invite dialog with fields for First Name, Last Name, Email, Role, Department, Status, Availability, Performance Score, Strengths, Team Dimensions, Phone, and Bio.
- [ ] **G12b** Fill all required fields and submit the invite dialog. PASS: toast confirms user creation, new user appears in the user list with correct name, email, role, and status badge.

### Activity Feed (`teams/activity-feed.html`)

- [ ] **G13** Navigate to `activity-feed/`. PASS: shows seeded activity entries with type icons and timestamps. Search input ("Search activity...") and type filter dropdown ("All Activity") visible.
- [ ] **G14** Activity types include scored, completed task, submitted new idea, commented on, joined the team, changed status, converted idea to project. PASS: multiple distinct types visible with appropriate icons (star, checkmark, lightbulb, chat bubble, user-plus, edit, arrow-right).
- [ ] **G14b** Each activity entry shows actor name, action verb, target name, and meta info (score badge, status badge, or quoted comment text). PASS: entries have full context.
- [ ] **G14c** Type in the search input. PASS: activity entries filter by actor name or target name in real-time.
- [ ] **G14d** Select a type from the filter dropdown (e.g. "Scored"). PASS: only activities of that type shown. Reset to "All Activity" → full list returns.

### Engineering Requirements

- [ ] **G15** Navigate to `engineering-requirements/?projectId=1`. PASS: page renders with engineering specifications content for project 1.
- [ ] **G16** Clarification questions section shows question cards with message icon, asker name, timestamp, question text, and status (pending with warning styling or answered with answer text). PASS: at least one clarification visible.

### Snapshots (`snapshots/`) — Run These Last

- [ ] **G18** Navigate to `snapshots/`. PASS: shows 4 operation cards: Create Pristine Environment, Wipe and Load Mock Data, Upload Snapshot, Download Snapshot.
- [ ] **G19** Click "Download Snapshot". PASS: browser downloads `fusion-ai-snapshot-YYYY-MM-DD.json`. File contains valid JSON with entity data.
- [ ] **G20** Click "Create Pristine Environment", confirm the dialog. PASS: redirects to `dashboard/index.html`. Dashboard renders with zeroed-out metrics (empty database). All 49 `fusion-ai:*` keys exist in localStorage as empty arrays.
- [ ] **G21** Click "Wipe and Load Mock Data". PASS: redirects to `dashboard/index.html`. Navigate to `ideas/` — 11 ideas are back.
- [ ] **G22** Return to `snapshots/`, wipe data, then use "Upload Snapshot" file input and select the previously downloaded JSON file. PASS: redirects to `dashboard/index.html`. Data matches the snapshot.

---

## H. Reference & System

- [ ] **H1** Navigate to `design-system/`. PASS: component gallery renders showing buttons, badges, cards, form elements, toasts, and other UI components from the design system.
- [ ] **H2** Navigate to `not-found/`. PASS: 404 page renders with a message and a link back to the dashboard or landing page.

---

## I. Cross-Cutting Concerns

### Theme

- [ ] **I1** Click the theme toggle (sun/moon icon) in the header, select "Dark". PASS: page switches to dark theme — background darkens, text lightens, CSS custom properties update.
- [ ] **I2** Navigate to another page. PASS: dark theme persists across navigation.
- [ ] **I3** Select "Light" theme. PASS: page returns to light theme.
- [ ] **I4** Select "System" theme. PASS: theme follows OS preference (matches `prefers-color-scheme`).
- [ ] **I5** Reload the page. PASS: theme choice persists (stored in `localStorage` key `fusion-theme`).

### Sidebar

- [ ] **I6** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
- [ ] **I6b** Click a sidebar section header (e.g. "Journey"). PASS: section items collapse/hide, chevron rotates. Click again. PASS: section items reappear, chevron returns to original orientation.
- [ ] **I7** Navigate to another page. PASS: collapsed state persists (stored in `localStorage` key `fusion-sidebar-collapsed`).
- [ ] **I8** Click the expand button. PASS: sidebar returns to full width with labels.

### Mobile Responsive

- [ ] **I9** Resize browser to ≤768px width (or use DevTools device emulation). PASS: desktop sidebar disappears, mobile header with hamburger menu appears.
- [ ] **I10** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
- [ ] **I11** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.
- [ ] **I11b** Tap a navigation link in the mobile sidebar. PASS: navigates to the target page and mobile sidebar closes.

### Command Palette

- [ ] **I12** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
- [ ] **I13** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
- [ ] **I14** Press `Escape`. PASS: command palette closes.

### Loading States

- [ ] **I15** Navigate to a data-dependent page with mock data loaded. PASS: loading skeleton (card-grid, card-list, or detail pattern) appears briefly before content renders.
- [ ] **I16** If an error occurs loading a page (e.g. corrupted localStorage), error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading.

### Toasts

- [ ] **I17** Trigger a toast (e.g. save profile, or use DB Admin reload). PASS: toast appears at bottom or corner of screen, auto-dismisses after ~3 seconds with fade-out.

### Snapshot Round-Trip

- [ ] **I18** Download a snapshot, wipe data (Create Pristine), upload the snapshot. PASS: all data restored correctly — spot-check 3 pages to confirm content matches pre-wipe state.

### General

- [ ] **I19** Check DevTools Console after navigating through 5+ different pages. PASS: no unhandled JavaScript errors (warnings and info messages from browser extensions are acceptable).

---

## J. Teardown

- [ ] **J1** Stop the HTTP server started in A3. PASS: process terminates.
- [ ] **J2** Remove the temp test directory (`rm -rf /tmp/fusion-test` or equivalent). PASS: directory removed.
- [ ] **J3** Verify the ZIP file remains on `~/Desktop` for archival. PASS: `fusion-ai-<sha>.zip` exists.

---

## Execution Log

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Browser & Version | |
| OS | |
| Build SHA | |
| Tests Passed | /249 |
| Tests Failed | /249 |
| Tests Skipped | /249 |
| Notes | |
