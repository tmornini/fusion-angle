# TEST-PLAN parallel hunters: one `*.localhost` alias per jar

Date: 2026-08-27. Status: spike pending. Hand this to an agent
whose browser-use is attached to a Chrome. This session could
not launch or attach to one from inside its sandbox (details in
§4.3), so the measurement in §4 is still owed. Nothing in the
product changes; on PASS the change is `TEST-PLAN.md` only.

## 1. Problem

Parallel test-plan runs fail on a shared cookie jar. The
mechanism, with evidence:

1. The session rides ONE cookie. `api/authentication.ts:165`
   mints `refresh_token` as `HttpOnly; SameSite=Strict;
   Path=/api/authentication; Secure` with no `Domain`, so it is
   host-only. Browsers key cookies by host and path — never by
   port, never by the CDP connection that opened the tab.
2. Every hunter opens `http://localhost:{PORT}`. Fourteen
   hunters on one host are fourteen writers to one cookie slot.
3. browser-use's "isolated CDP per hunter" is a tab, not a
   jar. `browser_harness/daemon.py:374`: *Named daemons
   (BU_NAME != "default") share one browser with other
   daemons.* The harness log at
   `~/.config/browser-harness/tmp/` shows the `default`,
   `hunter-r`, `g-hunter`, and `hunter-i` daemons all attached
   to the one Chrome at `ws://127.0.0.1:9306/…`. The F-F1
   mitigation record ("Chip on 9306 named D Admin") is this.
4. It cascades. Refresh rotation detects reuse
   (`api/authentication.ts:585`, `RotationOutcome` 'fail'
   revokes the chain). Two hunters' boot-refreshes racing on
   the same cookie value look like theft: the family is
   revoked, both hunters are signed out, and the auth throttle
   then answers 429 (the B25 record's "shared jar + auth 429").
5. The documented remedy leaks. A JS-side "delete site data"
   cannot reach an HttpOnly cookie (`TODO.md:311`). The CDP
   call that can, `Network.clearBrowserCookies`, is
   browser-wide — in a shared browser it signs every other
   live hunter out.

## 2. The idea

Give each hunter its own hostname on the one crank origin:

    http://aa.localhost:{PORT}   http://b.localhost:{PORT}   …

One Chrome, one profile, one Node process, one Postgres —
fourteen disjoint cookie jars. The alias is composed by the
master into the hunter prompt's `Origin:` line; crank and the
seed reveal print no origin and do not change.

Slugs, one per `parallel: yes` section (14), plus one extra for
the SV second identity:

| Section | Alias host |
|---|---|
| AA | `aa.localhost` |
| B | `b.localhost` |
| C | `c.localhost` |
| D | `d.localhost` |
| E | `e.localhost` |
| F | `f.localhost` |
| F2 | `f2.localhost` |
| FS | `fs.localhost` |
| G | `g.localhost` |
| H | `h.localhost` |
| I | `i.localhost` |
| K | `k.localhost` |
| R | `r.localhost` |
| SV | `sv.localhost` (second jar: `sv2.localhost`) |

Serial mode is untouched: `http://localhost:{PORT}`, one jar.

## 3. Why it should work — and what is only assumed

Facts read from code (no measurement needed):

- The server does not validate `Host`.
  `server/http-server.ts:253` echoes whatever arrives into the
  request URL. No allow-list to extend.
- The web app builds its API base from `location.origin`
  (`web-app/app/server-core.ts:14`), navigates by relative
  path, and fetches with `credentials: 'same-origin'`. An
  alias origin is self-consistent end to end.
- `api/api.ts:162` `BASE_URL = 'http://localhost'` composes
  internal sub-requests only; it is not a host check.
- `SameSite=Strict` is per site; `aa.localhost` and
  `b.localhost` are different sites, so a hunter's cookie
  never rides another hunter's request.
- `localStorage` and `BroadcastChannel` are origin-scoped.
  `web-app/app/adapters/session-refresh-mutex.ts:24` (the
  cross-tab refresh mutex) and
  `web-app/app/adapters/broadcast-channel.ts:42`
  (`fusion-angle:data`) therefore coordinate only within one
  hunter's tabs — today fourteen hunters share both channels.

Facts assumed about Chrome — these are the spike:

- Chrome resolves any `*.localhost` name to loopback on its
  own, with no `/etc/hosts` entry.
- Chrome accepts a `Secure` cookie set over plain `http://`
  on a `*.localhost` host (it does for `localhost`; Chromium's
  loopback rule is expected to include subdomains).
- `Storage.clearDataForOrigin` with `storageTypes: 'cookies'`
  removes only the named origin's cookies, HttpOnly included.
- The product's boot cookie-refresh (`POST
  /api/authentication/token`, `grant_type=refresh`) succeeds on
  an alias origin exactly as on `localhost`.

## 4. Spike

Two parts. Part 1 needs no Postgres and isolates Chrome's
behavior with the product's exact cookie attributes. Part 2
confirms it on the real stack. Everything here is throwaway:
run it from a scratch directory; commit none of it.

### 4.1 Part 1 — probe server

Save Appendix A as `jar-probe.mjs` and run
`PROBE_PORT=8089 node jar-probe.mjs`. It serves a page at `/`
whose `mint` button POSTs `/api/authentication/token` (the
server answers with `Set-Cookie: refresh_token=<host>-<rand>;
HttpOnly; SameSite=Strict; Path=/api/authentication; Secure`),
whose `clear` button POSTs `/api/authentication/logout`
(`Max-Age=0`), and which on every probe reports what cookie
arrived on `/api/authentication/probe` and on `/api/other`
(path scoping). The server logs every request's `Host` and
cookie to stdout — the server-side witness.

Then run Appendix B through browser-use. It opens
`http://aa.localhost:8089/` and `http://b.localhost:8089/` in
two tabs, mints on both, reloads `aa`, clears `b` per origin
over CDP, signs `aa` out, and prints the jar
(`Storage.getCookies`, HttpOnly included) after each step.
Appendix B was written against browser-use 0.1.9's helper
signatures (`new_tab`, `switch_tab`, `goto_url`,
`wait_for_load`, `wait`, `js`, `cdp`, `close_tab`) but never
executed here — no Chrome was reachable. Expect to touch it.

PASS for Part 1, every line required:

- `aa load` and `b load` render (`*.localhost` resolves).
- `secureContext: true` on both aliases.
- After `aa` mints, `b load` still shows
  `cookie on /api/authentication: ""` (no cross-alias leak).
- Every `=== jar` listing shows one `refresh_token` row per
  minted alias with `domain` equal to that alias, `secure:
  true`, `httpOnly: true`, `sameSite: "Strict"`, `path:
  "/api/authentication"`.
- `cookie on /api/other` is `""` throughout (path scoping).
- `aa reload` shows `aa`'s own value (the Secure cookie
  persisted and was sent back over `http://`).
- After `clearDataForOrigin(b)` the jar holds only `aa`'s row
  and `b after per-origin clear` shows `""`.
- After `aa after logout` the jar is empty for both aliases.
- The probe log shows `Host: aa.localhost:8089` requests
  carrying only `aa-…` values and `b.localhost:8089` requests
  carrying only `b-…` values.

### 4.2 Part 2 — real stack

Bring up the origin: `./crank --test-plan-slices 8080`
(sandboxed sessions: `TMPDIR=/tmp/claude ./crank
--test-plan-slices 8080`; crank needs Docker). Read the reveal
TSV from crank's stdout. Then, in one Chrome:

1. Tab 1: `http://aa.localhost:8080/auth/index.html`. Sign in
   as the AA admin (`demo@example.com`, reveal password).
   Dashboard loads; the sidebar chip names the AA admin.
2. Tab 2: `http://b.localhost:8080/`. PASS: lands on
   `landing/index.html` unsigned (no `refresh_token` for this
   host). Sign in as the B admin from the reveal. Chip names
   the B admin.
3. Reload tab 1, then tab 2. PASS: both stay signed in; the
   network log shows each `POST /api/authentication/token`
   refresh answering 201 — no 401, no 429, no `token chain
   revoked`. Chips unchanged.
4. `cdp("Storage.getCookies")`: two `refresh_token` rows,
   domains `aa.localhost` and `b.localhost`. Do not print the
   values (they are live refresh JWTs).
5. `cdp("Storage.clearDataForOrigin",
   origin="http://b.localhost:8080", storageTypes="cookies")`.
   Reload tab 2: bounced to `auth`. Reload tab 1: still the AA
   admin.
6. Tab 3: `http://localhost:8080/`. Sign in as the C admin.
   PASS: coexists with tab 1; reload both; chips unchanged.
   (The serial path keeps the bare host.)
7. Sign out in tab 1. PASS: `Set-Cookie … Max-Age=0` for
   `aa.localhost` only; tab 3 is untouched.

Stop crank (its EXIT trap downs compose and removes the
bundle).

### 4.3 What this session tried, so nobody repeats it

Inside the Claude Code sandbox: the Docker socket is denied
(no crank); the Claude-in-Chrome extension was not connected;
browser-use found no Chrome exposing a DevTools port (no
`DevToolsActivePort`, 9222 closed — its "attached" line was
stale); and a headless Chrome launched with `./measure`'s
flags aborted on `Failed to create a ProcessSingleton` because
Chrome puts its singleton socket in the per-user `/var/folders`
temp dir, which the sandbox denies (a short `TMPDIR` does not
help — Chrome does not use it for that socket). Run the spike
from a session that owns a Chrome with remote debugging, or
run Part 1 outside the sandbox.

## 5. On PASS — `TEST-PLAN.md` edits (line anchors at 77c08fb8)

Doc only. No product, crank, seed, or `./validate` change.

1. **How to invoke, step 5 (48–58).** Replace "isolated
   browser-use CDP per hunter (own cookie jar)" with: one
   `*.localhost` alias per hunter on the one crank origin,
   from the slug table; a named browser-use daemon per hunter
   isolates tabs, not jars. SV6–SV10's second jar is
   `sv2.localhost`, not a second CDP. Drop "serialize hunters
   on one daemon only when each hunter deletes site data
   first" — aliases make live hunters safe together.
2. **Sub-agent contract (108–110) and hunter prompt (138,
   155–156).** `Origin: http://{slug}.localhost:{PORT}`.
   Replace "Delete site data for the origin" with: clear this
   origin's cookies with `Storage.clearDataForOrigin` (origin
   = your alias, `storageTypes: 'cookies'`); never
   `Network.clearBrowserCookies`. Add: every tab you open is
   on your alias; a chip naming another section's admin means
   you left your alias — FAIL, and say so.
3. **Protocol, Parallel bullet (210–227).** Same substitution.
   "wrong jar" becomes "wrong alias". Keep the stolen-tab paint
   rule and the "not a product bug unless a serial C or R pin
   fails" clause.
4. **Browser-use driving, Two-jar SV6–SV10 (304–306).** "a
   second browser-use CDP/jar" becomes "the `sv2.localhost`
   alias in a second tab; same process, distinct host".
5. **Known limitations, Stolen-tab (381–392).** Keep the tab
   rule; replace jar language with alias language; add one
   bullet naming the shared-jar mechanism (§1 items 1, 3, 4)
   as the reason aliases exist.
6. **Summary (506) and Summary Format (3615).** "a shared jar"
   becomes "a shared alias".
7. **C4 (1233–1238), R14 (3420–3424).** "wrong jar" becomes
   "wrong alias".
8. **SV (3504–3548).** SV6/SV7: browser A is `sv.localhost`,
   browser B is `sv2.localhost` — two aliases, two identities,
   one Postgres, one Chrome; drop "Chrome + Firefox, or Chrome +
   a Guest profile". SV8, SV8b, SV9 stay single-alias (two tabs
   of `sv.localhost` share its cookie). SV10's "browser B" is
   the `sv2.localhost` tab; the named residual holds because
   BroadcastChannel is origin-scoped, and the case text says
   so.
9. **Serial (201–209, 424–427, 439–442) and A4/A5/SV2.**
   Unchanged: bare `localhost`, one jar.
10. **Slug table.** Add §2's table under `### Protocol`.

Record the measured Part 1 and Part 2 results in the commit
that lands these edits, the way SV3 was settled by
measurement.

## 6. On FAIL — fallbacks, in order

- **Chrome refuses the Secure cookie on `http://x.localhost`
  but resolves the name:** use loopback aliases
  `127.0.0.2` … `127.0.0.15` instead of hostnames. Chrome
  treats all of 127/8 as loopback for Secure cookies (measure
  it). macOS needs `sudo ifconfig lo0 alias 127.0.0.N up` per
  address — an operator step outside crank; `./serve` binds
  every interface, so no server change. Same protocol edits
  with IPs in the slug table.
- **`*.localhost` does not resolve in Chrome:** `/etc/hosts`
  entries (sudo). Unlikely; Chrome has resolved `*.localhost`
  internally for years.
- **Aliases pass but tab or focus stealing still bites:** one
  Chrome per hunter. Launch each with
  `--user-data-dir=<own dir> --remote-debugging-port=<93xx>
  --no-first-run` (a non-default profile skips the macOS
  "Allow remote debugging" sheet, `daemon.py:215`), and give
  each hunter `BU_NAME=<slug> BU_CDP_URL=http://127.0.0.1:<93xx>`.
  Fourteen Chromes. The master must assert each hunter's chip
  before dispatch — the last run believed it had isolation and
  did not. Aliases and private Chromes compose; keep the
  aliases either way.

## 7. Rejected

- One `./serve` per hunter on distinct ports: cookies ignore
  ports (RFC 6265), and SV forbids two mint processes.
- Per-tenant cookie names or paths in the product: the harness
  must not bend the session covenant, and
  `Path=/api/authentication` is already as narrow as it gets.
- CDP `Target.createBrowserContext` per hunter: works over raw
  `cdp()`, but every browser-use helper creates targets in the
  default context, so one reflexive `new_tab()` re-enters the
  shared jar.
- Serializing hunters: abandons parallelism and still leaks the
  HttpOnly cookie between hunters.
- browser-use cloud browsers: cannot reach `localhost:{PORT}`,
  and bill.

## Appendix A — `jar-probe.mjs` (throwaway)

```js
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.PROBE_PORT ?? '8089');
const COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/authentication';
const ATTRS = 'HttpOnly; SameSite=Strict; Path=' + COOKIE_PATH
    + '; Secure';

function cookieValue(header) {
    if (!header) return '';
    for (const part of header.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === COOKIE) return rest.join('=');
    }
    return '';
}

const PAGE = `<!doctype html><meta charset=utf-8>
<title>jar probe</title>
<pre id=out>probing…</pre>
<button id=mint>mint</button> <button id=clear>clear</button>
<script>
const out = document.getElementById('out');
async function probe() {
  const r = await (await fetch('/api/authentication/probe',
    {credentials: 'same-origin'})).json();
  const o = await (await fetch('/api/other',
    {credentials: 'same-origin'})).json();
  out.textContent = [
    'host: ' + location.host,
    'secureContext: ' + window.isSecureContext,
    'cookie on /api/authentication: ' + JSON.stringify(r.cookie),
    'cookie on /api/other: ' + JSON.stringify(o.cookie),
  ].join('\\n');
}
document.getElementById('mint').onclick = async () => {
  const m = await (await fetch('/api/authentication/token',
    {method: 'POST', credentials: 'same-origin'})).json();
  await probe();
  out.textContent += '\\nminted: ' + m.minted;
};
document.getElementById('clear').onclick = async () => {
  await fetch('/api/authentication/logout',
    {method: 'POST', credentials: 'same-origin'});
  await probe();
};
probe();
</script>`;

const server = createServer((req, res) => {
    const host = req.headers.host ?? '(no host)';
    const url = req.url ?? '/';
    const sent = cookieValue(req.headers.cookie);
    console.log(req.method, host, url, 'cookie=' + JSON.stringify(sent));
    const json = (body, extra = {}) => {
        res.writeHead(200, {
            'content-type': 'application/json', ...extra,
        });
        res.end(JSON.stringify(body));
    };
    if (url === '/') {
        res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
        });
        res.end(PAGE);
        return;
    }
    if (url === COOKIE_PATH + '/token' && req.method === 'POST') {
        const minted = host.replace(/[^a-z0-9.]/gi, '_')
            + '-' + randomBytes(3).toString('hex');
        json({ minted }, {
            'set-cookie': COOKIE + '=' + minted + '; ' + ATTRS,
        });
        return;
    }
    if (url === COOKIE_PATH + '/logout' && req.method === 'POST') {
        json({ cleared: true }, {
            'set-cookie': COOKIE + '=; Max-Age=0; ' + ATTRS,
        });
        return;
    }
    if (url === COOKIE_PATH + '/probe' || url === '/api/other') {
        json({ host, path: url, cookie: sent });
        return;
    }
    res.writeHead(404);
    res.end();
});

server.listen(PORT, () => {
    console.log('probe listening on ' + PORT);
});
```

## Appendix B — browser-use driving script (untested here)

```
browser-use <<'PY'
import json
AA = "http://aa.localhost:8089/"
B = "http://b.localhost:8089/"
made = []
def out(label):
    wait(0.8)
    print(f"--- {label} @ {js('location.host')}")
    print(js("document.getElementById('out').textContent"))
def click(id_):
    js(f"document.getElementById('{id_}').click()")
def jar(label):
    cs = cdp("Storage.getCookies")["cookies"]
    rows = [{k: c.get(k) for k in ("domain", "path", "value",
             "secure", "httpOnly", "sameSite", "sourceScheme")}
            for c in cs if c["name"] == "refresh_token"]
    print(f"=== jar {label}: {len(rows)} refresh_token cookie(s)")
    for r in rows:
        print(json.dumps(r))
try:
    t_aa = new_tab(AA); made.append(t_aa); wait_for_load()
    out("aa load")
    click("mint"); out("aa after mint")
    jar("after aa mint")
    t_b = new_tab(B); made.append(t_b); wait_for_load()
    out("b load")
    click("mint"); out("b after mint")
    jar("after b mint")
    switch_tab(t_aa); goto_url(AA); wait_for_load()
    out("aa reload")
    cdp("Storage.clearDataForOrigin",
        origin="http://b.localhost:8089", storageTypes="cookies")
    jar("after clearDataForOrigin(b)")
    switch_tab(t_b); goto_url(B); wait_for_load()
    out("b after per-origin clear")
    switch_tab(t_aa); click("clear"); out("aa after logout")
    jar("after aa logout")
finally:
    for t in made:
        try:
            close_tab(t)
        except Exception as e:
            print("close failed", t, e)
PY
```

If the attached Chrome is the operator's own profile, the jar
listing may also show a stale `localhost` `refresh_token` from
an earlier run. Leave it alone; it is evidence of the leak, not
part of the measurement.
