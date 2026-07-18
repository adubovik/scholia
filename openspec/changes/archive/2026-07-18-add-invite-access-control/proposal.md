## Why

The app is deployed to production but Clerk sign-up is open, and `requireUser` upserts a `users` row for *anyone* who authenticates — so today there is no "allowed vs. not-allowed" concept and any stranger who signs up can use the app. During this early stage, access should be limited to people the admin has personally invited. The admin (Anton) also needs a tamper-proof anchor for admin privileges so no user can self-promote.

## What Changes

- **Gate production access to invited members only.** An authenticated user may use the app only if they are the admin or have redeemed a valid invite. Everyone else is bounced to a "you need an invite" page. **BREAKING** for any Clerk account that signed in but was never invited (currently none but the admin).
- **Anchor admin privileges in Clerk.** Admin status is read from Clerk `publicMetadata.role === "admin"` (set once in the Clerk dashboard for the admin's account). `publicMetadata` is only writable server-side/dashboard, so it cannot be self-set — it is the root of trust for authorization.
- **Single-use invite links, admin-created.** The admin generates a per-person invite link (random token). A link redeems exactly once: the redeeming user becomes an active member; the link is then spent. Links can be revoked and optionally expire.
- **Invite management UI.** A settings control (⚙ glyph button in the home header) opens a Radix dialog to generate a link, copy it, and see/revoke outstanding invites. Admin-only for now.
- **Future-proof delegation seam (not built now).** Add a `canInvite` flag on `users` and route all "may create invites?" checks through one helper (`admin OR users.canInvite`). The next step — letting the admin grant invite power to specific members — becomes a toggle, no schema/authz rework.
- **Dev-bypass stays open.** In `SCHOLIA_AUTH=dev` mode the local user is treated as admin so local/e2e flows are unaffected.

## Capabilities

### New Capabilities
- `app-access-control`: who may use the deployed app — admin identity anchored in Clerk metadata, member access derived from a redeemed invite, and the server-side gate that bounces everyone else.
- `invite-links`: single-use invite link lifecycle (create, redeem, revoke, list) plus the settings UI to manage them.

### Modified Capabilities
<!-- None — openspec/specs/ is empty; this is the first access-control spec. -->

## Impact

- **Schema (`lib/db/schema.ts`, `db:push`):** new `invites` table; new `users` columns (`status` for member access, `canInvite` for the delegation seam). Mind the shared-DB drift hazard.
- **Auth (`lib/auth/`):** `current-user.ts` returns admin/member context (reads Clerk `publicMetadata`); new `requireMember` gate and `canCreateInvites` helper; `upsert-user.ts` must not clobber `status`/`canInvite` on re-login; `authorize.ts` unchanged (document-level).
- **Routing:** membership gate in the authed RSC layout; new `app/invite/[token]/` redemption route; new "need an invite" page. `proxy.ts` unchanged (keeps DB out of middleware).
- **Actions:** new `lib/actions/invites.ts` (`createInvite`, `revokeInvite`).
- **UI:** new settings control + invite dialog in the home header (`app/page.tsx`); adds `@radix-ui/react-dialog` (consistent with existing Radix usage).
- **Env/config:** relies on Clerk `publicMetadata` being set in the dashboard; no new secret required.
