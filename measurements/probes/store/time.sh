#!/bin/sh
# Item 0, decision 2. Median of 7 EXPLAIN ANALYZE execution
# times after one warmup. Each insert rolls back.
# Container fa-store-probe, database probe, Postgres 18.6,
# tmpfs on /var/lib/postgresql. Load with setup.sql first.
# $1 label  $2 sql-file  $3 ident  $4 path  $5 name
cd "$(dirname "$0")" || exit 1
med() {
    label=$1
    file=$2
    ident=$3
    path=$4
    name=$5
    {
        printf '%s\n' "\\set path '$path'" "\\set name '$name'" \
            "\\set ident $ident"
        echo 'BEGIN;'
        echo 'SET ROLE fa_api;'
        echo 'EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)'
        cat "$file"
        echo ';'
        echo 'ROLLBACK;'
    } > /tmp/fa-store-one.sql
    i=0
    : > /tmp/fa-store-times.txt
    while [ "$i" -lt 8 ]; do
        docker exec -i fa-store-probe \
            psql -U postgres -d probe -v ON_ERROR_STOP=1 -f - \
            < /tmp/fa-store-one.sql > /tmp/fa-store-out.txt 2>&1 \
            || { echo "FAIL $label"; cat /tmp/fa-store-out.txt; return 1; }
        awk '/Execution Time:/ { print $3 }' /tmp/fa-store-out.txt \
            >> /tmp/fa-store-times.txt
        i=$((i + 1))
    done
    awk -v label="$label" '
        { t[++n] = $1 + 0 }
        END {
            m = 0
            for (i = 2; i <= n; i++) v[++m] = t[i]
            for (i = 1; i <= m; i++)
                for (j = i + 1; j <= m; j++)
                    if (v[j] < v[i]) {
                        x = v[i]; v[i] = v[j]; v[j] = x
                    }
            printf "%-22s median %8.3f ms  min %8.3f  max %8.3f\n",
                label, v[int((m + 1) / 2)], v[1], v[m]
        }
    ' /tmp/fa-store-times.txt
}
med_read() {
    label=$1
    path=$2
    name=$3
    i=0
    : > /tmp/fa-store-times.txt
    while [ "$i" -lt 8 ]; do
        docker exec -i fa-store-probe \
            psql -U postgres -d probe -v ON_ERROR_STOP=1 -c \
            "SET ROLE fa_api; EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
             SELECT id, response_at FROM pairs_none
             WHERE path = '$path' AND name = '$name'
               AND method IN ('PUT','DELETE')
             ORDER BY response_at DESC, id DESC LIMIT 1;" \
            > /tmp/fa-store-out.txt 2>&1 \
            || { echo FAIL; cat /tmp/fa-store-out.txt; return 1; }
        awk '/Execution Time:/ { print $3 }' /tmp/fa-store-out.txt \
            >> /tmp/fa-store-times.txt
        i=$((i + 1))
    done
    awk -v label="$label" '
        { t[++n] = $1 + 0 }
        END {
            m = 0
            for (i = 2; i <= n; i++) v[++m] = t[i]
            for (i = 1; i <= m; i++)
                for (j = i + 1; j <= m; j++)
                    if (v[j] < v[i]) {
                        x = v[i]; v[i] = v[j]; v[j] = x
                    }
            printf "%-22s median %8.3f ms  min %8.3f  max %8.3f\n",
                label, v[int((m + 1) / 2)], v[1], v[m]
        }
    ' /tmp/fa-store-times.txt
}
echo "=== timings ==="
med none-huge none.sql pairs_none /huge/ h
med none-shallow none.sql pairs_none /c77/ n7777
med trig-huge omit.sql pairs_trig /huge/ h
med trig-shallow omit.sql pairs_trig /c77/ n7777
med grant-huge omit.sql pairs_grant /huge/ h
med grant-shallow omit.sql pairs_grant /c77/ n7777
echo "=== head read ==="
med_read read-huge /huge/ h
med_read read-shallow /c77/ n7777
