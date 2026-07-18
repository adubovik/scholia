## Context

Reads are RSC hitting Neon directly; mutations are `"use server"` actions gated by an auth check; `proxy.ts` (Clerk) forces authentication on everything except sign-in/up and webhooks. Two facts about the current auth model drive this design:

- `lib/auth/current-user.ts::requireUser` calls `upsertUser` on **every** authenticated request, so a `users` row means only "signed in once" — not "allowed." We need an explicit access state.
- There is no `role` column and no invite tables. `authorize.ts` is document-owner-only and stays as-is.

Decisions already made with the user: admin is anchored in **Clerk `publicMetadata.role`**; invite links are **single-use per person**; delegated invite power (letting members invite) is the **next step**, not this change.

## Goals / Non-Goals

**Goals:**
- Only admin + users who redeemed an invite can use the prod app; everyone else is bounced server-side.
- Admin privilege cannot be self-granted (root of trust = Clerk metadata, set in dashboard).
- Admin can generate, copy, list, and revoke single-use invite links from a ⚙ settings control in the header.
- Leave a clean seam so "let member X invite others" is later a toggle, not a redesign.
- Local dev-bypass keeps working unchanged.

**Non-Goals:**
- The delegation UI (admin granting `canInvite` to members) — schema/authz seam only.
- Restricting Clerk sign-up itself. Sign-up stays open; the app gate does the work. An uninvited signup just lands on the "need an invite" page.
- Email delivery of invites — admin copies the link and shares it out-of-band.
- Multi-use links, per-document sharing, or the M5 collaborator role matrix.

## Decisions

**1. Admin from Clerk `publicMetadata.role`, read via session claims.**
`current-user.ts` reads `sessionClaims.metadata?.role` (or `currentUser().publicMetadata.role`) and returns `isAdmin`. Set once in the Clerk dashboard: the admin's Clerk account → `publicMetadata: { "role": "admin" }`. `publicMetadata` is only writable server-side/dashboard, so no user can self-promote. `publicMetadata` is world-readable client-side — acceptable, "is admin" is not a secret. Dev-bypass (`isDevAuth()`) forces `isAdmin: true` for the local user.

**2. Access state on `users`, not a separate membership table (yet).**
Add two columns:
```
users.status     text  not null default 'pending'   -- 'pending' | 'active'
users.canInvite  boolean not null default false      -- future delegation seam
```
`active` = redeemed an invite. A single-column check keeps the gate a cheap boolean. A membership/org table is overkill at one-tenant scale (YAGNI); revisit at M5.

**3. `upsertUser` must not clobber access columns.** Its `onConflictDoUpdate` currently overwrites `{email, displayName}` only — good, but we must keep `status`/`canInvite` out of the `set` clause so re-login never demotes a member. Add a test pinning this.

**4. Invites table.**
```
invites:
  id          uuid  pk default random
  token       text  unique not null          -- crypto.randomUUID() or randomBytes, URL-safe
  createdBy   text  -> users.id
  email       text                           -- optional recipient label
  status      text  not null default 'pending'  -- 'pending' | 'accepted' | 'revoked'
  redeemedBy  text  -> users.id (nullable)
  redeemedAt  timestamptz (nullable)
  expiresAt   timestamptz (nullable)
  createdAt   timestamptz not null default now
```
Single-use is enforced by the `status` transition `pending → accepted`, done in one UPDATE guarded by `where status = 'pending'` so a double-open can't double-redeem.

**5. Authorization helpers (one seam each).**
- `isAdmin(ctx)` — from Clerk metadata.
- `canCreateInvites(ctx)` — `isAdmin || user.canInvite`. **All** invite creation routes through this; the future delegation step just flips `canInvite`.
- `requireMember()` — wraps `requireUser`, throws/redirects unless `isAdmin || status === 'active'`. Used by gated actions.

**6. Gate location: authed RSC layout + per-action, not middleware.**
`proxy.ts` stays DB-free (keep middleware lean even though it's Node runtime now). Membership is DB-backed, so the gate lives in a server component boundary: a check in the home/document render path (via `requireMember`) that `redirect()`s non-members to `/welcome` (the "need an invite" page). Mutations independently call `requireMember`. Belt-and-suspenders: UI hides controls, server enforces.

**7. Redemption route: `app/invite/[token]/page.tsx` (RSC).**
On load: `requireUser()` (Clerk forces sign-in first, returning to this URL). Then look up the token:
- already `active` member → redirect to `/` (idempotent; don't spend a link).
- token pending & valid → atomic redeem (set `invites.status='accepted', redeemedBy, redeemedAt`, set `users.status='active'`), redirect to `/`.
- accepted/revoked/expired/missing → render the corresponding message.

**8. UI: ⚙ glyph button → Radix dialog.**
Consistent with the existing glyph + Radix idiom (`＋ New`, `¶`, Radix dropdown/context menus; no icon lib). Add `@radix-ui/react-dialog`. A client `Settings`/`InviteDialog` component mounted in the `app/page.tsx` header, rendered only when `canCreateInvites`. Inside: "Generate link" (calls `createInvite` action, shows URL + copy button via `navigator.clipboard`), and a list of outstanding invites with a Revoke button (`revokeInvite` action). `revalidatePath('/')` after mutations.

## Risks / Trade-offs

- **`db:push` on shared Neon (drift hazard).** New columns default-backfill safely (`status` defaults `'pending'` — but the admin's own row must be reachable regardless via the Clerk-metadata check, so a pending admin still gets in). Push deliberately; one shared DB.
- **Clerk metadata is manual.** Admin must set `publicMetadata` in the dashboard once. If forgotten, the admin themselves is treated as non-member → locked out. Mitigation: the redemption/gate should never hard-lock the Clerk-metadata admin; `isAdmin` short-circuits the gate before the `status` check.
- **Open Clerk sign-up = strangers can create accounts** (just can't use the app). Acceptable for now; the "need an invite" page is the visible wall. Tighten via Clerk restrictions later if spam appears.
- **`status` default `'pending'` retro-applies to existing rows.** Only the admin has a row today, and `isAdmin` bypasses `status`, so no lockout. Any future backfill of already-trusted users would flip them to `'active'` explicitly.
- **`publicMetadata` is client-readable.** Fine for a role flag; do not put anything secret there.
