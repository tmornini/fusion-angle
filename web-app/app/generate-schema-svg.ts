// Read the schema of record and write or `--check`
// SCHEMA.svg. Picture logic lives in schema-svg.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { renderSchemaSvg } from './schema-svg.ts';

const TYPES_PATH = 'api/types.ts';
const DB_PATH = 'api/db.ts';
const SCHEMA_PATH = 'api/schema-postgres.ts';
const SVG_PATH = 'SCHEMA.svg';

const svg = renderSchemaSvg({
    typesSrc: readFileSync(TYPES_PATH, 'utf8'),
    dbSrc: readFileSync(DB_PATH, 'utf8'),
    schemaSrc: readFileSync(SCHEMA_PATH, 'utf8'),
});
if (process.argv.includes('--check')) {
    let current = '';
    try {
        current = readFileSync(SVG_PATH, 'utf8');
    } catch {
        current = '';
    }
    if (current !== svg) {
        process.stderr.write(
            'SCHEMA.svg is stale — run '
            + './generate-schema-svg\n',
        );
        process.exit(1);
    }
    process.stdout.write('SCHEMA.svg is up to date\n');
} else {
    writeFileSync(SVG_PATH, svg);
    process.stdout.write('wrote ' + SVG_PATH + '\n');
}
