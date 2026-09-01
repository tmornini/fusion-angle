// Generator for ./measure --visualize.
// Reads history + budgets from disk; embeds a versioned
// payload in self-contained dashboard + page HTML.
// Synchronous Deno file calls have no browser
// equivalent, so this generator runs only under Deno.

import { dirname, join } from '@std/path';

import {
    buildPayload,
    parseBudgetsJson,
    parseHistoryJsonl,
    VIZ_PAYLOAD_VERSION,
    type VizPayload,
} from './measure-viz-core.ts';

function exists(path: string): boolean {
    try {
        Deno.statSync(path);
        return true;
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            return false;
        }
        throw error;
    }
}

export const HISTORY_PATH =
    'measurements/history.jsonl';
export const BUDGETS_PATH =
    'measurements/budgets.json';
export const VIZ_OUTPUT_PATH =
    'measurements/page-load-times-broken-in-ichat.html';

/**
 * Read disk history + budgets, write measurements/
 * page-load-times-broken-in-ichat.html. Throws named
 * Errors (caller maps to exit 1).
 */
export function generateMeasureViz(
    repoRoot: string,
    generatedAt: string = new Date().toISOString(),
): string {
    const historyFile = join(repoRoot, HISTORY_PATH);
    const budgetsFile = join(repoRoot, BUDGETS_PATH);
    const outFile = join(repoRoot, VIZ_OUTPUT_PATH);

    if (!exists(historyFile)) {
        throw new Error(
            `visualize: missing history file: `
            + historyFile,
        );
    }
    if (!exists(budgetsFile)) {
        throw new Error(
            `visualize: missing budgets file: `
            + budgetsFile,
        );
    }

    let historyText: string;
    let budgetsText: string;
    try {
        historyText = Deno.readTextFileSync(
            historyFile,
        );
    } catch (err: unknown) {
        const msg = err instanceof Error
            ? err.message
            : String(err);
        throw new Error(
            `visualize: cannot read ${historyFile}: `
            + msg,
        );
    }
    try {
        budgetsText = Deno.readTextFileSync(
            budgetsFile,
        );
    } catch (err: unknown) {
        const msg = err instanceof Error
            ? err.message
            : String(err);
        throw new Error(
            `visualize: cannot read ${budgetsFile}: `
            + msg,
        );
    }

    const sweeps = parseHistoryJsonl(historyText);
    const budgets = parseBudgetsJson(budgetsText);
    const payload = buildPayload(
        sweeps, budgets, generatedAt,
    );
    const html = renderVizHtml(payload);

    Deno.mkdirSync(dirname(outFile), { recursive: true });
    Deno.writeTextFileSync(outFile, html);
    return outFile;
}

function renderVizHtml(payload: VizPayload): string {
    const json = JSON.stringify(payload)
        .replace(/</g, '\\u003c');
    return (
        '<!DOCTYPE html>\n'
        + '<html lang="en">\n'
        + '<head>\n'
        + '<meta charset="utf-8">\n'
        + '<meta name="viewport" content="width=device'
        + '-width, initial-scale=1">\n'
        + '<title>Measure history</title>\n'
        + '<style>\n'
        + vizCss()
        + '</style>\n'
        + '</head>\n'
        + '<body>\n'
        + vizBodyMarkup()
        + '<script type="application/json" id="payload">'
        + json
        + '</script>\n'
        + '<script>\n'
        + vizClientScript()
        + '</script>\n'
        + '</body>\n'
        + '</html>\n'
    );
}

function vizCss(): string {
    return `
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --border: #2a3140;
  --text: #e7ecf3;
  --muted: #9aa6b2;
  --accent: #6ea8fe;
  --good: #3dd68c;
  --bad: #f07178;
  --boot: #6ea8fe;
  --fetch: #f0c674;
  --render: #c678dd;
  --other: #9aa6b2;
  --budget: #56b6c2;
  --band: rgba(110, 168, 254, 0.18);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  position: sticky;
  top: 0;
  z-index: 20;
}
header h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}
.crumb {
  font-size: 0.85rem;
  color: var(--muted);
}
.crumb a, .crumb button.linkish {
  color: var(--accent);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  font: inherit;
  text-decoration: none;
}
.crumb a:hover, .crumb button.linkish:hover {
  text-decoration: underline;
}
header label {
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  gap: 6px;
  align-items: center;
}
header select, header button.tool {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.8rem;
  cursor: pointer;
}
header button.tool:hover {
  border-color: var(--accent);
}
.summary {
  font-size: 0.8rem;
  color: var(--muted);
  margin-right: auto;
}
.view-system, .view-page { display: none; }
.view-system.active, .view-page.active {
  display: block;
}
.dash {
  padding: 16px;
  max-width: 1100px;
  margin: 0 auto;
}
.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.metric {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  min-width: 120px;
  flex: 1 1 120px;
}
.metric .label {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.metric .value {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.dash-section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.dash-section h2 {
  font-size: 0.9rem;
  margin: 0 0 10px;
  font-weight: 600;
}
.dash-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 800px) {
  .dash-grid { grid-template-columns: 1fr; }
}
.layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) 1fr;
  min-height: calc(100vh - 56px);
}
@media (max-width: 800px) {
  .layout { grid-template-columns: 1fr; }
}
.rank, .focus {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.focus { border-right: 0; }
.tabs {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.8rem;
}
.tabs button[aria-selected="true"] {
  color: var(--text);
  border-color: var(--accent);
  background: #1c2433;
}
.rank-list {
  overflow: auto;
  flex: 1;
}
.rank-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  font-size: 0.85rem;
}
.rank-row:hover { background: #1a2030; }
.rank-row[aria-selected="true"] {
  background: #1c2a40;
  box-shadow: inset 3px 0 0 var(--accent);
}
.rank-meta {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.metric-row.page-metrics {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  margin: 0;
}
.panel-body { padding: 16px; flex: 1; }
.chart-wrap {
  position: relative;
  touch-action: none;
  user-select: none;
}
.trend-svg {
  width: 100%;
  height: 260px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: block;
}
.point-hit { cursor: pointer; fill: transparent; }
.point-vis { pointer-events: none; }
.sel-band { fill: var(--band); pointer-events: none; }
.tooltip {
  position: fixed;
  z-index: 50;
  pointer-events: none;
  background: #1c2433;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  max-width: 240px;
  display: none;
}
.tooltip.show { display: block; }
.tooltip .t-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin: 2px 0;
}
.tooltip .t-k { color: var(--muted); }
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.table th, .table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}
.table th {
  color: var(--muted);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
}
.table th:hover { color: var(--text); }
.table tr[data-page] { cursor: pointer; }
.table tr[data-page]:hover { background: #1a2030; }
.bar-stack {
  display: flex;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  margin: 12px 0;
}
.bar-seg { height: 100%; min-width: 0; }
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 12px;
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  margin-right: 4px;
}
.phase-list, .budget-block {
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}
.phase-list div, .budget-block div {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}
.muted { color: var(--muted); }
.delta-pos { color: var(--bad); }
.delta-neg { color: var(--good); }
.budget-track {
  height: 16px;
  background: #222833;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
  margin-top: 8px;
}
.budget-fill {
  height: 100%;
  background: var(--budget);
}
.budget-fill.over { background: var(--bad); }
.counts {
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
`.replace(/^\n/, '');
}

function vizBodyMarkup(): string {
    return `
<header>
  <h1>Measure history</h1>
  <nav class="crumb" id="crumb" aria-label="Breadcrumb">
  </nav>
  <span class="summary" id="summary"></span>
  <label>Start
    <select id="start-sel"
      aria-label="Window start sweep"></select>
  </label>
  <label>End
    <select id="end-sel"
      aria-label="Window end sweep"></select>
  </label>
  <button type="button" class="tool" id="reset-window">
    Reset window
  </button>
</header>
<div id="tooltip" class="tooltip" role="tooltip"></div>
<div class="view-system" id="view-system">
  <div class="dash">
    <div class="metric-row" id="sys-metrics"></div>
    <section class="dash-section">
      <h2>System ready (mean of page medians)</h2>
      <div id="sys-trend"></div>
    </section>
    <div class="dash-grid">
      <section class="dash-section">
        <h2>Biggest regressions</h2>
        <div id="sys-regress"></div>
      </section>
      <section class="dash-section">
        <h2>Biggest wins</h2>
        <div id="sys-wins"></div>
      </section>
    </div>
    <section class="dash-section">
      <h2>Budget pressure</h2>
      <div id="sys-budget"></div>
    </section>
    <section class="dash-section">
      <h2>Phase mix at end</h2>
      <div id="sys-phase"></div>
    </section>
    <section class="dash-section">
      <h2>All pages</h2>
      <div id="sys-all"></div>
    </section>
  </div>
</div>
<div class="view-page" id="view-page">
  <div class="layout">
    <section class="rank" aria-label="Page rank">
      <div class="tabs" role="tablist"
        aria-label="Rank sort">
        <button type="button" role="tab"
          data-sort="ready"
          aria-selected="true">ready</button>
        <button type="button" role="tab"
          data-sort="delta"
          aria-selected="false">Δ</button>
        <button type="button" role="tab"
          data-sort="budget"
          aria-selected="false">budget%</button>
      </div>
      <div class="rank-list" id="rank-list"
        role="listbox" aria-label="Pages"></div>
    </section>
    <section class="focus" aria-label="Page focus">
      <div class="tabs" role="tablist"
        aria-label="Focus mode">
        <button type="button" role="tab"
          data-mode="trend"
          aria-selected="true">trend</button>
        <button type="button" role="tab"
          data-mode="phase"
          aria-selected="false">phase</button>
        <button type="button" role="tab"
          data-mode="budget"
          aria-selected="false">budget</button>
      </div>
      <div class="metric-row page-metrics"
        id="page-metrics"></div>
      <div class="panel-body" id="focus-body"></div>
    </section>
  </div>
</div>
`.replace(/^\n/, '');
}

function vizClientScript(): string {
    // Client reimplements rank/format to match pure core.
    const ver = String(VIZ_PAYLOAD_VERSION);
    return `
(function () {
  var raw = document.getElementById('payload')
    .textContent;
  var payload = JSON.parse(raw);
  if (payload.version !== ${ver}) {
    document.body.innerHTML =
      '<p>Unsupported payload version '
      + payload.version + '</p>';
    return;
  }
  var sweeps = payload.sweeps;
  var budgets = payload.budgets;
  var startIndex = payload.compareDefault.fromIndex;
  var endIndex = payload.compareDefault.toIndex;
  var sort = 'ready';
  var mode = 'trend';
  var view = 'system';
  var focused = null;
  var MINUS = '\\u2212';
  var tip = document.getElementById('tooltip');
  var drag = null;

  function trimNum(n, maxDecimals) {
    if (Number.isInteger(n)) return String(n);
    var s = n.toFixed(maxDecimals);
    if (s.indexOf('.') !== -1) {
      s = s.replace(/\\.?0+$/, '');
    }
    return s;
  }
  function formatDurationPerf(ms, signed) {
    var abs = Math.abs(ms);
    var body;
    if (abs < 1) {
      body = Math.round(abs * 1000) + ' µs';
    } else if (abs < 1000) {
      body = trimNum(abs, 3) + ' ms';
    } else {
      body = trimNum(abs / 1000, 2) + ' s';
    }
    if (ms < 0) return MINUS + body;
    if (signed && ms > 0) return '+' + body;
    return body;
  }
  function pickAxisUnit(values) {
    var max = 0;
    for (var i = 0; i < values.length; i++) {
      var a = Math.abs(values[i]);
      if (a > max) max = a;
    }
    if (max < 1) return 'us';
    if (max < 1000) return 'ms';
    return 's';
  }
  function toAxis(ms, unit) {
    if (unit === 'us') return ms * 1000;
    if (unit === 'ms') return ms;
    return ms / 1000;
  }
  function formatAxisTick(ms, unit) {
    var abs = Math.abs(ms);
    var body;
    if (unit === 'us') {
      body = Math.round(abs * 1000) + ' µs';
    } else if (unit === 'ms') {
      body = trimNum(abs, 3) + ' ms';
    } else {
      body = trimNum(abs / 1000, 2) + ' s';
    }
    if (ms < 0) return MINUS + body;
    return body;
  }
  function formatUtc(at) {
    if (!at || at.length < 19) return String(at || '');
    return at.slice(0, 19).replace('T', ' ') + ' UTC';
  }
  function pageKeysUnion() {
    var set = {};
    for (var s = 0; s < sweeps.length; s++) {
      var pages = sweeps[s].pages;
      for (var k in pages) {
        if (Object.prototype.hasOwnProperty.call(
          pages, k,
        )) {
          set[k] = true;
        }
      }
    }
    return Object.keys(set).sort();
  }
  function cmpNumDescNullLast(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a < b) return 1;
    if (a > b) return -1;
    return 0;
  }
  function rankPages() {
    var from = sweeps[startIndex];
    var to = sweeps[endIndex];
    var sameSweep = startIndex === endIndex;
    var keys = pageKeysUnion();
    var entries = keys.map(function (page) {
      var toReady = to.pages[page]
        ? to.pages[page].readyMs
        : undefined;
      var fromReady = from.pages[page]
        ? from.pages[page].readyMs
        : undefined;
      var budget = budgets[page]
        ? budgets[page].readyMs
        : undefined;
      var readyMs = toReady === undefined
        ? null
        : toReady;
      var deltaMs = sameSweep
        ? null
        : (fromReady === undefined
          || toReady === undefined
          ? null
          : toReady - fromReady);
      var budgetPct =
        readyMs === null || budget === undefined
          ? null
          : readyMs / budget;
      return {
        page: page,
        readyMs: readyMs,
        deltaMs: deltaMs,
        budgetPct: budgetPct,
      };
    });
    entries.sort(function (a, b) {
      if (sort === 'ready') {
        return cmpNumDescNullLast(
          a.readyMs, b.readyMs,
        );
      }
      if (sort === 'delta') {
        return cmpNumDescNullLast(
          a.deltaMs, b.deltaMs,
        );
      }
      return cmpNumDescNullLast(
        a.budgetPct, b.budgetPct,
      );
    });
    return entries;
  }
  function meanReadyMs(sweep) {
    var pages = Object.keys(sweep.pages);
    if (!pages.length) return null;
    var sum = 0;
    for (var i = 0; i < pages.length; i++) {
      sum += sweep.pages[pages[i]].readyMs;
    }
    return sum / pages.length;
  }
  function systemReadySeries() {
    var out = [];
    for (var i = startIndex; i <= endIndex; i++) {
      var s = sweeps[i];
      if (!s) continue;
      var keys = Object.keys(s.pages);
      if (!keys.length) continue;
      var sum = 0;
      for (var j = 0; j < keys.length; j++) {
        sum += s.pages[keys[j]].readyMs;
      }
      out.push({
        index: i,
        meanMs: sum / keys.length,
        sampleCount: keys.length,
      });
    }
    return out;
  }
  function systemDeltaMs() {
    if (startIndex === endIndex) return null;
    var a = meanReadyMs(sweeps[startIndex]);
    var b = meanReadyMs(sweeps[endIndex]);
    if (a === null || b === null) return null;
    return b - a;
  }
  function budgetPressure() {
    var to = sweeps[endIndex];
    var pages = pageKeysUnion();
    var over = 0;
    var within = 0;
    var unknown = 0;
    var rows = [];
    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var readyMs = to.pages[page]
        ? to.pages[page].readyMs
        : undefined;
      var budgetMs = budgets[page]
        ? budgets[page].readyMs
        : undefined;
      if (
        readyMs === undefined
        || budgetMs === undefined
      ) {
        unknown += 1;
        rows.push({
          page: page,
          readyMs: readyMs === undefined
            ? null : readyMs,
          budgetMs: budgetMs === undefined
            ? null : budgetMs,
          budgetPct: null,
        });
        continue;
      }
      var pct = readyMs / budgetMs;
      if (readyMs > budgetMs) over += 1;
      else within += 1;
      rows.push({
        page: page,
        readyMs: readyMs,
        budgetMs: budgetMs,
        budgetPct: pct,
      });
    }
    rows.sort(function (a, b) {
      return cmpNumDescNullLast(
        a.budgetPct, b.budgetPct,
      );
    });
    return {
      over: over,
      within: within,
      unknown: unknown,
      rows: rows,
    };
  }
  var MEASURE_BOOT_PAGE_INIT = 'boot:page-init';
  function phaseBucket(name) {
    if (name.indexOf('boot:') === 0) return 'boot';
    if (name.indexOf('fetch:') === 0) return 'fetch';
    if (name.indexOf('render:') === 0) return 'render';
    return 'other';
  }
  function residualPageInitMs(phases) {
    var pageInit = phases[MEASURE_BOOT_PAGE_INIT];
    if (pageInit === undefined) return undefined;
    var nested = 0;
    var names = Object.keys(phases || {});
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (
        n.indexOf('fetch:') === 0
        || n.indexOf('render:') === 0
      ) {
        nested += phases[n];
      }
    }
    return Math.max(0, pageInit - nested);
  }
  function rollupPhases(phases) {
    var buckets = {
      boot: 0, fetch: 0, render: 0, other: 0,
    };
    var list = [];
    var residual = residualPageInitMs(phases || {});
    var names = Object.keys(phases || {});
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var raw = phases[name];
      var bucket = phaseBucket(name);
      if (name === MEASURE_BOOT_PAGE_INIT) {
        var residMs = residual === undefined
          ? 0
          : residual;
        buckets.boot += residMs;
        list.push({
          name: name, ms: residMs, bucket: 'boot',
        });
        continue;
      }
      buckets[bucket] += raw;
      list.push({
        name: name, ms: raw, bucket: bucket,
      });
    }
    list.sort(function (a, b) {
      if (a.ms > b.ms) return -1;
      if (a.ms < b.ms) return 1;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    return { buckets: buckets, phases: list };
  }
  function meanPhaseBuckets() {
    var to = sweeps[endIndex];
    var keys = Object.keys(to.pages);
    var empty = {
      boot: 0, fetch: 0, render: 0, other: 0,
    };
    if (!keys.length) return empty;
    var boot = 0;
    var fetch = 0;
    var render = 0;
    var other = 0;
    for (var i = 0; i < keys.length; i++) {
      var r = rollupPhases(to.pages[keys[i]].phases);
      boot += r.buckets.boot;
      fetch += r.buckets.fetch;
      render += r.buckets.render;
      other += r.buckets.other;
    }
    var n = keys.length;
    return {
      boot: boot / n,
      fetch: fetch / n,
      render: render / n,
      other: other / n,
    };
  }
  function systemMetrics() {
    var pressure = budgetPressure();
    var pcts = [];
    for (var i = 0; i < pressure.rows.length; i++) {
      if (pressure.rows[i].budgetPct !== null) {
        pcts.push(pressure.rows[i].budgetPct);
      }
    }
    var budgetP50 = null;
    if (pcts.length) {
      pcts.sort(function (a, b) { return a - b; });
      var mid = Math.floor(pcts.length / 2);
      if (pcts.length % 2 === 1) {
        budgetP50 = pcts[mid];
      } else {
        budgetP50 =
          (pcts[mid - 1] + pcts[mid]) / 2;
      }
    }
    return {
      sweepsInWindow: endIndex - startIndex + 1,
      totalSweeps: sweeps.length,
      pageCount: pageKeysUnion().length,
      meanReadyMs: meanReadyMs(sweeps[endIndex]),
      systemDeltaMs: systemDeltaMs(),
      overBudget: pressure.over,
      budgetP50: budgetP50,
    };
  }
  function trendLabelIndices(page, maxLabels) {
    var max = maxLabels == null ? 8 : maxLabels;
    var cands = [];
    for (var i = startIndex; i <= endIndex; i++) {
      if (
        page === null
        || sweeps[i].pages[page] !== undefined
      ) {
        if (page === null) {
          var keys = Object.keys(sweeps[i].pages);
          if (!keys.length) continue;
        }
        cands.push(i);
      }
    }
    if (cands.length === 0) return [];
    if (cands.length <= max) return cands;
    var first = cands[0];
    var last = cands[cands.length - 1];
    var picked = new Set([first, last]);
    if (max >= 2) {
      for (var k = 0; k < max; k++) {
        if (picked.size >= max) break;
        var ci = Math.round(
          (k * (cands.length - 1)) / (max - 1),
        );
        picked.add(cands[ci]);
      }
    }
    return Array.from(picked).sort(function (a, b) {
      return a - b;
    });
  }
  function sweepLabel(i) {
    var s = sweeps[i];
    var at = s.at.slice(0, 19).replace('T', ' ');
    return at + ' · ' + s.sha;
  }
  function hideTip() {
    tip.className = 'tooltip';
    tip.innerHTML = '';
  }
  function showTip(ev, lines) {
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      html += '<div class="t-row"><span class="t-k">'
        + lines[i][0]
        + '</span><span>'
        + lines[i][1]
        + '</span></div>';
    }
    tip.innerHTML = html;
    tip.className = 'tooltip show';
    var x = ev.clientX + 12;
    var y = ev.clientY + 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function setWindow(a, b) {
    var lo = Math.min(a, b);
    var hi = Math.max(a, b);
    if (lo === startIndex && hi === endIndex) return;
    startIndex = lo;
    endIndex = hi;
    fillSelectors();
    renderAll();
  }
  function fillSelectors() {
    var startSel = document.getElementById('start-sel');
    var endSel = document.getElementById('end-sel');
    startSel.innerHTML = '';
    endSel.innerHTML = '';
    for (var i = 0; i < sweeps.length; i++) {
      var o1 = document.createElement('option');
      o1.value = String(i);
      o1.textContent = sweepLabel(i);
      if (i === startIndex) o1.selected = true;
      startSel.appendChild(o1);
      var o2 = document.createElement('option');
      o2.value = String(i);
      o2.textContent = sweepLabel(i);
      if (i === endIndex) o2.selected = true;
      endSel.appendChild(o2);
    }
  }
  function renderSummary() {
    var end = sweeps[endIndex];
    var m = end.machine || {};
    var machine = (m.platform || '')
      + '/' + (m.arch || '')
      + ' · ' + (m.cpuModel || '');
    document.getElementById('summary').textContent =
      sweeps.length + ' sweep'
      + (sweeps.length === 1 ? '' : 's')
      + ' · payload v' + payload.version
      + ' · ' + machine;
  }
  function renderCrumb() {
    var el = document.getElementById('crumb');
    if (view === 'system') {
      el.innerHTML = '<span>System</span>';
      return;
    }
    el.innerHTML =
      '<button type="button" class="linkish"'
      + ' id="to-system">System</button>'
      + ' / <span>' + (focused || '') + '</span>';
    var btn = document.getElementById('to-system');
    if (btn) {
      btn.addEventListener('click', function () {
        goSystem();
      });
    }
  }
  function goSystem() {
    view = 'system';
    location.hash = '#/';
    renderAll();
  }
  function goPage(page) {
    focused = page;
    view = 'page';
    location.hash = '#/page/' + encodeURIComponent(page);
    renderAll();
  }
  function readHash() {
    var h = location.hash || '#/';
    if (h.indexOf('#/page/') === 0) {
      var key = decodeURIComponent(h.slice(7));
      var keys = pageKeysUnion();
      if (keys.indexOf(key) !== -1) {
        focused = key;
        view = 'page';
        return;
      }
    }
    view = 'system';
  }
  function metricCard(label, value, extraClass) {
    return '<div class="metric'
      + (extraClass ? ' ' + extraClass : '')
      + '"><div class="label">' + label
      + '</div><div class="value">' + value
      + '</div></div>';
  }
  function bindPageClicks(root) {
    var rows = root.querySelectorAll('[data-page]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].addEventListener('click', function (ev) {
        var p = ev.currentTarget.getAttribute(
          'data-page',
        );
        if (p) goPage(p);
      });
    }
  }
  function renderMovers(el, entries, positive) {
    var rows = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.deltaMs === null) continue;
      if (positive && e.deltaMs <= 0) continue;
      if (!positive && e.deltaMs >= 0) continue;
      rows.push(e);
      if (rows.length >= 8) break;
    }
    if (!rows.length) {
      el.innerHTML =
        '<p class="muted">None in this window.</p>';
      return;
    }
    var html = '<table class="table"><thead><tr>'
      + '<th>Page</th><th>Δ</th><th>Ready</th>'
      + '</tr></thead><tbody>';
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var dc = r.deltaMs > 0
        ? 'delta-pos'
        : 'delta-neg';
      html += '<tr data-page="' + r.page + '">'
        + '<td>' + r.page + '</td>'
        + '<td class="' + dc + '">'
        + formatDurationPerf(r.deltaMs, true)
        + '</td><td>'
        + (r.readyMs === null
          ? 'n/a'
          : formatDurationPerf(r.readyMs, false))
        + '</td></tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    bindPageClicks(el);
  }
  function renderSysMetrics() {
    var m = systemMetrics();
    var ready = m.meanReadyMs === null
      ? 'n/a'
      : formatDurationPerf(m.meanReadyMs, false);
    var delta = m.systemDeltaMs === null
      ? 'n/a'
      : formatDurationPerf(m.systemDeltaMs, true);
    var dClass = '';
    if (m.systemDeltaMs !== null && m.systemDeltaMs > 0) {
      dClass = 'delta-pos';
    } else if (
      m.systemDeltaMs !== null
      && m.systemDeltaMs < 0
    ) {
      dClass = 'delta-neg';
    }
    var p50 = m.budgetP50 === null
      ? 'n/a'
      : (Math.round(m.budgetP50 * 1000) / 10) + '%';
    var el = document.getElementById('sys-metrics');
    el.innerHTML =
      metricCard(
        'Sweeps',
        m.sweepsInWindow + ' / ' + m.totalSweeps,
      )
      + metricCard('Pages', String(m.pageCount))
      + metricCard('Mean ready', ready)
      + metricCard('System Δ', delta, dClass)
      + metricCard('Over budget', String(m.overBudget))
      + metricCard('Budget p50', p50);
  }
  function buildTrendSvg(points, opts) {
    // points: {index, y, tipLines[]}
    // opts: {budgetMs?}
    if (!points.length) {
      return '<p class="muted">No samples in window.'
        + '</p>';
    }
    var ys = points.map(function (p) { return p.y; });
    var unitVals = ys.slice();
    if (opts.budgetMs != null) {
      unitVals.push(opts.budgetMs);
    }
    var unit = pickAxisUnit(unitVals);
    var w = 640;
    var h = 260;
    var padL = 56;
    var padR = 16;
    var padT = 16;
    var padB = 36;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var yMax = Math.max.apply(null, unitVals);
    if (yMax <= 0) yMax = 1;
    var span = endIndex - startIndex;
    function xPos(idx) {
      if (span === 0) return padL + plotW / 2;
      return padL
        + ((idx - startIndex) / span) * plotW;
    }
    function yPos(ms) {
      var v = toAxis(ms, unit);
      var vmax = toAxis(yMax, unit);
      return padT + plotH - (v / vmax) * plotH;
    }
    var parts = [];
    parts.push(
      '<div class="chart-wrap">'
      + '<svg class="trend-svg" viewBox="0 0 '
      + w + ' ' + h
      + '" role="img" aria-label="Ready trend">',
    );
    for (var t = 0; t < 5; t++) {
      var frac = t / 4;
      var msTick = yMax * (1 - frac);
      var y = padT + plotH * frac;
      parts.push(
        '<line x1="' + padL + '" x2="' + (w - padR)
        + '" y1="' + y + '" y2="' + y
        + '" stroke="#2a3140"/>',
      );
      parts.push(
        '<text x="' + (padL - 6) + '" y="' + (y + 4)
        + '" fill="#9aa6b2" font-size="10" '
        + 'text-anchor="end">'
        + formatAxisTick(msTick, unit) + '</text>',
      );
    }
    if (opts.budgetMs != null) {
      var by = yPos(opts.budgetMs);
      parts.push(
        '<line x1="' + padL + '" x2="' + (w - padR)
        + '" y1="' + by + '" y2="' + by
        + '" stroke="#56b6c2" '
        + 'stroke-dasharray="4 3"/>',
      );
    }
    parts.push(
      '<rect class="sel-band" id="sel-band" x="0" y="'
      + padT + '" width="0" height="' + plotH
      + '" visibility="hidden"/>',
    );
    var d = '';
    for (var j = 0; j < points.length; j++) {
      var pt = points[j];
      var px = xPos(pt.index);
      var py = yPos(pt.y);
      d += (j === 0 ? 'M' : 'L') + px + ' ' + py + ' ';
      parts.push(
        '<circle class="point-vis" cx="' + px
        + '" cy="' + py
        + '" r="3.5" fill="#6ea8fe"/>',
      );
      parts.push(
        '<circle class="point-hit" cx="' + px
        + '" cy="' + py + '" r="10" data-index="'
        + pt.index + '" data-tip="'
        + encodeURIComponent(JSON.stringify(pt.tipLines))
        + '"/>',
      );
    }
    parts.push(
      '<path d="' + d
      + '" fill="none" stroke="#6ea8fe" '
      + 'stroke-width="2"/>',
    );
    var labelIdxs = opts.labelIndices || [];
    for (var li = 0; li < labelIdxs.length; li++) {
      var xi = labelIdxs[li];
      parts.push(
        '<text x="' + xPos(xi) + '" y="' + (h - 12)
        + '" fill="#9aa6b2" font-size="9" '
        + 'text-anchor="middle">'
        + sweeps[xi].sha + '</text>',
      );
    }
    parts.push('</svg></div>');
    return parts.join('');
  }
  function wireTrend(root) {
    var hits = root.querySelectorAll('.point-hit');
    for (var i = 0; i < hits.length; i++) {
      (function (el) {
        el.addEventListener('pointerenter', function (ev) {
          if (drag) return;
          var lines = JSON.parse(
            decodeURIComponent(
              el.getAttribute('data-tip'),
            ),
          );
          showTip(ev, lines);
        });
        el.addEventListener('pointermove', function (ev) {
          if (drag) return;
          var lines = JSON.parse(
            decodeURIComponent(
              el.getAttribute('data-tip'),
            ),
          );
          showTip(ev, lines);
        });
        el.addEventListener('pointerleave', function () {
          if (!drag) hideTip();
        });
        el.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          hideTip();
          var idx = Number(el.getAttribute('data-index'));
          drag = {
            anchor: idx,
            current: idx,
            svg: root.querySelector('svg'),
            band: root.querySelector('#sel-band'),
          };
          el.setPointerCapture(ev.pointerId);
          updateBand();
        });
        el.addEventListener('pointermove', function (ev) {
          if (!drag) return;
          var nearest = nearestIndex(ev, root);
          if (nearest !== null) {
            drag.current = nearest;
            updateBand();
          }
        });
        el.addEventListener('pointerup', function (ev) {
          if (!drag) return;
          var a = drag.anchor;
          var b = drag.current;
          drag = null;
          var band = root.querySelector('#sel-band');
          if (band) {
            band.setAttribute('visibility', 'hidden');
          }
          if (a !== b) setWindow(a, b);
        });
      })(hits[i]);
    }
  }
  function nearestIndex(ev, root) {
    var svg = root.querySelector('svg');
    if (!svg) return null;
    var rect = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    var scaleX = vb.width / rect.width;
    var mx = (ev.clientX - rect.left) * scaleX;
    var padL = 56;
    var padR = 16;
    var plotW = vb.width - padL - padR;
    var span = endIndex - startIndex;
    var hits = root.querySelectorAll('.point-hit');
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < hits.length; i++) {
      var idx = Number(
        hits[i].getAttribute('data-index'),
      );
      var cx = span === 0
        ? padL + plotW / 2
        : padL + ((idx - startIndex) / span) * plotW;
      var d = Math.abs(cx - mx);
      if (d < bestD) {
        bestD = d;
        best = idx;
      }
    }
    return best;
  }
  function updateBand() {
    if (!drag || !drag.band || !drag.svg) return;
    var vb = drag.svg.viewBox.baseVal;
    var padL = 56;
    var padR = 16;
    var plotW = vb.width - padL - padR;
    var span = endIndex - startIndex;
    function xPos(idx) {
      if (span === 0) return padL + plotW / 2;
      return padL
        + ((idx - startIndex) / span) * plotW;
    }
    var x0 = xPos(drag.anchor);
    var x1 = xPos(drag.current);
    var lo = Math.min(x0, x1);
    var hi = Math.max(x0, x1);
    drag.band.setAttribute('x', String(lo));
    drag.band.setAttribute('width', String(hi - lo));
    drag.band.setAttribute('visibility', 'visible');
  }
  function renderSysTrend() {
    var el = document.getElementById('sys-trend');
    var series = systemReadySeries();
    var nPages = pageKeysUnion().length;
    var points = series.map(function (p) {
      var s = sweeps[p.index];
      return {
        index: p.index,
        y: p.meanMs,
        tipLines: [
          ['SHA', s.sha],
          ['Date', formatUtc(s.at)],
          [
            'Mean',
            formatDurationPerf(p.meanMs, false),
          ],
          ['Runs', String(s.runs) + ' runs'],
          [
            'Pages',
            p.sampleCount + ' / ' + nPages,
          ],
        ],
      };
    });
    el.innerHTML = buildTrendSvg(points, {
      labelIndices: trendLabelIndices(null, 8),
    })
      + '<p class="muted">Mean of page medians. '
      + 'Drag point→point to set window. '
      + 'No system budget line.</p>';
    wireTrend(el);
  }
  function renderSysBudget() {
    var el = document.getElementById('sys-budget');
    var p = budgetPressure();
    var html = '<div class="counts">'
      + '<span>Over: <strong class="delta-pos">'
      + p.over + '</strong></span>'
      + '<span>Within: <strong class="delta-neg">'
      + p.within + '</strong></span>'
      + '<span>Unknown: <strong>'
      + p.unknown + '</strong></span></div>';
    html += '<table class="table"><thead><tr>'
      + '<th>Page</th><th>Ready</th><th>Budget</th>'
      + '<th>%</th></tr></thead><tbody>';
    var n = Math.min(10, p.rows.length);
    for (var i = 0; i < n; i++) {
      var r = p.rows[i];
      var pct = r.budgetPct === null
        ? 'n/a'
        : (Math.round(r.budgetPct * 1000) / 10) + '%';
      html += '<tr data-page="' + r.page + '">'
        + '<td>' + r.page + '</td><td>'
        + (r.readyMs === null
          ? 'n/a'
          : formatDurationPerf(r.readyMs, false))
        + '</td><td>'
        + (r.budgetMs === null
          ? 'n/a'
          : formatDurationPerf(r.budgetMs, false))
        + '</td><td>' + pct + '</td></tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    bindPageClicks(el);
  }
  function renderSysPhase() {
    var el = document.getElementById('sys-phase');
    var b = meanPhaseBuckets();
    var total = b.boot + b.fetch + b.render + b.other;
    function seg(name, ms, color) {
      if (ms <= 0 || total <= 0) return '';
      var pct = (ms / total) * 100;
      return '<div class="bar-seg" style="width:'
        + pct + '%;background:' + color
        + '"></div>';
    }
    var html = '<div class="legend">'
      + '<span><span class="swatch" style="'
      + 'background:var(--boot)"></span>boot '
      + formatDurationPerf(b.boot, false)
      + '</span>'
      + '<span><span class="swatch" style="'
      + 'background:var(--fetch)"></span>fetch '
      + formatDurationPerf(b.fetch, false)
      + '</span>'
      + '<span><span class="swatch" style="'
      + 'background:var(--render)"></span>render '
      + formatDurationPerf(b.render, false)
      + '</span>'
      + '<span><span class="swatch" style="'
      + 'background:var(--other)"></span>other '
      + formatDurationPerf(b.other, false)
      + '</span></div>';
    html += '<div class="bar-stack">'
      + seg('boot', b.boot, 'var(--boot)')
      + seg('fetch', b.fetch, 'var(--fetch)')
      + seg('render', b.render, 'var(--render)')
      + seg('other', b.other, 'var(--other)')
      + '</div>';
    html += '<p class="muted">Mean phase mix across pages '
      + 'at end sweep (page-init residual).</p>';
    el.innerHTML = html;
  }
  function renderSysAll() {
    var el = document.getElementById('sys-all');
    var entries = rankPages();
    var html = '<table class="table"><thead><tr>'
      + '<th data-col="ready">Page</th>'
      + '<th data-col="ready">Ready</th>'
      + '<th data-col="delta">Δ</th>'
      + '<th data-col="budget">Budget%</th>'
      + '</tr></thead><tbody>';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var dc = '';
      if (e.deltaMs !== null && e.deltaMs > 0) {
        dc = 'delta-pos';
      } else if (e.deltaMs !== null && e.deltaMs < 0) {
        dc = 'delta-neg';
      }
      var pct = e.budgetPct === null
        ? 'n/a'
        : (Math.round(e.budgetPct * 1000) / 10) + '%';
      html += '<tr data-page="' + e.page + '">'
        + '<td>' + e.page + '</td><td>'
        + (e.readyMs === null
          ? 'n/a'
          : formatDurationPerf(e.readyMs, false))
        + '</td><td class="' + dc + '">'
        + (e.deltaMs === null
          ? 'n/a'
          : formatDurationPerf(e.deltaMs, true))
        + '</td><td>' + pct + '</td></tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
    bindPageClicks(el);
    var ths = el.querySelectorAll('th[data-col]');
    for (var t = 0; t < ths.length; t++) {
      ths[t].addEventListener('click', function (ev) {
        sort = ev.currentTarget.getAttribute('data-col');
        renderSysAll();
        syncSortTabs();
      });
    }
  }
  function syncSortTabs() {
    document.querySelectorAll('[data-sort]').forEach(
      function (b) {
        b.setAttribute(
          'aria-selected',
          b.getAttribute('data-sort') === sort
            ? 'true'
            : 'false',
        );
      },
    );
  }
  function renderSystem() {
    renderSysMetrics();
    renderSysTrend();
    var entries = rankPages();
    renderMovers(
      document.getElementById('sys-regress'),
      entries,
      true,
    );
    // Most improved first (most negative Δ).
    var wins = entries.slice().filter(function (e) {
      return e.deltaMs !== null && e.deltaMs < 0;
    }).sort(function (a, b) {
      return a.deltaMs - b.deltaMs;
    });
    renderMovers(
      document.getElementById('sys-wins'),
      wins,
      false,
    );
    renderSysBudget();
    renderSysPhase();
    renderSysAll();
  }
  function metaFor(entry) {
    if (sort === 'ready') {
      return entry.readyMs === null
        ? 'n/a'
        : formatDurationPerf(entry.readyMs, false);
    }
    if (sort === 'delta') {
      return entry.deltaMs === null
        ? 'n/a'
        : formatDurationPerf(entry.deltaMs, true);
    }
    if (entry.budgetPct === null) return 'n/a';
    return Math.round(entry.budgetPct * 1000) / 10
      + '%';
  }
  function renderRank() {
    var list = document.getElementById('rank-list');
    var entries = rankPages();
    if (focused === null && entries.length) {
      focused = entries[0].page;
    }
    list.innerHTML = '';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var row = document.createElement('div');
      row.className = 'rank-row';
      row.setAttribute('role', 'option');
      row.setAttribute(
        'aria-selected',
        e.page === focused ? 'true' : 'false',
      );
      row.dataset.page = e.page;
      row.innerHTML =
        '<span>' + e.page + '</span>'
        + '<span class="rank-meta">'
        + metaFor(e) + '</span>';
      row.addEventListener('click', function (ev) {
        goPage(ev.currentTarget.dataset.page);
      });
      list.appendChild(row);
    }
  }
  function currentEntry() {
    var entries = rankPages();
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].page === focused) {
        return entries[i];
      }
    }
    return entries[0] || null;
  }
  function renderPageMetrics() {
    var e = currentEntry();
    var el = document.getElementById('page-metrics');
    if (!e) {
      el.innerHTML = '';
      return;
    }
    var ready =
      e.readyMs === null
        ? 'n/a'
        : formatDurationPerf(e.readyMs, false);
    var delta =
      e.deltaMs === null
        ? 'n/a'
        : formatDurationPerf(e.deltaMs, true);
    var budget =
      e.budgetPct === null
        ? 'n/a'
        : (Math.round(e.budgetPct * 1000) / 10) + '%';
    var deltaClass = '';
    if (e.deltaMs !== null && e.deltaMs > 0) {
      deltaClass = 'delta-pos';
    } else if (e.deltaMs !== null && e.deltaMs < 0) {
      deltaClass = 'delta-neg';
    }
    el.innerHTML =
      metricCard('Page', e.page)
      + metricCard('End ready', ready)
      + metricCard('Δ start→end', delta, deltaClass)
      + metricCard('Budget', budget);
  }
  function renderTrend() {
    var body = document.getElementById('focus-body');
    var page = focused;
    var points = [];
    for (var i = startIndex; i <= endIndex; i++) {
      var p = sweeps[i].pages[page];
      if (!p) continue;
      var s = sweeps[i];
      points.push({
        index: i,
        y: p.readyMs,
        tipLines: [
          ['SHA', s.sha],
          ['Date', formatUtc(s.at)],
          [
            'Ready',
            formatDurationPerf(p.readyMs, false),
          ],
          ['Runs', String(s.runs) + ' runs'],
        ],
      });
    }
    if (!points.length) {
      body.innerHTML =
        '<p class="muted">No samples for this page '
        + 'in the window.</p>';
      return;
    }
    var budget = budgets[page]
      ? budgets[page].readyMs
      : null;
    var html = buildTrendSvg(points, {
      budgetMs: budget,
      labelIndices: trendLabelIndices(page, 8),
    });
    if (budget !== null) {
      html +=
        '<p class="muted">Dashed line = budget ceiling ('
        + formatDurationPerf(budget, false) + ').</p>';
    }
    html +=
      '<p class="muted">Gaps mean the page was absent '
      + 'from that sweep. Drag point→point to set '
      + 'window.</p>';
    body.innerHTML = html;
    wireTrend(body);
  }
  function renderPhase() {
    var body = document.getElementById('focus-body');
    var to = sweeps[endIndex];
    var pageData = to.pages[focused];
    if (!pageData) {
      body.innerHTML =
        '<p class="muted">No phase data in the '
        + '<strong>end</strong> sweep for this page.</p>';
      return;
    }
    var r = rollupPhases(pageData.phases);
    var total =
      r.buckets.boot + r.buckets.fetch
      + r.buckets.render + r.buckets.other;
    function seg(name, ms, color) {
      if (ms <= 0 || total <= 0) return '';
      var pct = (ms / total) * 100;
      return '<div class="bar-seg" style="width:'
        + pct + '%;background:' + color
        + '"></div>';
    }
    var html = '';
    html += '<div class="legend">'
      + '<span><span class="swatch" style="'
      + 'background:var(--boot)"></span>boot '
      + formatDurationPerf(r.buckets.boot, false)
      + '</span>'
      + '<span><span class="swatch" style="'
      + 'background:var(--fetch)"></span>fetch '
      + formatDurationPerf(r.buckets.fetch, false)
      + '</span>'
      + '<span><span class="swatch" style="'
      + 'background:var(--render)"></span>render '
      + formatDurationPerf(r.buckets.render, false)
      + '</span>'
      + '<span><span class="swatch" style="'
      + 'background:var(--other)"></span>other '
      + formatDurationPerf(r.buckets.other, false)
      + '</span></div>';
    html += '<div class="bar-stack">'
      + seg('boot', r.buckets.boot, 'var(--boot)')
      + seg('fetch', r.buckets.fetch, 'var(--fetch)')
      + seg(
        'render', r.buckets.render, 'var(--render)',
      )
      + seg('other', r.buckets.other, 'var(--other)')
      + '</div>';
    html += '<p class="muted">'
      + 'boot:page-init is residual wall time after '
      + 'nested fetch/render (no double-count).</p>';
    html += '<div class="phase-list">';
    for (var i = 0; i < r.phases.length; i++) {
      var ph = r.phases[i];
      var label = ph.name;
      if (ph.name === MEASURE_BOOT_PAGE_INIT) {
        label = ph.name + ' (residual)';
      }
      html += '<div><span>' + label
        + ' <span class="muted">(' + ph.bucket
        + ')</span></span><span>'
        + formatDurationPerf(ph.ms, false)
        + '</span></div>';
    }
    if (!r.phases.length) {
      html += '<p class="muted">'
        + 'No phase marks recorded.</p>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function renderBudget() {
    var body = document.getElementById('focus-body');
    var e = currentEntry();
    if (!e) {
      body.innerHTML = '';
      return;
    }
    var budget = budgets[focused]
      ? budgets[focused].readyMs
      : null;
    if (e.readyMs === null || budget === null) {
      body.innerHTML =
        '<p class="muted">Budget ratio n/a '
        + '(need median and budget for this page).</p>';
      return;
    }
    var pct = e.budgetPct;
    var pctShow = Math.round(pct * 1000) / 10;
    var headroom = budget - e.readyMs;
    var fillPct = Math.min(pct * 100, 100);
    var over = pct > 1;
    var html = '<div class="budget-block">';
    html += '<div><span>Median ready</span><span>'
      + formatDurationPerf(e.readyMs, false)
      + '</span></div>';
    html += '<div><span>Budget ceiling</span><span>'
      + formatDurationPerf(budget, false)
      + '</span></div>';
    html += '<div><span>Used</span><span>'
      + pctShow + '%</span></div>';
    html += '<div><span>Headroom</span><span>'
      + formatDurationPerf(headroom, true)
      + '</span></div>';
    html += '<div class="budget-track">'
      + '<div class="budget-fill'
      + (over ? ' over' : '')
      + '" style="width:' + fillPct
      + '%"></div></div>';
    if (over) {
      html += '<p class="delta-pos">Over budget.</p>';
    }
    html += '</div>';
    body.innerHTML = html;
  }
  function renderFocus() {
    if (mode === 'trend') renderTrend();
    else if (mode === 'phase') renderPhase();
    else renderBudget();
  }
  function renderViews() {
    var sys = document.getElementById('view-system');
    var pg = document.getElementById('view-page');
    if (view === 'system') {
      sys.className = 'view-system active';
      pg.className = 'view-page';
      renderSystem();
    } else {
      sys.className = 'view-system';
      pg.className = 'view-page active';
      renderRank();
      renderPageMetrics();
      renderFocus();
    }
  }
  function renderAll() {
    renderSummary();
    renderCrumb();
    renderViews();
  }
  document.querySelectorAll('[data-sort]').forEach(
    function (btn) {
      btn.addEventListener('click', function () {
        sort = btn.getAttribute('data-sort');
        syncSortTabs();
        if (view === 'page') {
          renderRank();
          renderPageMetrics();
        } else {
          renderSystem();
        }
      });
    },
  );
  document.querySelectorAll('[data-mode]').forEach(
    function (btn) {
      btn.addEventListener('click', function () {
        mode = btn.getAttribute('data-mode');
        document.querySelectorAll('[data-mode]')
          .forEach(function (b) {
            b.setAttribute(
              'aria-selected',
              b === btn ? 'true' : 'false',
            );
          });
        if (view === 'page') renderFocus();
      });
    },
  );
  document.getElementById('start-sel').addEventListener(
    'change',
    function (ev) {
      var v = Number(ev.target.value);
      if (v > endIndex) endIndex = v;
      startIndex = v;
      fillSelectors();
      renderAll();
    },
  );
  document.getElementById('end-sel').addEventListener(
    'change',
    function (ev) {
      var v = Number(ev.target.value);
      if (v < startIndex) startIndex = v;
      endIndex = v;
      fillSelectors();
      renderAll();
    },
  );
  document.getElementById('reset-window')
    .addEventListener('click', function () {
      startIndex = 0;
      endIndex = sweeps.length - 1;
      fillSelectors();
      renderAll();
    });
  window.addEventListener('hashchange', function () {
    readHash();
    renderAll();
  });
  fillSelectors();
  readHash();
  renderAll();
})();
`.replace(/^\n/, '');
}
