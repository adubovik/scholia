# app-access-control Specification

## Purpose
TBD - created by archiving change add-invite-access-control. Update Purpose after archive.
## Requirements
### Requirement: Admin identity is anchored in Clerk metadata

The system SHALL treat an authenticated user as admin if and only if their Clerk `publicMetadata.role` equals `"admin"`. Admin status MUST NOT be derivable from anything a user can set themselves (e.g. their email string alone, or a self-writable field). `publicMetadata` is only writable via the Clerk dashboard or backend API, so it is the sole root of trust for admin authorization.

#### Scenario: Admin recognized from Clerk metadata

- **WHEN** a user whose Clerk `publicMetadata.role` is `"admin"` authenticates
- **THEN** the system SHALL treat them as admin (full access plus invite-management rights)

#### Scenario: Non-admin cannot self-promote

- **WHEN** a user without `publicMetadata.role === "admin"` authenticates, regardless of their email, display name, or any client-supplied data
- **THEN** the system SHALL NOT treat them as admin

#### Scenario: Dev-bypass user is admin

- **WHEN** the app runs in dev-bypass mode (`SCHOLIA_AUTH=dev` and not on Vercel)
- **THEN** the local dev user SHALL be treated as admin so local and e2e flows are unaffected

### Requirement: Member access is derived from a redeemed invite

The system SHALL record, per user, whether they have active access to the app. A user's access status becomes active only by redeeming a valid invite link (or by being admin). Merely authenticating with Clerk SHALL NOT grant app access.

#### Scenario: Authenticated but never invited

- **WHEN** a user authenticates via Clerk but is neither admin nor has redeemed an invite
- **THEN** the system SHALL treat them as not having access

#### Scenario: Access persists across logins

- **WHEN** a user who previously redeemed an invite signs in again
- **THEN** the system SHALL still treat them as an active member, and re-login (user upsert) SHALL NOT reset their access status

### Requirement: Production access is gated to admin and members

The system SHALL prevent users who are neither admin nor active members from reaching any document read path or mutation. Such users SHALL be redirected to a "you need an invite" page. The gate MUST be enforced server-side (not only in the UI).

#### Scenario: Member reaches the app

- **WHEN** an admin or active member navigates to the home page or a document
- **THEN** the system SHALL render the requested page

#### Scenario: Uninvited user is bounced

- **WHEN** an authenticated user who is not admin and not an active member navigates to any gated page
- **THEN** the system SHALL redirect them to the "need an invite" page instead of rendering app content

#### Scenario: Uninvited user cannot mutate

- **WHEN** an authenticated user who is not admin and not an active member invokes any server action that requires membership
- **THEN** the system SHALL reject the action

### Requirement: Invite-creation permission is centrally checked and delegable

The system SHALL determine "may this user create invites?" through a single authorization helper that returns true when the user is admin OR when the user carries a `canInvite` grant. Only admin-controlled code paths may set `canInvite`. This is the seam for the future step of letting the admin delegate invite power to selected members; the delegation UI is out of scope for this change.

#### Scenario: Admin may create invites

- **WHEN** the invite-creation permission is checked for an admin
- **THEN** the helper SHALL return true

#### Scenario: Ordinary member may not create invites yet

- **WHEN** the invite-creation permission is checked for an active member who has no `canInvite` grant
- **THEN** the helper SHALL return false

#### Scenario: Delegated member may create invites

- **WHEN** the invite-creation permission is checked for a member whose `canInvite` grant is set
- **THEN** the helper SHALL return true

