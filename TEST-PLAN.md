# Fusion AI — Test Plan

> **Encoding:** `- [ ]` = pending, `- [ ]` = PASS, `- [FAIL]` = failure (add note)

### Scope

This plan covers **UI behavior** — anything that requires a browser
DOM, CSS, gestures, or visual rendering. Pure transitions,
adapter behavior, and HTTP-style API routing are now covered by
the **automated test suite** (`./validate` runs them; the suite
also runs standalone via `node --test --strip-types tests/*.test.ts`).
See `CLAUDE.md` section `## Testing` for the inventory of
automated test files and what each covers.

This UI plan therefore focuses on what automated tests cannot
verify: layout, gestures, navigation, drag-and-drop, dialog
behavior, and end-to-end user flows through the rendered DOM.

### Protocol

All sections are executed over HTTP. Two execution modes:

- **Serial (single human tester)**:
  `./build --no-zip /tmp/fusion-test/` then
  `cd /tmp/fusion-test/ && python3 -m http.server 8080`. Run
  sections in document order.
- **Parallel (Claude Code agents)**:
  `TMPDIR=/tmp/claude ./build --no-zip ~/Desktop/fusion-test/`
  then `cd ~/Desktop/fusion-test/ && python3 -m http.server 8080`.
  See `CLAUDE.md` section `## Testing` for the six-phase agent
  protocol, entity mutation domain scoping, and known MCP
  limitations (flow-designer gestures, `resize_window`, file I/O).

### Execution Order

Sections A through AA establish a pristine environment and populate
it through the UI. Sections B through J then verify every page
renders correctly against that data.

In the serial run the plan is a single continuous regression pass.
In the parallel run B–J split across seven agents each with its
own browser tab and disjoint entity mutation domain; I runs alone
(global UI state); G30–G35 run alone last (they wipe the database).
See `CLAUDE.md` section `## Testing`.

## Summary

| Section | Tests |
|---|--:|
| A. Build & Setup | 5 |
| AA. Data Entry Workflow | 43 |
| B. Entry Pages | 16 |
| C. Core: Dashboard | 7 |
| D. Core: Ideas Workflow | 37 |
| E. Core: Projects | 11 |
| F. Tools | 46 |
| F2. Workbox | 19 |
| G. Admin Pages | 37 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 28 |
| J. Teardown | 3 |
| **Total** | **254** |

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Run `./build --no-zip /tmp/fusion-test/`. PASS: `/tmp/fusion-test/` contains `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), `index.html`, and 14 page directories containing 24 HTML page files, plus root `index.html`.
- [ ] **A3** Start an HTTP server from the build directory (`cd /tmp/fusion-test/ && python3 -m http.server 8080`). PASS: server starts without errors.
- [ ] **A4** Open `http://localhost:8080/` in the test browser. PASS: redirects to `snapshots/index.html` when no data exists, or `landing/index.html` (which auto-redirects to `dashboard/index.html` after ~2 seconds) when data has been loaded.
- [ ] **A5** Open DevTools Console and confirm no JavaScript errors on initial load. PASS: console is clean (warnings from browser extensions are acceptable).

---

## AA. Data Entry Workflow

This section populates a pristine environment with all data
through the UI. Each step creates data that later steps depend
on. Run these in order.

### AA1. Create Pristine Environment

- [ ] **AA1** Navigate to `snapshots/`. Click "Create Pristine Environment" and confirm the wipe dialog. PASS: redirects to dashboard. Dashboard shows empty/minimal state.
- [ ] **AA2** Open DevTools, verify localStorage has `fusion-ai:*` keys (19 tables as empty arrays plus bootstrap data, including the `deleted` tombstone table).
- [ ] **AA3** Verify bootstrap data exists: user "Tony Stark" (id: `current`), company "Stark Industries" with "Business" plan.

### AA2. Create Users

- [ ] **AA4** Navigate to Organization > Users. Click "Invite User". PASS: invite dialog opens with fields for First Name, Last Name, Email, Role, Department, Status, Phone, Availability %, Performance, and Bio.
- [ ] **AA5** Fill all fields for user "Sarah Chen" (Engineering Manager, Engineering dept, active status). Submit. PASS: toast confirms creation, user appears in the list.
- [ ] **AA6** Repeat for all 10 users: Sarah Chen, Mike Thompson, Jessica Park, David Martinez, Emily Rodriguez (pending), Alex Kim, Marcus Johnson, David Kim, Lisa Wang, James Miller (deactivated). PASS: all 10 appear on Users page with correct name, email, role, and status badge.
- [ ] **AA7** Navigate to Teams page. PASS: users display with correct availability color coding and performance stats.

### AA3. Profile & Company

- [ ] **AA8** Navigate to Profile. Edit fields (phone, bio, strengths). Click "Save Changes". PASS: toast "Profile saved" appears.
- [ ] **AA9** Navigate away, return to Profile. PASS: edited fields persist with saved values.
- [ ] **AA10** Navigate to Company. Edit a field (e.g. timezone). Click save. PASS: success toast appears.
- [ ] **AA11** Navigate away, return to Settings. PASS: edited field persists with saved value.

### AA4. Create Ideas

- [ ] **AA12** Navigate to Ideas. Click "Create Idea". Fill in title, problem, solution, and outcome for "AI-Powered Customer Segmentation". Click "Submit Idea". PASS: idea appears on ideas list.
- [ ] **AA13** Navigate to the new idea's detail page. Click "Edit". Verify title and text fields (problem, solution, outcome) are editable. Click "Save". PASS: toast confirms save, all fields persist.
- [ ] **AA14** Repeat creation and field entry for all 11 ideas matching mock data titles. PASS: ideas list shows all 11 with correct titles.

### AA5. Submit Ideas for Review

- [ ] **AA15** Navigate to idea #1 detail (status: active). Click "Submit for Review". PASS: status changes to "In Review", button disappears.
- [ ] **AA16** Submit ideas 1, 4, 7, 8, 9, 10, 11 for review (matching mock data statuses). PASS: each transitions from active to in-review.
- [ ] **AA17** Navigate to Ideas list and filter by "In Review" status badge. PASS: the 7 submitted ideas appear.

### AA7. Approve Ideas & Convert to Projects

- [ ] **AA18** On Ideas list, filter by "In Review". Click idea #1. PASS: navigates to idea detail with approval footer.
- [ ] **AA19** Click "Approve". PASS: idea status changes to approved, confirmation shown.
- [ ] **AA20** Approve idea #4 as well (it was submitted for review in AA16). Leave others in their current status. PASS: statuses match mock data (2 approved, rest in-review/active).
- [ ] **AA21** Navigate to approved idea #1. Click "Convert". PASS: conversion form loads with 5 required fields (Project Name, Lead, Start Date, End Date, Cost).
- [ ] **AA22** Fill all required fields: Project Name, select "Sarah Chen" as project lead, Start Date, Target End Date, Cost. Click "Create Project". PASS: navigates to project detail for the new project.
- [ ] **AA23** On project detail, click "Edit". Set fields (title, description, status, start date, end date, cost baseline, impact baseline) to match mock data. Save. PASS: project data persists.
- [ ] **AA24** Approve remaining ideas (7, 8, 9, 10) from Ideas list (filter by "In Review"), then convert all 6 approved ideas to projects. PASS: Projects list shows all 6 with correct status and progress.

### AA9. Create Flows

- [ ] **AA25** Navigate to Projects. Click into
  project #1 detail (status: approved). PASS:
  a "Flows" section is visible showing "No
  flows yet" empty state and a "New Flow"
  button. Non-approved projects show an info
  badge "Approve to add flows" instead of
  the button, and empty state reads "Flow
  creation limited to approved projects only".
- [ ] **AA26** Click "New Flow". PASS: navigates
  to the flow designer page. The SVG canvas
  shows two nodes: "Start" (start, top-left with
  green border) and "End" (end, bottom-right
  with red 3-px border) connected by no edges.
  Toolbar shows Undo, Redo, Delete (trash icon),
  Auto Layout, Zoom −/Show All/+,
  Copy Mermaid, Export. Changes auto-save
  (no explicit Save button).
- [ ] **AA27** Drag the port circle on the start
  node into empty canvas past 20 pixels. PASS:
  during the drag a ghost "New State" card
  follows the cursor along with a faint bezier
  preview. On release, a new node appears at the
  drop position with a blue border,
  auto-connected from the start by an edge with
  a default name. The start node is also
  draggable by its body.
- [ ] **AA28** Double-click the new blue-bordered
  node. PASS: properties panel appears showing
  State Name input, Description input, empty
  Fields list, and outgoing transitions. The
  node gets a blue glow selection effect on the
  canvas.
- [ ] **AA29** Edit the state name in the
  properties panel to "Data Capture". PASS: the
  node label updates on the canvas immediately
  (auto-saves via 800ms debounce).
- [ ] **AA30** Double-click the edge between
  start and "Data Capture". PASS: no properties
  panel opens — the outgoing edge from Start is
  intentionally not interactive. The edge has no
  name label visible on the canvas, just a plain
  blue arrow.
- [ ] **AA31** Drag from "Data Capture"'s port
  into empty canvas past 20 pixels to create a
  new middle node; rename it "Review" via its
  properties panel. Rename the new edge
  "submit".
- [ ] **AA32** Hold Shift and drag from "Review"
  onto "Data Capture". PASS: during the drag the
  preview redraws as a dashed-orange curved
  bezier because a forward path "Data Capture" →
  "Review" already exists, and the reachability
  check recognises the release would close a
  loop. Release to create the cycle edge; rename
  it "needs revision". Hold Shift and drag from
  "Review" onto "End". PASS: preview is a
  solid-blue curved bezier (no return path).
  Release to create the edge; rename it
  "approve".
- [ ] **AA33** In the "Data Capture" properties
  panel, click "+ Add Field". Enter name "Company
  Name", type "text", check "Required". PASS:
  field appears in the fields list with a "text"
  badge and a red asterisk (*) required indicator.
- [ ] **AA34** Add more fields to "Data Capture":
  Contact Email (email, required), Industry (select
  with options "Technology, Finance, Healthcare"),
  Company Logo (image). PASS: all fields appear
  with correct type badges.
- [ ] **AA35** Wait for auto-save (800ms debounce).
  Navigate away and back. PASS: all nodes, edges,
  and fields persist.

### AA10. Verify Dashboard

- [ ] **AA36** Navigate to Dashboard. PASS: gauge
  cards (Time, Cost, Impact) show aggregated values
  computed from the entered project data.
- [ ] **AA37** Header stats reflect entered data
  counts (ideas, projects, flows). PASS:
  counts are non-zero and match.

### AA11. Edit & Verify Cycle

- [ ] **AA38** Edit idea #1: change title. Save,
  navigate to ideas list, return to detail. PASS:
  changed title persists.
- [ ] **AA39** Edit project #1: change description.
  Save, navigate away, return. PASS: changed
  description persists.
- [ ] **AA40** Edit flow: navigate to flow
  designer, rename a state (auto-saves). Navigate
  away, return. PASS: changed state name persists.
- [ ] **AA41** Edit profile: change phone number.
  Save, navigate away, return. PASS: changed phone
  persists.
- [ ] **AA42** Edit company: change
  timezone. Save, navigate away, return. PASS:
  changed timezone persists.

### AA12. Snapshot Round-Trip

- [ ] **AA43** Navigate to Snapshots. Click
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
- [ ] **B2** "Start Free Trial" (hero CTA) and "Get Started" (navbar CTA) are present and navigate to `auth/index.html` if clicked before the auto-redirect. PASS: buttons exist with correct target.
- [ ] **B3** "Sign In" link is present and navigates to `auth/index.html` if clicked before the auto-redirect. PASS: link exists with correct target.

### Auth Page (`auth/`)

- [ ] **B4** Page loads in **Sign In** mode by default. PASS: title is "Welcome back", submit button reads "Sign in →".
- [ ] **B5** On desktop (≥1024px), left panel shows branded marketing stats (10K+ Active Users, 98% Satisfaction, 50+ Integrations). PASS: two-column layout visible.
- [ ] **B6** Submit with empty fields. PASS: "Email is required" error appears below email input; input gets error styling.
- [ ] **B7** Enter `notanemail` in email, leave password empty. PASS: "Please enter a valid email address" error on email.
- [ ] **B8** Enter `test@example.com`, password `123`. PASS: "Password must be at least 6 characters" error on password.
- [ ] **B9** Enter `test@example.com`, password `password123`, click "Sign in →". PASS: button shows spinner briefly, then navigates to `dashboard/index.html`.
- [ ] **B10** Click "Don't have an account?" toggle. PASS: switches to Sign Up mode — title changes to "Get started", "Company name (optional)" field appears, submit reads "Create account" with arrow icon.
- [ ] **B11** Fill valid email + password (≥6 chars) in Sign Up mode, click "Create account →". PASS: toast "Welcome to Fusion AI! Your account has been created." appears, then navigates to `organization/onboarding.html`.

### Onboarding Page (`onboarding/`)

- [ ] **B12** Page renders centered welcome section with sparkle icon, "Welcome to Fusion AI" heading, and descriptive text. PASS: layout is complete, no console errors.
- [ ] **B13** Click "Go to Dashboard" button. PASS: navigates to `dashboard/index.html`.

### Auth Validation Edge Cases

- [ ] **B14** In Sign In mode, enter valid email, valid password, then clear email and submit. PASS: email error reappears.
- [ ] **B15** Toggle between Sign In and Sign Up modes multiple times. PASS: form resets cleanly each time, no layout glitches.
- [ ] **B16** Footer shows "By continuing, you agree to our Terms of Service and Privacy Policy." PASS: text is visible.

---

## C. Core: Dashboard

- [ ] **C1** Navigate to `dashboard/`. PASS: page loads with sidebar, header, and main content area.
- [ ] **C2** Sidebar shows flat navigation
  links in this order: Dashboard, Ideas,
  Projects, Flows, Workbox, Profile,
  Organization, Teams, Company,
  Billing, Snapshots, Design System. PASS:
  all 12 links present, in order, and styled.
- [ ] **C3** Header shows search bar, greeting
  ("Good {morning/afternoon/evening}, Tony
  Stark" — varies by time of day), company
  stats ("Stark Industries · 11 Ideas ·
  6 Projects · 1 Flows"), and theme toggle.
  PASS: elements visible and styled.
- [ ] **C4** Dashboard displays 3 gauge/metric cards (Time, Cost, Impact) with baseline and current values. PASS: cards render with non-zero values and concentric arc gauges.
- [ ] **C5** Sidebar navigation links all function correctly. PASS: clicking a sidebar link navigates to the expected page.
- [ ] **C6** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C7** Check that seed data populates all dashboard widgets. PASS: no "No data" empty states on initial load (seed data provides content for all widgets).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: list shows 11 ideas as cards, each with a drag-handle grip, title, status badge, and (for approved ideas) a Convert button. Ideas represent the problem-and-proposed-solution shape and do not carry time/cost/impact estimates; those fields live on projects created by conversion.
- [ ] **D2** Each idea row shows a status badge
  (Active, In Review, Approved, Promoted, Sent
  Back, or Archived). PASS: badges render with
  distinct colors.
- [ ] **D3** Click an idea row/title. PASS: navigates to the idea's detail or scoring page with the correct `ideaId` parameter.
- [ ] **D4** "New Idea" or "Create Idea" button is visible. PASS: clicking it navigates to `ideas/create.html`.

### Idea Create Form (`ideas/create.html`)

- [ ] **D5** Page loads showing a single-page form with six fields: Title, Problem Statement, Target Users, Proposed Solution, Expected Outcome, Success Metrics. PASS: all six fields visible.
- [ ] **D6** "Submit Idea" button is disabled when any required field is empty. PASS: button is visually disabled and not clickable.
- [ ] **D7** Fill in all required fields (Title,
  Problem Statement, Proposed Solution,
  Expected Outcome). PASS: "Submit Idea" button becomes enabled.
- [ ] **D8** Click "Submit Idea". PASS: navigates to `ideas/index.html`.
- [ ] **D9** Click "Cancel". PASS: navigates to `ideas/` list.

### Idea Detail (`ideas/detail.html?ideaId=1`)

- [ ] **D10** Navigate to `ideas/detail.html?ideaId=1`. PASS: page loads with idea title, status badge, and "Submitted by [name] @ [date/time]" in the header.
- [ ] **D11** Page displays one card: Problem & Solution (Problem Statement,
  Target Users, Proposed Solution, Expected
  Outcome, Success Metrics). PASS: all fields populated. No Details or Estimates cards.
- [ ] **D12** Click "Edit" button. PASS: text fields become editable inputs/textareas, Save and Cancel buttons appear, Edit button hides.
- [ ] **D13** Modify a field (e.g. Problem Statement or Expected Outcome — inline edit exposes the four textarea fields only; title is not editable here), click "Save". PASS: toast "Idea saved" appears, page returns to view mode with updated data.

### Idea Detail — Edit & Actions

- [ ] **D14** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
- [ ] **D15** For an idea in "in_review"
  status: clicking the card navigates to
  `ideas/detail.html` page with approval
  footer (Approve / Send Back).
- [ ] **D16** For a convertible idea: "Convert" action button is visible. PASS: clicking it navigates to `ideas/convert.html` page.
- [ ] **D17** Navigate to `ideas/detail.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows error state, no unhandled JS exception.

### Idea Detail — Submit for Review

- [ ] **D18** Navigate to an idea with status "active". PASS: "Submit for Review" button is visible in the header area.
- [ ] **D19** Click "Submit for Review". PASS: status changes to "In Review", button disappears, status badge updates.

### Idea Detail — Sent Back Re-Submit

- [ ] **D20** Navigate to an idea with status "sent-back" (after a reviewer sends it back). PASS: "Submit for Review" button is visible, allowing re-submission.
- [ ] **D21** Click "Edit", modify a field, click "Save". PASS: idea updates. Click "Submit for Review". PASS: status changes to "In Review".

### Idea Convert (`ideas/convert.html`)

- [ ] **D22** Navigate to `ideas/convert.html?ideaId=<id>` for a convertible idea. PASS: page loads with conversion form showing 6 required fields: Project Name, Project Lead (dropdown of active users), Start Date, Target End Date, Budget, Impact. Sticky sidebar shows "Problem & Solution" with title, problem, solution, and expected outcome.
- [ ] **D23** With required fields empty, "Create Project" button is disabled and progress bar shows 0/6. Fill fields one at a time. PASS: progress bar increments with each field, checkmarks appear next to completed fields, button enables only when all 6 required fields are filled.
- [ ] **D24** Fill all required fields (progress bar reaches 100%), click "Create Project". PASS: navigates to project detail page for the newly created project.

### Idea Status Filtering (`ideas/index.html`)

- [ ] **D25** Navigate to `ideas/index.html`. PASS: status badges appear showing each status present in the data (e.g., Active, In Review, Approved).
- [ ] **D26** Click a status badge. PASS: list filters to show only ideas with that status, badge is highlighted, others are dimmed, count updates.
- [ ] **D27** Click the same badge again. PASS: filter clears, all ideas shown, all badges at full opacity.
- [ ] **D28** Click a different badge. PASS: filter switches to the new status.

### Idea Detail — Approval Actions

- [ ] **D29** Navigate to `ideas/detail.html?ideaId=7` (in-review idea). PASS: page loads with idea details and sticky approval footer showing Send Back / Approve.
- [ ] **D30** Click "Approve". PASS: success toast, navigates to ideas list, idea status is now "approved".
- [ ] **D31** Click "Send Back". PASS: dialog opens asking for feedback. Confirm. PASS: idea status changes to "sent-back", navigates to ideas list.
- [ ] **D32** Navigate to idea detail for a non-in-review idea. PASS: no approval footer is shown.

### Ideas Workflow Integration

- [ ] **D33** After creating an idea and converting it to a project, navigate back to `ideas/`. PASS: the ideas list still loads correctly with seed data.
- [ ] **D34** Navigate from ideas list → idea convert → back button. PASS: navigates to ideas list.
- [ ] **D35** Navigate to `ideas/convert.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows empty/error state, no unhandled JS exception.

### Ideas List — Drag-reorder

- [ ] **D36** On `ideas/index.html`, press and hold on an idea row then
  drag it upward past another row's midpoint. PASS: during the drag a
  hysteresis indicator appears at the target drop position, the
  dragged row follows the pointer, and on release the ideas list
  reorders in place. Reload the page — new order persists.
- [ ] **D37** During a drag, hover slowly across the midpoint of a
  neighbouring row. PASS: the drop indicator line only flips to the
  new target once the pointer crosses the hysteresis threshold, not
  on the first pixel over the midpoint.

---

## E. Core: Projects

### Projects List (`projects/`)

- [ ] **E1** Navigate to `projects/`. PASS: table/list shows 6 seeded projects with title, status, and progress. Project cards show "—" (em-dash) for missing/zero metric values (time, cost, impact).
- [ ] **E2** Click a status filter badge (e.g. "Active"). PASS: project list filters to show only projects with that status. Click the same badge again or "All". PASS: full list returns.
- [ ] **E3** Click a project row. PASS: navigates to `projects/detail.html?projectId=<id>`.

### Project Detail (`projects/detail.html?projectId=1`)

- [ ] **E4** Page loads with project summary
  card (description, dates, progress bar) and
  baseline vs. current metrics. PASS: all cards
  render with data. Baseline/current metrics
  show em dash when values are zero or missing.
- [ ] **E5** Sidebar shows Team card listing
  project team members with roles. PASS: team
  members render with names and role badges.
- [ ] **E6** Flows section shows linked flows with
  node/edge counts. For approved projects, a "New
  Flow" button is visible. For non-approved
  projects, an info badge "Approve to add flows"
  appears instead and empty state reads "Flow
  creation limited to approved projects only".
  PASS: correct UI for project status.
- [ ] **E7** On an approved project, click "New
  Flow" button. PASS: a "New Flow" dialog opens
  with a Flow Name input and Create/Cancel
  buttons. Enter a name and click Create. PASS:
  a new flow is created and the browser
  navigates to the flow designer page. The new
  flow is associated with the current project.

### Project Detail — Edit Mode

- [ ] **E8** Click "Edit" button on project detail. PASS: fields become editable inputs/textareas, Save and Cancel buttons appear.
- [ ] **E9** Modify a field, click "Save". PASS: project saves successfully, returns to view mode with updated data.
- [ ] **E10** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.

### Projects List — Drag-reorder

- [ ] **E11** On `projects/index.html`, press and hold on a project
  card then drag it to a new position. PASS: drop indicator appears,
  card follows the pointer, and on release the projects list
  reorders. Reload the page — new order persists.

---

## F. Tools

### Flow List (`flows/`)

- [ ] **F1** Navigate to `flows/`. PASS: page shows
  flow cards with name, description, project
  name badge, and state/transition counts.
- [ ] **F2** Type in the search input (if present).
  PASS: filters flow cards by name or
  description in real-time.
- [ ] **F3** Click a flow card. PASS: navigates
  to `flows/detail.html?flowId=<id>`.

### Flow Import

- [ ] **F4** Click "Import Flow" button on the flows list page. PASS: import dialog opens with a file upload input and a project selector dropdown.
- [ ] **F5** Select a `.mmd` file via the file input and choose a project from the dropdown. Click "Import". PASS: flow is created, toast confirms import, and browser navigates to the flow designer for the imported flow.
- [ ] **F6** Repeat with a `.zip` file exported from a previous flow. PASS: imported flow contains the same nodes, edges, and fields as the original.

### Flow Designer (`flows/detail.html?flowId=...`)

- [ ] **F7** Navigate to a flow designer page.
  PASS: toolbar runs vertically along the left
  edge of the canvas with Back at the top, Delete
  (trash icon) at the bottom, and Undo/Redo, Auto
  Layout, Zoom −/Auto Fit/+, Copy Mermaid, Export
  distributed between them. Locked checkbox in
  header controls edit lock. SVG canvas to the
  right of the toolbar with dot grid background
  showing the flow graph. When Auto Fit is on,
  conflicting interactions (drag, pan, zoom
  buttons, panel pan) are gated with a fire-and-
  toast "blocked" message rather than being
  silently absorbed; the user either turns Auto
  Fit off or accepts the constraint. Changes
  auto-save (no explicit Save button).
- [ ] **F8** Nodes display correctly: start node
  has green border with its name centered in the
  card and no subtitle, standard nodes have blue
  border with field count subtitle, complete node
  has a red 3-px border with its name centered
  in the card and no subtitle.
- [ ] **F9** Edges display correctly: forward
  edges are solid blue lines with arrow markers
  and named labels. Cycle edges — those that
  close a loop because a return path from target
  back to source already exists in the graph —
  are dashed orange with a warning arrow. Sibling
  transitions between nodes that have no return
  path render as solid blue even when they share
  a level.
- [ ] **F10** Connection ports (small circles) are
  visible on middle nodes (not on start or
  complete, and not on any node when the flow is
  locked). Each port sits on the longest open
  perimeter gap of its node, not always the right
  side. Hover over a port. PASS: cursor changes
  to crosshair and a browser tooltip reads "Click
  and drag to create a new node attached here.
  Hold Shift to connect to an existing node
  instead."
- [ ] **F11** Click a node. PASS: node gets blue
  glow selection effect. Double-click the node.
  PASS: properties panel appears showing state
  name, description, form fields list, and
  outgoing transitions.
- [ ] **F12** Pan so a node sits near the right
  edge of the canvas, then double-click it. PASS:
  the properties panel slides out from the
  toolbar edge over ~200ms and the canvas
  re-centers so the node sits at the visual center
  of the canvas region not covered by the panel.
- [ ] **F13** While the panel is open, double-click
  a different node. PASS: panel content updates to
  the new selection and the canvas re-centers on
  it.
- [ ] **F14** Enable Auto Fit, then double-click a
  node. PASS: the panel-open gesture is gated by
  Auto Fit — a toast reports the action is blocked.
  Turn Auto Fit off and double-click again. PASS:
  panel opens and the canvas centers on the node.
- [ ] **F15** Drag from a middle node's port into
  empty canvas past 20 pixels, without holding
  Shift. PASS: during the drag a faint bezier
  preview plus a "New State" ghost card track the
  cursor. On release, a new middle node is
  created at the drop position and
  auto-connected from the source node with a
  default edge name.
- [ ] **F16** Drag a standard node to a new
  position. PASS: node follows the pointer and
  can be placed freely on the canvas.
- [ ] **F17** Drag the start node. PASS: it moves
  freely like any standard node (start and
  complete nodes are both draggable; Auto Layout
  restores them to upper-left and lower-right
  respectively when invoked). Clicking the start
  node's port still initiates a drag-from-start
  to create a new state.
- [ ] **F18** Click "Auto Layout" in the vertical
  toolbar on the left. PASS:
  all nodes reposition based on their rank from
  start. Start is placed top-left, complete
  bottom-right, others arranged by graph depth.
- [ ] **F19** Hold Shift and drag from a middle
  node's port over another middle node, then
  release. PASS: during the drag the preview
  re-draws from a ghosted grey straight line
  (when the cursor is over empty canvas) into a
  curved bezier with an arrowhead the moment the
  cursor enters a valid target node. On release
  over the target, a new edge is created with a
  default name. No "New State" ghost card is
  shown while Shift is held.
- [ ] **F20** Shift-drag forward (earlier node →
  later node). PASS: the curved preview is solid
  blue while over the target. The committed edge
  matches the preview exactly.
- [ ] **F21** Shift-drag backward (later node →
  earlier node). PASS: the curved preview is
  dashed orange with a warning arrow while over
  the target — the reachability check recognises
  that target → … → source already exists. The
  committed cycle edge matches the preview.
- [ ] **F22** Shift-drag and release in empty
  canvas (no node under cursor). PASS: the grey
  straight-line preview disappears and nothing
  happens — no edge, no new node.
- [ ] **F23** Begin a plain drag from a port (no
  Shift). While the mouse remains stationary,
  press and hold Shift. PASS: without any mouse
  movement the ghost "New State" card disappears
  and the preview collapses to the grey line (or
  curved bezier if the cursor is already over a
  target). Release Shift — the ghost card
  returns. Release the mouse with Shift held to
  create an edge, or without Shift to create a
  node.
- [ ] **F24** Double-click a node, edit its name in
  the properties panel. PASS: the node label
  updates on the SVG canvas immediately (changes
  auto-save after 800ms debounce).
- [ ] **F25** Double-click a node, click "+ Add
  Field". Enter field name, select type from
  dropdown, toggle required. PASS: field appears
  in the fields list with lowercase type badge
  (e.g. "text") and red asterisk (*) if required.
- [ ] **F26** Click an edge to select it (blue glow).
  Double-click to open properties panel. PASS:
  panel shows transition name, description,
  from/to state names. Edit the name. PASS: label
  updates on the canvas.
- [ ] **F27** Select a non-start/non-complete node,
  click the Delete (trash) button in toolbar.
  PASS: node and all connected edges are removed.
- [ ] **F28** Select an edge, click the Delete
  (trash) button in toolbar. PASS: edge is
  removed from the canvas.
- [ ] **F29** Click "Zoom +" and "Zoom -" in
  toolbar. PASS: canvas zooms in and out smoothly.
  Click "Show All". PASS: canvas adjusts to
  show all nodes.
- [ ] **F30** Edit a node name via the properties
  panel, wait 1 second for auto-save. Navigate
  away and return to the designer. PASS: all
  nodes, edges, fields, and positions persist.
- [ ] **F31** Navigate to
  `flows/detail.html?flowId=nonexistent`. PASS:
  page handles gracefully — shows error state,
  no unhandled JS exception.

### Flow Designer — Undo/Redo

- [ ] **F32** After adding a state, click the Undo
  toolbar button. PASS: the state and its
  connecting edge are removed. Redo button
  becomes enabled.
- [ ] **F33** Click the Redo toolbar button. PASS:
  the state and edge reappear.
- [ ] **F34** After moving a node, press Cmd+Z (Mac)
  or Ctrl+Z. PASS: node returns to its previous
  position.
- [ ] **F35** After deleting a state, undo. PASS:
  the state and all its connected edges are
  restored.
- [ ] **F36** Undo and Redo buttons are disabled
  when their respective stacks are empty. PASS:
  buttons show disabled state initially.
- [ ] **F37** Perform an action, undo, then perform
  a new action. PASS: the redo stack is cleared
  (redo button disabled).

### Flow Designer — Keyboard Shortcuts

- [ ] **F38** Press Delete or Backspace with a node
  or edge selected (not focused in an input).
  PASS: selected item is deleted.
- [ ] **F39** Press Cmd+Z / Ctrl+Z to undo, press
  Cmd+Shift+Z / Ctrl+Shift+Z to redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.

### Flow Designer — Additional Coverage

- [ ] **F40** Toggle the Locked checkbox in the designer header.
  PASS: connection ports disappear from all middle nodes, the
  Delete toolbar button becomes disabled, and opening a properties
  panel shows fields as read-only (inputs `disabled`). Auto Layout
  remains enabled because it only repositions nodes without
  changing structure. Untoggle Locked: ports return, the Delete
  button re-enables, fields become editable.
- [ ] **F41** With a non-trivial flow loaded, click "Copy Mermaid"
  in the toolbar. PASS: toast confirms the clipboard copy. Paste the
  clipboard contents into a text editor — the result is valid Mermaid
  flowchart syntax that round-trips through `parseMermaid` without
  losing nodes, edges, or field definitions.
- [ ] **F42** Click "Export" in the toolbar. PASS: a `.zip` file
  downloads. Unzip the archive — it contains `flow.mmd` (Mermaid
  source), `flow.json` (graph with node positions), and a
  human-readable `flow.txt`.
- [ ] **F43** On `flows/index.html` click "Import Flow", select a
  `.mmd` file previously exported from a known flow, choose a
  project, and submit. PASS: the imported flow opens in the designer
  with the same node count, edge count, and field definitions as the
  original (compare to source flow side-by-side).
- [ ] **F44** Repeat F43 with a `.zip` archive. PASS: node
  positions are preserved as well as structural data — the imported
  flow looks visually identical to the original, not auto-laid-out.
- [ ] **F45** Make 11 edits in the flow designer (e.g. rename 11
  nodes one at a time, waiting for each auto-save). PASS: the
  persistent undo history retains at most 10 versions (inspect
  `fusion-ai:flow_versions` in DevTools — at most 10 rows for this
  `flow_id`; the oldest has been hard-deleted).
- [ ] **F46** Edit a flow (rename a state), let auto-save complete.
  Navigate away from the designer to `flows/index.html`. Re-open the
  same flow. Click Undo. PASS: the rename reverts — the undo history
  survived navigation because versions are persisted to the schema,
  not held in memory.

---

## F2. Workbox

### Workbox Inbox (`workbox/`)

- [ ] **WB1** Navigate to `workbox/`. PASS:
  page shows "Workbox" title, subtitle "Your
  work order inbox", Active/Archive tabs, and
  a "+ Create Work Order" button.
- [ ] **WB2** With no work orders, the Active
  tab shows an empty state with mail icon and
  "No Active Work Orders Yet" message.
- [ ] **WB3** Click the Archive tab. PASS: tab
  switches to show archive list (empty state
  initially).

### Workbox — Create Work Order

- [ ] **WB4** Click "+ Create Work Order". PASS:
  a dropdown menu opens listing available flows
  by name. (No separate dialog or Cancel button;
  the flow listing itself is the selector.)
- [ ] **WB5** Select a flow (e.g. "Customer
  Onboarding") and click Create. PASS: work
  order is created, browser navigates to the
  action screen at the first post-start state
  (e.g. "Data Capture"). Display ID (8-char
  hex) is visible in the header.

### Workbox — Action Screen (`workbox/detail.html`)

- [ ] **WB6** The action screen shows: back link
  ("Workbox"), flow name, display ID, current
  state badge, and dynamically rendered fields
  matching the current node's field definitions
  from the flow graph.
- [ ] **WB7** Field types render correctly: text
  inputs, textareas, selects, number inputs,
  date inputs, file inputs, checkboxes, radio
  buttons as appropriate for each field type
  in the flow definition.
- [ ] **WB8** Transition buttons appear below
  the fields, one per outgoing edge from the
  current node, labeled with the edge name.
- [ ] **WB9** A "Release Work Order" button is
  visible,
  separate from transition buttons.
- [ ] **WB10** A collapsible History section
  shows all transitions with from/to state
  names, user name, and relative timestamp.

### Workbox — Transitions

- [ ] **WB11** Fill in required fields and click
  a transition button. PASS: transition is
  recorded, work order moves to the next state,
  browser navigates back to the inbox. The work
  order appears in the Active tab (unclaimed).
- [ ] **WB12** Click the work order row in the
  Active tab. PASS: work order is claimed and
  browser navigates to the action screen
  showing the new state's fields.
- [ ] **WB13** Click "Release Work Order". PASS:
  a single click soft-deletes the active claim
  and the browser navigates to the inbox, where
  the work order reappears in the Active tab.

### Workbox — Completion

- [ ] **WB14** Transition a work order to the
  completion node (is_complete=true). PASS:
  work order moves to the Archive tab. It no
  longer appears in Active.
- [ ] **WB15** Click a completed work order in
  the Archive tab. PASS: action screen shows
  read-only view with history but no fields
  or transition buttons.

### Workbox — Data Integrity

- [ ] **WB16** After creating and transitioning
  a work order, check localStorage. PASS:
  work_orders table has 1 row with display_id
  and flow_graph JSON. work_order_transitions
  has immutable event records with from/to
  node IDs, user ID, values JSON, and
  timestamps.
- [ ] **WB17** Navigate away from the action
  screen and return. PASS: all data persists
  correctly across page navigation.

### Workbox — Concurrency & Integrity

- [ ] **WB18** Open the same unclaimed work order in two browser
  tabs. In tab 1, click the row to claim it. In tab 2, attempt the
  same. PASS: tab 2 either navigates to a read-only/already-claimed
  view or the claim is rejected — no duplicate row exists in
  `fusion-ai:work_order_claims` for this work order.
- [ ] **WB19** After transitioning a work order through at least
  two states, read `fusion-ai:work_order_transitions` from DevTools.
  PASS: each row has an immutable shape (from_node_id, to_node_id,
  user_id, values, transitioned_at). Verify no app code path mutates
  an existing transition row — transitions are append-only.

---

## G. Admin Pages

### Team (`teams/index.html`)

- [ ] **G1** Navigate to `teams/index.html`. PASS: shows roster of seeded team members with initials avatars, names, roles, departments, availability percentage badges, strength chips, performance stats (percentage, active count, completed count), and status dots (green=available, yellow=busy, red=limited). Search input and "Activity Feed" / "Add Member" buttons visible.
- [ ] **G2** Click a team member card. PASS: right-side detail panel populates with member name, role, email, and large avatar with initials.
- [ ] **G3** Detail panel shows two tabs (Dimensions, Performance). Click between tabs. PASS: tab content switches — Dimensions shows Driver/Analytical/Expressive/Amiable scores with progress bars.
- [ ] **G4** Click a different team member card. PASS: detail panel updates to show the newly selected member's information.
- [ ] **G5** Type a name in the search input. PASS: team member cards filter in real-time by name, role, or department.
- [ ] **G6** Click "Add Member" button. PASS: add-member dialog opens with an email field and send button.
- [ ] **G7** Enter an email address and click send. PASS: toast confirms invitation, dialog closes.
- [ ] **G8** Member status dots render with distinct colors (green for available, yellow for busy, red for limited). PASS: at least 2 different statuses visible.

### Account (`organization/index.html`)

- [ ] **G9** Navigate to `organization/index.html`. PASS: shows account overview with plan info, billing date, seat usage, and resource usage bars. (The overview values on this page are currently hardcoded placeholders — 18/25 seats, 12 Projects, 47 Ideas — not computed from live tables. Verify the page renders without error; numeric accuracy will be addressed when the values are wired to the database.)
- [ ] **G10** Health score (92, "excellent") is displayed. PASS: score and label visible. (Also hardcoded; see G9.)

### Profile (`profile/`)

- [ ] **G11** Navigate to `profile/`. PASS: shows profile form with avatar (initials), First Name, Last Name, Email, Phone, Role, Department (dropdown), and Bio fields for the current user (Tony Stark / demo@example.com).
- [ ] **G12** Strength chips are displayed with pre-selected strengths shown in primary style with checkmark icons. Click an unselected chip. PASS: chip toggles to primary/selected style. Click a selected chip. PASS: chip toggles to secondary/unselected style.
- [ ] **G13** Edit a field (e.g. phone), toggle strengths, and click "Save Changes". PASS: toast "Profile saved" appears.
- [ ] **G14** Navigate away from Profile (e.g. to Dashboard), then return to Profile. PASS: the edited field retains the saved value — data was persisted to the database, not just displayed via toast.

### Company (`company/`)

- [ ] **G15** Navigate to `company/`. PASS: shows the current Company form — Name (e.g. "Stark Industries") and Domain (e.g. "acmecorp.com"). The broader settings feature is being reduced; additional fields may be removed in upcoming work.
- [ ] **G17** Edit Name (or Domain) and click save. PASS: success toast or save completes without error.
- [ ] **G18** Navigate away from Settings, then return. PASS: the edited setting retains the saved value — data was persisted to the database.

### Manage Users (`organization/users.html`)

- [ ] **G19** Navigate to `organization/users.html`. PASS: shows user table with avatar, name, email, role badge (job title), department, status badge (Active/Pending/Deactivated), and last active time. Header shows active/pending user counts. Search input and two filter dropdowns (All Roles, All Status) visible.
- [ ] **G20** Type in the search input. PASS: filters user list by name or email in real-time. Role and status dropdowns also filter the list.
- [ ] **G21** Deactivated user (James Miller) is visually distinguished with "Deactivated" badge (X icon) and reduced opacity styling. PASS: clearly different from active users.
- [ ] **G22** Pending users show "Pending" badge with clock icon and "Invite sent" text. PASS: visually distinct from active users.
- [ ] **G23** "Invite User" button is visible. PASS: clicking it opens the invite dialog with fields for First Name, Last Name, Email, Role, Department, Status, Phone, Availability %, Performance, and Bio.
- [ ] **G24** Fill all required fields and submit the invite dialog. PASS: toast confirms user creation, new user appears in the user list with correct name, email, role, and status badge.

### Activity Feed (`organization/activity-feed.html`)

- [ ] **G25** Navigate to `organization/activity-feed.html`. PASS: shows seeded activity entries with type icons and timestamps. Search input ("Search activity...") and type filter dropdown ("All Activity") visible.
- [ ] **G26** Activity types include idea created, project created, user joined, status changed, idea converted, and comment added. PASS: multiple distinct types visible with appropriate icons (lightbulb, folder, user-plus, edit, arrow-right).
- [ ] **G27** Each activity entry shows actor name, action verb, target name, and meta info (score badge, status badge, or quoted feedback text). PASS: entries have full context.
- [ ] **G28** Type in the search input. PASS: activity entries filter by actor name or target name in real-time.
- [ ] **G29** Select a type from the filter dropdown (e.g. "Ideas"). PASS: only activities of that type shown. Filter options: All Activity, Ideas, Projects, Teams. Reset to "All Activity" → full list returns.

### Snapshots (`snapshots/`) — Run These Last

- [ ] **G30** Navigate to `snapshots/`. PASS: shows 4 operation cards: Create Pristine Environment, Wipe and Load Mock Data, Upload Snapshot, Download Snapshot.
- [ ] **G31** Click "Download Snapshot". PASS: browser downloads `fusion-ai-snapshot-YYYY-MM-DD.json`. File contains valid JSON with entity data.
- [ ] **G32** Click "Create Pristine Environment", confirm the dialog. PASS: redirects to `dashboard/index.html`. Dashboard renders with zeroed-out metrics (empty database). All 18 `fusion-ai:*` keys exist in localStorage as empty arrays.
- [ ] **G33** Click "Wipe and Load Mock Data". PASS: redirects to `dashboard/index.html`. Navigate to `ideas/` — 11 ideas are back.
- [ ] **G34** Return to `snapshots/`, wipe data, then use "Upload Snapshot" file input and select the previously downloaded JSON file. PASS: redirects to `dashboard/index.html`. Data matches the snapshot.

### Snapshot & User Lifecycle — Error/Edge Cases

- [ ] **G35** On `snapshots/`, click "Upload Snapshot" and select a
  malformed JSON file (e.g. truncated mid-object). PASS: a toast or
  inline error reports the upload failed with a human-readable
  message; existing data in localStorage is untouched (verify via
  DevTools that no fusion-ai:* keys were overwritten or cleared).
- [ ] **G36** On `organization/users.html`, each active or pending
  user row shows a user-X icon button (aria-label "Deactivate
  user") and each deactivated row shows a user-check icon button
  ("Reactivate user"). Click an active user's deactivate button.
  PASS: a toast "User deactivated" fires and the list reloads with
  the user's badge changed to "Deactivated" and reduced opacity
  styling; the user no longer counts toward the active header
  stat. Click the reactivate button on a deactivated row. PASS: a
  toast "User reactivated" fires and the user returns to active.
  The action is intentionally reversible with a single click, so
  no confirmation dialog is required.

### Billing (`billing/`) — STUB

Billing is a placeholder page. `init()` is empty and
the body is hand-written static HTML. These tests
verify the page loads and the sidebar nav link works
— functional billing tests will be added when the
feature is implemented.

- [ ] **G37** Click "Billing" in the sidebar. PASS:
  browser navigates to `billing/index.html`. The page
  renders without console errors. Sidebar highlights
  the Billing link as active. No runtime JS errors
  from the empty `init()`.

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
- [ ] **I6** Open the app in a second browser tab. Change theme in the first tab. PASS: second tab updates to the new theme without manual reload (cross-tab sync via StorageEvent).

### Sidebar

- [ ] **I7** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
- [ ] **I8** Navigate to another page. PASS:
  collapsed state persists (stored in
  `localStorage` key
  `fusion-sidebar-collapsed`).
- [ ] **I9** Click the expand button. PASS: sidebar returns to full width with labels.

### Mobile Responsive

- [ ] **I10** Resize browser to ≤768px width (or use DevTools device emulation). PASS: desktop sidebar disappears, mobile header with hamburger menu appears.
- [ ] **I11** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
- [ ] **I12** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.
- [ ] **I13** Tap a navigation link in the mobile sidebar. PASS: navigates to the target page and mobile sidebar closes.
- [ ] **I14** Open the mobile sidebar, press `Escape`. PASS: sidebar closes.
- [ ] **I15** Open the mobile sidebar, press `Tab` repeatedly. PASS: focus cycles through focusable elements inside the sidebar without escaping to the page behind it. `Shift+Tab` at the first element wraps to the last.

### Command Palette

- [ ] **I16** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
- [ ] **I17** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
- [ ] **I18** Press `Escape`. PASS: command palette closes.
- [ ] **I19** Open command palette, type a search term. Use `Down Arrow` and `Up Arrow` to navigate results. PASS: active result highlight moves with arrow keys. Press `Enter`. PASS: navigates to the highlighted result.
- [ ] **I20** Open command palette with an empty search field. PASS: results list shows up to 12 items from the combined index, grouped by category (Pages, Ideas, Projects, People) with category headers — when the dataset is sparse enough for multiple categories to fit in 12 items, multiple groups appear; otherwise a single group is shown. Type a multi-category term (e.g. "dashboard") that matches across groups. PASS: results regroup under multiple category headers. Type a term that matches no results. PASS: result list is empty or shows a no-results message.

### Loading States

- [ ] **I21** Navigate to a data-dependent page with mock data loaded. PASS: loading skeleton (card-grid, card-list, or detail pattern) appears briefly before content renders.
- [ ] **I22** If an error occurs inside a `withLoadingState()` fetch path (e.g. a data-dependent page hits a thrown adapter error after the database initialized successfully), the error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading. (Note: errors surfaced from `initDatabase` itself — e.g. corrupted localStorage that fails before the page renders — show a separate "Failed to initialize database" error UI via `handleDatabaseError`, without a retry button. Both are valid error states for different layers.)

### Toasts

- [ ] **I23** Trigger a toast (e.g. save profile, or use DB Admin reload). PASS: toast appears at bottom or corner of screen, auto-dismisses after ~3 seconds with fade-out.
- [ ] **I24** While a toast is visible, click its close button (×). PASS: toast dismisses immediately without waiting for auto-dismiss timer.
- [ ] **I25** Trigger multiple toasts in rapid succession (e.g. save profile repeatedly). PASS: toasts stack visibly (up to 5). When a 6th toast arrives, the oldest is removed.

### Snapshot Round-Trip

- [ ] **I26** Download a snapshot, wipe data (Create Pristine), upload the snapshot. PASS: all data restored correctly — spot-check 3 pages to confirm content matches pre-wipe state.

### General

- [ ] **I27** Check DevTools Console after navigating through 5+ different pages. PASS: no unhandled JavaScript errors (warnings and info messages from browser extensions are acceptable).

### Sidebar Cross-Tab Sync

- [ ] **I28** Open the app in two tabs. In tab 1 collapse the
  sidebar. PASS: tab 2 reflects the collapsed state without manual
  reload (cross-tab sync via StorageEvent on
  `fusion-sidebar-collapsed`).

---

## J. Teardown

- [ ] **J1** Stop the HTTP server started in A3. PASS: process terminates.
- [ ] **J2** Remove the build directory (`rm -rf /tmp/fusion-test` or equivalent). PASS: directory removed.
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
| Tests Passed | /253 |
| Tests Failed | /253 |
| Tests Skipped | /253 |
| Notes | |
