#!/bin/sh
# Throwaway Postgres for the membership body-index probe.
# A running fa-gin-probe is left alone: it may be in use.
# A stopped container of that name is removed so run can
# recreate it. If the container this invocation starts
# does not become ready, that container is removed.
# A ready container is left running. No other container
# is removed.
set -eu
name=fa-gin-probe
image=postgres:18.6

running=$(
    docker inspect -f '{{.State.Running}}' "$name" \
        2>/dev/null || true
)
if [ "$running" = "true" ]; then
    echo "$name is already running" >&2
    exit 1
fi
if [ -n "$running" ]; then
    docker rm "$name" >/dev/null
fi

docker run -d --name "$name" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=probe \
    --tmpfs /var/lib/postgresql \
    "$image" >/dev/null

# Only the container this invocation started. Cleared
# once it is ready, so success leaves it running.
cleanup() {
    docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

i=0
while [ "$i" -lt 60 ]; do
    if docker exec "$name" \
        pg_isready -h 127.0.0.1 -U postgres -d probe \
        >/dev/null 2>&1 \
        && docker exec "$name" \
            psql -U postgres -d probe -c 'SELECT 1' \
            >/dev/null 2>&1
    then
        trap - EXIT
        exit 0
    fi
    i=$((i + 1))
    sleep 1
done
echo "$name did not become ready" >&2
exit 1
