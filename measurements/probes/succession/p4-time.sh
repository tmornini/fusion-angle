#!/bin/sh
COLS="id, path, name, method, supersedes, response_at, response"
med() { # $1 path, $2 shape -> median of 7 warm runs, owner on the bare table
  case "$2" in
    distinct) Q="SELECT count(*), sum(length(response)) FROM (SELECT id, response FROM (SELECT DISTINCT ON (name) $COLS FROM message_pairs WHERE path = '$1' AND method IN ('PUT','DELETE') ORDER BY name DESC, response_at DESC, id DESC) heads WHERE method = 'PUT') q" ;;
    skip) Q="WITH RECURSIVE names AS ((SELECT name FROM message_pairs WHERE path = '$1' ORDER BY name LIMIT 1) UNION ALL SELECT (SELECT name FROM message_pairs WHERE path = '$1' AND name > n.name ORDER BY name LIMIT 1) FROM names n WHERE n.name IS NOT NULL) SELECT count(*), sum(length(h.response)) FROM names n CROSS JOIN LATERAL (SELECT id, method, response FROM message_pairs WHERE path = '$1' AND name = n.name AND method IN ('PUT','DELETE') ORDER BY response_at DESC, id DESC LIMIT 1) h WHERE n.name IS NOT NULL AND h.method = 'PUT'" ;;
  esac
  { printf '%s\n' '\timing on'; for i in 1 2 3 4 5 6 7 8; do printf '%s;\n' "$Q"; done; } \
    | docker exec -i fa-rethink-probe psql -U postgres -q -At 2>&1 \
    | awk -v shape="$2" -v path="$1" '
        /^Time:/ { t[++n] = $2 + 0 }
        /^[0-9]+\|/ { rows = $0 }
        /ERROR/ { err = $0 }
        END {
          m = 0; for (i = 2; i <= n; i++) v[++m] = t[i]
          for (i = 1; i <= m; i++) for (j = i + 1; j <= m; j++) if (v[j] < v[i]) { x = v[i]; v[i] = v[j]; v[j] = x }
          printf "%-9s %-12s %8.2f ms  heads=%s %s\n", shape, path, v[int((m + 1) / 2)], rows, err
        }'
}
for p in /d10000v1/ /d10000v3/ /d2000v5/ /d500v20/ /d200v50/; do for s in distinct skip; do med "$p" "$s"; done; done
