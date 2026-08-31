# Cost Estimation

How to re-run the pre-AI replacement-cost estimate of
this tree. Report-only. No product change rides on the
number.

The first run (2026-08-30, tag `tom-begins` through then
HEAD) wrote a signed bid of $5M, 209 PM COCOMO II
adjusted, 7.2 PM actual, 29× effort, 3.0× calendar. A
new run re-measures. It does not copy those figures.

## What this estimates

Replacement cost of the **delivered product at HEAD**
for a conventional team with conventional tools, using
the three public pre-AI techniques. Not what this git
history billed. Not an AI-era productivity study except
in the estimated-versus-actual section.

Range is `tom-begins..HEAD` unless the operator names
another tag. Size is HEAD production SLOC, not git
insertions (insertions include tests, docs, and churn).
The tag tree is a discarded Vite/React/Supabase
prototype; give it no COCOMO reuse credit.

## The three techniques

Surveys from Boehm (IEEE TSE, 1984) through the 2000s
name this public trio. Omit proprietary tools (PRICE-S,
SEER-SEM, ESTIMACS).

### COCOMO / COCOMO II

Boehm 1981; USC COCOMO II.2000. Size in KSLOC
(delivered source, comments and blanks out).

COCOMO 81 Basic: \(PM = a \times (KSLOC)^b\).
\(T_{dev} = 2.5 \times PM^{e}\).

| Mode | \(a\) | \(b\) | \(e\) |
|---|---:|---:|---:|
| Organic | 2.4 | 1.05 | 0.38 |
| Semi-detached | 3.0 | 1.12 | 0.35 |
| Embedded | 3.6 | 1.20 | 0.32 |

This product is semi-detached until evidence says
otherwise: custom architecture, high reliability,
not a payroll CRUD app, not flight software.

COCOMO II.2000 Post-Architecture:

\[
PM = 2.94 \times Size^{E} \times \prod EM_i
\]

\[
E = 0.91 + 0.01 \sum_{j=1}^{5} SF_j
\]

\[
T_{dev} = 3.67 \times PM^{0.28 + 0.2(E-0.91)}
\]

Five scale factors (PREC, FLEX, RESL, TEAM, PMAT).
Seventeen effort multipliers. A person-month is **152
hours** (19 × 8). Tests are not KDSI; test effort is
already inside the person-months. Documentation is the
DOCU multiplier, not SLOC.

### Function Point Analysis

Albrecht 1979; IFPUG 4.3 weights. NESMA indicative and
estimated as cross-checks. Boundary: this product, one
origin, API + web app as one application. Count
user-visible logical files, not the physical
`message_pairs` table.

| Type | Low | Average | High |
|---|---:|---:|---:|
| EI | 3 | 4 | 6 |
| EO | 4 | 5 | 7 |
| EQ | 3 | 4 | 6 |
| ILF | 7 | 10 | 15 |
| EIF | 5 | 7 | 10 |

NESMA indicative: \(35 \times ILF + 15 \times EIF\).
NESMA estimated: \(10 \times ILF + 7 \times EIF +
4 \times EI + 5 \times EO + 4 \times EQ\).

VAF (IFPUG 4.3, keep it for comparability):
\(0.65 + 0.01 \sum_{i=1}^{14} F_i\), each GSC 0–5.
AFP = UFP × VAF. ISO/IEC 20926 dropped VAF; this
procedure keeps it.

Convert with both Jones 8 FP/staff-month and hours/FP
(16.5 US average, 30 complex MIS) ÷ 152. Record
SLOC/UFP. Jones 3GL tables sit around 50–80; this
tree ran 171 on the first run because FPA cannot see
the ledger.

### Putnam SLIM

Software equation \(S = C_k \cdot K^{1/3} \cdot
t_d^{4/3}\). Special-skills \(B = 0.39\) above 70
KSLOC; development PM = \(12 \times B \times K_{raw}\).
\(C_k\): 2,000 poor, 8,000 good, 10,040 supported and
organized, 11,000 excellent.

\(t_d\) is a staffed-team development schedule, never
the git-log span. Do not feed 6–7 months into SLIM
for ~100 KSLOC; the Rayleigh curve then invents a
crowd. Report a grid: \(C_k \in \{8000, 10040,
11000\}\) against 24 and 30 months. The 24-month
good-org row tracks COCOMO 81 semi-detached; the
30-month good-org row tracks COCOMO II adjusted.

## Units that do not move

| Unit | Value |
|---|---|
| Person-month | 152 hours |
| Calendar month | 30.44 days |
| Elapsed months | (last − first author-date) / 30.44 |
| COCOMO II A, B, C, D | 2.94, 0.91, 3.67, 0.28 |
| SLIM B above 70 KSLOC | 0.39 |
| Primary actual labor | 8 h × (days with a commit) / 152 |
| Effort multiplier | estimated PM / actual PM |
| Schedule multiplier | estimated \(T_{dev}\) / elapsed months |

Re-source the loaded senior rate for the analysis
year. Record the year and the rate. The first run used
**$22,000/PM** (2026 US senior fully loaded, ≈ $264k
/year). Sensitivity: lean mid and hub senior. The
effort multiplier does not move with the rate; the
dollar bid does.

## Procedure

One session. Measure, rate, compute, write the report,
rest. Do not mutate product.

### 1. Header facts

Record RFC-3339 Z date, HEAD SHA, whether the tree is
clean, the range tag, tag SHA and date, author list
and commit count on the range, first and last
author-dates. `cloc` version. Labor-rate year.

```sh
git rev-parse HEAD tom-begins
git log tom-begins..HEAD --format='%H %aI %an %s' \
    | awk 'NR==1{print "last", $0} {a=$0} END{print "first", a}'
git log tom-begins..HEAD --format='%an' \
    | sort | uniq -c | sort -nr
git diff --shortstat tom-begins HEAD
```

### 2. Production SLOC

`cloc` on the git-tracked tree. Comments and blanks
out. Sum only production:

- `api/` TypeScript
- `web-app/` TypeScript + CSS + HTML, **excluding**
  `web-app/api-documentation/` (generated rooms)
- `server/` TypeScript
- `shared/` TypeScript
- root operator scripts (the same files `cloc` counts
  as Bourne Again Shell at repo root)

```sh
cloc --vcs git --exclude-dir=node_modules,.worktrees
cloc --vcs git api server shared tests docs
cloc --vcs git --exclude-dir=api-documentation web-app
```

Do not put `tests/` or Markdown into KDSI. Report
their cloc as appendix facts. Do not count generated
API rooms. If a new generated tree appears, exclude it
the same way and name it in the report.

KSLOC = production SLOC / 1000.

### 3. Git history: idle and actual labor

Author-dates (`%aI`) on the range.

```sh
git log tom-begins..HEAD --format='%aI'
```

Bucket by local calendar date.

- **Active day:** any commit that date.
- **Idle day:** none.
- **Stoppage:** two or more consecutive idle days.
  List every run with start, end, length. Name the
  commits that bound the two longest.
- **Weekday mix:** commits by Monday–Sunday. Weekend
  work counts.

**Elapsed** is last − first author-date, not idle
subtracted.

**Actual labor, primary:** 8 hours × active days /
152. That is one Boehm working day per date with a
commit. It does not credit all-night sessions as two
shifts.

**Span hours (ceiling, not labor):** per active day,
last commit minus first commit, floor 1 hour if a
single commit. A 00:03 and a 23:59 is not 24 hours of
work. Report raw sum, mean, median, p90, and sums
capped at 8/10/12/14/16 hours. The effort-multiplier
band is primary 8h/day against uncapped span.

Do not treat calendar span as 1 FTE (that counts idle
as work). Do not feed elapsed months to SLIM as
\(t_d\).

### 4. Function-point surface

Re-count at HEAD. Do not reuse a prior ILF table
without walking the code.

**ILFs** are user-recognizable groups, grouped as
RETs of a parent when they are subgroups of one
user concept (Identity holds PII, credentials,
tokens as RETs). Start from `FAMILY_REGISTRY`
(`api/family-registry.ts`) plus user-visible
documents the registry does not name (members,
invitations, record instances, scores). The ledger
is not an ILF.

**EIF:** external identity-provider catalog if still
a file we read and do not maintain; else zero. Say
which.

**Transactions** from `export const routes` in
`api/routes.ts`: each `route()` row, each offered
verb (`api/route-surface.ts`). PUT, POST, PATCH,
DELETE → EI. GET → EQ unless the handler derives
(dashboard aggregates, flow-stats, score history,
generated catalog) → EO. `PAGE_REGISTRY`
(`web-app/app/page-registry.ts`) is the page list;
it does not add transactions the API already
counted.

Rate each Low / Average / High from DET/FTR (or RET)
bands in IFPUG 4.3. If a certified count is not on
the table, say so and keep NESMA estimated next to
the detailed UFP. The two must agree inside ~25% or
the classification is wrong.

Fourteen GSCs, each 0–5, named in the report with
the sum. First-run \(\sum F_i = 49\), VAF = 1.14.
Re-rate; do not copy.

### 5. COCOMO II ratings

Re-rate every scale factor and every EM. Quote the
reason in one line each. Personnel stay **High, not
Very High**: replacement cost for a competent senior
team, not a 95th-percentile solo. SCED stays Nominal
(unconstrained replacement).

First-run ratings, for drift detection, not as a
default:

| Driver | First run | Why then |
|---|---|---|
| PREC | Low 4.96 | message-plane, one-table ledger |
| FLEX | High 2.03 | owner is the customer |
| RESL | Nominal 4.24 | architecture found by rewrite |
| TEAM | Very High 1.10 | one mind |
| PMAT | High 3.12 | `./validate`, three test layers |
| RELY | High 1.10 | tenancy, write authorizer, secrets |
| CPLX | High 1.17 | concurrent ledger, graph FSM, JWT |
| DOCU | High 1.11 | root docs + generated rooms |
| PVOL | Low 0.87 | Node + Postgres |
| ACAP / PCAP | High 0.85 / 0.88 | senior replacement team |
| PCON | Very High 0.81 | no turnover on the range |
| PLEX / LTEX | High 0.91 / 0.91 | TypeScript, this stack |
| SITE | Very High 0.86 | one site |
| DATA, RUSE, TIME, STOR, APEX, TOOL, SCED | Nominal 1.00 | |

First-run EAF ≈ 0.536, \(E\) ≈ 1.0645. A new rating
that moves EAF by more than ~15% needs a sentence.

Also report COCOMO 81 Basic organic / semi-detached
/ embedded on the same KSLOC. Semi-detached is the
1981 write-down mode unless the product class
changed.

### 6. Compute

One script, or a sheet that prints every
intermediate. Required outputs:

1. COCOMO 81 three modes: PM, \(T_{dev}\), peak
   staff, dollars.
2. COCOMO II nominal (EAF=1) and adjusted: PM,
   \(T_{dev}\), staff, dollars.
3. SLIM grid as above: PM, staff, dollars.
4. FPA: detailed UFP, NESMA estimated, NESMA
   indicative, VAF, AFP, four cost conversions,
   SLOC/UFP.
5. Actual: elapsed months, active days, idle days,
   primary PM, span PM.
6. For each estimated PM: effort × vs primary and vs
   span; schedule × where the model has \(T_{dev}\).

Staff = PM / \(T_{dev}\). Dollars = PM × rate.

### 7. Write-down

Sign one bid. The first run signed the overlap of
COCOMO II adjusted and Putnam at a non-crushed
schedule (~$5M), envelope FPA-complex floor to
COCOMO 81 semi-detached / SLIM 24-month good-org
ceiling.

State two multipliers, not one:

- **Effort ×** is productivity. Quote this.
- **Schedule ×** is time-to-delivery against a
  staffed team. Do not quote it as the productivity
  gain. Check that schedule× times estimated
  staff is about effort×.

Name what 29× (or this run's figure) is not: it is
not hand-coding speed against 1981; it folds one
author, AI-in-the-loop, ceremony, idle calendar, and
long active days.

### 8. Report

Write a dated file **outside this repository**
(Desktop is fine). This runbook stays; instance
reports do not land in the tree. Header: date, HEAD
SHA, range, rate, cloc version, clean or dirty.

The report includes every input in §§1–5, every
output in §6, the idle-run table, the write-down,
assumptions, and the commands that produced the
numbers. A reader with this file and the same HEAD
must be able to re-derive the bid.

## Assumptions that bind every run

1. HEAD production SLOC is Size. Not net insertions,
   not tests, not generated rooms, not Markdown.
2. No reuse credit for `tom-begins`.
3. Personnel High, not Very High, unless the bid is
   explicitly "this author."
4. Function-point processes come from routes and
   pages walked this run. Say if the counter is not
   IFPUG-certified.
5. Actual labor is git author-dates, not timesheets.
   Idle is absence of commits, not proven vacation.
   Design-only days look idle; stoppages of many days
   still count.
6. Dollars are the analysis-year US senior loaded
   rate, not Jones's $1,000/FP slogan, not 1981
   dollars, not offshore.
7. Development PM is requirements through
   integration test. Not product management, not
   design research, not go-to-market.
8. Boehm's calibration scatter was about ±20–30%
   one standard deviation. Reverse-estimating this
   architecture sits outside that set. The envelope
   is the uncertainty.

## Sources

- Boehm, B. W. *Software Engineering Economics.*
  Prentice-Hall, 1981.
- Boehm et al. *Software Cost Estimation with
  COCOMO II.* Prentice-Hall, 2000.
- Albrecht, A. J. “Measuring Application Development
  Productivity.” IBM, 1979.
- IFPUG Counting Practices Manual 4.3.
- Putnam, L. H.; Putnam and Myers, *Measures for
  Excellence*, 1992.
- Jones, C. Industry productivity (~8 FP/staff-month,
  ~16.5 hours/FP, ~$1,000/FP development).
- Boehm, B. W. “Software Engineering Economics.”
  *IEEE Transactions on Software Engineering*, 1984.
