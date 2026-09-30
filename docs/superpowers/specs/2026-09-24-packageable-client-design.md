# The packageable client

- Date: 2026-09-24
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/ledger-store`
- Base: `ledger-store` at `b3a71bd0`
- Ships: the API client as `client/`, importing only
  itself and `shared/`, an instance its caller owns,
  under an import-graph test
- Defers: state by PUT and whole responses (item 1's
  second and third specs), the retries bullet, and the
  app's four remaining server reads (their bullet)
- Witness: the import-graph test; nothing is measured

## Problem

`web-app/app/adapters/` is the client in all but
boundary: one transport facade (`http-facade.ts`), a
`RequestContext` passed first (`shared.ts`), per-noun
verbs named by HTTP method, 57 files and 10,429 lines.
It imports the server: 37 files reach into eleven
`api/` modules, 33 of them into `api/types.ts` alone,
for entity types, state helpers, status codes, error
classes, JSON coercion, graph validators, claim and
token-chain derivation, the bell's wire, and the
`operation-id` header name. It imports the app: 24
files reach into eighteen app modules, and the app
reaches back. `web-app/app/channels.ts` imports the
client's bell and session modules while thirteen
client files import it, a cycle no import-graph test
can pass. The facade is a module-level singleton
(`facade-holder.ts`, fifteen consumers), and so is the
session: the token holder, the cookie-session flag,
the refresh single-flight, and the recovery in flight
each live in a module `let`, so two origins or two
sessions cannot coexist. Two calls inside the facade
bypass its own exchange with raw `fetch`
(`http-facade.ts:203`, `:236`). The test composition
root (`adapters/init.ts`) mints tokens through a
server module (`api/access-token.ts`). The barrel
(`adapters/index.ts`) re-exports API nouns beside
clipboard, viewport, location, url-params,
preferences, and resize-observer adapters. And eleven
client files call app logic, mermaid, zip, graph
layout, scoring and calendar formatting, drag
positions, flow-stats aggregation, and
`createElement`, inside functions that also call the
wire.

TODO item 1 merged the packageable client with its
oracle: a test that walks the client entry point's
import graph and finds no module outside the client's
directory and `shared/`. This is item 1's first of
three specs; the wire shape does not change here.

## Axiom

A boundary is a test that walks it.

## Decisions

1. **`client/` at the root.** The API client moves to
   `client/`, beside `api/`, `shared/`, `server/`, and
   `web-app/`: the transport, the request context, the
   session, the bell, the channels, and the per-noun
   verbs. Its entry point is `client/index.ts`, which
   exports the client alone. The nine browser adapters
   stay at `web-app/app/adapters/`: blob-download,
   clipboard, location, media-query, preferences,
   resize-observer, storage-event, url-params, and
   viewport. No file is renamed but one (Decision 10).

2. **The contract moves to `shared/`, whole modules.**
   Six `api/` modules move as they are, each importing
   nothing or only `shared/` and the types module:

   | Module | Importers whose paths move |
   |---|---|
   | `api/types.ts` | 281 |
   | `api/http-errors.ts` | 43 |
   | `api/identity-tokens.ts` | 7 |
   | `api/notifications.ts` | 9 |
   | `api/work-order-claims.ts` | 6 |
   | `api/record-constraints.ts` | 6 |

   `shared/` still never imports `api/`.
   `ValidationError` moves with `api/types.ts`.

3. **Two extractions and the header names.** From
   `api/validators.ts` (4,466 lines, which otherwise
   stays server-side): `shared/json-assert.ts` takes
   `parseOrThrow`, `asArray`, `asObject`, `asString`,
   `asNumber`, and `asBoolean` (`:75-190`);
   `shared/flow-graph-body.ts` takes `asStoredGraph`,
   `asWorkOrderFlowGraph` (`:436-500`), the private
   node and edge helpers they call, and the seven
   row-body types (`:4259-4340`). `OPERATION_ID_HEADER`
   (`api/message-pair.ts:205`) and `REQUEST_ID_HEADER`
   (`api/request-context.ts:26`) move to
   `shared/message-id-fields.ts`; the field registry
   (`shared/http-message/field-registry.ts`) classifies
   field kinds and is no home for names.

4. **Infrastructure in, app logic out.** The client's
   nouns return typed wire data; presentation, layout,
   scoring, and file building are the app's. Into the
   client: `web-app/app/channels.ts`,
   `credential-resolution.ts`, the two session keys
   split out of `storage-keys.ts` (authorization, active
   organization), and `adapters/event-listener.ts`,
   which the bell uses. Up to the app, whole:
   `flow-export.ts` (1,250 lines), `flow-stats.ts`,
   `dashboard.ts`. Up to the app, split, the verbs
   staying and the composition rising: `projects.ts`,
   `project-scoring.ts`, `flow-queries.ts`,
   `flow-publish.ts`, `work-orders-mutations.ts`,
   `admin.ts`. The plan enumerates each function by its
   app import: `mermaid-generate.ts`,
   `mermaid-parse.ts`, `zip.ts`, `flow-layout.ts`,
   `flow-graph-layout.ts`, `flow-graph.ts`,
   `flow-stats-aggregate.ts`, `scoring-format.ts`,
   `format.ts`, `drag-reorder-positions.ts`, `dom.ts`.

5. **`createClient`, an instance its caller owns.**
   `client/index.ts` exports `createClient`, taking the
   facade, a navigation object with the two calls made
   today (`redirectToLogin`, `navigateToAuth`), the
   logger, and the request recorder, and returning a
   client with `sessionContext`,
   `requestContext(token)`,
   `recoveringRequestContext(token)`, and the session
   accessors. Every module-level `let` of the session
   becomes instance state: the token holder
   (`session-token.ts:10`), the cookie-session flag
   (`session-credentials.ts:11`), the refresh
   single-flight with its peer channel
   (`session-refresh-mutex.ts:11-13`), and the recovery
   in flight (`shared.ts:381`). The bell and its buses
   (`broadcast-channel.ts:21-65`) and flow-mutations'
   per-flow save chains (`flow-mutations.ts:451`) stay
   per tab: the first is the platform's singleton, the
   second is keyed by flow id, and neither is the
   session's. This reaches past the literal facade
   because the brief's reason, two sessions coexisting,
   needs it.

6. **The app owns one instance.** `facade-holder.ts`
   retires, with `registerInPageWrap` and
   `wrapClientAdapter`: a test hands the client a real
   facade. `web-app/app/client.ts` holds the app's one
   instance (`putClient`, `getClient`) and a
   `sessionContext()` for the 33 page and app modules
   that call it today. `server-core.ts` and
   `root-redirect.ts` create the instance where they
   install the facade today (`:25-27` in each);
   `web-app/auth/index.ts` (`:20`, `:599`) and
   `apex-destination.ts` (`:31-49`) read it.

7. **The transport takes `fetch`.** `createHttpFacade`
   takes the origin and the `fetch` it uses, the
   platform primitive handed in at construction, so a
   test scripts the wire. The cookie refresh and the
   organization exchange (`http-facade.ts:203`, `:236`)
   go through the facade's one `exchange` (`:181`) with
   the headers they set today; the apex probe already
   rides a context. Recovery keeps its two layers
   (`exchangeOnce`, `withAuthRecovery`) for the retries
   bullet; only navigation is injected here.

8. **The test root leaves.** `adapters/init.ts` becomes
   `tests/client-init.ts`: it mints its anonymous token
   through `api/access-token.ts` as today and builds a
   client over `tests/in-page-facade.ts`'s wrap. The
   six test files that import it, and the eight that
   install a facade, construct a client instead.

9. **Move discipline.** A move commit is `git mv` plus
   the import-path rewrites the move forces, in the
   moved files and in every importer, and nothing else;
   `./test validate` is green on it. An extraction is
   cut and paste plus paths. Change commits follow their
   moves. Order: the contract (Decisions 2 and 3), then
   the `client/` move, then in and out (Decision 4),
   then the instance (Decisions 5 and 6), then the
   transport and the test root (Decisions 7 and 8),
   then the oracle, the gates, and the docs, then the
   rename (Decision 10).

10. **`client/shared.ts` becomes
    `client/request-context.ts`**, the last move
    commit: it holds the `RequestContext` and its
    factories, beside `api/request-context.ts`, the
    server's. No other file is renamed.

11. **Carried in, and not reopened.** The wire shape,
    the `RequestContext` verbs, the two-layer recovery,
    the bell per tab, and the message plane's two ids.

## Found on the base

1. **The cycle.** `channels.ts` imports
   `adapters/broadcast-channel.ts` and
   `adapters/session-token.ts` (`:1-10`); thirteen
   client files import `createSubscriptionChannel`.
2. **Two raw calls, not three.** The apex probe rides
   `ctx.postForHeaders` (`apex-destination.ts:31-49`);
   the cookie refresh and the organization exchange
   call `fetch` inside the facade.
3. **Server code in the client's directory.**
   `adapters/init.ts` imports `mintAccessToken`,
   `TOKEN_AUDIENCE`, and `ANONYMOUS_ID` from
   `api/access-token.ts` and `ClientFacadeAdapter` from
   `api/api.ts`; test-only.
4. **A formatter in the type module.**
   `formatCompactCurrency` lives in `api/types.ts:327`
   and is re-exported by `web-app/app/format.ts` and
   the barrel. It moves with its module, unchanged.
5. **Four app modules still read the server after the
   moves**, their bullet in `## Later work`: the
   documentation generator, two presenters, and the
   records detail page.
6. **Module-level state.** Nine `let`s and three maps
   or sets across eight client files; Decision 5 names
   which become instance state and which stay.

## Out of scope

- State by PUT and whole responses: item 1's second
  and third specs.
- The retries bullet: one retry policy, one recovery
  layer, timeouts.
- The app's four remaining server reads: their bullet.
- The eleven comments naming the retired appenders:
  their bullet.
- Renaming beyond Decision 10; the browser adapters'
  own shape.

## Sequence

1. **Contract.** Six moves to `shared/`, two
   extractions, the header names.
2. **Move.** `git mv` the API client to `client/`.
3. **In and out.** Infrastructure in, app logic out.
4. **Instance.** `createClient`; the holder retires;
   the app's `client.ts`.
5. **Transport and root.** `fetch` injected, the two
   calls through `exchange`; `tests/client-init.ts`.
6. **Oracle, gates, docs.** The import-graph test, the
   `test` script's roots, AGENTS.md, ARCHITECTURE.md.
7. **Rename.** `client/shared.ts` to
   `client/request-context.ts`.

## 1. The layout

`client/` holds, from today's directory: the transport
(`http-facade.ts`), the context (`shared.ts`, renamed
last), `authentication.ts`, the session
(`session-token.ts`, `session-credentials.ts`,
`session-refresh.ts`, `session-refresh-mutex.ts`,
`session-logout.ts`, `organization-session.ts`), the
bell (`broadcast-channel.ts`, `event-listener.ts`), the
channels, credential resolution, `validation.ts`, and
the per-noun verbs. `client/index.ts` exports
`createClient`, the context types, and the verbs; it
re-exports nothing from `shared/`. The app imports
`shared/` itself, as `api/` does, so the 29 app files
that take types from the barrel today take them from
`shared/`.

`web-app/app/adapters/` keeps the nine browser
adapters and a barrel of its own. `init.ts` leaves for
`tests/`.

## 2. The contract in `shared/`

After Decisions 2 and 3, `shared/` holds the domain
types, the status codes and error classes, the bell's
wire, the claim and token-chain derivations, the record
constraints, the JSON assertions, the graph bodies, and
the two id header names. `api/` imports them by their
new paths; nothing in `shared/` imports `api/`.

## 3. Infrastructure in, app logic out

The rule of Decision 4 decides each function: one that
calls the wire and app logic splits at the wire. The
wire half stays a verb in the client and returns typed
data; the app half moves up beside its logic and calls
the verb through the context. `flow-export.ts`,
`flow-stats.ts`, and `dashboard.ts` move whole: their
wire calls are verbs in other client files already, or
become ones.

## 4. The instance

`createClient(deps)`, where `deps` is `{ facade,
navigation, log, recordRequest }` and `navigation` is
`{ redirectToLogin(), navigateToAuth() }`. The instance
owns the session state Decision 5 names.
`sessionContext()` reads the instance's token and
facade; `requestContext(token)` and
`recoveringRequestContext(token)` are today's two
factories. A context closes over its instance; the
verbs stay free functions taking `ctx` first.

## 5. The app's holder

`web-app/app/client.ts` exports `putClient(client)`,
`getClient()`, and `sessionContext()`; the 33 callers
change one import. The product root creates the client
with the fetch facade over `location.origin`,
`navigation` from `navigation.ts` and
`auth-redirect.ts`, `log` from `logger.ts`, and
`recordApiRequest` from `page-request-profile.ts`.

## 6. The transport

`createHttpFacade(origin, fetch)`. The two credential
calls become `exchange('POST', 'authentication/token',
token, payload, headers)` with the token, payload, and
headers each sets today.

## 7. Tests' composition

`tests/client-init.ts` mints the anonymous token, wraps
the memory adapter with `wrapInPageAdapter`, and
returns a client. Tests that called `putClientFacade`
or `registerInPageWrap` build a client and hand it to
`putClient`, where the page reads `getClient()`.

## 8. The oracle

`tests/client-import-graph.test.ts` starts at
`client/index.ts`, follows every static `import` and
`export … from` specifier, and asserts each reachable
module is under `client/` or `shared/` and that no
specifier names a registry (`npm:`, `jsr:`, `node:`).
The walk is the test's own regex over the files, no
subprocess.

## 9. Gates and docs

The `test` script adds `client` to `deno check`, to the
78-character lint, and to the `org` ban. `deno.json` is
unchanged. AGENTS.md's gate description names the new
root, `## Where things live` gains `client/` and
rewords `web-app/`, and `## Subagents` says client
verbs take `ctx` first. ARCHITECTURE.md `## Layers`
(`:82-102`) becomes five directories and names the
composition roots as they are after this spec;
`## Conventions` (`:258-288`) says client verbs take
`ctx` first.

## Error and wire

No wire change. `RequestError` and `UnauthorizedError`
keep their behavior under `shared/http-errors.ts`. A
failed refresh calls the injected navigation; a client
built without one is a bug at construction, not a
silent no-op.

## Testing

Layer 1 in `tests/`. Layer 2 (`./test browser`) sees no
wire change and stays green; the walk is unaffected.

Standing pins: the 98 test files importing the client
pass with new paths; the tests of every moved module
pass under `shared/`.

New pins:

- The import-graph oracle (§8).
- Two clients coexist: built over different facades and
  tokens, each `sessionContext()` sees its own token,
  and a refresh on one leaves the other untouched.
- A failed refresh calls the injected navigation, and a
  client is never built without one.
- The cookie refresh and the organization exchange pass
  through the transport: a scripted `fetch` sees both
  with their method, path, and headers.
- The test root builds a working client: a seeded
  memory adapter, wrapped, answers a verb through it.

## Docs that change when this ships

- AGENTS.md: the gate description, `## Where things
  live`, `## Subagents`.
- ARCHITECTURE.md: `## Layers`, `## Conventions`.
- TODO.md: nothing closes; the two bullets this
  brainstorm added stay.

## For the next brainstorms

The second spec, state by PUT, inherits the paths. The
third, the unit, inherits the `fetch` seam, the
instance, and the place a splitter goes. The retries
bullet inherits the scripted-transport seam.
