## ADDED Requirements

### Requirement: Authorized users can create single-use invite links

A user with invite-creation permission SHALL be able to generate an invite link. Each link carries a cryptographically random, unguessable token and is redeemable exactly once. The link MAY carry an optional recipient email label and an optional expiry. Users without invite-creation permission SHALL NOT be able to create links.

#### Scenario: Admin generates a link

- **WHEN** an admin requests a new invite link
- **THEN** the system SHALL create an invite with a unique random token and status `pending`, and return a shareable URL of the form `/invite/<token>`

#### Scenario: Unauthorized user cannot create a link

- **WHEN** a user without invite-creation permission invokes the create-invite action
- **THEN** the system SHALL reject the request and create no invite

### Requirement: Redeeming a valid link grants membership once

The system SHALL, when an authenticated user opens a valid pending invite link, mark that user as an active member and mark the invite as accepted (recording who redeemed it and when). A given link SHALL grant membership to at most one user.

#### Scenario: First redemption succeeds

- **WHEN** an authenticated user opens a pending, non-expired, non-revoked invite link
- **THEN** the system SHALL set that user's access status to active, mark the invite accepted with the redeemer's id and timestamp, and redirect them into the app

#### Scenario: Already-spent link is rejected

- **WHEN** a user opens an invite link that has already been accepted
- **THEN** the system SHALL NOT grant membership and SHALL show an "invite already used" message

#### Scenario: Revoked or expired link is rejected

- **WHEN** a user opens an invite link that has been revoked or whose expiry has passed
- **THEN** the system SHALL NOT grant membership and SHALL show an "invite no longer valid" message

#### Scenario: Unauthenticated visitor to a link

- **WHEN** an unauthenticated visitor opens an invite link
- **THEN** the system SHALL route them through Clerk sign-in/up and return them to the link to complete redemption

#### Scenario: Existing member re-opens a link

- **WHEN** a user who is already an active member opens any invite link
- **THEN** the system SHALL leave that user's membership intact and SHALL NOT spend an unrelated pending link on them

### Requirement: Invite creators can view and revoke outstanding invites

The system SHALL let a user with invite-creation permission see the invites they created with their status, and revoke any of their own pending invites. Revoking a pending invite SHALL make it non-redeemable. An already-accepted invite SHALL NOT be revocable (redemption already happened).

#### Scenario: List shows invite status

- **WHEN** an authorized user opens the invite management view
- **THEN** the system SHALL list their invites with each invite's status (pending / accepted / revoked) and, for accepted ones, who redeemed it

#### Scenario: Revoke a pending invite

- **WHEN** an authorized user revokes one of their pending invites
- **THEN** the system SHALL set that invite's status to revoked so it can no longer be redeemed

### Requirement: Invite management is reachable from a settings control

The system SHALL expose invite management behind a settings control rendered as a gear (⚙) glyph button in the app header. Activating it SHALL open a dialog to generate a link, copy it to the clipboard, and view/revoke outstanding invites. The control SHALL be shown only to users with invite-creation permission.

#### Scenario: Admin opens settings

- **WHEN** an admin clicks the ⚙ settings button in the header
- **THEN** the system SHALL open the invite management dialog

#### Scenario: Copy a generated link

- **WHEN** an admin generates a link inside the dialog and clicks copy
- **THEN** the system SHALL place the full invite URL on the clipboard

#### Scenario: Control hidden from non-inviters

- **WHEN** an active member without invite-creation permission views the header
- **THEN** the system SHALL NOT render the settings/invite control for them
