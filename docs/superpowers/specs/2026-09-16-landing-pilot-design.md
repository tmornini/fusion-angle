# Landing page for pilot prospects

- Date: 2026-09-16
- Status: approved for planning
- Worktree: `.worktrees/2026-09-16-landing-pilot`
- Base: master at `862a9713`
- Parent: `1f863a08` (Keep landing until the visitor clicks)
- Ships: a landing page that argues the shipped product to a
  pilot prospect; one scheduling call to action; one true
  product sentence in every page head; Layer 1 and Layer 2
  pins; TEST-PLAN B1–B3 rewritten
- Leaves: the auth page's invented stats (B5); product
  screenshots; a pilot-request form; CSS class renames; the
  scheduling URL value (TODO.md and the red pin name each)

## Problem

`web-app/landing/index.ts` is the designer's mock-up. Every
claim on it is invented: an "AI platform" with SOC 2, GDPR,
and HIPAA compliance, one-click integrations, enterprise SSO,
"thousands of teams", five made-up customer logos, a free
trial with no credit card, and a "Watch Demo" button with no
click handler. The company has no customers. Sign-up is not
available: `web-app/auth/index.ts` shows "Sign-up is not
available yet in this demo." Both calls to action send a
stranger to a sign-in form they cannot use.

The invented tagline also leaks past the page. The meta
description "Fusion Angle - Human-Intelligence first AI
platform." sits in `web-app/landing/index.html`,
`web-app/app/components-layout.html`, and
`web-app/auth/index.html`, so every page describes the
product with the mock-up's sentence.

## Audience and promise

Decided in the brainstorm:

- **Audience.** A pilot prospect: an operations or innovation
  lead deciding whether to run a pilot. Invited members are
  secondary and only need Sign In.
- **Promise.** Ideas are easy; execution is hard. Fusion Angle
  takes an idea to execution in one system. It is for teams
  that have an AI strategy and need a place to execute it
  safely.
- **The AI worker is roadmap.** It appears in one section,
  under a label that says so, in future tense. What exists
  today (an AI member on the roster, nameable on a flow step)
  is stated in present tense.
- **Call to action.** A scheduling link. Its URL is unknown at
  spec time; see decision 2.

## Voice rules

1. **Tense is a truth claim.** Present tense only for what
   ships. Future tense only inside the roadmap section.
2. **No number the code cannot cite.** No customer count, no
   logos, no compliance acronyms, no "trusted by".
3. **Short declaratives.** No "seamlessly", "powerful",
   "bank-grade", or any superlative.
4. **One tongue.** The page names modules as the app does:
   Ideas, Projects, Flows, Records, Workbox.
5. **Each section answers one prospect question.** What is
   this? Why does execution fail? What do I get? What about
   AI? Is it safe? What is a pilot?
6. **Attribution, not signature.** Nothing is
   cryptographically signed. Every write stores its
   `requester_identity_id` (SCHEMA.md rule 10), so the copy
   says "its name is on every change" and never "signs".

## Decisions

1. **Text-led, one scrolling page, about 450 words.** No
   auto-rotating sections and no carousel: a timer decides
   what most visitors never see, WCAG 2.2.2 requires a pause
   control for anything that moves past five seconds, and the
   `responsive.css` reduced-motion rule would freeze it, so
   the static page must stand alone regardless. No tabs
   either; the pipeline reads top to bottom.
2. **The call to action is a plain anchor to a scheduling
   URL.** `PILOT_SCHEDULING_URL` is an exported constant in
   `web-app/landing/index.ts`, the one value the operator
   supplies. Every "Book a pilot call" is
   `<a class="btn …" data-book-pilot href="${…}">`, same tab,
   no `target`, no `rel`, no click handler. This is the app's
   first external link; the convention it sets is the
   platform default and nothing more. A Layer 1 test (below)
   is red while the constant does not parse as an https URL
   with a host. The branch lands only green: red on the branch
   is allowed, red on master is not.
3. **Sign In keeps its handler.** The ghost button carries
   `data-goto-auth` and `putLocation('../auth/index.html')`,
   unchanged, so `tests/landing-stay.test.ts` and TEST-PLAN
   B3 hold.
4. **"See how it works" is an in-page anchor** to
   `#how-it-works`. It replaces the dead Watch Demo button
   with a control that does something.
5. **One meta description, three heads.** The landing page,
   the shared layout, and the auth page get the same sentence
   (below). The landing title changes; the other two titles
   do not.
6. **CSS: deletions only.** The hero badge and highlight, the
   trust bar, the step-point checklist, the feature icon, and
   the already-dead footer columns and socials leave
   `pages-landing.css`. One new rule is allowed for the
   roadmap label if no existing utility fits. No new tokens.
7. **Class names stay.** `.features-section` and
   `.feature-card` now host stall and safety content. Renaming
   is a move, not a content change, and belongs in its own
   commit outside this request.
8. **Copy lives in named constant arrays** (`STALLS`,
   `PIPELINE`, `SAFETY`), one builder per section, `SafeHtml`
   throughout, as the page does today.

## Copy

The words below are the deliverable. Bold marks the element
type, not text to render in bold.

**Head.**
Title: `Fusion Angle — Idea to execution, one system`.
Meta description (all three heads): `Fusion Angle takes ideas
to execution in one system: the case, the approval, the
project, and the process that moves the work.`

**Navbar.** Brand (unchanged). Anchors: "How it works"
(`#how-it-works`), "AI" (`#ai`), "Pilot" (`#pilot`). Right:
"Sign In" (ghost, `data-goto-auth`), "Book a pilot call"
(primary, `data-book-pilot`). The mobile menu mirrors all
five.

**Hero.**
h1: Ideas are easy. Execution is hard.
p: Fusion Angle takes an idea to execution in one system: the
case, the approval, the project, and the process that moves
the work. For teams that have an AI strategy and need a place
to execute it safely.
Buttons: "Book a pilot call" (accent, `data-book-pilot`);
"See how it works" (outline-hero, `href="#how-it-works"`).

**Stalls** (`id="stalls"`).
h2: Most ideas do not fail. They stall.
p: The idea never becomes a case, so nobody can decide. The
approval leaves no record, so nobody can say who agreed to
what. The work scatters across tools, so nobody can see where
it piles up.

**Pipeline** (`id="how-it-works"`).
h2: Idea to execution, one system
p: Every step ships today, under the names you will see in
the product.
Five numbered steps, name and one sentence each:
01 Ideas. An idea is captured as a case: the problem, the
target users, the proposed solution, the expected outcome,
and the metrics that would prove it.
02 Objectives and approval. Converting an idea scores it
against your organization's objectives, sets a budget and a
duration, and makes it a project. The score stays on the
record.
03 Projects. A project tracks progress, dates, and cost
against plan. Actuals roll up to the objectives it was
approved against.
04 Flows. Draw the process on a canvas, bind it to a typed
Record, publish it, and it runs.
05 Workbox. A member claims a work order, satisfies the fields
its step requires, and transitions it. A heat map shows where
work piles up.

**AI seat** (`id="ai"`).
label: Roadmap, shaped with pilots
h2: People and AI, same process, same rules
p: An AI member already holds a seat on the roster: a name, a
skill focus, and the model behind it. You can name it on a
step of a flow.
p: Next comes the worker. It will claim a work order at its
step, do the work under the same validation a person faces,
leave its name on every change, and hand the order on. You
will correct it in the same conversation you would have with
a colleague, and record content will be data to it, never
instruction.
p: That is how an AI strategy gets executed safely: one step
at a time, on a process you drew, with a ledger of what the
agent did.

**Safety** (`id="safety"`).
h2: Built to be trusted with the record
Three cards, title and one or two sentences:
Nothing is overwritten. Every change is a new, authored entry
in one ledger. Undo is another entry.
Your organization is the boundary. Scope comes from the
verified sign-in token, never the address bar. Remove a
member and their access ends within minutes.
A foreign write is refused before it exists. A write that
names a record outside your organization is rejected
outright. Nothing is created in your name by accident.

**Pilot** (`id="pilot"`).
h2: Run a pilot with us
p: We are a small team with a working product and no
customers yet. A pilot is one team, one real process, and the
founders on the call. You get the system and a direct line to
the people building it. We get the process that proves the
next step. There is no pricing page. We work that out
together.
Button: "Book a pilot call" (accent, `data-book-pilot`).
Line: "Already a member?" followed by a "Sign in" link
(`data-goto-auth`).

**Footer.** Brand mark and name; p: Idea to execution, one
system.; copyright line with the current year, as today. No
`id="about"`, no columns, no socials.

## Claims and their evidence

Every present-tense claim in the copy maps to shipped code.

| Claim | Evidence |
|---|---|
| Idea captured as problem, users, solution, outcome, metrics | `IdeaEntity`, `api/types.ts:933-946` |
| Conversion scores against objectives, sets budget and duration | `web-app/ideas/convert.ts:589-627` (`baselines`, `time-days`, `cost`) |
| Project tracks progress, dates, cost against plan | `ProjectEntity`, `api/types.ts:1004-1018` |
| Actuals roll up to objectives | `fd6556b1` (objective aggregate after a new actual) |
| Draw, bind a Record, publish, it runs | FLOW-CANVAS.md; ARCHITECTURE.md `## Records` (`flows/:id/records`); `tests/adapters-flow-publish.test.ts` |
| Claim, satisfy the step's fields, transition | ARCHITECTURE.md `## Work orders`; `validateRecordTransition` |
| Heat map shows where work piles up | `web-app/flows/stats.ts`; DESIGN-SYSTEM.md `## Heat ramp` |
| AI member: name, skill focus, model | `AIMemberDraftFields`, `web-app/app/presenters/ai-member-detail.ts`; `isAIMember`, `api/types.ts:915` |
| Nameable on a step of a flow | `GraphNode.agentIds`, `api/types.ts:1029` |
| Every change a new, authored entry; undo is another entry | SCHEMA.md rule 10; ARCHITECTURE.md `## Flow graph` (undo lands a restore pair) |
| Scope from the verified token, never the address bar | ARCHITECTURE.md `## Tenancy`; AGENTS.md `### Tenancy and the named covenant` |
| Access ends within minutes | access TTL ≤ 15 min, AGENTS.md `### Tenancy` |
| Foreign write refused before it exists | `api/write-authorizer.ts`; AGENTS.md `### Write authorizer 403s before genesis` |

Everything in the AI section's second and third paragraphs is
TODO.md items 9, 10, and 11 and is written in future tense.

## File map

| File | Change |
|---|---|
| `web-app/landing/index.ts` | copy constants, eight builders, `PILOT_SCHEDULING_URL`, `data-book-pilot` anchors; feature grid, logos, free-trial CTA, badge removed |
| `web-app/landing/index.html` | title and meta description |
| `web-app/app/components-layout.html` | meta description |
| `web-app/auth/index.html` | meta description |
| `web-app/app/styles/pages-landing.css` | delete `.hero-badge`, `.hero-badge span`, `.hero h1 .highlight`, `.hero-trust*` (4), `.feature-icon`, `.card-hover:hover .feature-icon`, `.step-points`, `.step-point*` (3), `.footer-col*` (4), `.footer-socials*` (3); one label rule at most |
| `tests/landing-pilot.test.ts` | new, Layer 1, two tests |
| `tests/browser/landing.test.ts` | new, Layer 2 |
| `TEST-PLAN.md` | B1, B2 rewritten; B3 unchanged |
| `TODO.md` | close the B2/B3 Layer 2 bullet; add the B5 follow-on |

`tests/landing-stay.test.ts` is unchanged and must stay
green: no `AUTO_REDIRECT_MS`, no `dashboard/index.html`, and
`auth/index.html` present.

## Tests

**Layer 1, `tests/landing-pilot.test.ts`.**

1. `'the pilot CTA is a real https URL'` imports
   `PILOT_SCHEDULING_URL` from `web-app/landing/index.ts`
   (page modules are already imported by
   `tests/flows-detail-*.test.ts`), constructs `new URL()`,
   and asserts `protocol === 'https:'` and a non-empty
   `hostname`. Red until the operator supplies the URL.
2. `'no invented claim survives the landing'` reads the
   landing source and the three heads and asserts none of a
   named `RETIRED_CLAIMS` list appears: `Start Free Trial`,
   `Watch Demo`, `Trusted by`, `TechCorp`, `SOC 2`, `HIPAA`,
   `thousands of teams`, `Human-Intelligence`.

**Layer 2, `tests/browser/landing.test.ts`.** One test on an
unsigned page from `startOrigin()` and `newPage()`:

1. navigate to `${origin}/landing/index.html` and wait for
   `[data-book-pilot]`;
2. `stays(page, 'location.pathname', 3_000)` — B1's live
   three-second stay;
3. assert every `[data-book-pilot]` has `href` equal to the
   imported `PILOT_SCHEDULING_URL` and there are four of
   them (navbar, mobile menu, hero, pilot section) — never
   click one, it leaves the origin;
4. click `[data-goto-auth]` and assert `location.pathname`
   includes `/auth/`.

The Layer 2 test is the one TODO.md asks for at the "landing
CTAs carrying `[data-goto-auth]`" bullet; that bullet closes.

## TEST-PLAN and TODO

**B1.** Page renders the hero ("Ideas are easy. Execution is
hard."), the stalls paragraph, the five-step pipeline, the
roadmap block labelled "Roadmap, shaped with pilots", the
three safety cards, and the pilot section, and stays. Wait
~3 seconds. PASS: still on `landing/index.html`. Pin:
`tests/landing-stay.test.ts`; `tests/browser/landing.test.ts`.

**B2.** "Book a pilot call" appears four times (navbar,
mobile menu, hero, pilot section) as anchors carrying `data-book-pilot` whose
`href` is the scheduling URL; "See how it works" scrolls to
`#how-it-works`. PASS: the four hrefs match and the anchor
scrolls. Do not click a `data-book-pilot` anchor in the walk:
it leaves the origin. Drive by selector, never `.navbar-logo`
(Apple menu). Pin: `tests/browser/landing.test.ts`.

**B3.** Unchanged.

**TODO.md.** Remove the B2/B3 Layer 2 bullet. Under
`## Later work` add: the auth page's left panel shows
invented stats — "10K+ Active Users", "98% Satisfaction",
"50+ Integrations" (`web-app/auth/index.ts:141-169`,
TEST-PLAN B5); same sin as the landing mock-up, its own spec.

## Budget

`measurements/budgets.json` holds `landing.readyMs: 137`. The
change removes markup and adds none of consequence, so the
budget stands. The plan runs `./bin/measure --check` once
when Chrome is available and records the median; it is not
part of `./test validate`.

## Out of scope

- The auth page's invented stats (B5) — named in TODO.md.
- Product screenshots from the mock-data deploy — a later
  spec, after the words settle.
- A pilot-request form stored as a message pair — not chosen.
- Renaming `.features-section` / `.feature-card` — a move,
  its own commit.
- Removing icons the landing no longer imports from
  `web-app/app/icons.ts` — other pages own them.
- A `target="_blank"` / `rel` convention for external links —
  the anchor uses the platform default.
