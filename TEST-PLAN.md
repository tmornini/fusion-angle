# Fusion AI — Test Plan

> **Encoding:** `- [ ]` = pending, `- [x]` = PASS, `- [FAIL]` = failure (add note)

## Summary

| Section | Tests |
|---|--:|
| A. Build & Setup | 5 |
| B. Entry Pages | 16 |
| C. Core: Dashboard | 8 |
| D. Core: Ideas Workflow | 44 |
| E. Core: Projects | 16 |
| F. Tools | 26 |
| G. Admin Pages | 28 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 18 |
| J. Protocol B: `file://` Retest | 14 |
| K. Teardown | 3 |
| **Total** | **180** |

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Unzip the archive into a temp directory (e.g. `/tmp/fusion-test`). PASS: directory contains `assets/app.js`, `assets/styles.css`, `assets/` (*.woff2 fonts), `index.html`, and 26 page directories each with `index.html`.
- [ ] **A3** Start an HTTP server from the unzipped directory (e.g. `python3 -m http.server 8080`). PASS: server starts without errors.
- [ ] **A4** Open `http://localhost:8080/` in the test browser. PASS: redirects to `snapshots/index.html` when no data exists, or `dashboard/index.html` when data has been loaded.
- [ ] **A5** Open DevTools Console and confirm no JavaScript errors on initial load. PASS: console is clean (warnings from browser extensions are acceptable).

---

## B. Entry Pages

### Landing Page (`landing/`)

- [ ] **B1** Page renders with marketing hero content, feature sections, and call-to-action buttons. PASS: layout is complete, no broken images or unstyled text.
- [ ] **B2** Click "Get Started" (or primary CTA). PASS: navigates to `auth/index.html`.
- [ ] **B3** Click "Sign In" link. PASS: navigates to `auth/index.html`.

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
- [ ] **C2** Sidebar shows navigation links grouped under Journey (Dashboard, Ideas, Projects, Teams), Tools (Edge, Crunch, Flow), and Settings (Organization, Snapshots, Design System). PASS: all links present and styled.
- [ ] **C3** Header shows search bar, greeting ("Good evening, Tony Stark"), company stats ("Stark Industries · 11 Ideas · 6 Projects · 4 Flow"), and theme toggle. PASS: elements visible and styled.
- [ ] **C4** Dashboard displays 3 gauge/metric cards (Time, Cost, Impact) with baseline and current values. PASS: cards render with non-zero values and concentric arc gauges.
- [ ] **C5** Dashboard displays at least one chart (bar, line, donut, or area). PASS: SVG chart renders with visible data.
- [ ] **C6** Quick-action cards or links are present. PASS: clicking one navigates to the expected page.
- [ ] **C7** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C8** Check that seed data populates all dashboard widgets. PASS: no "No data" empty states on initial load (seed data provides content for all widgets).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: table/list shows 11 seeded ideas with title, score, priority, status, and Time/Cost/Impact stats. Ideas without estimates show "—" (em-dash) instead of zero values.
- [ ] **D2** Each idea row shows a status badge (In Review, Promoted, Active, Archived, or Rejected) and an edge status badge (Edge Complete, Edge Draft, or Edge Missing). PASS: badges render with distinct colors.
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

### Idea Convert (`idea-convert/`)

- [ ] **D20** Navigate to `idea-convert/?ideaId=<id>` for a convertible idea. PASS: page loads with conversion form showing 6 required fields: Project Name, Project Lead (dropdown of active users), Start Date, Target End Date, Budget (select), Priority (select). Sticky sidebar shows idea summary (problem, solution, outcome).
- [ ] **D21** Fill all required fields (progress bar reaches 100%), click "Create Project". PASS: navigates to project detail page for the newly created project.

### Idea Review Queue (`idea-review-queue/`)

- [ ] **D22** Navigate to `idea-review-queue/`. PASS: page shows stats cards (Pending Review, Ready to Decide, High Priority, Avg. Wait Time) and a list of ideas pending review.
- [ ] **D22b** Each review card shows priority badge (High Priority/Medium), readiness status (Ready for Review/Needs Info/Unknown), edge status badge, title, submitter, category, days waiting, score, impact, and effort. PASS: all fields render with data.
- [ ] **D23** At least one idea with `pending_review` status appears in the queue. PASS: idea 7 ("AI-Powered Customer Support Chatbot") or similar is listed.
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
- [ ] **E2** Click a project row. PASS: navigates to `project-detail/?projectId=<id>`.

### Project Detail (`project-detail/?projectId=1`)

- [ ] **E3** Page loads with project summary card (description, dates, progress bar), baseline vs. current metrics, and Edge KPI card. PASS: all cards render with data. Baseline/current metrics show "—" (em-dash) when values are zero or missing.
- [ ] **E4** Four quick-action cards visible (Engineering, Team, Flow, Crunch). PASS: clicking "Engineering" navigates to `engineering-requirements/?projectId=1`.
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
- [ ] **F4** Delete an outcome. PASS: outcome is removed, progress bar updates.
- [ ] **F5** Expected Impact section shows 3 textareas (Short-term, Mid-term, Long-term). Confidence select and Edge Owner fields are visible. PASS: all fields render with seeded data.

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

### Flow List (`flow/`)

- [ ] **F11** Navigate to `flow/`. PASS: page shows stats cards (Total Flows, Total Steps, Departments) and flow cards with name, description, department badge, and step count.
- [ ] **F12** Type in the search input. PASS: filters flow cards by name or description in real-time.
- [ ] **F12b** Select a department from the filter dropdown. PASS: list shows only flows in that department. Reset to "All Departments" → full list returns.
- [ ] **F12c** Apply search + filter that matches no items. PASS: empty state shows "No processes found" with "Try adjusting your search or filter criteria".
- [ ] **F13** Click a flow card. PASS: navigates to `flow/detail.html?flowId=<id>`.

### Flow Detail (`flow/detail.html?flowId=1`)

- [ ] **F14** Navigate to `flow/detail.html?flowId=1`. PASS: shows flow name, description, department, and step cards in a vertical timeline.
- [ ] **F15** Click a step card header to expand it. PASS: reveals Title, Description, Owner, Role, Duration, and Step Type fields.
- [ ] **F16** Click "Add Step". PASS: new step card appears at the bottom, auto-expanded.
- [ ] **F17** Click move-up/move-down buttons on a step. PASS: step reorders in the list.
- [ ] **F18** Click remove button on a step. PASS: step is removed from the list.
- [ ] **F19** Edit flow name and step fields, click "Save". PASS: toast "Flow saved" appears.
- [ ] **F19b** Navigate to `flow/detail.html?flowId=999` (non-existent). PASS: page handles gracefully — shows error state, no unhandled JS exception.

---

## G. Admin Pages

### Team (`teams/`)

- [ ] **G1** Navigate to `teams/`. PASS: shows roster of seeded team members with initials avatars, names, roles, departments, availability percentage badges, strength chips, performance stats (percentage, active count, completed count), and status dots (green=available, yellow=busy, red=limited). Search input and "Activity Feed" / "Add Member" buttons visible.
- [ ] **G1b** Click a team member card. PASS: right-side detail panel populates with member name, role, email, and large avatar with initials.
- [ ] **G1c** Detail panel shows two tabs (Dimensions, Performance). Click between tabs. PASS: tab content switches — Dimensions shows Driver/Analytical/Expressive/Amiable scores with progress bars.
- [ ] **G1d** Click a different team member card. PASS: detail panel updates to show the newly selected member's information.
- [ ] **G2** Member status dots render with distinct colors (green for available, yellow for busy, red for limited). PASS: at least 2 different statuses visible.

### Account (`account/`)

- [ ] **G3** Navigate to `account/`. PASS: shows account overview with plan info (Business plan), billing date, seat usage (18/25), and resource usage bars.
- [ ] **G4** Health score (92, "excellent") is displayed. PASS: score and label visible.

### Profile (`profile/`)

- [ ] **G5** Navigate to `profile/`. PASS: shows profile form with avatar (initials), First Name, Last Name, Email, Phone, Role, Department (dropdown), and Bio fields for the current user (Tony Stark / demo@example.com).
- [ ] **G5b** Strength chips are displayed with pre-selected strengths shown in primary style with checkmark icons. Click an unselected chip. PASS: chip toggles to primary/selected style. Click a selected chip. PASS: chip toggles to secondary/unselected style.
- [ ] **G6** Edit a field (e.g. phone), toggle strengths, and click "Save Changes". PASS: toast "Profile saved successfully" appears.

### Company Settings (`settings/`)

- [ ] **G7** Navigate to `settings/`. PASS: shows company info (Acme Corporation, acmecorp.com, Technology, 51-200).
- [ ] **G8** Security settings visible: SSO (off), 2FA (on), IP Whitelist (off). PASS: toggle/indicator states match seed data.
- [ ] **G9** Edit a setting (e.g. timezone or language) and save. PASS: success toast or save completes without error.

### Manage Users (`manage-users/`)

- [ ] **G10** Navigate to `manage-users/`. PASS: shows user table with avatar, name, email, role badge (job title), department, status badge (Active/Pending/Deactivated), and last active time. Header shows active/pending user counts. Search input and two filter dropdowns (All Roles, All Status) visible.
- [ ] **G10b** Type in the search input. PASS: filters user list by name or email in real-time. Role and status dropdowns also filter the list.
- [ ] **G11** Deactivated user (James Miller) is visually distinguished with "Deactivated" badge (X icon), strikethrough or opacity styling. PASS: clearly different from active users.
- [ ] **G11b** Pending users show "Pending" badge with clock icon and "Invite sent" text. PASS: visually distinct from active users.
- [ ] **G12** "Invite User" button is visible. PASS: clicking it opens the invite dialog with email input and role selector.

### Activity Feed (`teams/activity-feed.html`)

- [ ] **G13** Navigate to `activity-feed/`. PASS: shows seeded activity entries with type icons and timestamps. Search input ("Search activity...") and type filter dropdown ("All Activity") visible.
- [ ] **G14** Activity types include scored, completed task, submitted new idea, commented on, joined the team, changed status, converted idea to project. PASS: multiple distinct types visible with appropriate icons (star, checkmark, lightbulb, chat bubble, user-plus, edit, arrow-right).
- [ ] **G14b** Each activity entry shows actor name, action verb, target name, and meta info (score badge, status badge, or quoted comment text). PASS: entries have full context.

### Engineering Requirements

- [ ] **G15** Navigate to `engineering-requirements/?projectId=1`. PASS: page renders with engineering specifications content for project 1.
- [ ] **G16** Clarification questions section shows question cards with message icon, asker name, timestamp, question text, and status (pending with warning styling or answered with answer text). PASS: at least one clarification visible.

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

### Sidebar

- [ ] **I6** Click the sidebar collapse button. PASS: sidebar collapses to icon-only view, main content area expands.
- [ ] **I7** Navigate to another page. PASS: collapsed state persists (stored in `localStorage` key `fusion-sidebar-collapsed`).
- [ ] **I8** Click the expand button. PASS: sidebar returns to full width with labels.

### Mobile Responsive

- [ ] **I9** Resize browser to ≤768px width (or use DevTools device emulation). PASS: desktop sidebar disappears, mobile header with hamburger menu appears.
- [ ] **I10** Tap/click the hamburger menu. PASS: mobile sidebar sheet slides in from the left with navigation links.
- [ ] **I11** Tap/click the backdrop or a nav link. PASS: mobile sidebar closes.

### Command Palette

- [ ] **I12** Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux). PASS: command palette overlay appears with search input focused.
- [ ] **I13** Type a search term (e.g. "ideas"). PASS: filtered results appear. Select a result — navigates to the corresponding page.
- [ ] **I14** Press `Escape`. PASS: command palette closes.

### Loading States

- [ ] **I15** Navigate to a data-dependent page with mock data loaded. PASS: loading skeleton (card-grid, card-list, or detail pattern) appears briefly before content renders.
- [ ] **I16** If an error occurs loading a page (e.g. corrupted localStorage), error state with "Try Again" retry button is shown. PASS: clicking retry re-attempts data loading.

### Toasts

- [ ] **I17** Trigger a toast (e.g. save profile, or use DB Admin reload). PASS: toast appears at bottom or corner of screen, auto-dismisses after ~3 seconds with fade-out.

### General

- [ ] **I18** Check DevTools Console after navigating through 5+ different pages. PASS: no unhandled JavaScript errors (warnings and info messages from browser extensions are acceptable).

---

## J. Protocol B: `file://` Retest

> Open the unzipped build directory directly in the browser via `file://` protocol (e.g. `file:///tmp/fusion-test/index.html`). The app uses localStorage for persistence, which works on `file://` across all major browsers.

### Static Pages (No DB Required)

- [ ] **J1** Open `file:///.../index.html` (root). PASS: redirects or links to landing page.
- [ ] **J2** Open `file:///.../landing/index.html`. PASS: landing page renders with full layout and styling.
- [ ] **J3** Open `file:///.../auth/index.html`. PASS: auth form renders, validation works (test empty submit → error messages appear).
- [ ] **J4** Open `file:///.../onboarding/index.html`. PASS: page renders with content.
- [ ] **J5** Open `file:///.../not-found/index.html`. PASS: 404 page renders.
- [ ] **J6** Open `file:///.../design-system/index.html`. PASS: component gallery renders.
- [ ] **J7** Verify CSS loads: pages are styled (not unstyled HTML). PASS: fonts, colors, and layout apply correctly.
- [ ] **J8** Verify `assets/app.js` loads: interactive elements work (e.g. theme toggle, auth form validation). PASS: JavaScript executes.

### Database-Dependent Pages

- [ ] **J9** Open `file:///.../dashboard/index.html`. PASS: dashboard renders (redirects to snapshots if no data loaded yet).
- [ ] **J10** Navigate to `snapshots/index.html`, click "Reload Mock Data". PASS: mock data loads. Navigate to `ideas/index.html`. PASS: ideas list renders with seed data.
- [ ] **J11** Navigate to `snapshots/index.html` and click "Download Snapshot". PASS: download triggers.
- [ ] **J12** Navigate between 3+ database-dependent pages (dashboard, ideas, projects). PASS: data persists across page navigations via localStorage.

### Navigation Under `file://`

- [ ] **J13** Click sidebar navigation links between pages. PASS: links work (note: relative paths resolve correctly under `file://`).
- [ ] **J14** Test `Cmd+K` command palette. PASS: palette opens and closes. Navigation from palette results may or may not work depending on URL resolution under `file://`.

---

## K. Teardown

- [ ] **K1** Stop the HTTP server started in A3. PASS: process terminates.
- [ ] **K2** Remove the temp test directory (`rm -rf /tmp/fusion-test` or equivalent). PASS: directory removed.
- [ ] **K3** Verify the ZIP file remains on `~/Desktop` for archival. PASS: `fusion-ai-<sha>.zip` exists.

---

## Execution Log

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Browser & Version | |
| OS | |
| Build SHA | |
| Tests Passed | /180 |
| Tests Failed | /180 |
| Tests Skipped | /180 |
| Notes | |
