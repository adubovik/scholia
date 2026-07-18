## 1. Schema & data

- [x] 1.1 Add `invites` table to `lib/db/schema.ts` (token unique, createdBy, email?, status, redeemedBy?, redeemedAt?, expiresAt?, createdAt) per design §4
- [x] 1.2 Add `users.status` (`'pending'|'active'`, default `'pending'`) and `users.canInvite` (boolean, default false)
- [x] 1.3 Applied invites table + users.status/can_invite to Neon via surgical idempotent DDL (NOT `drizzle-kit push` — push wanted to truncate 575 node_source_ranges rows over the pre-existing M2 unique-constraint drift; left that alone)
- [x] 1.4 Ensure `upsertUser` only sets `{email, displayName}` on conflict (never `status`/`canInvite`); add a test pinning that re-login does not reset access

## 2. Authorization core

- [x] 2.1 Extend `current-user.ts` to read Clerk `publicMetadata.role` (via session claims) and return `{ id, displayName, isAdmin, status }`; force `isAdmin: true` in dev-bypass
- [x] 2.2 Add `isAdmin(ctx)` and `canCreateInvites(ctx)` = `isAdmin || user.canInvite` helpers (single seam for future delegation)
- [x] 2.3 Add `requireMember()` that resolves the user and throws/redirects unless `isAdmin || status === 'active'`
- [x] 2.4 Unit-test: non-admin without invite is denied; admin bypasses `status`; delegated `canInvite` member passes `canCreateInvites`

## 3. Access gate & routing

- [x] 3.1 Add `app/welcome/page.tsx` ("you need an invite") — public within the authed area
- [x] 3.2 Gate the home + document render paths via `requireMember`, redirecting non-members to `/welcome` (admin short-circuits before the status check so a not-yet-configured admin is never locked out)
- [x] 3.3 Leave `proxy.ts` unchanged (no DB in middleware)

## 4. Invite lifecycle

- [x] 4.1 Add `lib/actions/invites.ts::createInvite` — gated by `canCreateInvites`, generates a URL-safe random token, inserts `pending` invite, returns the `/invite/<token>` URL
- [x] 4.2 Add `revokeInvite(id)` — gated to the invite's creator (or admin), sets `status='revoked'` only if still `pending`
- [x] 4.3 Add `app/invite/[token]/page.tsx` redemption RSC: sign-in first, then atomic `pending→accepted` UPDATE guarded on status + set `users.status='active'`; handle already-member (no-op redirect), accepted, revoked, expired, missing
- [x] 4.4 Tests: first redemption activates + spends; second open rejected; revoked/expired rejected; existing member re-open is a no-op

## 5. Settings & invite UI

- [x] 5.1 Add `@radix-ui/react-dialog`
- [x] 5.2 Add a client `InviteSettings` component: ⚙ glyph button (header idiom) opening a Radix dialog; rendered only when `canCreateInvites`
- [x] 5.3 Dialog: "Generate link" (calls `createInvite`, shows URL + copy via `navigator.clipboard`) and a list of outstanding invites with status + Revoke; `revalidatePath('/')` after mutations
- [x] 5.4 Mount `InviteSettings` in the `app/page.tsx` header; component test for render-gating and copy

## 6. Verify

- [x] 6.1 Test suite green: 161/162 (all invite/access tests pass; the 1 failure is pre-existing `lib/reading/prefs.test.ts` block-gap literal, unrelated to this change, fails on clean HEAD too)
- [x] 6.2 `pnpm build` green (ES2017 tsc target — catches what Vitest won't)
- [ ] 6.3 Manual: set admin `publicMetadata` in Clerk dashboard; confirm gate bounces an uninvited account and a redeemed link grants access
