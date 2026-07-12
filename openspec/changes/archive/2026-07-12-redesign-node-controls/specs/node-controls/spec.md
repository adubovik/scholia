## ADDED Requirements

### Requirement: Reading view carries no persistent per-node control chrome

The reading view SHALL present node prose without any always-visible or partially-visible per-node editing or note affordance. The removed pencil glyph and hover popover of restructuring buttons SHALL NOT appear in any state on nodes that have no note.

#### Scenario: A node without a note shows no control chrome

- **WHEN** a node has no whole-node annotation and the pointer is not interacting with it
- **THEN** no pencil, marker, popover, or restructuring buttons are rendered for that node
- **AND** only the node's prose, sigla/title, and collapse toggle are visible

#### Scenario: Prose body remains the text-selection surface

- **WHEN** the user selects text within a node's prose body
- **THEN** the inline-annotation selection flow (`SelectionPopover`) is triggered
- **AND** no node-level control is triggered by selecting or clicking prose text

### Requirement: Annotated nodes display a quiet marginal marker

A node that carries a whole-node annotation SHALL display a marginal marker rendered as `¶` in the muted mono chrome style, positioned in the node's left margin. The marker SHALL be shown regardless of node shape (leaf prose, heading, or titled section). Nodes without a whole-node annotation SHALL NOT display the marker.

#### Scenario: Marker appears only when a note exists

- **WHEN** a node has a whole-node annotation
- **THEN** the `¶` marginal marker is rendered for that node
- **WHEN** a node has no whole-node annotation
- **THEN** no marginal marker is rendered for that node

#### Scenario: Marker is uniform across node types

- **WHEN** a leaf prose node with no siglum or title carries a whole-node annotation
- **THEN** it displays the same `¶` marginal marker as a titled section node with an annotation

### Requirement: The marginal marker reveals the note inline

Activating a node's marginal marker SHALL open that node's whole-node annotation inline beneath the node head, reusing the existing inline note view. Activating it again SHALL close the note.

#### Scenario: Reader opens a note

- **WHEN** the user clicks (or activates via keyboard) a node's `¶` marker
- **THEN** the node's annotation content is displayed inline beneath the node
- **WHEN** the user activates the marker again
- **THEN** the inline annotation is hidden

### Requirement: A row context menu provides node editing actions

Each node SHALL expose a context menu, opened by right-click or by touch long-press anywhere on the node row (excluding a prose text selection). For editors the menu SHALL offer the restructuring actions (Move up, Move down, Outdent, Indent) and a note action; for any reader whose node has children it SHALL offer Collapse children and Expand children (view-only, available regardless of edit permission). The note action is editor-only and SHALL read "Add note" when the node has no annotation and "Edit note" when it does. Selecting a restructuring action SHALL invoke the corresponding existing server action; selecting the note action SHALL open the inline note view for editing. The menu SHALL render whenever at least one action applies (the user can edit, or the node has children).

#### Scenario: Collapse/Expand children fold the whole subtree

- **WHEN** a reader opens the menu on a node that has children and chooses Collapse children
- **THEN** every descendant of that node becomes collapsed
- **WHEN** the reader chooses Expand children
- **THEN** every descendant of that node becomes expanded

#### Scenario: Restructuring shortcuts are shown beside their commands

- **WHEN** an editor views the menu
- **THEN** each restructuring command displays its keyboard shortcut (`⌥↑`, `⌥↓`, `⌥[`, `⌥]`), left-aligned command name and right-aligned shortcut
- **AND** the shortcut hint is not part of the command's accessible name

#### Scenario: The node a menu acts on is highlighted while open

- **WHEN** a node's menu (context menu or `⋮` dropdown) is open
- **THEN** that node's content is visually marked (a lighter background and a dashed border) for as long as the menu stays open
- **AND** the marking is removed when the menu closes
- **AND** applying it does not shift the surrounding prose

#### Scenario: Owner opens the menu and restructures a node

- **WHEN** an editor right-clicks (or long-presses) a node row
- **THEN** a context menu appears offering Move up, Move down, Outdent, Indent, and the note action
- **WHEN** the editor chooses Indent
- **THEN** the node is indented via the existing indent action and the view revalidates

#### Scenario: Note action label reflects note presence

- **WHEN** the node has no whole-node annotation
- **THEN** the menu's note action reads "Add note"
- **WHEN** the node already has a whole-node annotation
- **THEN** the menu's note action reads "Edit note"

#### Scenario: Restructuring actions are limited to editors

- **WHEN** a viewer who cannot edit the document opens a node's context menu
- **THEN** the restructuring actions (Move up/down, Outdent, Indent) are not offered

### Requirement: Empty reading space exposes document-level collapse/expand

Right-clicking (or long-pressing) the reading canvas outside any node SHALL open a menu offering Collapse children and Expand children that act on the invisible top-level — folding or unfolding every node in the document. Right-clicking a node SHALL open that node's own menu instead, not this one.

#### Scenario: Collapse the whole document from empty space

- **WHEN** the reader right-clicks empty reading space and chooses Collapse children
- **THEN** every node in the document becomes collapsed
- **WHEN** the reader chooses Expand children
- **THEN** every node in the document becomes expanded

#### Scenario: A node's own menu takes precedence over the canvas menu

- **WHEN** the reader right-clicks on a node that has its own menu
- **THEN** the node's menu opens and the document-level menu does not

### Requirement: A discoverability hint opens the menu for pointer users

Each node that has an available menu SHALL provide a hover-revealed hint rendered as a vertical ellipsis (`⋮`) in the node's gutter that, when activated, opens the same context menu. The hint SHALL be revealed on row hover (or when focused) and SHALL NOT be persistently visible.

#### Scenario: Mouse user discovers the menu without right-clicking

- **WHEN** the pointer hovers a node row that has an available menu
- **THEN** a `⋮` hint appears in the node's gutter
- **WHEN** the user clicks the hint
- **THEN** the same context menu opens as with right-click

### Requirement: Keyboard shortcuts restructure the engaged node

When a node is engaged (its `⋯` hint control focused), the system SHALL support keyboard shortcuts that act on that node, using bindings that do not clash with browser navigation or focus traversal: `Alt+ArrowUp` to move up, `Alt+ArrowDown` to move down, `Alt+]` to indent, and `Alt+[` to outdent. Shortcuts SHALL invoke the same server actions as the menu and SHALL only apply for users who can edit the document. Bracket shortcuts SHALL be matched by physical key (`event.code`) so platform Option/Alt character composition does not mask them.

#### Scenario: Editor moves a node by keyboard

- **WHEN** an editor has a node's hint control focused and presses `Alt+ArrowDown`
- **THEN** the node moves down via the existing move-down action

#### Scenario: Indent/outdent use non-clashing bindings

- **WHEN** an editor has a node's hint control focused and presses `Alt+]`
- **THEN** the node indents via the existing indent action
- **AND** the shortcut does not trigger any browser back/forward navigation

#### Scenario: Focus traversal is preserved when not engaged

- **WHEN** no node's hint control is focused
- **THEN** `Tab` and browser navigation keys retain their normal behavior

### Requirement: The context menu is accessible

The context menu SHALL provide keyboard navigation between items, close on `Escape`, return focus to the trigger on close, close on outside click, and be operable by touch long-press. Interactive markers and hints SHALL have accessible labels and adequate hit areas.

#### Scenario: Menu is keyboard operable and dismissible

- **WHEN** the menu is open
- **THEN** the user can move between items with arrow keys and activate one with Enter
- **WHEN** the user presses `Escape`
- **THEN** the menu closes and focus returns to the element that opened it

#### Scenario: Menu closes on outside interaction

- **WHEN** the menu is open and the user clicks outside it
- **THEN** the menu closes without invoking any action
