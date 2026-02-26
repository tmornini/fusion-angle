# Fusion AI — Test Plan

> **Encoding:** `- [ ]` = pending, `- [x]` = PASS, `- [FAIL]` = failure (add note)

## Summary

| Section | Tests |
|---|--:|
| A. Build & Setup | 5 |
| B. Entry Pages | 16 |
| C. Core: Dashboard | 8 |
| D. Core: Ideas Workflow | 34 |
| E. Core: Projects | 10 |
| F. Tools | 14 |
| G. Admin Pages | 22 |
| H. Reference & System | 2 |
| I. Cross-Cutting Concerns | 18 |
| J. Protocol B: `file://` Retest | 14 |
| K. Teardown | 3 |
| **Total** | **146** |

---

## A. Build & Setup

- [ ] **A1** Run `./build` from a clean working directory. PASS: exits 0, prints no errors, creates `~/Desktop/fusion-ai-<sha>.zip`.
- [ ] **A2** Unzip the archive into a temp directory (e.g. `/tmp/fusion-test`). PASS: directory contains `site/app.js`, `site/style.css`, `site/fonts/`, `index.html`, and 27 page directories each with `index.html`.
- [ ] **A3** Start an HTTP server from the unzipped directory (e.g. `python3 -m http.server 8080`). PASS: server starts without errors.
- [ ] **A4** Open `http://localhost:8080/` in the test browser. PASS: redirects to `entry/landing/index.html`.
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

- [ ] **B12** Page renders with welcome content. PASS: page layout is intact, no console errors.
- [ ] **B13** Click the primary action to proceed. PASS: navigates to `dashboard/index.html`.

### Auth Validation Edge Cases

- [ ] **B14** In Sign In mode, enter valid email, valid password, then clear email and submit. PASS: email error reappears.
- [ ] **B15** Toggle between Sign In and Sign Up modes multiple times. PASS: form resets cleanly each time, no layout glitches.
- [ ] **B16** Footer shows "Terms of Service and Privacy Policy" text. PASS: text is visible.

---

## C. Core: Dashboard

- [ ] **C1** Navigate to `dashboard/`. PASS: page loads with sidebar, header, and main content area.
- [ ] **C2** Sidebar shows navigation links for all sections (Dashboard, Ideas, Projects, Edge List, Crunch, Flow, Team, Activity Feed, Settings group). PASS: all links present and styled.
- [ ] **C3** Header shows user avatar area, notification bell, and theme toggle. PASS: elements visible and styled.
- [ ] **C4** Dashboard displays gauge/metric cards with numerical values. PASS: at least 3 metric cards render with non-zero values.
- [ ] **C5** Dashboard displays at least one chart (bar, line, donut, or area). PASS: SVG chart renders with visible data.
- [ ] **C6** Quick-action cards or links are present. PASS: clicking one navigates to the expected page.
- [ ] **C7** Scroll the page. PASS: sidebar stays fixed, main content scrolls independently.
- [ ] **C8** Check that seed data populates all dashboard widgets. PASS: no "No data" empty states on initial load (seed data provides content for all widgets).

---

## D. Core: Ideas Workflow

### Ideas List (`ideas/`)

- [ ] **D1** Navigate to `ideas/`. PASS: table/list shows 11 seeded ideas with title, score, priority, status, and Time/Cost/Impact stats. Ideas without estimates show "—" (em-dash) instead of zero values.
- [ ] **D2** Each idea row shows a status badge (pending_review, approved, scored, draft, or rejected). PASS: badges render with distinct colors.
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
- [ ] **D12** Click "Submit Idea". PASS: navigates to `idea-convert/index.html?ideaId=new`.
- [ ] **D13** On Step 2, click "Back". PASS: returns to Step 1 with previously entered data preserved.
- [ ] **D14** On Step 1, click "Cancel" (or "Back"). PASS: navigates to `ideas/` list.
- [ ] **D15** "Generate with AI" button is present in the header. PASS: button is visible (no action expected — UI placeholder).

### Idea Convert (`idea-convert/`)

- [ ] **D20** Navigate to `idea-convert/`. PASS: page loads with conversion form/workflow.
- [ ] **D21** Conversion action completes (fill required fields if any, click convert). PASS: navigates to project detail or projects list.

### Idea Review Queue (`idea-review-queue/`)

- [ ] **D22** Navigate to `idea-review-queue/`. PASS: page shows a list of ideas pending review.
- [ ] **D23** At least one idea with `pending_review` status appears in the queue. PASS: idea 7 ("AI-Powered Customer Support Chatbot") or similar is listed.
- [ ] **D24** Click a review item. PASS: navigates to `approval-detail/?id=<ideaId>`.

### Approval Detail (`approval-detail/`)

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
- [ ] **E5** **Tasks tab** (default): shows 5 task cards with priority badges, skill tags, and hours. Assigned/unassigned count is dynamically computed from task data (seed data: 1 assigned, 4 unassigned). PASS: "Save Assignments" button visible.
- [ ] **E6** **Discussion tab**: shows 3 seeded comments with author avatars/names. Comment composer textarea + "Post Comment" button (disabled when empty, enabled when text entered). PASS: all elements render.
- [ ] **E7** **History tab**: shows 3 version entries (v1.0, v1.1, v1.2) with latest highlighted. PASS: version list renders in order.
- [ ] **E8** **Linked Data tab**: shows empty state "No linked data yet" with "Link Data Source" button. PASS: empty state renders cleanly.
- [ ] **E9** Right sidebar shows Team card (4 members with roles) and Milestones card (5 milestones: 2 completed, 1 in progress, 2 pending). PASS: both cards render with correct data.

### Engineering Requirements (`engineering-requirements/`)

This test is covered by E4 (navigation) — verify the page loads:

- [ ] **E10** (covered by E4 navigation) Page loads with engineering requirements content for the project. PASS: page renders without errors.

---

## F. Tools

### Edge Definition (`edge/?ideaId=1`)

- [ ] **F1** Navigate to `edge/?ideaId=1`. PASS: left panel shows idea 1's summary (title, score, problem statement); right panel shows the Edge form.
- [ ] **F2** Business Outcomes section shows 2 seeded outcomes with metrics. Completion progress bar reflects current state. PASS: outcomes and metrics render with input fields.
- [ ] **F3** Click "Add Outcome". PASS: a new empty outcome row appears with "Add Metric" button.
- [ ] **F4** Delete an outcome. PASS: outcome is removed, progress bar updates.
- [ ] **F5** Expected Impact section shows 3 textareas (Short-term, Mid-term, Long-term). Confidence select and Edge Owner fields are visible. PASS: all fields render with seeded data.

### Edge List (`edge-list/`)

- [ ] **F6** Navigate to `edge-list/`. PASS: shows a list of edges (up to 6 seeded) with status indicators (complete, draft, missing). Outcome/metric counts use correct singular/plural grammar (e.g. "1 outcome", "2 outcomes").

### Crunch (`crunch/`)

- [ ] **F7** Navigate to `crunch/`. PASS: Step 1 (Upload) shows drop zone with "Drop your file here or click to browse" and supported-format info.
- [ ] **F8** Click the drop zone. PASS: advances to Step 2 (Label & Explain) — shows mock file info ("Q4_Sales_Report.xlsx", 1,247 rows, 6 columns) and per-column accordion cards.
- [ ] **F9** Expand a column card (e.g. CUST_ID). PASS: reveals Friendly Name input, Data Type select, Acronym Expansion input (for acronym columns), and Description textarea. Fill all fields — completion icon changes to green check.
- [ ] **F10** Fill all 6 columns to 100% completion, click "Continue to Review". PASS: advances to Step 3 — shows "Data Translation Complete" with "Edit Labels" and "Continue to Dashboard" buttons.

### Flow (`flow/`)

- [ ] **F11** Navigate to `flow/`. PASS: Edit mode shows "Customer Onboarding" process with 5 step cards connected by vertical lines.
- [ ] **F12** Expand a step card. PASS: reveals Title, Description, Owner, Role, Duration, Step Type, and Tools Used fields. Toggle a tool button on/off — button highlights/unhighlights.
- [ ] **F13** Click "Add Step". PASS: new step card appears at the bottom, auto-expanded, type defaults to Action.
- [ ] **F14** Click "Preview" button. PASS: switches to preview mode — shows process name heading, vertical timeline with numbered step circles, and step details (title, owner, duration, tool badges).

---

## G. Admin Pages

### Team (`team/`)

- [ ] **G1** Navigate to `team/`. PASS: shows roster of seeded users with names, roles, departments, and status indicators.
- [ ] **G2** User status badges render with distinct styling (available, busy, limited, active, deactivated). PASS: at least 3 different statuses visible.

### Account (`account/`)

- [ ] **G3** Navigate to `account/`. PASS: shows account overview with plan info (Business plan), billing date, seat usage (18/25), and resource usage bars.
- [ ] **G4** Health score (92, "excellent") is displayed. PASS: score and label visible.

### Profile (`profile/`)

- [ ] **G5** Navigate to `profile/`. PASS: shows profile form for the current user (Demo User / demo@example.com).
- [ ] **G6** Edit a field (e.g. bio or phone) and save. PASS: success toast appears, or save action completes without error.

### Company Settings (`company-settings/`)

- [ ] **G7** Navigate to `company-settings/`. PASS: shows company info (Acme Corporation, acmecorp.com, Technology, 51-200).
- [ ] **G8** Security settings visible: SSO (off), 2FA (on), IP Whitelist (off). PASS: toggle/indicator states match seed data.
- [ ] **G9** Edit a setting (e.g. timezone or language) and save. PASS: success toast or save completes without error.

### Manage Users (`manage-users/`)

- [ ] **G10** Navigate to `manage-users/`. PASS: shows user list with admin controls (role assignments, status changes).
- [ ] **G11** Deactivated user (James Miller) is visually distinguished. PASS: different styling or badge for deactivated status.
- [ ] **G12** "Add User" or invite action is available. PASS: button/link is visible and clickable.

### Activity Feed (`activity-feed/`)

- [ ] **G13** Navigate to `activity-feed/`. PASS: shows 10 seeded activity entries with type icons and timestamps.
- [ ] **G14** Activity types include idea_scored, task_completed, idea_created, comment_added, user_joined, status_changed, idea_converted, project_created. PASS: multiple distinct types visible with appropriate icons.

### Notification Settings (`notification-settings/`)

- [ ] **G15** Navigate to `notification-settings/`. PASS: shows 4 categories (Ideas, Projects, Teams, Account) with toggle controls.
- [ ] **G16** 16 individual notification preferences are displayed with current on/off states. PASS: toggles render and are interactive.
- [ ] **G17** Toggle a preference and save. PASS: change persists (no error toast).

### Snapshots (`snapshots/`) — Run These Last

- [ ] **G18** Navigate to `snapshots/`. PASS: shows 4 operation cards: Create Pristine Environment, Wipe and Load Mock Data, Upload Snapshot, Download Snapshot.
- [ ] **G19** Click "Download Snapshot". PASS: browser downloads `fusion-ai-snapshot-YYYY-MM-DD.json`. File contains valid JSON with entity data.
- [ ] **G20** Click "Create Pristine Environment", confirm the dialog. PASS: success toast "Pristine environment created." Info banner appears: "Your database is empty." Navigate to `ideas/` — page loads (no redirect, schema exists). All 22 `fusion-ai:*` keys exist in localStorage as empty arrays.
- [ ] **G21** Click "Wipe and Load Mock Data". PASS: redirects to root `index.html` (landing page). Navigate to `ideas/` — 11 ideas are back.
- [ ] **G22** Return to `snapshots/`, wipe data, then use "Upload Snapshot" file input and select the previously downloaded JSON file. PASS: redirects to root `index.html`. Data matches the snapshot.

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

### Notifications

- [ ] **I15** Click the notification bell icon. PASS: dropdown opens showing 4 seeded notifications (2 unread, 2 read). Unread count badge shows "2".
- [ ] **I16** Click outside the dropdown. PASS: dropdown closes.

### Toasts

- [ ] **I17** Trigger a toast (e.g. save profile, or use DB Admin reload). PASS: toast appears at bottom or corner of screen, auto-dismisses after ~3 seconds with fade-out.

### General

- [ ] **I18** Check DevTools Console after navigating through 5+ different pages. PASS: no unhandled JavaScript errors (warnings and info messages from browser extensions are acceptable).

---

## J. Protocol B: `file://` Retest

> Open the unzipped build directory directly in the browser via `file://` protocol (e.g. `file:///tmp/fusion-test/index.html`). The app uses localStorage for persistence, which works on `file://` across all major browsers.

### Static Pages (No DB Required)

- [ ] **J1** Open `file:///.../index.html` (root). PASS: redirects or links to landing page.
- [ ] **J2** Open `file:///.../entry/landing/index.html`. PASS: landing page renders with full layout and styling.
- [ ] **J3** Open `file:///.../entry/auth/index.html`. PASS: auth form renders, validation works (test empty submit → error messages appear).
- [ ] **J4** Open `file:///.../entry/onboarding/index.html`. PASS: page renders with content.
- [ ] **J5** Open `file:///.../system/not-found/index.html`. PASS: 404 page renders.
- [ ] **J6** Open `file:///.../reference/design-system/index.html`. PASS: component gallery renders.
- [ ] **J7** Verify CSS loads: pages are styled (not unstyled HTML). PASS: fonts, colors, and layout apply correctly.
- [ ] **J8** Verify `site/app.js` loads: interactive elements work (e.g. theme toggle, auth form validation). PASS: JavaScript executes.

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
| Tests Passed | /146 |
| Tests Failed | /146 |
| Tests Skipped | /146 |
| Notes | |
