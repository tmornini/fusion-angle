// The one ledger INSERT. Fourteen binds per row follow
// the attempt class in $1. A row this statement inserts
// is not visible to its own head read.

const NIL_UUID =
    "'00000000-0000-0000-0000-000000000000'::uuid";

const CAST = [
    'uuid', 'uuid', 'text', 'text', 'text', 'text',
    'bytea', 'bytea', 'bytea', 'bytea', 'bytea',
    'bytea', 'uuid', 'text',
] as const;

// $1 is the attempt class. Each row's binds follow it.
export const LEADING_PARAMETERS = 1;
export const PARAMETERS_PER_ROW = CAST.length;

const STAMP_TEXT =
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

function tuples(rowCount: number): string {
    const rows: string[] = [];
    for (let row = 0; row < rowCount; row++) {
        const binds: string[] = [];
        for (let field = 0; field < CAST.length; field++) {
            const n = LEADING_PARAMETERS + 1
                + row * PARAMETERS_PER_ROW + field;
            binds.push(
                '$' + String(n) + '::' + CAST[field]!,
            );
        }
        rows.push(
            '        (' + String(row + 1) + ',\n'
            + '            ' + binds.slice(0, 4).join(', ')
            + ',\n'
            + '            ' + binds.slice(4, 8).join(', ')
            + ',\n'
            + '            ' + binds.slice(8, 12).join(', ')
            + ',\n'
            + '            ' + binds.slice(12).join(', ')
            + ')',
        );
    }
    return rows.join(',\n');
}

export function statementText(rowCount: number): string {
    if (rowCount < 1) {
        throw new Error(
            'ledger statement requires a row',
        );
    }
    return [
        'WITH input AS (',
        '    SELECT * FROM (VALUES',
        tuples(rowCount),
        '    ) AS v(',
        '        ord, id, operation_id, path, name,',
        '        requester_identity_id, method,',
        '        request, request_salt, secret,',
        '        response_prefix, response_suffix,',
        '        response_salt, if_match, notify',
        '    )',
        '),',
        'headed AS (',
        '    SELECT i.*,',
        '        h.id AS head_id,',
        '        h.response_at AS head_response_at,',
        '        h.response AS head_response,',
        '        h.method AS head_method',
        '    FROM input i',
        '    LEFT JOIN LATERAL (',
        '        SELECT id, response_at, response, method',
        '        FROM fa_message_pairs',
        '        WHERE path = i.path',
        '          AND name = i.name',
        "          AND method IN ('PUT', 'DELETE')",
        '        ORDER BY response_at DESC, id DESC',
        '        LIMIT 1',
        '    ) h ON true',
        '),',
        'stamped AS (',
        '    SELECT h.*,',
        '        CASE',
        '            WHEN h.head_id IS NULL',
        "                AND $1::text = 'blind'",
        '            THEN clock_timestamp()',
        '            ELSE greatest(',
        '                clock_timestamp(),',
        '                h.head_response_at',
        "                    + interval '1 microsecond'",
        '            )',
        '        END AS stamp',
        '    FROM headed h',
        '),',
        'spliced AS (',
        '    SELECT s.*,',
        '        CASE',
        "            WHEN s.method <> 'PUT'",
        '                OR s.head_id IS NULL',
        "                OR s.head_method = 'DELETE'",
        '            THEN s.response_prefix',
        '            ELSE overlay(',
        '                s.response_prefix',
        "                PLACING '200'::bytea FROM 10 FOR 3",
        '            )',
        '        END',
        '            || convert_to(',
        "                fa_imf_fixdate(s.stamp), 'UTF8'",
        '            )',
        '            || s.response_suffix AS response,',
        '        COALESCE(s.head_id, ' + NIL_UUID + ')',
        '            AS supersedes',
        '    FROM stamped s',
        '),',
        'hashed AS (',
        '    SELECT sp.*,',
        '        sha256(sp.request_salt || sp.request)',
        '            AS request_hash,',
        '        sha256(sp.secret) AS secret_hash,',
        '        sha256(sp.response_salt || sp.response)',
        '            AS response_hash',
        '    FROM spliced sp',
        '),',
        'rooted AS (',
        '    SELECT hs.*,',
        '        fa_pair_root(',
        '            hs.id, hs.operation_id,',
        '            hs.path, hs.name, hs.supersedes,',
        '            hs.requester_identity_id,',
        '            hs.method, hs.stamp,',
        '            hs.request_hash, hs.secret_hash,',
        '            hs.response_hash',
        '        ) AS pair_hash',
        '    FROM hashed hs',
        '),',
        'classed AS (',
        '    SELECT r.*,',
        '        CASE',
        '            WHEN r.if_match = ' + NIL_UUID,
        "                AND r.head_method = 'PUT'",
        "            THEN 'stale'",
        '            WHEN r.if_match = ' + NIL_UUID,
        "            THEN 'land'",
        '            WHEN r.if_match IS NOT NULL',
        '                AND (',
        '                    r.head_id IS NULL',
        '                    OR r.head_id',
        '                        IS DISTINCT FROM r.if_match',
        '                )',
        "            THEN 'stale'",
        '            WHEN r.head_id IS NOT NULL',
        '                AND fa_message_body_bytes(',
        '                    r.head_response',
        '                ) = fa_message_body_bytes(',
        '                    r.response',
        '                )',
        "            THEN 'matched'",
        "            ELSE 'land'",
        '        END AS raw_outcome',
        '    FROM rooted r',
        '),',
        'reported AS (',
        '    SELECT c.*,',
        '        CASE',
        '            WHEN bool_or(',
        "                c.raw_outcome = 'stale'",
        '            ) OVER ()',
        "            THEN 'stale'",
        '            WHEN bool_or(',
        "                c.raw_outcome = 'matched'",
        '            ) OVER ()',
        "            THEN 'matched'",
        "            ELSE 'land'",
        '        END AS outcome',
        '    FROM classed c',
        '),',
        'inserted AS (',
        '    INSERT INTO fa_message_pairs (',
        '        id, operation_id, path, name, supersedes,',
        '        requester_identity_id, method,',
        '        response_at,',
        '        request, request_salt, request_hash,',
        '        secret, secret_hash,',
        '        response, response_salt, response_hash,',
        '        pair_hash',
        '    )',
        '    SELECT',
        '        id, operation_id, path, name, supersedes,',
        '        requester_identity_id, method, stamp,',
        '        request, request_salt, request_hash,',
        '        secret, secret_hash,',
        '        response, response_salt, response_hash,',
        '        pair_hash',
        '    FROM reported',
        '    WHERE NOT EXISTS (',
        '        SELECT 1 FROM classed bad',
        "        WHERE bad.raw_outcome <> 'land'",
        '    )',
        '    RETURNING id',
        '),',
        'notified AS (',
        '    SELECT pg_notify(',
        "        'fusion_events', src.notify",
        '    ) AS sent',
        '    FROM inserted ins',
        '    JOIN input src ON src.id = ins.id',
        ')',
        'SELECT',
        '    rep.id,',
        '    rep.path,',
        '    rep.name,',
        '    rep.method,',
        '    rep.outcome,',
        '    rep.raw_outcome,',
        '    to_char(',
        "        rep.stamp AT TIME ZONE 'UTC',",
        "        '" + STAMP_TEXT + "'",
        '    ) AS stamp,',
        '    rep.response,',
        '    rep.head_id,',
        '    rep.head_response,',
        '    rep.supersedes,',
        "    encode(rep.request_hash, 'hex')",
        '        AS request_hash,',
        "    encode(rep.secret_hash, 'hex')",
        '        AS secret_hash,',
        "    encode(rep.response_hash, 'hex')",
        '        AS response_hash,',
        "    encode(rep.pair_hash, 'hex')",
        '        AS pair_hash',
        'FROM reported rep',
        'CROSS JOIN (',
        '    SELECT count(*) AS n FROM notified',
        ')',
        'ORDER BY rep.ord',
    ].join('\n');
}
