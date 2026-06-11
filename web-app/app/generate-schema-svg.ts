// Derive SCHEMA.svg — the entity-relationship diagram — from the
// schema of record: api/db.ts (the DbStores store map, whose
// property names are the tables) and api/types.ts (the entity
// interfaces, whose fields are the columns and whose *_id fields
// are the foreign keys). The schema is the source; this emits a
// picture of it. Run via ./generate-schema-svg [--check].
//
// Dev tooling, like compose.ts: run with `node --strip-types`,
// excluded from tsc (Node APIs, no @types/node), kept under the
// 78-char lint.
// Output is deterministic — no clocks, no randomness, stable
// ordering — so `--check` can gate staleness in ./validate.
import { readFileSync, writeFileSync } from 'node:fs';

const TYPES_PATH = 'api/types.ts';
const DB_PATH = 'api/db.ts';
const SVG_PATH = 'SCHEMA.svg';

interface Column {
    name: string;
    type: string;
    fk: string | null;
    pk: boolean;
}

interface Table {
    name: string;
    entity: string;
    columns: Column[];
}

// _id columns whose target table the name convention cannot
// reach: field_id points at record_attributes (the column name
// predates Records); state_event_id points at states.
const FK_SPECIAL: Record<string, string> = {
    field_id: 'record_attributes',
    state_event_id: 'states',
};

// Branded id types that name their home table. A detail row whose
// own `id` carries one of these is a shared-primary-key reference
// to that parent (human_members.id: MemberId -> members).
const BRAND_TABLE: Record<string, string> = {
    MemberId: 'members',
    RecordId: 'records',
    RecordAttributeId: 'record_attributes',
    FlowRecordId: 'flow_records',
    ObjectiveId: 'objectives',
};

function sliceBlock(src: string, opener: string): string {
    const start = src.indexOf(opener);
    if (start < 0) throw new Error('not found: ' + opener);
    const from = src.indexOf('{', start);
    let depth = 0;
    for (let i = from; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(from + 1, i);
        }
    }
    throw new Error('unterminated: ' + opener);
}

function camelToSnake(s: string): string {
    return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

function parseTableNames(src: string): string[] {
    const at = src.indexOf('TABLE_NAMES = [');
    const arr = src.slice(at, src.indexOf(']', at));
    const names: string[] = [];
    const re = /'([a-z_]+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(arr)) !== null) names.push(m[1]!);
    return names;
}

function parseStores(
    src: string,
): { table: string; entity: string }[] {
    const flat = sliceBlock(
        src, 'export interface DbStores {',
    ).replace(/\s+/g, ' ');
    const out: { table: string; entity: string }[] = [];
    const reStore = new RegExp(
        '(\\w+)\\s*:\\s*'
        + '(?:EntityStore|SingletonStore)\\s*<\\s*(\\w+)\\s*>',
        'g',
    );
    let m: RegExpExecArray | null;
    while ((m = reStore.exec(flat)) !== null) {
        out.push({ table: camelToSnake(m[1]!), entity: m[2]! });
    }
    const reState = /(\w+)\s*:\s*StateStore\b/g;
    while ((m = reState.exec(flat)) !== null) {
        out.push({
            table: camelToSnake(m[1]!),
            entity: 'StateEntity',
        });
    }
    return out;
}

function parseFields(
    src: string, entity: string,
): { name: string; type: string }[] {
    const body = sliceBlock(
        src, 'export interface ' + entity + ' {',
    );
    const fields: { name: string; type: string }[] = [];
    for (const raw of body.split('\n')) {
        const line = raw.trim();
        if (line === '' || line.startsWith('//')) continue;
        const m = line.match(/^(\w+)\s*:\s*([^;]+);/);
        if (m) fields.push({ name: m[1]!, type: m[2]!.trim() });
    }
    return fields;
}

function displayType(type: string): string {
    if (/Id$/.test(type)) return 'id';
    if (type === 'string') return 'text';
    if (type === 'number') return 'num';
    if (type === 'boolean') return 'bool';
    if (/^Json/.test(type)) return 'json';
    return type;
}

function fkTarget(
    col: string, type: string, table: string,
    tables: Set<string>,
): string | null {
    if (col === 'id') {
        const t = BRAND_TABLE[type];
        return t && t !== table ? t : null;
    }
    if (!col.endsWith('_id')) return null;
    const special = FK_SPECIAL[col];
    if (special) return special;
    const target = col.slice(0, -3) + 's';
    return tables.has(target) ? target : null;
}

function buildModel(): Table[] {
    const typesSrc = readFileSync(TYPES_PATH, 'utf8');
    const dbSrc = readFileSync(DB_PATH, 'utf8');
    const tableNames = parseTableNames(dbSrc);
    const tableSet = new Set(tableNames);
    const stores = parseStores(dbSrc);

    const parsed = new Set(stores.map((s) => s.table));
    for (const t of tableNames) {
        if (!parsed.has(t)) {
            throw new Error('no store parsed for table: ' + t);
        }
    }
    if (parsed.size !== tableNames.length) {
        throw new Error('store/table count mismatch');
    }

    return stores.map((s) => ({
        name: s.table,
        entity: s.entity,
        columns: parseFields(typesSrc, s.entity).map((f) => ({
            name: f.name,
            type: displayType(f.type),
            fk: fkTarget(f.name, f.type, s.table, tableSet),
            pk: f.name === 'id',
        })),
    }));
}

// Rank each table by its longest foreign-key chain: roots (no
// outgoing FK) sit at rank 0, their referrers at rank 1, and so
// on. Relaxation is capped at one pass per table so any cycle
// resolves to a finite, deterministic rank rather than looping.
function computeRanks(tables: Table[]): Map<string, number> {
    const refs = new Map<string, string[]>();
    for (const t of tables) {
        const out = t.columns
            .filter((c) => c.fk && c.fk !== t.name)
            .map((c) => c.fk!);
        refs.set(t.name, [...new Set(out)]);
    }
    const rank = new Map<string, number>();
    for (const t of tables) rank.set(t.name, 0);
    for (let i = 0; i < tables.length; i++) {
        let changed = false;
        for (const t of tables) {
            let best = 0;
            for (const r of refs.get(t.name)!) {
                best = Math.max(best, (rank.get(r) ?? 0) + 1);
            }
            if (best > rank.get(t.name)!) {
                rank.set(t.name, best);
                changed = true;
            }
        }
        if (!changed) break;
    }
    return rank;
}

const BOX_W = 208;
const HEADER_H = 26;
const ROW_H = 18;
const TEXT_INSET_X = 10;
const HEADER_BASELINE_Y = 18;
const ROW_BASELINE_Y = 13;
const COL_GAP = 96;
const ROW_GAP = 30;
const PAD = 40;
const MAX_PER_COL = 6;

function boxHeight(t: Table): number {
    return HEADER_H + t.columns.length * ROW_H;
}

interface Placed {
    table: Table;
    x: number;
    y: number;
    h: number;
}

function layout(tables: Table[]): {
    placed: Map<string, Placed>;
    width: number;
    height: number;
} {
    const rank = computeRanks(tables);
    const byRank = new Map<number, Table[]>();
    for (const t of tables) {
        const r = rank.get(t.name)!;
        (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(t);
    }
    for (const list of byRank.values()) {
        list.sort((a, b) => (a.name < b.name ? -1 : 1));
    }
    const ranks = [...byRank.keys()].sort((a, b) => a - b);
    const placed = new Map<string, Placed>();
    let bottom = 0;
    let vcol = 0;
    // A whole rank can hold many tables; wrap each into stacks of
    // at most MAX_PER_COL so the diagram stays a balanced
    // landscape while columns still read left-to-right by FK depth.
    for (const r of ranks) {
        const list = byRank.get(r)!;
        for (let i = 0; i < list.length; i += MAX_PER_COL) {
            const x = PAD + vcol * (BOX_W + COL_GAP);
            let y = PAD;
            for (const t of list.slice(i, i + MAX_PER_COL)) {
                const h = boxHeight(t);
                placed.set(t.name, { table: t, x, y, h });
                y += h + ROW_GAP;
            }
            bottom = Math.max(bottom, y - ROW_GAP);
            vcol++;
        }
    }
    const width =
        PAD * 2 + vcol * BOX_W + (vcol - 1) * COL_GAP;
    return { placed, width, height: bottom + PAD };
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderBox(p: Placed, parts: string[]): void {
    const { table: t, x, y, h } = p;
    parts.push(
        `  <g class="table">`,
        `    <rect class="box" x="${x}" y="${y}" `
        + `width="${BOX_W}" height="${h}" rx="6" />`,
        `    <rect class="head" x="${x}" y="${y}" `
        + `width="${BOX_W}" height="${HEADER_H}" rx="6" />`,
        `    <text class="thead" x="${x + TEXT_INSET_X}" `
        + `y="${y + HEADER_BASELINE_Y}">${esc(t.name)}</text>`,
    );
    t.columns.forEach((c, i) => {
        const cy = y + HEADER_H + i * ROW_H
            + ROW_BASELINE_Y;
        const cls = c.pk ? 'pk' : c.fk ? 'fk' : 'col';
        parts.push(
            `    <text class="${cls}" x="${x + TEXT_INSET_X}" `
            + `y="${cy}">${esc(c.name)}</text>`,
            `    <text class="type" x="${x
            + BOX_W - TEXT_INSET_X}" `
            + `y="${cy}">${esc(c.type)}</text>`,
        );
    });
    parts.push(`  </g>`);
}

function renderEdge(
    from: Placed, to: Placed, parts: string[],
): void {
    const fc = from.y + from.h / 2;
    const tc = to.y + to.h / 2;
    let sx: number;
    let tx: number;
    let dir: number;
    if (to.x < from.x) {
        sx = from.x;
        tx = to.x + BOX_W;
        dir = -1;
    } else if (to.x > from.x) {
        sx = from.x + BOX_W;
        tx = to.x;
        dir = 1;
    } else {
        sx = from.x + BOX_W;
        tx = to.x + BOX_W;
        dir = 1;
    }
    const k = COL_GAP * 0.6 * dir;
    parts.push(
        `  <path class="edge" d="M ${sx} ${fc} `
        + `C ${sx + k} ${fc}, ${tx - k} ${tc}, `
        + `${tx} ${tc}" />`,
    );
}

const STYLE = [
    '    <style>',
    '      text { font-family: ui-sans-serif, system-ui,',
    "        'Segoe UI', Helvetica, Arial, sans-serif; }",
    '      .box { fill: hsl(0 0% 100%);',
    '        stroke: hsl(217 30% 88%); stroke-width: 1; }',
    '      .head { fill: hsl(217 36% 46%); }',
    '      .thead { fill: hsl(0 0% 100%); font-size: 12px;',
    '        font-weight: 700; }',
    '      .col, .pk, .fk, .type { font-size: 11px; }',
    '      .col { fill: hsl(217 45% 15%); }',
    '      .pk { fill: hsl(217 45% 15%); font-weight: 700; }',
    '      .fk { fill: hsl(217 38% 38%);',
    '        font-style: italic; }',
    '      .type { fill: hsl(217 12% 55%);',
    '        text-anchor: end; }',
    '      .edge { fill: none; stroke: hsl(217 34% 60%);',
    '        stroke-width: 1.5; }',
    '    </style>',
];

function render(): string {
    const tables = buildModel();
    const { placed, width, height } = layout(tables);
    const parts: string[] = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" `
        + `viewBox="0 0 ${width} ${height}" `
        + `width="${width}" height="${height}">`,
        '  <defs>',
        ...STYLE,
        '  </defs>',
        `  <rect x="0" y="0" width="${width}" `
        + `height="${height}" fill="hsl(217 30% 97%)" />`,
    );
    for (const t of tables) {
        for (const c of t.columns) {
            if (!c.fk || c.fk === t.name) continue;
            const to = placed.get(c.fk);
            if (to) renderEdge(placed.get(t.name)!, to, parts);
        }
    }
    for (const t of tables) renderBox(placed.get(t.name)!, parts);
    parts.push('</svg>', '');
    return parts.join('\n');
}

const svg = render();
if (process.argv.includes('--check')) {
    let current = '';
    try {
        current = readFileSync(SVG_PATH, 'utf8');
    } catch {
        current = '';
    }
    if (current !== svg) {
        process.stderr.write(
            'SCHEMA.svg is stale — run ./generate-schema-svg\n',
        );
        process.exit(1);
    }
    process.stdout.write('SCHEMA.svg is up to date\n');
} else {
    writeFileSync(SVG_PATH, svg);
    process.stdout.write('wrote ' + SVG_PATH + '\n');
}
