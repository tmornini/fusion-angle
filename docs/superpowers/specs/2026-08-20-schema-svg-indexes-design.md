# SCHEMA.svg Index Details — Design

Date: 2026-08-20
Revised: 2026-08-20 (orthogonal id-to-id FK; sidecar
centered, straight mid-height connector)
Status: draft (brainstorm 2026-08-20; awaiting user
review)
Spec-only. No implementation in this document.

## Goal

`SCHEMA.svg` becomes the picture of the message-plane
tables **and** their indexes: physical Postgres
indexes, the `getWhere` allow-list, and the pair FK.
`SCHEMA.md` keeps doctrine and points at the picture
for columns, keys, and indexes.

## Context

`./generate-schema-svg` draws `requests` and
`responses` from `api/db.ts` + `api/types.ts`. It
does not read indexes. `TABLE_INDEXES` (`api/db.ts`)
is the `getWhere` allow-list. Physical indexes live
in `api/schema-postgres.ts` (`CREATE INDEX` plus
`PRIMARY KEY`). The pair FK
(`responses.id → requests.id`) is a table-level
`FOREIGN KEY` in that same DDL; both TypeScript `id`
fields are unbranded `Id`, so the name-convention
finder draws no edge.

`SCHEMA.md` restates column tables, getWhere lists,
and Postgres index lists — a third copy once the
picture carries them.

## User decisions

1. Picture both `TABLE_INDEXES` (getWhere) and
   `POSTGRES_INDEXES` (physical), visually
   distinguished.
2. Sidecar `indexes` box per table, to the right,
   vertically centered on the table. One straight
   horizontal connector through both mid-heights.
   Full physical form: method, columns or
   expression, opclass. Names drop the `{table}_`
   prefix (`address`, not `requests_address`).
3. Sidecar includes `pk btree` / `id`.
4. Colored `◆` on the table: one per sidecar index
   that names the column. Same color on the sidecar
   row. Rails are a grid flush right; empty cells
   stay empty so one vertical rail is one color.
5. No caption naming `TABLE_INDEXES` or `getWhere`.
6. getWhere mark is a larger `▸` (24px, names 11px)
   in its own column on the **left** of the names.
   Empty cells stay empty.
7. Parse existing sources (no structured
   `POSTGRES_INDEX_SPECS` refactor).
8. `SCHEMA.md`: replace column tables, getWhere
   lists, and Postgres index lists with a pointer at
   `SCHEMA.svg`. Keep doctrine. Fold table-cell-only
   notes into surrounding prose.
9. Draw `responses.id → requests.id`. Orthogonal
   polyline (straight segments, right angles) from
   the child `id` row to the parent `id` row, on
   the **left** of the tables so it does not cross
   sidecars. Arrow at the parent row. Source is
   parsed `FOREIGN KEY` DDL. Not a bezier, not box
   midpoints.

## Picture

### Table box

Left to right on each column row:

1. getWhere rail (`▸` or empty)
2. column name (pk still bold)
3. display type, end-anchored just left of the `◆`
   grid
4. `◆` rails, sidecar order left to right, grid
   flush to the right inset

`▸` is 24px, weight 700, fill `hsl(217 36% 46%)`.
Names and types stay 11px.

A column participates in a sidecar index if it is a
key of that index, or an identifier in the index
expression that matches a column of that table
(`message_body(message)` → `message`).

`responses.id` is pk (bold) and the FK source. The
left-side edge is the FK. Do not italic the name.

### Sidecar

Header `indexes` (lighter than the table head:
`hsl(217 28% 62%)`). Rows, DDL order after pk:

- left: colored `◆` then `{name} {method}` and
  opclass when present (`body gin jsonb_path_ops`)
- right: column list or expression without the
  opclass (`message_body(message)`)

`pk` is first, `btree`, column `id`, `◆` bold like
the pk name.

Default method is `btree` when `USING` is absent. If
`CREATE UNIQUE INDEX` appears later, keep `unique`
in the method cluster. None exist today.

### Color

Named `hsl(...)` palette, keyed by **stripped
name**, so both tables share `pk` / `address` /
`collection`:

| suffix | fill |
|---|---|
| pk | `hsl(217 45% 15%)` |
| address | `hsl(217 36% 46%)` |
| collection | `hsl(173 42% 32%)` |
| replay | `hsl(32 70% 42%)` |
| version | `hsl(270 35% 42%)` |
| body | `hsl(350 48% 44%)` |

An unknown stripped name fails the run. Adding an
index means adding a row to this table. Colors do
not reshuffle.

### FK edge

Orthogonal polyline on the left: child `id` row
left edge → left rail → parent `id` row left edge.
Arrow at the parent. Pad the canvas so the rail
is inside the viewBox. Attach to the column rows
named by the `FOREIGN KEY`, never to box
midpoints.

### Sidecar connector

Vertically center the sidecar on its table so both
halfway points share a Y. One straight horizontal
line from table right-edge mid-height to sidecar
left-edge mid-height. No dogleg, no diagonal.

### Layout

Rank layout unchanged (FK-depth columns, wrap at
`MAX_PER_COL`). Each slot is table + sidecar.
Slot height is `max(table, sidecar)`. Sidecar Y is
table Y plus half the leftover height. Table width
grows with the `▸` rail and the `◆` rail count.

## Parse

Text parse, same rite as today's `TABLE_NAMES` /
`DbStores` / entity fields. New source:
`api/schema-postgres.ts`.

### `TABLE_INDEXES` (`api/db.ts`)

Parse the const. Accept `'column'` and
`{ column: '…', unique: true }`. `unique` on this
list is not a sidecar mark — it is the getWhere
allow-list only. `▸` those columns. A table absent
from `TABLE_INDEXES` has no `▸`. Missing const fails
the run.

### DDL (`api/schema-postgres.ts`)

Skip `DROP INDEX`.

`PRIMARY KEY` on a `CREATE TABLE` column → sidecar
`pk btree` / that column. A pictured table with no
`PRIMARY KEY` fails the run.

Each `CREATE INDEX IF NOT EXISTS {name} ON {table}`
→ one sidecar row, DDL order. Match nested parens
in the key list (GIN expressions). `USING {method}`
is the method; omit means `btree`. Trailing
identifier inside the key parens is the opclass.

Display name strips `{table}_`. Missing prefix
fails the run. Index table not in `TABLE_NAMES`
fails the run. Parsed `CREATE INDEX` count must
equal `CREATE INDEX` count. Partial parse does not
emit a picture.

`FOREIGN KEY ({cols}) REFERENCES {table} ({cols})`
→ edges. Today: `responses.id → requests.id`.
`requester_identity_id` is not a live FK (no
`identities` table) and gets no edge. Edges come
from this DDL, not from `FK_SPECIAL` /
`BRAND_TABLE` / `_id` name convention.

## SCHEMA.md

Keep message-plane doctrine, orphan-stores residual,
timestamp width, Operation-ID / ETag / validator
prose, derived families, alphabets, history map.

Under `### requests` and `### responses`: delete the
column table, the getWhere list, and the Postgres
index list. One sentence in their place: columns,
keys, and indexes live in `SCHEMA.svg`. Fold any
note that lived only in a table cell into the
surrounding paragraph (e.g. method: no GET rows).

The top note already names the generator. It also
says the picture is columns, keys, and indexes.

Header comment in `generate-schema-svg.ts` and the
`CLAUDE.md` schema-of-record line add
`api/schema-postgres.ts`.

## Errors and checks

The generator throws (so `--check` and `./validate`
fail) on any parse failure named above. `--check`
remains a byte compare of `SCHEMA.svg`. After
implementation, regenerate the committed SVG. No
new test file: the generator stays a Node picture
script; the gate is `--check`.

## Out of scope

- `schema_marker`
- Refactoring `POSTGRES_INDEXES` into a typed spec
- Deleting `SCHEMA.md`
- Colored edges from column `◆` to sidecar row
  (color match is the link)
- Cleaning leftover `FK_SPECIAL` target names
- `generate-api-documentation`

## Files

| File | Change |
|---|---|
| `web-app/app/generate-schema-svg.ts` | Parse and draw |
| `SCHEMA.svg` | Regenerated |
| `SCHEMA.md` | Physical lists → pointer at `SCHEMA.svg` |
| `CLAUDE.md` | Schema-of-record line includes `schema-postgres.ts` |
