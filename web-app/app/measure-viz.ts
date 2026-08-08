// Node-only generator for ./measure --visualize.
// Reads history + budgets from disk; embeds a versioned
// payload in self-contained Layout B HTML. Excluded from
// browser tsc (Node APIs).

import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
    buildPayload,
    parseBudgetsJson,
    parseHistoryJsonl,
    VIZ_PAYLOAD_VERSION,
    type VizPayload,
} from './measure-viz-core.ts';

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

    if (!existsSync(historyFile)) {
        throw new Error(
            `visualize: missing history file: `
            + historyFile,
        );
    }
    if (!existsSync(budgetsFile)) {
        throw new Error(
            `visualize: missing budgets file: `
            + budgetsFile,
        );
    }

    let historyText: string;
    let budgetsText: string;
    try {
        historyText = readFileSync(
            historyFile, 'utf8',
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
        budgetsText = readFileSync(
            budgetsFile, 'utf8',
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

    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html, 'utf8');
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
}
header h1 {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  margin-right: auto;
}
header label {
  font-size: 0.8rem;
  color: var(--muted);
  display: flex;
  gap: 6px;
  align-items: center;
}
header select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 8px;
}
.summary {
  font-size: 0.8rem;
  color: var(--muted);
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
.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.kpi {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  min-width: 120px;
}
.kpi .label {
  font-size: 0.7rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.kpi .value {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
.panel-body { padding: 16px; flex: 1; }
.trend-svg {
  width: 100%;
  height: 260px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
}
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
`.replace(/^\n/, '');
}

function vizBodyMarkup(): string {
    return `
<header>
  <h1>Measure history</h1>
  <span class="summary" id="summary"></span>
  <label>From
    <select id="from-sel"
      aria-label="Compare from sweep"></select>
  </label>
  <label>To
    <select id="to-sel"
      aria-label="Compare to sweep"></select>
  </label>
</header>
<div class="layout">
  <section class="rank" aria-label="Page rank">
    <div class="tabs" role="tablist"
      aria-label="Rank sort">
      <button type="button" role="tab" data-sort="ready"
        aria-selected="true">ready</button>
      <button type="button" role="tab" data-sort="delta"
        aria-selected="false">Δ</button>
      <button type="button" role="tab" data-sort="budget"
        aria-selected="false">budget%</button>
    </div>
    <div class="rank-list" id="rank-list" role="listbox"
      aria-label="Pages"></div>
  </section>
  <section class="focus" aria-label="Page focus">
    <div class="tabs" role="tablist"
      aria-label="Focus mode">
      <button type="button" role="tab" data-mode="trend"
        aria-selected="true">trend</button>
      <button type="button" role="tab" data-mode="phase"
        aria-selected="false">phase</button>
      <button type="button" role="tab" data-mode="budget"
        aria-selected="false">budget</button>
    </div>
    <div class="kpi-row" id="kpis"></div>
    <div class="panel-body" id="focus-body"></div>
  </section>
</div>
`.replace(/^\n/, '');
}

function vizClientScript(): string {
    // Client reimplements rank/format to match pure core.
    // sameSweep → deltaMs null; desc sorts with nulls last.
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
  var fromIndex = payload.compareDefault.fromIndex;
  var toIndex = payload.compareDefault.toIndex;
  var sort = 'ready';
  var mode = 'trend';
  var focused = null;
  var MINUS = '\\u2212';

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
  /** Descending; nulls always last (matches core). */
  function cmpNumDescNullLast(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (a < b) return 1;
    if (a > b) return -1;
    return 0;
  }
  function rankPages() {
    var from = sweeps[fromIndex];
    var to = sweeps[toIndex];
    var sameSweep = fromIndex === toIndex;
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
  // keep in sync with trendLabelIndices
  function trendLabelIndices(
    sweeps, page, fromIndex, toIndex, maxLabels,
  ) {
    var max = maxLabels == null ? 8 : maxLabels;
    var cands = [];
    for (var i = 0; i < sweeps.length; i++) {
      if (sweeps[i].pages[page] !== undefined) {
        cands.push(i);
      }
    }
    if (cands.length === 0) return [];
    if (cands.length <= max) return cands;

    var first = cands[0];
    var last = cands[cands.length - 1];
    var forced = new Set([first, last]);
    if (cands.indexOf(fromIndex) !== -1) {
      forced.add(fromIndex);
    }
    if (cands.indexOf(toIndex) !== -1) {
      forced.add(toIndex);
    }

    if (forced.size >= max) {
      if (max <= 1) return [first];
      var out = new Set([first, last]);
      var room = max - out.size;
      var interiors = [];
      if (
        forced.has(fromIndex)
        && fromIndex !== first
        && fromIndex !== last
      ) {
        interiors.push(fromIndex);
      }
      if (
        forced.has(toIndex)
        && toIndex !== first
        && toIndex !== last
        && toIndex !== fromIndex
      ) {
        interiors.push(toIndex);
      }
      for (
        var j = 0;
        j < room && j < interiors.length;
        j++
      ) {
        out.add(interiors[j]);
      }
      return Array.from(out).sort(function (a, b) {
        return a - b;
      });
    }

    var picked = new Set(forced);
    if (max >= 2) {
      for (var k = 0; k < max; k++) {
        if (picked.size >= max) break;
        var ci = Math.round(
          (k * (cands.length - 1)) / (max - 1),
        );
        picked.add(cands[ci]);
      }
    }
    if (picked.size < max) {
      for (var c = 0; c < cands.length; c++) {
        if (picked.size >= max) break;
        picked.add(cands[c]);
      }
    }
    return Array.from(picked).sort(function (a, b) {
      return a - b;
    });
  }
  var MEASURE_BOOT_PAGE_INIT = 'boot:page-init';
  function phaseBucket(name) {
    if (name.indexOf('boot:') === 0) return 'boot';
    if (name.indexOf('fetch:') === 0) return 'fetch';
    if (name.indexOf('render:') === 0) return 'render';
    return 'other';
  }
  // Residual page-init: wall minus nested fetch/render
  // so the stacked bar does not double-count.
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
    // Longest duration first; name break for stability.
    list.sort(function (a, b) {
      if (a.ms > b.ms) return -1;
      if (a.ms < b.ms) return 1;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    return { buckets: buckets, phases: list };
  }
  function sweepLabel(i) {
    var s = sweeps[i];
    var at = s.at.slice(0, 19).replace('T', ' ');
    return at + ' · ' + s.sha;
  }
  function fillSelectors() {
    var fromSel = document.getElementById('from-sel');
    var toSel = document.getElementById('to-sel');
    fromSel.innerHTML = '';
    toSel.innerHTML = '';
    for (var i = 0; i < sweeps.length; i++) {
      var o1 = document.createElement('option');
      o1.value = String(i);
      o1.textContent = sweepLabel(i);
      if (i === fromIndex) o1.selected = true;
      fromSel.appendChild(o1);
      var o2 = document.createElement('option');
      o2.value = String(i);
      o2.textContent = sweepLabel(i);
      if (i === toIndex) o2.selected = true;
      toSel.appendChild(o2);
    }
  }
  function renderSummary() {
    document.getElementById('summary').textContent =
      sweeps.length + ' sweep'
      + (sweeps.length === 1 ? '' : 's')
      + ' · payload v' + payload.version;
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
        focused = ev.currentTarget.dataset.page;
        renderAll();
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
  function renderKpis() {
    var e = currentEntry();
    var el = document.getElementById('kpis');
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
      deltaClass = ' delta-pos';
    } else if (e.deltaMs !== null && e.deltaMs < 0) {
      deltaClass = ' delta-neg';
    }
    el.innerHTML =
      '<div class="kpi"><div class="label">Page</div>'
      + '<div class="value">' + e.page
      + '</div></div>'
      + '<div class="kpi"><div class="label">'
      + 'Latest ready</div>'
      + '<div class="value">' + ready
      + '</div></div>'
      + '<div class="kpi"><div class="label">'
      + 'Δ from→to</div>'
      + '<div class="value' + deltaClass + '">'
      + delta + '</div></div>'
      + '<div class="kpi"><div class="label">'
      + 'Budget</div>'
      + '<div class="value">' + budget
      + '</div></div>';
  }
  function renderTrend() {
    var body = document.getElementById('focus-body');
    var page = focused;
    var xs = [];
    var ys = [];
    for (var i = 0; i < sweeps.length; i++) {
      var p = sweeps[i].pages[page];
      if (!p) continue;
      xs.push(i);
      ys.push(p.readyMs);
    }
    if (!ys.length) {
      body.innerHTML =
        '<p class="muted">No samples for this page.</p>';
      return;
    }
    var budget = budgets[page]
      ? budgets[page].readyMs
      : null;
    var unitVals = ys.slice();
    if (budget !== null) unitVals.push(budget);
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
    function xPos(idx) {
      if (sweeps.length === 1) {
        return padL + plotW / 2;
      }
      return padL
        + (idx / (sweeps.length - 1)) * plotW;
    }
    function yPos(ms) {
      var v = toAxis(ms, unit);
      var vmax = toAxis(yMax, unit);
      return padT + plotH - (v / vmax) * plotH;
    }
    var parts = [];
    parts.push(
      '<svg class="trend-svg" viewBox="0 0 '
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
    if (budget !== null) {
      var by = yPos(budget);
      parts.push(
        '<line x1="' + padL + '" x2="' + (w - padR)
        + '" y1="' + by + '" y2="' + by
        + '" stroke="#56b6c2" '
        + 'stroke-dasharray="4 3"/>',
      );
    }
    var d = '';
    for (var j = 0; j < xs.length; j++) {
      var px = xPos(xs[j]);
      var py = yPos(ys[j]);
      d += (j === 0 ? 'M' : 'L') + px + ' ' + py + ' ';
      parts.push(
        '<circle cx="' + px + '" cy="' + py
        + '" r="3.5" fill="#6ea8fe"/>',
      );
    }
    parts.push(
      '<path d="' + d
      + '" fill="none" stroke="#6ea8fe" '
      + 'stroke-width="2"/>',
    );
    var labelIdxs = trendLabelIndices(
      sweeps, page, fromIndex, toIndex,
    );
    for (var li = 0; li < labelIdxs.length; li++) {
      var xi = labelIdxs[li];
      parts.push(
        '<text x="' + xPos(xi) + '" y="' + (h - 12)
        + '" fill="#9aa6b2" font-size="9" '
        + 'text-anchor="middle">'
        + sweeps[xi].sha + '</text>',
      );
    }
    parts.push('</svg>');
    if (budget !== null) {
      parts.push(
        '<p class="muted">Dashed line = budget ceiling ('
        + formatDurationPerf(budget, false) + ').</p>',
      );
    }
    parts.push(
      '<p class="muted">Gaps mean the page was absent '
      + 'from that sweep (partial --pages).</p>',
    );
    body.innerHTML = parts.join('');
  }
  function renderPhase() {
    var body = document.getElementById('focus-body');
    var to = sweeps[toIndex];
    var pageData = to.pages[focused];
    if (!pageData) {
      body.innerHTML =
        '<p class="muted">No phase data in the '
        + '<strong>to</strong> sweep for this page.</p>';
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
        + '" title="' + name + '"></div>';
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
  function renderAll() {
    renderSummary();
    renderRank();
    renderKpis();
    renderFocus();
  }
  document.querySelectorAll('[data-sort]').forEach(
    function (btn) {
      btn.addEventListener('click', function () {
        sort = btn.getAttribute('data-sort');
        document.querySelectorAll('[data-sort]')
          .forEach(function (b) {
            b.setAttribute(
              'aria-selected',
              b === btn ? 'true' : 'false',
            );
          });
        renderAll();
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
        renderFocus();
      });
    },
  );
  document.getElementById('from-sel').addEventListener(
    'change',
    function (ev) {
      fromIndex = Number(ev.target.value);
      renderAll();
    },
  );
  document.getElementById('to-sel').addEventListener(
    'change',
    function (ev) {
      toIndex = Number(ev.target.value);
      renderAll();
    },
  );
  fillSelectors();
  renderAll();
})();
`.replace(/^\n/, '');
}
