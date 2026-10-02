#!/bin/sh
# Medians of seven warm runs (eight, drop the first).
# fa-gin-probe is removed on exit, including failure.
# The path literal stays in the prepared statement so
# the partial index can be proved. A subquery cannot
# be an EXECUTE parameter, so the arguments are
# function expressions. The organization id is read
# inside the function, never written into the text.
set -eu
cd "$(dirname "$0")" || exit 1
name=fa-gin-probe
scratch=$(mktemp -d /tmp/fa-gin-probe.XXXXXX)
cleanup() {
    docker rm -f "$name" >/dev/null 2>&1 || true
    rm -rf "$scratch"
}
trap cleanup EXIT

running=$(
    docker inspect -f '{{.State.Running}}' "$name" \
        2>/dev/null || true
)
if [ "$running" != "true" ]; then
    sh ./setup.sh
fi

echo "=== environment ==="
docker exec "$name" postgres --version

run_sql() {
    docker exec -i "$name" \
        psql -U postgres -d probe \
        -v ON_ERROR_STOP=1 "$@" -f -
}

awk '
    BEGIN { keep = 1 }
    /^-- gin-probe-insert$/ { keep = 0 }
    keep { print }
' seed.sql > "$scratch/schema.sql"
if ! run_sql < "$scratch/schema.sql" \
    > "$scratch/schema.out" 2>&1
then
    cat "$scratch/schema.out" >&2
    exit 1
fi

awk '
    BEGIN { keep = 0 }
    /^-- gin-probe-insert$/ { keep = 1; next }
    keep { print }
' seed.sql > "$scratch/insert.sql"

cat > "$scratch/seam.sql" <<'END_SEAM'
SELECT heads.id, heads.operation_id, heads.path,
    heads.name, heads.supersedes,
    heads.requester_identity_id, heads.method,
    to_char(response_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        AS response_at,
    heads.request, heads.request_salt,
    heads.request_hash,
    heads.request_secrets, heads.request_secrets_hash,
    heads.response, heads.response_salt,
    heads.response_hash,
    heads.response_secrets,
    heads.response_secrets_hash,
    heads.pair_hash
FROM (
    SELECT DISTINCT ON (head.name) head.*
    FROM fa_message_pairs head
    WHERE head.path = '/invitations/'
      AND head.path = $1
      AND head.method IN ('PUT', 'DELETE')
      AND head.name IN (
          SELECT version.name
          FROM fa_message_pairs version
          WHERE version.path = '/invitations/'
            AND version.path = $1
            AND fa_message_body_json(version.response)
                @> $2::jsonb
      )
    ORDER BY head.name, head.response_at DESC,
        head.id DESC
) heads
WHERE heads.method = 'PUT'
ORDER BY heads.response_at, heads.id
END_SEAM

{
    echo 'TRUNCATE fa_message_pairs;'
    echo 'EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)'
    cat "$scratch/insert.sql"
} > "$scratch/insert-explain.sql"

plan_ok() {
    kind=$1
    out=$2
    if [ "$kind" = insert ]; then
        if grep -q 'rows=10000.00' "$out"; then
            return 0
        fi
        return 1
    fi
    if [ "$kind" = noindex ]; then
        if grep -q 'fa_message_pairs_body' "$out"; then
            return 1
        fi
        if grep -q 'rows=10000.00' "$out"; then
            return 0
        fi
        return 1
    fi
    if [ "$kind" = index ]; then
        if grep -q 'Seq Scan' "$out"; then
            return 1
        fi
        if grep -q 'Bitmap Index Scan' "$out" \
            && grep -q 'fa_message_pairs_body' "$out" \
            && grep -q 'rows=100.00' "$out"
        then
            return 0
        fi
        return 1
    fi
    if [ "$kind" = seq ]; then
        if grep -q 'fa_message_pairs_body' "$out"; then
            return 1
        fi
        if grep -q 'Bitmap' "$out"; then
            return 1
        fi
        if grep -q 'Index Scan' "$out"; then
            return 1
        fi
        if grep -q 'Seq Scan' "$out" \
            && grep -q 'rows=100.00' "$out"
        then
            return 0
        fi
        return 1
    fi
    return 1
}

med_exec() {
    label=$1
    file=$2
    kind=$3
    : > "$scratch/times.txt"
    i=0
    while [ "$i" -lt 8 ]; do
        if ! run_sql < "$file" > "$scratch/out.txt" 2>&1
        then
            echo "FAIL $label" >&2
            cat "$scratch/out.txt" >&2
            return 1
        fi
        if [ "$i" -eq 0 ]; then
            cp "$scratch/out.txt" "$scratch/first.txt"
            if ! plan_ok "$kind" "$scratch/first.txt"
            then
                echo "FAIL $label plan" >&2
                cat "$scratch/first.txt" >&2
                return 1
            fi
        fi
        awk '/Execution Time:/ { print $3 }' \
            "$scratch/out.txt" >> "$scratch/times.txt"
        i=$((i + 1))
    done
    count=$(wc -l < "$scratch/times.txt" | tr -d ' ')
    if [ "$count" -ne 8 ]; then
        echo "FAIL $label times $count" >&2
        cat "$scratch/out.txt" >&2
        return 1
    fi
    echo "--- $label plan ---"
    cat "$scratch/first.txt"
    awk -v label="$label" '
        { t[++n] = $1 + 0 }
        END {
            m = 0
            for (i = 2; i <= n; i++) v[++m] = t[i]
            for (i = 1; i <= m; i++)
                for (j = i + 1; j <= m; j++)
                    if (v[j] < v[i]) {
                        x = v[i]
                        v[i] = v[j]
                        v[j] = x
                    }
            printf "warm"
            for (i = 1; i <= m; i++)
                printf " %.3f", v[i]
            printf "\n"
            printf \
                "%-22s median %8.3f ms  min %8.3f  max %8.3f\n",
                label, v[int((m + 1) / 2)], v[1], v[m]
        }
    ' "$scratch/times.txt"
}

view_sql() {
    mode=$1
    {
        if [ "$mode" = seq ]; then
            echo 'SET enable_bitmapscan = off;'
            echo 'SET enable_indexscan = off;'
        fi
        echo 'PREPARE containing_heads (text, jsonb) AS'
        cat "$scratch/seam.sql"
        echo ';'
        cat <<'EOF'
CREATE OR REPLACE FUNCTION fa_gin_probe_path()
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURN '/invitations/';
CREATE OR REPLACE FUNCTION fa_gin_probe_contains()
RETURNS jsonb
LANGUAGE sql
STABLE
RETURN (
    SELECT jsonb_build_object(
        'organization_id',
        split_part(name, ':', 1)
    )
    FROM fa_message_pairs
    WHERE path = '/invitations/'
    ORDER BY name
    LIMIT 1
);
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
EXECUTE containing_heads(
    fa_gin_probe_path(),
    fa_gin_probe_contains()
);
EOF
    } > "$scratch/view-$mode.sql"
}

echo "=== insert with index ==="
med_exec insert-with-index \
    "$scratch/insert-explain.sql" insert

echo "=== analyze ==="
printf '%s\n' 'ANALYZE fa_message_pairs;' | run_sql -q

echo "=== sizes ==="
cat <<'EOF' | run_sql -At
SELECT 'table_bytes',
    pg_relation_size('fa_message_pairs');
SELECT 'index_bytes',
    pg_relation_size('fa_message_pairs_body');
EOF

view_sql index
view_sql seq
echo "=== view with index ==="
med_exec view-index "$scratch/view-index.sql" index
echo "=== view sequential ==="
med_exec view-sequential "$scratch/view-seq.sql" seq

echo "=== drop index ==="
printf '%s\n' 'DROP INDEX fa_message_pairs_body;' \
    | run_sql -q

echo "=== insert without index ==="
med_exec insert-without-index \
    "$scratch/insert-explain.sql" noindex

echo "=== recreate index ==="
cat <<'EOF' | run_sql -q
CREATE INDEX IF NOT EXISTS fa_message_pairs_body
    ON fa_message_pairs
    USING gin (fa_message_body_json(response)
        jsonb_path_ops)
    WHERE path = '/invitations/';
EOF
echo "index recreated"
