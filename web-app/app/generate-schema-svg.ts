// Read the schema of record and write or `--check`
// SCHEMA.svg. Picture logic lives in schema-svg.ts.
import { renderSchemaSvg } from './schema-svg.ts';

const TYPES_PATH = 'api/types.ts';
const DB_PATH = 'api/db.ts';
const SCHEMA_PATH = 'api/schema-postgres.ts';
const SVG_PATH = 'SCHEMA.svg';
const enc = new TextEncoder();

const svg = renderSchemaSvg({
    typesSrc: Deno.readTextFileSync(TYPES_PATH),
    dbSrc: Deno.readTextFileSync(DB_PATH),
    schemaSrc: Deno.readTextFileSync(SCHEMA_PATH),
});
if (Deno.args.includes('--check')) {
    let current = '';
    try {
        current = Deno.readTextFileSync(SVG_PATH);
    } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) {
            throw error;
        }
    }
    if (current !== svg) {
        Deno.stderr.writeSync(enc.encode(
            'SCHEMA.svg is stale — run '
            + './generate-schema-svg\n',
        ));
        Deno.exit(1);
    }
    Deno.stdout.writeSync(enc.encode(
        'SCHEMA.svg is up to date\n',
    ));
} else {
    Deno.writeTextFileSync(SVG_PATH, svg);
    Deno.stdout.writeSync(enc.encode(
        'wrote ' + SVG_PATH + '\n',
    ));
}
