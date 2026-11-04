# Account chrome

Branch and worktree `account-chrome`.

## Intent

The sidebar footer keeps the signed-in identity chip and
nothing else about the session. Sign out moves to the far
right of the header that is on screen. The menu that
switches the current organization moves into the
organization box. The menu that sets the default
organization moves onto the signed-in identity's own
identity page.

## Decisions

- The desktop sidebar footer and the mobile drawer keep
  the avatar and the identity name. The chip links to
  `identity-detail` for the session identity. The
  organization line under the name goes away.
- Sign out is one labeled button, "Sign out". On the
  desktop top bar it is the last control in
  `.header-actions`, after the invitations bell. On the
  mobile header it is the last control in
  `.header-actions`, after the search toggle. Pressing
  it revokes the session, then opens `auth/index.html`.
  A failed revoke still opens that page.
- The current-organization menu is the existing
  organization `<select>`. It switches the session and
  reloads, including the convert-page redirect the
  switcher already performs. It does not set the
  default. With fewer than two organizations there is
  no menu. One organization shows its name as text.
- That menu lives in the organization box
  (`#header-stats`), in the seat the organization name
  occupies now. The stat tiles stay after it. From
  768px up the name or the menu stays visible. Below
  1024px the stat tiles stay hidden.
- Below 768px the top bar is hidden. The mobile header
  carries the same organization control between the
  title and Sign out: the menu when there are two or
  more organizations, the name as text when there is
  one.
- The default-organization menu is a separate
  `<select>` on the identity page, and only when that
  page's identity is the session identity. It lists the
  caller's organizations. Changing it writes the
  default and does not switch the session or reload.
  With organizations listed, the menu has no blank
  option. With none, the menu is disabled and reads
  "no active organization memberships". Another
  identity's page has no menu.
- A default, once written, cannot be cleared. The
  route has GET and PUT. An empty value does not
  write.

## Non-goals

- A new route, or a control that clears a default.
- Showing the default menu to an organization admin
  who is viewing someone else's identity.
- Changing the stat tiles, the invitations bell, or
  the search field.
- Changing which organizations are reachable, or how
  a switch is persisted.
- Putting Sign out, the organization line, or either
  organization menu back in the sidebar footer.

## Behavior

### Identity chip

`mutateSidebarMember` still fills `#sidebar-member-name`
and `#mobile-sidebar-member-name` from the session
identity's name. Both `.sidebar-member` chips navigate
to `identity-detail` with `{ identityId }` set to
`ctx.identity.id`. The member-detail navigation from
the chip goes away.

`#sidebar-member-org` and `#mobile-sidebar-member-org`
are removed, along with the single-organization text
they displayed. `#sidebar-org-switcher` and
`#mobile-sidebar-org-switcher` are removed. Both
`[data-signout]` buttons leave the sidebars.

A collapsed desktop sidebar still shows the avatar and
hides the name, as it does now.

### Sign out

Both headers carry one `button[data-signout]`. The
visible label is "Sign out". `initSignOut` keeps
binding every `[data-signout]`. The handler still
calls `postSessionLogout`, logs a failed revoke, and
in `finally` calls `navigateTo('auth')`, whose page is
`auth/index.html`.

### Current organization

`organizationSwitcherHtml` renders the `<select
class="org-switcher">` and no longer renders
`.org-set-default`. It is still empty when
`shouldShowOrganizationSwitcher` is false. The
accessible name stays "Switch organization".

The desktop host is `#header-stats`. With two or more
organizations the select replaces the organization-name
label and the stat tiles follow it. With one
organization the name stays text. With no organization
scope the strip stays empty and `.header-info:empty`
keeps hiding it.

`wireOrganizationSwitcher` still sets the active
organization and reloads through `switchToOrganization`
on change. It no longer looks for `.org-set-default`.

Below 1024px, `.header-stat-item` and
`.header-stat-divider` are hidden. The organization
name or select inside `#header-stats` is not. The
rule that hides all of `#header-stats` at
`max-width: 1023px` goes away.

The mobile header order, left to right, is the menu
button, the title, the organization control, the
search toggle, Sign out. The organization control uses
the same one-organization and many-organization rules.
`wireOrganizationSwitcher` wires every `.org-switcher`.
A change reloads the page. Only one header is visible
at a time.

### Default organization

The identity detail page renders a "Default
organization" field in the card stack when the loaded
identity id equals the session identity id. Another
identity's page has no field.

The field is a `<select>` whose accessible name is
"Default organization". Its options are the caller's
organizations, with no blank option. When a default
is stored, that option is selected. When none is
stored, no option is selected. When the caller has
no organizations, the select is disabled and its only
option is "no active organization memberships".

A change to an organization id calls
`putIdentityDefaultOrganization` with that id. The
page does not reload and does not change
`ACTIVE_ORGANIZATION_ID`. On success the select keeps
the new value and the page shows the toast "Set as
your default organization." On failure the select
returns to its previous value and the page shows the
toast "Could not set the default organization." An
empty value does not write.

The field reads organizations with `getOrganizations`
and the stored default with
`getIdentityDefaultOrganization`. A 404 from that GET
is an unset default. Any other failure of either
read omits the field and logs a warning. The rest of
the identity page still renders.

## Tests

`tests/organization-switcher.test.ts` stops expecting
`.org-set-default` inside `organizationSwitcherHtml`.
The select and the empty-below-two behavior stay
covered there.

A unit test covers the default-organization select:
options for each organization, the stored id
selected, no blank option when organizations exist,
and a disabled menu when none do.

A unit test covers the chip target: the session
identity id is passed to `identity-detail`, not
`member-detail`.

The browser sign-out click on `[data-signout]` stays
valid because the button moves and keeps that
attribute. `#sidebar-member-name` stays in the
sidebar, so the browser reads of that node stay valid.
