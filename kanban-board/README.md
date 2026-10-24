# Vault Kanban

Obsidian plugin: a GitHub Projects-style kanban board (Todo / In progress / Waiting for feedback / Closed), opened from the ribbon icon or the `Vault Kanban: Open board` command.

## Data

```
<vault>/obsidian-kanban/
├── board.json              # { "version": 1, "items": [ ... ] } — order within a column = order in the array
└── archived/
    └── dd-mm-yyyy.json     # [ ...items with "archivedAt" ] — created on the first archive of the day, appended afterwards
```

Item: `{ id, title, description, status, createdAt, updatedAt }`, where `status` is one of `todo`, `in-progress`, `waiting-for-feedback`, `closed`.

Editing `board.json` by hand (or via sync) is picked up live by the open board.

## Usage

- Drag cards between and within columns.
- "+ Add item" at the bottom of a column for quick drafts (Enter adds and keeps the input open, Esc cancels).
- Click a card to edit title, status and description; right-click or `…` for move / archive / delete.
- Closed items: "Archive" on a single card, or "Archive all" from the Closed column's `…` menu.

## Develop

```sh
npm install
npm run build          # type-check + bundle to main.js
npm run install-vault  # build and copy into ~/obsidian-notes (or: node install.mjs /path/to/vault)
npm run dev            # watch mode
```
