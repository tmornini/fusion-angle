# Fusion Angle Product Rename — Design

Date: 2026-08-18
Status: draft (brainstorm 2026-08-18; awaiting user
review)
Spec-only. No implementation in this document.

## Goal

Rename the product from Fusion AI to Fusion Angle
everywhere a person or a live identifier still says
the old name. Replace the orbital atom mark and the
favicons with a derived form of
`~/Desktop/favicon.png`. Point Render at the renamed
GitHub repository.

## Context

Visible “Fusion AI” lives in titles, sidebar, landing,
auth, meta, and current docs (~25 strings). Live
identifiers use the `fusion-ai` slug: localStorage
keys, BroadcastChannel names, JWT audience
`fusion-ai-web`, the server ZIP name, and
`package-lock.json` `name`.

The mark today is an inline SVG atom
(`logo-orbital` / `logo-nucleus`) in sidebar HTML,
`iconLogo`, and `web-app/assets/favicon.svg`, plus
`favicon.ico`. The source PNG is 1088×972, opaque
white line art on black.

Render workspace, project, web service, and Postgres
display names are already Fusion Angle. The web
service (`srv-da0vkntbedkc73bn3i70`) still builds
from `https://github.com/tmornini/fusion-ai`. Public
custom domains are `fusionangle.ai` and
`fusionangle.com` (www redirects to each apex). The
assigned host `fusion-ai-f740.onrender.com` has the
Render Subdomain disabled and is not a public entry.
Auto-deploy is off. This work does not deploy.

## User decisions

1. Every live `fusion-ai` identifier becomes
   `fusion-angle`. JWT audience is `fusion-angle`,
   not `fusion-angle-web`.
2. Fusion Flow, Fusion Card, and the GitHub repo /
   local checkout change. Historical specs and
   plans stay as written.
3. Mark: one transparent PNG from the source;
   light theme inverts black and white. Approach 1
   — one asset plus CSS `invert(1)`.
4. `favicon.svg` is primary and inverts with
   `prefers-color-scheme`. `favicon.ico` is the
   dark-ink transparent fallback.
5. No migration of old storage keys or old JWT
   audience.
6. After the in-repo commits are on master: rename
   GitHub, update origin, point Render at the new
   repo URL, rename the local checkout.
7. Keep `https://fusion-ai-f740.onrender.com`. Do
   not create a new service for a new slug.

## Name map

Visible product name: Fusion AI → Fusion Angle.

| Today | After |
|---|---|
| `Fusion AI` (titles, sidebar, landing, auth, meta, current docs) | `Fusion Angle` |
| `fusion-ai:theme` and sibling storage keys | `fusion-angle:…` |
| `fusion-ai:data` / `fusion-ai:refresh` | `fusion-angle:data` / `fusion-angle:refresh` |
| JWT audience `fusion-ai-web` | `fusion-angle` |
| Client-registration placeholder and test pins of that audience | `fusion-angle` |
| ZIP `fusion-ai-server-${SHA}.zip` | `fusion-angle-server-${SHA}.zip` |
| `package-lock.json` name `fusion-ai` | `fusion-angle` |
| Seeded flow **Fusion Flow** | **Fusion Angle Flow** (name and mentions; seed id stays) |
| Design-system heading **Fusion Card** | **Fusion Angle Card** |
| GitHub `tmornini/fusion-ai` | `tmornini/fusion-angle` |
| Checkout `…/code/fusion-ai` | `…/code/fusion-angle` |
| Render service repo `https://github.com/tmornini/fusion-ai` | `https://github.com/tmornini/fusion-angle` |

| Today | After |
|---|---|
| `fusion-ai-browser` (forbidden in `build`) | still absent — no `fusion-angle-browser`, no SHA’d variant |
| Render team / project / **Fusion Angle Server** / **Fusion Angle Postgres** | already Fusion Angle — no rename |
| Public URL `https://fusion-ai-f740.onrender.com` (`slug: fusion-ai-f740`) | keep. Slug is not renamed. Custom domains already serve the product |
| Postgres database `fusion_9hc2`, user `fusion` | stay — changing them means recreating the instance |

| Stays |
|---|
| Dated files under `docs/superpowers/specs/` and `docs/superpowers/plans/` |
| Seed pair id `fSe02FusionFl0w0aActiv` |
| Old localStorage keys and old JWT audience — no migration |
| `./wipe-render-postgres` script name |

Current docs that still say Fusion AI or `fusion-ai`
(README, CLAUDE.md, TEST-PLAN.md, ARCHITECTURE.md,
DESIGN-SYSTEM.md, SCHEMA.md, API.md, AUDIT.md) update
to the new name. Dated specs and plans do not.

## Mark and favicon

Source: `~/Desktop/favicon.png`. Derive one white-on-
transparent PNG (black knocked out). Commit it under
`web-app/assets/`.

In-app (sidebar, mobile sidebar, landing, auth,
`iconLogo`):

- Dark theme: the PNG as-is.
- Light theme: CSS `invert(1)` on the mark. The
  class lives in `components-brand.css`. No inline
  style.
- Wordmark next to the mark is Fusion Angle.

Favicon:

- `favicon.svg` embeds the same PNG and inverts
  under `prefers-color-scheme: light`.
- `favicon.ico` is a square, padded, dark-ink
  transparent raster. Browsers that ignore SVG
  keep that ICO, including on a dark tab.

Remove the orbital/nucleus SVG from `icons.ts`,
sidebar HTML, and `favicon.svg`. Remove
`logo-orbital` / `logo-nucleus` CSS with those
marks.

## Order of work

In-repo first, while the checkout and GitHub remote
are still `fusion-ai`. One concern per commit:
display name, identifiers, mock-data labels, mark
assets, current docs.

Then, after those commits are on master and
`./validate` passes:

1. Rename the GitHub repo to `tmornini/fusion-angle`.
2. Point origin at the new URL.
3. Update Render:

   ```
   render services update srv-da0vkntbedkc73bn3i70 \
     --repo https://github.com/tmornini/fusion-angle \
     --output json --confirm
   ```

4. Rename the local checkout directory to
   `fusion-angle`.

Do not redeploy Render. `JWT_HMAC_SIGNING_KEY` and
`POSTGRES_URL` stay. The next human deploy builds
the renamed repo and serves Fusion Angle at
`fusionangle.ai` and `fusionangle.com`.

## Testing and verification

`./validate` must pass after the in-repo commits.
Audience pins and ZIP-name pins move with the new
strings.

A search after the sweep must find no live
`Fusion AI` or `fusion-ai` identifier except:

- historical specs and plans
- seed id `fSe02FusionFl0w0aActiv`
- the `build` forbidden-name pin for
  `fusion-ai-browser` (still absent)

Browser, once `./serve` is up: landing, auth,
sidebar, and a titled app page show Fusion Angle.
Light theme inverts the mark; dark does not. The
tab icon follows `favicon.svg` with the OS color
scheme.

After the GitHub and Render steps: `render services`
shows repo `https://github.com/tmornini/fusion-angle`.
No Render deploy is part of this verification.

## What breaks, on purpose

No migration.

- Existing browsers keep `fusion-ai:theme` and
  sibling keys. Theme and sidebar-collapse reset
  to defaults. New writes go to `fusion-angle:…`.
- Live access tokens with `aud: fusion-ai-web`
  fail verify (`wrong audience`). Users sign in
  again. Refresh cookies still hit the same path;
  the next mint stamps `aud: fusion-angle`.
- BroadcastChannel names change, so an old tab and
  a new tab do not share `fusion-ai:data` /
  `fusion-ai:refresh`.

## Non-goals

- Do not rewrite `docs/superpowers/specs/` or
  `docs/superpowers/plans/`.
- Do not migrate old localStorage keys or accept
  the old JWT audience.
- Do not invent `fusion-angle-web` or
  `fusion-angle-browser` / a SHA’d browser ZIP.
- Do not change seed id `fSe02FusionFl0w0aActiv`.
- Do not rename `./wipe-render-postgres`.
- Do not recreate the Postgres instance to rename
  `fusion_9hc2` / user `fusion`.
- Do not create a new Render service for a new
  onrender slug.
- Do not enable or redeploy the disabled
  `fusion-ai-f740.onrender.com` host.
- Do not deploy Render as part of this work.
- Do not trace the mark to vector paths.
- Do not ship the opaque black-tile PNG as the
  in-app logo.
