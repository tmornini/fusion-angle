# AUDIT.md — The Doctrine Audit

> *We do not assert; we measure. We do not declare; we witness.*
> — the Church of Code, *We measure before we optimize*

A whole-repository audit of this codebase against every section
of the Church of Code scripture — one indoctrinated agent per
section, report-only. Run it as an ultracode workflow; the
harness announces itself in-session, and absent that
announcement you stop and ask — never improvise a different
engine.

The audit follows the codebase scroll policy (CLAUDE.md
§ Subagents): its orchestrator conducts as master and goes
Full (`Go to Church!`), enumerating the scripture's sections;
its hunters and refuters fan out as subagents and go Medium
(`Go to Medium Church!`).

## Scope

- The unit of audit is the scripture section; the surface is
  every tracked file, plus git history where the doctrine
  demands it (the Office of the Commit).
- Report-only. No agent mutates the repo; the orchestrator
  writes `AUDIT-REPORT.md` once.
- Static. No build, no server, no browser. Browser truth belongs
  to [TEST-PLAN.md](TEST-PLAN.md), separately invoked; questions
  only runtime can answer land in the not-verifiable appendix.

## The Rule of Evidence

Binding on every agent and every claim. The cardinal audit sin
is the verdict delivered without reading the code.

1. No finding without `file:line`, a verbatim snippet read THIS
   run, and the doctrine clause it violates — quoted.
2. Re-derive every location by symbol search each run; never
   cite a stored line number.
3. When two readings disagree, the disagreement becomes a
   measurement. The number rules.
4. The report header makes the run reproducible: HEAD SHA, tree
   clean or dirty, scripture version, the raw `./validate`
   verdict, and the run date in RFC-3339 Z.

## Procedure

0. **Gate & roster (serial).** The orchestrator itself begins
   `Go to Church!` — indoctrination, and the skill announces the
   scroll's base directory, the only sanctioned source of its
   path. Enumerate the roster from the FULL scroll
   (`CHURCH-OF-CODE.md`): every `###` heading under The Twelve
   Commandments, The Book of Abominations, and The Daily
   Offices, plus every bold-led paragraph under The Articles of
   Faith — ≈60 sections, derived by grep each run, never from a
   stored list, not even one kept in this file. Record the
   header facts and the KNOWN-list count m (§ Security: KNOWN
   vs NEW). Run `./validate` THREE times — and once more under
   the hunt fan-out's concurrent load, if agents are already
   dispatched. Report the modal verdict AND any test whose
   pass/fail varies across runs: a load-sensitive test is a
   *false prophet* (Office of Verification), finding #1 under
   Commandment I whether or not HEAD is green today. RED aborts
   nothing: this audit is static and builds no bundle — the
   abort rule is TEST-PLAN's, for the browser. Test-based
   measurements carry a caveat.
1. **Hunt (parallel, ≈60).** One agent per section, prompt per
   the template below.
2. **Consolidate (serial).** Dedup BEFORE refutation, or one
   defect is refuted N times with N verdicts.
3. **Refute (parallel).** One fresh indoctrinated refuter per
   finding, mandated to DISPROVE it: re-read the cited lines;
   hunt an upstream guard, a gate validator, a deleted symbol, a
   correct doc; prefer a runnable read-only measurement over
   prose. The refuter also adjudicates the commandment trace —
   moving it requires a scripture quote — and may SPLIT a bad
   merge. CONFIRMED lands. REFUTED drops but stays in the
   ledger. DISPUTED goes to one tie-breaker who must return a
   measurement. A NEW finding tracing to Commandment II needs
   two refuters, both confirming. Every consolidated finding
   gets a verdict — none ships UNVERIFIED (§ Failure modes).
   Exemplars land unrefuted — credit, not claims.
3b. **Challenge kills-by-contract (parallel).** A refuter may
   kill a finding by citing a contract of record
   (ARCHITECTURE.md, API.md, CLAUDE.md, SCHEMA.md). Each such
   REFUTED verdict draws ONE narrow adjudicator asking a single
   question: does the cited contract address THIS charge, or a
   neighbor of it? A doc that blesses shape X does not refute a
   charge about shape Y. The adjudicator returns a measurement;
   it restores the finding to CONFIRMED or upholds the kill.
   Triggers only on killed-by-contract verdicts.
4. **Report (serial).** Write `AUDIT-REPORT.md` once, wrapped
   to pass the root-`.md` lint (CLAUDE.md § Validate
   semantics); snippet lines may be truncated to fit, marked
   explicitly — fidelity lives at the cited `file:line`.

## The hunter's prompt

Compose per CLAUDE.md § Subagents — the `Go to Medium Church!`
opener and the codebase push-down are mandated there — with the
repository's absolute path and HEAD SHA, then add:

```
Go to Medium Church!

You audit the fusion-ai repository at <ABS_PATH>,
HEAD <SHA>, against ONE scripture section:
<section name>. After the skill loads, read YOUR
section from the Medium scroll
(CHURCH-OF-CODE-medium-context.md in the skill's
base directory). It is your whole mandate — derive
the hunt from it. The repo-root *.md files are the
contracts of record.

Scope: the entire repository, read-only. You may
run read-only commands and single test files to
measure; never the full suite, never build or
serve, never any write. AUDIT.md § The Rule of
Evidence binds every claim.

- Trace each finding to one commandment I–XII,
  quoting scripture for the trace; absent a quote,
  take the least severe defensible numeral.
- A repeated defect is ONE pattern finding: site
  count plus up to 3 representative citations.
- Credit exemplars — scripture leads with the
  righteous.
- Log every hunt, including empty ones; say whether
  each was exhaustive or sampled. Sample
  breadth-first if the surface exceeds your context.

Return JSON matching the findings schema.
```

## The schemas

Each hunter returns JSON in this shape — the findings schema;
consolidation is a mechanical fold over it.

```json
{
  "section": "the Greedy Catch",
  "hunts": [{"what": "", "how": "",
             "scope": "exhaustive|sampled", "hits": 0}],
  "findings": [{
    "title": "", "file": "", "line": 0, "symbol": "",
    "snippet": "",
    "doctrine": "<quoted clause violated>",
    "commandment": 1, "security": "KNOWN|NEW|-",
    "sites": 1, "more_sites": ["file:line"]
  }],
  "exemplars": [{"file": "", "line": 0,
                 "snippet": "", "why": ""}],
  "not_verifiable": ["needs runtime/browser/server"],
  "context": "complete|truncated"
}
```

A `hunts` row with `hits: 0` is the empty-hunt proof;
`sites`/`more_sites` is the flood valve; `context` is the
honesty bit for hunts larger than one context; `symbol` is the
enclosing function or class, empty at file scope, so the merge
key computes from JSON alone.

Each refuter receives one merged finding verbatim, contributors
included, and returns:

```json
{
  "verdict": "CONFIRMED|REFUTED|DISPUTED",
  "evidence": "", "measurement": "",
  "commandment": 1, "quote": "<required when moved>",
  "split": ["child findings, findings[] shape"]
}
```

## Consolidation

- **One defect, one finding.** Merge key: same file AND (same
  enclosing symbol OR line within ±3) AND the same defect on
  snippet read. The merged finding lists every contributing
  section; each contributor's roster row still credits a
  productive hunt. Owner: the most specific doctrine —
  abomination > office > article > commandment — ties broken by
  scroll order.
- **Severity is the lowest-numbered commandment implicated**,
  surviving refutation. No second scale: the scroll already
  ranks the commandments. A finding renders as
  `[II] [section] title — file:line`.
- A doc that misstates fact X violates Clarity (V), not X —
  unless the misstatement conceals a live exposure.
- **Internal-consistency gate.** Before the report is written,
  reconcile verdicts across sites: any two findings — or a
  finding and a refutation — citing the same enclosing-symbol
  SHAPE in different files must resolve to ONE verdict. A
  CONFIRMED site and a REFUTED twin of the same defect cannot
  both ship.

## Security: KNOWN vs NEW

[ARCHITECTURE.md](ARCHITECTURE.md) § Server-tier deploy blockers
is the canonical KNOWN list — counted at run time, never
restated here. A KNOWN finding re-confirms its seam flag still
exists, unwidened; moving KNOWN → NEW requires showing the flag
absent or changed. Anything security-relevant not on that list
is NEW, reported separately. The Commandment II hunter's prompt
carries a pointer to that list; it re-confirms every seam flag
and tags each finding `KNOWN` or `NEW` in the schema's
`security` field.

Section hunts miss whole vulnerability classes: a single
Commandment II section hunter greps toward one class and misses
its neighbors. So run a fixed roster of CLASS hunters IN
ADDITION to the section hunt, each swept end to end:

- **Injection** — SQL, regex (ReDoS), template, command.
- **Authn/authz flow** — token lifecycle, OAuth grant
  completeness (PKCE, TTL, client binding), replay, enumeration.
- **Secret handling** — logs, error bodies, config defaults.
- **Untrusted-input DoS** — ReDoS, zip-bomb, unbounded
  allocation.

Each class hunter returns the findings schema and tags KNOWN or
NEW like any Commandment II finding.

## The report

`AUDIT-REPORT.md`, repo root, written once:

1. **Header** — the Rule of Evidence reproducibility fields,
   roster counts by kind, agents dispatched / re-dispatched /
   FAILED.
2. **Executive summary** — verdict first; finding tally by
   commandment numeral; KNOWN re-confirmed n/m (per § Security:
   KNOWN vs NEW); the top NEW items.
3. **Findings ledger**, scripture order: numeral, owning
   section, contributors, title, `file:line`, snippet, doctrine
   quote, KNOWN|NEW, verification status.
4. **Exemplars ledger** — section → `file:line` + why.
5. **Section-coverage roster** — one row per enumerated section:
   status (OK|TRUNCATED|FAILED), hunts n (exhaustive/sampled),
   findings n, exemplars n. An absent row is an un-run hunt,
   not a pass.
6. **Refutation ledger** — every REFUTED and DISPUTED claim with
   the evidence that killed or saved it.
7. **Not-verifiable appendix** — what needs runtime, pointed at
   TEST-PLAN.md.

## Failure modes

- Agent dies: re-dispatch once; a second death is a FAILED
  roster row, never a silent absence.
- Invalid return: re-dispatch once with the validation error
  appended.
- Context exhaustion: the sampled/truncated bits make it
  visible. Never pre-bound a hunt.
- Refuter budget strain: never truncate. Refute EVERY
  consolidated finding — pipeline the refuters if the fleet is
  large. A finding without a verdict is a FAILED roster row,
  not a shipped finding; there is no UNVERIFIED tail.
- Orchestrator bloat: after Phase 0 the orchestrator reads no
  repo source — it consumes JSON and writes one file.

## Reconciliation (when more than one audit runs)

Two audits of one HEAD are not merged by union, nor is either
trusted wholesale — independent runs fail in opposite
directions (one over-includes an unverified tail, the other
over-refutes via contracts of record; each can miss a security
class the other caught).

Diff the two findings ledgers. For every delta — a site one
audit CONFIRMED and the other REFUTED or missed — dispatch ONE
adversarial adjudicator with a re-measurement mandate: read the
cited lines THIS run, side with neither auditor, let the number
rule (§ The Rule of Evidence). The reconciled ledger is the
verified union: every finding either audit confirmed that
survives adjudication, minus every one a re-measurement kills.

Cheapest high-value pass available once two audits exist — it
recovers the findings each run missed alone and catches the
errors each made independently, including an audit that
contradicts itself.

## Remediation (separately invoked)

Report-only is the default; remediation is opt-in after the
report is read. One commit per finding, safest-first;
`./validate` green before each commit. The Office of the Commit
and CLAUDE.md govern the rest.
