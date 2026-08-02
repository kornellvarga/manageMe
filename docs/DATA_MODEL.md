# ManageMe data model

`contracts/manage-me-state.schema.json` is the canonical personal-management state contract. `contracts/manage-me-command.schema.json` is the supported task/project mutation envelope.

Finance is intentionally stored separately. `contracts/finance-ledger.schema.json` defines the synchronized money ledger and `contracts/finance-command.schema.json` defines controlled finance mutations. The private data repository therefore contains:

- `state.json` — areas, projects, tasks, routines, focus, and activity;
- `finance.json` — expense/income entries and money categories.

Keeping these files separate prevents a growing transaction history from making ordinary task updates large or conflict-prone.

## Personal-management abstractions

- **Inbox task** — a thought captured quickly, before it is organized.
- **Area** — an ongoing responsibility with no finish line, such as Home, PhD, Career, Anime Studio, or Finance.
- **Project** — a finishable outcome inside an area, such as “Submit the methods chapter.”
- **Task** — one concrete next action. It may belong to an area and project.
- **Routine** — a repeating responsibility tracked separately from the task backlog.
- **Daily focus** — zero to three active tasks for one local calendar day.
- **Activity** — append-only evidence of state-changing commands and their request IDs.

## Finance abstractions

- **Money entry** — an expense or income record with category, amount in minor units, original currency, optional name, and original timestamp.
- **Money category** — a separately ordered expense or income category used by the native quick-add screen.
- **Stable sync ID** — an identifier shared by SQLite and GitHub so retries do not duplicate entries.
- **Tombstone** — a deletion timestamp retained long enough to propagate deletion to other clients.

HUF, EUR, and TRY/TL values remain in their original currencies. The synchronized ledger does not silently convert or combine currencies. Display conversion remains a presentation feature of the Android app using its cached reference rates.

## Mutation and synchronization rules

Every personal-management command sends:

- `profileId: "kornel"`;
- an actor (`web`, `android`, `assistant`, or `kornel`);
- a globally unique `requestId` for idempotency;
- an optional expected revision;
- one supported command type and payload.

Finance commands use the same owner, actor, and request-ID principles. Android finance synchronization sends a complete local snapshot containing stable IDs and update timestamps. The gateway merges records by ID using the newest `updatedAtMillis`, commits the canonical ledger to the private repository, and returns it for merging into SQLite. Local quick-add writes never wait for the network.

The gateway reads the latest private GitHub file, applies the command or merge, and writes with the file SHA. Conflicting writes are reread and retried. Repeating the same command request ID does not repeat the action.

Important product constraints:

- Daily focus is capped at three real, active tasks.
- Completing a task removes it from daily focus.
- An assistant may suggest priorities, but may not invent a deadline or claim completion.
- An assistant may read or change finance only through the validated finance tools; it must not invent transactions, amounts, currencies, or exchange rates.
- Live personal and financial state belongs only in the private data repository and local device caches/databases.
