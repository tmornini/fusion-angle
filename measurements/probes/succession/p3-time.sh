#!/bin/sh
COLS="id, path, name, method, supersedes, response_at, response"
med() { # $1 role clause, $2 relation, $3 path, $4 shape -> median of 7 warm runs
  case "$4" in
    distinct) Q="SELECT count(*), sum(length(response)) FROM (SELECT id, response FROM (SELECT DISTINCT ON (name) $COLS FROM $2 WHERE path = '$3' AND method IN ('PUT','DELETE') ORDER BY name DESC, response_at DESC, id DESC) heads WHERE method = 'PUT') q" ;;
    skip) Q="WITH RECURSIVE names AS ((SELECT name FROM $2 WHERE path = '$3' ORDER BY name LIMIT 1) UNION ALL SELECT (SELECT name FROM $2 WHERE path = '$3' AND name > n.name ORDER BY name LIMIT 1) FROM names n WHERE n.name IS NOT NULL) SELECT count(*), sum(length(h.response)) FROM names n CROSS JOIN LATERAL (SELECT id, method, response FROM $2 WHERE path = '$3' AND name = n.name AND method IN ('PUT','DELETE') ORDER BY response_at DESC, id DESC LIMIT 1) h WHERE n.name IS NOT NULL AND h.method = 'PUT'" ;;
    nosuccessor) Q="SELECT count(*), sum(length(p.response)) FROM $2 p WHERE p.path = '$3' AND p.method = 'PUT' AND NOT EXISTS (SELECT 1 FROM $2 s WHERE s.path = p.path AND s.name = p.name AND s.supersedes = p.id AND s.method IN ('PUT','DELETE'))" ;;
  esac
  { printf '%s\n' "$1" '\timing on'; for i in 1 2 3 4 5 6 7 8; do printf '%s;\n' "$Q"; done; } \
    | docker exec -i fa-rethink-probe psql -U postgres -d fa -q -At 2>&1 \
    | awk -v shape="$4" -v path="$3" '
        /^Time:/ { t[++n] = $2 + 0 }
        /^[0-9]+\|/ { rows = $0 }
        /ERROR/ { err = $0 }
        END {
          m = 0; for (i = 2; i <= n; i++) v[++m] = t[i]
          for (i = 1; i <= m; i++) for (j = i + 1; j <= m; j++) if (v[j] < v[i]) { x = v[i]; v[i] = v[j]; v[j] = x }
          printf "%-12s %-9s %9.2f ms  (min %.2f, max %.2f)  heads|bytes=%s %s\n", shape, path, v[int((m + 1) / 2)], v[1], v[m], rows, err
        }'
}
echo "=== owner, bare table (baseline) ==="
for p in /v10/ /v250/ /v2500/; do for s in distinct skip nosuccessor; do med "SET ROLE fa_owner;" message_pairs "$p" "$s"; done; done
echo "=== member of fa_api, through the view and the row policy ==="
for p in /v10/ /v250/ /v2500/; do for s in distinct skip; do med "SET SESSION AUTHORIZATION api_login;" api_pairs "$p" "$s"; done; done
