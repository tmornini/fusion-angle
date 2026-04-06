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
| AA. Data Entry Workflow | 43 |
| B. Entry Pages | 16 |
| C. Core: Dashboard | 7 |
| D. Core: Ideas Workflow | 48 |
| E. Core: Projects | 11 |
| F. Tools | 32 |
| G. Admin Pages | 34 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 27 |
| J. Teardown | 3 |
| **Total** | **228** |

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Unzip the archive into a temp directory (e.g. `/tmp/fusion-test`). PASS: directory contains `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), `index.html`, and 12 page directories containing 23 HTML page files, plus root `index.html`.
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
- [ ] **AA2** Open DevTools, verify localStorage has `fusion-ai:*` keys (19 tables as empty arrays plus bootstrap data).
- [ ] **AA3** Verify bootstrap data exists: user "Tony Stark" (id: `current`), company "Stark Industries" with "Business" plan.

### AA2. Create Users

- [ ] **AA4** Navigate to Organization > Users. Click "Invite User". PASS: invite dialog opens with fields for First Name, Last Name, Email, Role, Department, Status, Phone, Availability %, Performance, and Bio.
- [ ] **AA5** Fill all fields for user "Sarah Chen" (Engineering Manager, Engineering dept, active status). Submit. PASS: toast confirms creation, user appears in the list.
- [ ] **AA6** Repeat for all 10 users: Sarah Chen, Mike Thompson, Jessica Park, David Martinez, Emily Rodriguez (pending), Alex Kim, Marcus Johnson, David Kim, Lisa Wang, James Miller (deactivated). PASS: all 10 appear on Users page with correct name, email, role, and status badge.
- [ ] **AA7** Navigate to Teams page. PASS: users display with correct availability color coding and performance stats.

### AA3. Profile & Company Settings

- [ ] **AA8** Navigate to Profile. Edit fields (phone, bio, strengths). Click "Save Changes". PASS: toast "Profile saved" appears.
- [ ] **AA9** Navigate away, return to Profile. PASS: edited fields persist with saved values.
- [ ] **AA10** Navigate to Company Settings. Edit a field (e.g. timezone). Click save. PASS: success toast appears.
- [ ] **AA11** Navigate away, return to Settings. PASS: edited field persists with saved value.

### AA4. Create Ideas

- [ ] **AA12** Navigate to Ideas. Click "Create Idea". Complete the 3-step wizard for "AI-Powered Customer Segmentation" (title, problem, solution, outcome, metrics). PASS: idea appears on ideas list.
- [ ] **AA13** Navigate to the new idea's detail page. Click "Edit". Set remaining fields: category, estimated impact, duration (days), cost. Click "Save". PASS: toast confirms save, all fields persist.
- [ ] **AA14** Repeat creation and field entry for all 11 ideas matching mock data titles. PASS: ideas list shows all 11 with correct titles.

### AA5. Submit Ideas for Review

- [ ] **AA18** Navigate to idea #1 detail (status: active). Click "Submit for Review". PASS: status changes to "In Review", button disappears.
- [ ] **AA19** Submit ideas 1, 4, 7, 8, 9, 10, 11 for review (matching mock data statuses). PASS: each transitions from active to in-review.
- [ ] **AA20** Navigate to Review Queue. PASS: the 7 submitted ideas appear with priority badges and readiness status.

### AA7. Approve Ideas & Convert to Projects

- [ ] **AA28** Navigate to Review Queue. Click idea #1. PASS: navigates to approval detail.
- [ ] **AA29** Click "Approve". PASS: idea status changes to approved, confirmation shown.
- [ ] **AA30** Approve idea #4 as well (it was submitted for review in AA19). Leave others in their current status. PASS: statuses match mock data (2 approved, rest in-review/active).
- [ ] **AA31** Navigate to approved idea #1. Click "Convert". PASS: conversion form loads with 6 required fields (Project Name, Lead, Start Date, End Date, Budget, Priority).
- [ ] **AA32** Fill all required fields: Project Name, select "Sarah Chen" as project lead, Start Date, Target End Date, Budget, Priority. Click "Create Project". PASS: navigates to project detail for the new project.
- [ ] **AA33** On project detail, click "Edit". Set fields (title, description, status, start date, end date, cost baseline, impact baseline) to match mock data. Save. PASS: project data persists.
- [ ] **AA34** Approve remaining ideas (7, 8, 9, 10) from Review Queue, then convert all 6 approved ideas to projects. PASS: Projects list shows all 6 with correct status, progress, and priority.

### AA9. Create Flows

- [ ] **AA35** Navigate to Projects. Click into
  project #1 detail. PASS: a "Flows" section
  is visible showing "No flows yet" empty
  state and a "New Flow" button.
- [ ] **AA36** Click "New Flow". PASS: navigates
  to the flow designer page. The SVG canvas
  shows two nodes: "New" (start, top-left with
  green border) and "Complete" (end, bottom-right
  with double green border) connected by no edges.
  Toolbar shows Undo, Redo, "+ Add State", Delete
  (trash icon), Auto Layout, Zoom +/−, Fit, Copy
  Mermaid, Export .zip. Changes auto-save (no
  explicit Save button).
- [ ] **AA37** Click the start node to select it.
  Click "+ Add State". PASS: a dialog opens asking
  for State Name, Transition Name, and Placement
  Direction. Enter "Data Capture" and "begin".
  Click "Add State". PASS: a new node appears on
  the canvas with a blue border, connected from
  the start node by an edge named "begin".
- [ ] **AA38** Double-click the "Data Capture" node.
  PASS: properties panel appears showing State
  Name input, Description input, empty Fields
  list, and outgoing transitions. The node gets a
  blue glow selection effect on the canvas.
- [ ] **AA39** Edit the state name in the
  properties panel. PASS: the node label updates
  on the canvas immediately (auto-saves via
  800ms debounce).
- [ ] **AA40** Click the start node and drag to
  "Data Capture". PASS: a dashed preview line
  shows during the drag. On release, a new edge
  appears with a default name. (Note: start nodes
  have no visible port circles — clicking the
  node itself initiates a connection.)
- [ ] **AA41** Double-click the new edge label.
  PASS: edge properties panel shows Name,
  Description, From/To states. Rename it to
  "begin".
- [ ] **AA42** Repeat: add a "Review" state, connect
  "Data Capture" to "Review" (name: "submit"),
  connect "Review" to "Data Capture" (name: "needs
  revision", should appear as dashed orange cycle
  edge), connect "Review" to "Complete" (name:
  "approve").
- [ ] **AA43** In the "Data Capture" properties
  panel, click "+ Add Field". Enter name "Company
  Name", type "text", check "Required". PASS:
  field appears in the fields list with a "text"
  badge and a red asterisk (*) required indicator.
- [ ] **AA44** Add more fields to "Data Capture":
  Contact Email (email, required), Industry (select
  with options "Technology, Finance, Healthcare"),
  Company Logo (image). PASS: all fields appear
  with correct type badges.
- [ ] **AA45** Wait for auto-save (800ms debounce).
  Navigate away and back. PASS: all nodes, edges,
  and fields persist.

### AA10. Verify Dashboard

- [ ] **AA46** Navigate to Dashboard. PASS: gauge
  cards (Time, Cost, Impact) show aggregated values
  computed from the entered project data.
- [ ] **AA47** Header stats reflect entered data
  counts (ideas, projects, flows). PASS:
  counts are non-zero and match.

### AA11. Edit & Verify Cycle

- [ ] **AA48** Edit idea #1: change title. Save,
  navigate to ideas list, return to detail. PASS:
  changed title persists.
- [ ] **AA49** Edit project #1: change description.
  Save, navigate away, return. PASS: changed
  description persists.
- [ ] **AA50** Edit flow: navigate to flow
  designer, rename a state (auto-saves). Navigate
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
  links: Dashboard, Ideas, Projects, Flows,
  Organization, Teams, Snapshots, Design
  System. PASS: all links present and styled.
- [ ] **C3** Header shows search bar, greeting
  ("Good {morning/afternoon/evening}, Tony
  Stark" — varies by time of day), company
  stats ("Stark Industries · 11 Ideas ·
  6 Projects · 1 Flows"), and theme toggle.
  PASS: elements visible and styled.
- [ ] **C4** Dashboard displays 3 gauge/metric cards (Time, Cost, Impact) with baseline and current values. PASS: cards render with non-zero values and concentric arc gauges.
- [ ] **C6** Sidebar navigation links all function correctly. PASS: clicking a sidebar link navigates to the expected page.
- [ ] **C7** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C8** Check that seed data populates all dashboard widgets. PASS: no "No data" empty states on initial load (seed data provides content for all widgets).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: table/list shows 11 ideas with title, priority, status, and Time/Cost/Impact stats. Ideas without estimates show "—" (em-dash) instead of zero values.
- [ ] **D1b** "Idea Flow" workflow banner is
  visible showing the 3 stages: Create → Review
  → Convert. PASS: banner renders with labeled
  steps.
- [ ] **D2** Each idea row shows a status badge
  (Active, In Review, Approved, Promoted, Sent
  Back, or Archived). PASS: badges render with
  distinct colors.
- [ ] **D3** Click an idea row/title. PASS: navigates to the idea's detail or scoring page with the correct `ideaId` parameter.
- [ ] **D4** "New Idea" or "Create Idea" button is visible. PASS: clicking it navigates to `ideas/create.html`.

### Idea Create Wizard (`ideas/create.html`)

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

- [ ] **D16** Navigate to `ideas/detail.html?ideaId=1`. PASS: page loads with idea title, status badge, "Submitted by" name, and submission date.
- [ ] **D17** Page displays three cards: Problem & Solution (Problem Statement, Target Users, Proposed Solution, Expected Outcome, Success Metrics), Details (Category, Submitted by, Submitted at), and Estimates (Impact, Duration in days, Cost). PASS: all fields populated.
- [ ] **D18** Click "Edit" button. PASS: text fields become editable inputs/textareas, Save and Cancel buttons appear, Edit button hides.
- [ ] **D19** Modify a field (e.g. title), click "Save". PASS: toast "Idea saved" appears, page returns to view mode with updated data.

### Idea Detail — Edit & Actions

- [ ] **D19b** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.
- [ ] **D19c** For an idea in "in_review"
  status: "Review" action button is visible.
  PASS: clicking it navigates to
  `ideas/approval-detail.html` page.
- [ ] **D19e** For a convertible idea: "Convert" action button is visible. PASS: clicking it navigates to `ideas/convert.html` page.
- [ ] **D19f** Navigate to `ideas/detail.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows error state, no unhandled JS exception.

### Idea Detail — Submit for Review

- [ ] **D19k** Navigate to an idea with status "active". PASS: "Submit for Review" button is visible in the header area.
- [ ] **D19l** Click "Submit for Review". PASS: status changes to "In Review", button disappears, status badge updates.

### Idea Detail — Sent Back Re-Submit

- [ ] **D19m** Navigate to an idea with status "sent-back" (after a reviewer sends it back). PASS: "Submit for Review" button is visible, allowing re-submission.
- [ ] **D19n** Click "Edit", modify a field, click "Save". PASS: idea updates. Click "Submit for Review". PASS: status changes to "In Review", idea reappears in Review Queue.

### Idea Convert (`ideas/convert.html`)

- [ ] **D20** Navigate to `ideas/convert.html?ideaId=<id>` for a convertible idea. PASS: page loads with conversion form showing 6 required fields: Project Name, Project Lead (dropdown of active users), Start Date, Target End Date, Budget (text input), Priority (select). Sticky sidebar shows idea summary (problem, solution, outcome).
- [ ] **D20b** With required fields empty, "Create Project" button is disabled and progress bar shows 0/6. Fill fields one at a time. PASS: progress bar increments with each field, checkmarks appear next to completed fields, button enables only when all 6 required fields are filled.
- [ ] **D21** Fill all required fields (progress bar reaches 100%), click "Create Project". PASS: navigates to project detail page for the newly created project.

### Idea Review Queue (`ideas/review-queue.html`)

- [ ] **D22** Navigate to `ideas/review-queue.html`. PASS: page shows 3 stats cards (Pending Review, Ready to Decide, Avg. Wait Time) and a list of ideas pending review.
- [ ] **D22b** Each review card shows readiness
  status (Ready for Review/Needs Info/Incomplete),
  title, submitter, category, days waiting,
  impact, and effort. PASS: all fields render
  with data.
- [ ] **D23** At least one idea with `in-review` status appears in the queue. PASS: idea 7 ("AI-Powered Customer Support Chatbot") or similar is listed.
- [ ] **D23b** Type a search term in the search input. PASS: review cards filter by title or submitter name in real-time.
- [ ] **D23c** Select "Ready" from the readiness filter dropdown. PASS: list shows only ready items. Reset to "All Status" → full list returns.
- [ ] **D23e** Apply search + filter that matches no items. PASS: empty state shows "No ideas match your filters" message.
- [ ] **D24** Click a review item. PASS: navigates to `ideas/approval-detail.html?id=<ideaId>`.

### Approval Detail (`ideas/approval-detail.html`)

- [ ] **D25** Navigate to `ideas/approval-detail.html?id=7`. PASS: page loads with full idea details for idea 7.
- [ ] **D26** Page shows the idea title, submitter, date, category, idea overview, expected impact, effort, cost, risks, assumptions, and alignments. PASS: all content sections populated.
- [ ] **D27** "Approve" action is available.
  PASS: clicking it shows confirmation or
  success feedback.
- [ ] **D29** "Reject" or "Send Back" action is available. PASS: clicking it shows confirmation or reason dialog.
- [ ] **D29b** Confirm the reject dialog. PASS: idea status changes to "sent-back", page updates to reflect rejected state.
- [ ] **D30** Click "Request Clarification" button. PASS: clarification dialog opens. Submit the dialog. PASS: toast "Clarification requested" appears and dialog closes.

### Ideas Workflow Integration

- [ ] **D31** After completing the idea-create wizard through to idea convert, navigate back to `ideas/`. PASS: the ideas list still loads correctly with seed data.
- [ ] **D32** Navigate from ideas list → idea convert → back button. PASS: navigates to ideas list.
- [ ] **D33** Navigate to `ideas/convert.html?ideaId=999` (non-existent). PASS: page handles gracefully — shows empty/error state, no unhandled JS exception.
- [ ] **D34** Navigate to `ideas/approval-detail.html` with no `id` parameter. PASS: page handles gracefully — no crash.

---

## E. Core: Projects

### Projects List (`projects/`)

- [ ] **E1** Navigate to `projects/`. PASS: table/list shows 6 seeded projects with title, status, progress, and priority. Project cards show "—" (em-dash) for missing/zero metric values (time, cost, impact). Footer count uses correct singular/plural grammar (e.g. "1 project", "6 projects").
- [ ] **E1b** Click the Priority/Performance view toggle. PASS: project list re-sorts by the selected criterion. Toggle button highlights for the active view.
- [ ] **E1c** Click a status filter badge (e.g. "Active"). PASS: project list filters to show only projects with that status. Click the same badge again or "All". PASS: full list returns.
- [ ] **E2** Click a project row. PASS: navigates to `projects/detail.html?projectId=<id>`.

### Project Detail (`projects/detail.html?projectId=1`)

- [ ] **E3** Page loads with project summary
  card (description, dates, progress bar) and
  baseline vs. current metrics. PASS: all cards
  render with data. Baseline/current metrics
  show em dash when values are zero or missing.
- [ ] **E4** Sidebar shows Team card listing
  project team members with roles. PASS: team
  members render with names and role badges.
- [ ] **E5** Flows section shows linked flows with
  node/edge counts and a "New Flow" button. PASS:
  at least one flow displayed or empty state with
  button visible.
- [ ] **E5b** Click "New Flow" button. PASS: a new flow is created and the browser navigates to the flow designer page. The new flow is associated with the current project.

### Project Detail — Edit Mode

- [ ] **E9b** Click "Edit" button on project detail. PASS: fields become editable inputs/textareas, Save and Cancel buttons appear.
- [ ] **E9c** Modify a field, click "Save". PASS: project saves successfully, returns to view mode with updated data.
- [ ] **E9d** Click "Edit", then "Cancel". PASS: returns to view mode with original data unchanged.

---

## F. Tools

### Flow List (`flow/`)

- [ ] **F11** Navigate to `flow/`. PASS: page shows
  flow cards with name, description, project
  name badge, and state/transition counts.
- [ ] **F12** Type in the search input (if present).
  PASS: filters flow cards by name or
  description in real-time.
- [ ] **F13** Click a flow card. PASS: navigates
  to `flow/detail.html?flowId=<id>`.

### Flow Import

- [ ] **F13b** Click "Import Flow" button on the flows list page. PASS: import dialog opens with a file upload input and a project selector dropdown.
- [ ] **F13c** Select a `.mmd` file via the file input and choose a project from the dropdown. Click "Import". PASS: flow is created, toast confirms import, and browser navigates to the flow designer for the imported flow.
- [ ] **F13d** Repeat with a `.zip` file exported from a previous flow. PASS: imported flow contains the same nodes, edges, and fields as the original.

### Flow Designer (`flow/detail.html?flowId=...`)

- [ ] **F14** Navigate to a flow designer page.
  PASS: toolbar at top with Undo, Redo, + Add
  State, Delete (trash icon), Auto Layout, Zoom
  +/−, Fit, Copy Mermaid, Export .zip. SVG canvas
  below with dot grid background showing the flow
  graph. Changes auto-save (no explicit Save
  button).
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
  visible on standard node edges (not on start or
  complete nodes). Hover over a port. PASS: cursor
  changes to crosshair.
- [ ] **F18** Click a node. PASS: node gets blue
  glow selection effect. Double-click the node.
  PASS: properties panel appears showing state
  name, description, form fields list, and
  outgoing transitions.
- [ ] **F19** Select a node, then click "+ Add
  State" in toolbar (button is disabled until a
  node is selected). PASS: dialog opens asking
  for State Name, Transition Name, and Placement
  Direction. Fill and submit. PASS: new node
  appears connected from the selected node.
- [ ] **F19b** Drag a standard node to a new
  position. PASS: node follows the pointer and
  can be placed freely on the canvas.
- [ ] **F19c** Attempt to drag the start node. PASS:
  it does not move (clicking it initiates a
  connection instead). The complete node is
  draggable like standard nodes.
- [ ] **F19d** Click "Auto Layout" in toolbar. PASS:
  all nodes reposition based on their rank from
  start. Start is placed top-left, complete
  bottom-right, others arranged by graph depth.
- [ ] **F20** Drag from one node's port to another
  node's port. PASS: a dashed preview line appears
  during drag. On release over a valid port, a new
  edge is created with a default name.
- [ ] **F21** Double-click a node, edit its name in
  the properties panel. PASS: the node label
  updates on the SVG canvas immediately (changes
  auto-save after 800ms debounce).
- [ ] **F22** Double-click a node, click "+ Add
  Field". Enter field name, select type from
  dropdown, toggle required. PASS: field appears
  in the fields list with lowercase type badge
  (e.g. "text") and red asterisk (*) if required.
- [ ] **F23** Click an edge to select it (blue glow).
  Double-click to open properties panel. PASS:
  panel shows transition name, description,
  from/to state names. Edit the name. PASS: label
  updates on the canvas.
- [ ] **F24** Select a non-start/non-complete node,
  click the Delete (trash) button in toolbar.
  PASS: node and all connected edges are removed.
- [ ] **F25** Select an edge, click the Delete
  (trash) button in toolbar. PASS: edge is
  removed from the canvas.
- [ ] **F26** Click "Zoom +" and "Zoom -" in
  toolbar. PASS: canvas zooms in and out smoothly.
  Click "Fit". PASS: canvas adjusts to show all
  nodes.
- [ ] **F27** Edit a node name via the properties
  panel, wait 1 second for auto-save. Navigate
  away and return to the designer. PASS: all
  nodes, edges, fields, and positions persist.
- [ ] **F28** Navigate to
  `flow/detail.html?flowId=nonexistent`. PASS:
  page handles gracefully — shows error state,
  no unhandled JS exception.

### Flow Designer — Undo/Redo

- [ ] **F29** After adding a state, click the Undo
  toolbar button. PASS: the state and its
  connecting edge are removed. Redo button
  becomes enabled.
- [ ] **F30** Click the Redo toolbar button. PASS:
  the state and edge reappear.
- [ ] **F31** After moving a node, press Cmd+Z (Mac)
  or Ctrl+Z. PASS: node returns to its previous
  position.
- [ ] **F32** After deleting a state, undo. PASS:
  the state and all its connected edges are
  restored.
- [ ] **F33** Undo and Redo buttons are disabled
  when their respective stacks are empty. PASS:
  buttons show disabled state initially.
- [ ] **F34** Perform an action, undo, then perform
  a new action. PASS: the redo stack is cleared
  (redo button disabled).

### Flow Designer — Keyboard Shortcuts

- [ ] **F35** Press Delete or Backspace with a node
  or edge selected (not focused in an input).
  PASS: selected item is deleted.
- [ ] **F36** Press Cmd+Z / Ctrl+Z to undo, press
  Cmd+Shift+Z / Ctrl+Shift+Z to redo. PASS:
  keyboard shortcuts match toolbar button
  behavior.

---

## G. Admin Pages

### Team (`organization/teams.html`)

- [ ] **G1** Navigate to `organization/teams.html`. PASS: shows roster of seeded team members with initials avatars, names, roles, departments, availability percentage badges, strength chips, performance stats (percentage, active count, completed count), and status dots (green=available, yellow=busy, red=limited). Search input and "Activity Feed" / "Add Member" buttons visible.
- [ ] **G1b** Click a team member card. PASS: right-side detail panel populates with member name, role, email, and large avatar with initials.
- [ ] **G1c** Detail panel shows two tabs (Dimensions, Performance). Click between tabs. PASS: tab content switches — Dimensions shows Driver/Analytical/Expressive/Amiable scores with progress bars.
- [ ] **G1d** Click a different team member card. PASS: detail panel updates to show the newly selected member's information.
- [ ] **G1e** Type a name in the search input. PASS: team member cards filter in real-time by name, role, or department.
- [ ] **G1f** Click "Add Member" button. PASS: add-member dialog opens with an email field and send button.
- [ ] **G1g** Enter an email address and click send. PASS: toast confirms invitation, dialog closes.
- [ ] **G2** Member status dots render with distinct colors (green for available, yellow for busy, red for limited). PASS: at least 2 different statuses visible.

### Account (`organization/index.html`)

- [ ] **G3** Navigate to `organization/index.html`. PASS: shows account overview with plan info (Business plan), billing date, seat usage (18/25), and resource usage bars.
- [ ] **G4** Health score (92, "excellent") is displayed. PASS: score and label visible.

### Profile (`profile/`)

- [ ] **G5** Navigate to `profile/`. PASS: shows profile form with avatar (initials), First Name, Last Name, Email, Phone, Role, Department (dropdown), and Bio fields for the current user (Tony Stark / demo@example.com).
- [ ] **G5b** Strength chips are displayed with pre-selected strengths shown in primary style with checkmark icons. Click an unselected chip. PASS: chip toggles to primary/selected style. Click a selected chip. PASS: chip toggles to secondary/unselected style.
- [ ] **G6** Edit a field (e.g. phone), toggle strengths, and click "Save Changes". PASS: toast "Profile saved" appears.
- [ ] **G6b** Navigate away from Profile (e.g. to Dashboard), then return to Profile. PASS: the edited field retains the saved value — data was persisted to the database, not just displayed via toast.

### Company Settings (`settings/`)

- [ ] **G7** Navigate to `settings/`. PASS: shows company info (Stark Industries, acmecorp.com, Technology, 51-200).
- [ ] **G8** Security settings visible: SSO (off), 2FA (on), IP Whitelist (off). PASS: toggle/indicator states match seed data.
- [ ] **G9** Edit a setting (e.g. timezone or language) and save. PASS: success toast or save completes without error.
- [ ] **G9b** Navigate away from Settings, then return. PASS: the edited setting retains the saved value — data was persisted to the database.

### Manage Users (`organization/users.html`)

- [ ] **G10** Navigate to `organization/users.html`. PASS: shows user table with avatar, name, email, role badge (job title), department, status badge (Active/Pending/Deactivated), and last active time. Header shows active/pending user counts. Search input and two filter dropdowns (All Roles, All Status) visible.
- [ ] **G10b** Type in the search input. PASS: filters user list by name or email in real-time. Role and status dropdowns also filter the list.
- [ ] **G11** Deactivated user (James Miller) is visually distinguished with "Deactivated" badge (X icon) and reduced opacity styling. PASS: clearly different from active users.
- [ ] **G11b** Pending users show "Pending" badge with clock icon and "Invite sent" text. PASS: visually distinct from active users.
- [ ] **G12** "Invite User" button is visible. PASS: clicking it opens the invite dialog with fields for First Name, Last Name, Email, Role, Department, Status, Phone, Availability %, Performance, and Bio.
- [ ] **G12b** Fill all required fields and submit the invite dialog. PASS: toast confirms user creation, new user appears in the user list with correct name, email, role, and status badge.

### Activity Feed (`organization/activity-feed.html`)

- [ ] **G13** Navigate to `organization/activity-feed.html`. PASS: shows seeded activity entries with type icons and timestamps. Search input ("Search activity...") and type filter dropdown ("All Activity") visible.
- [ ] **G14** Activity types include idea created, project created, user joined, status changed, idea converted, and comment added. PASS: multiple distinct types visible with appropriate icons (lightbulb, folder, user-plus, edit, arrow-right).
- [ ] **G14b** Each activity entry shows actor name, action verb, target name, and meta info (score badge, status badge, or quoted comment text). PASS: entries have full context.
- [ ] **G14c** Type in the search input. PASS: activity entries filter by actor name or target name in real-time.
- [ ] **G14d** Select a type from the filter dropdown (e.g. "Ideas"). PASS: only activities of that type shown. Filter options: All Activity, Ideas, Projects, Teams. Reset to "All Activity" → full list returns.

### Snapshots (`snapshots/`) — Run These Last

- [ ] **G18** Navigate to `snapshots/`. PASS: shows 4 operation cards: Create Pristine Environment, Wipe and Load Mock Data, Upload Snapshot, Download Snapshot.
- [ ] **G19** Click "Download Snapshot". PASS: browser downloads `fusion-ai-snapshot-YYYY-MM-DD.json`. File contains valid JSON with entity data.
- [ ] **G20** Click "Create Pristine Environment", confirm the dialog. PASS: redirects to `dashboard/index.html`. Dashboard renders with zeroed-out metrics (empty database). All 19 `fusion-ai:*` keys exist in localStorage as empty arrays.
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
- [ ] **I5b** Open the app in a second browser tab. Change theme in the first tab. PASS: second tab updates to the new theme without manual reload (cross-tab sync via StorageEvent).

### Sidebar

- [ ] **I6** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
- [ ] **I7** Navigate to another page. PASS:
  collapsed state persists (stored in
  `localStorage` key
  `fusion-sidebar-collapsed`).
- [ ] **I8** Click the expand button. PASS: sidebar returns to full width with labels.

### Mobile Responsive

- [ ] **I9** Resize browser to ≤768px width (or use DevTools device emulation). PASS: desktop sidebar disappears, mobile header with hamburger menu appears.
- [ ] **I10** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
- [ ] **I11** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.
- [ ] **I11b** Tap a navigation link in the mobile sidebar. PASS: navigates to the target page and mobile sidebar closes.
- [ ] **I11c** Open the mobile sidebar, press `Escape`. PASS: sidebar closes.
- [ ] **I11d** Open the mobile sidebar, press `Tab` repeatedly. PASS: focus cycles through focusable elements inside the sidebar without escaping to the page behind it. `Shift+Tab` at the first element wraps to the last.

### Command Palette

- [ ] **I12** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
- [ ] **I13** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
- [ ] **I14** Press `Escape`. PASS: command palette closes.
- [ ] **I14b** Open command palette, type a search term. Use `Down Arrow` and `Up Arrow` to navigate results. PASS: active result highlight moves with arrow keys. Press `Enter`. PASS: navigates to the highlighted result.
- [ ] **I14c** Open command palette with an empty search field. PASS: results are grouped by category (Pages, Ideas, Projects, People) with category headers. Type a term that matches no results. PASS: result list is empty or shows a no-results message.

### Loading States

- [ ] **I15** Navigate to a data-dependent page with mock data loaded. PASS: loading skeleton (card-grid, card-list, or detail pattern) appears briefly before content renders.
- [ ] **I16** If an error occurs loading a page (e.g. corrupted localStorage), error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading.

### Toasts

- [ ] **I17** Trigger a toast (e.g. save profile, or use DB Admin reload). PASS: toast appears at bottom or corner of screen, auto-dismisses after ~3 seconds with fade-out.
- [ ] **I17b** While a toast is visible, click its close button (×). PASS: toast dismisses immediately without waiting for auto-dismiss timer.
- [ ] **I17c** Trigger multiple toasts in rapid succession (e.g. save profile repeatedly). PASS: toasts stack visibly (up to 5). When a 6th toast arrives, the oldest is removed.

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
| Tests Passed | /228 |
| Tests Failed | /228 |
| Tests Skipped | /228 |
| Notes | |
