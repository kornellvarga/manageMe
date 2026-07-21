# ManageMe data model

`contracts/manage-me-state.schema.json` is the canonical state contract. `contracts/manage-me-command.schema.json` is the only supported mutation envelope.

## Abstractions

- **Inbox task** — a thought captured quickly, before it is organized.
- **Area** — an ongoing responsibility with no finish line, such as Home, PhD, Career, Anime Studio, or Finance.
- **Project** — a finishable outcome inside an area, such as “Submit the methods chapter.”
- **Task** — one concrete next action. It may belong to an area and project.
- **Routine** — a repeating responsibility tracked separately from the task backlog.
- **Daily focus** — zero to three active tasks for one local calendar day.
- **Activity** — append-only evidence of state-changing commands and their request IDs.

## Mutation rules

Every client sends a command with:

- `profileId: "kornel"`;
- an actor (`web`, `android`, `assistant`, or `kornel`);
- a globally unique `requestId` for idempotency;
- an optional expected revision;
- one supported command type and payload.

The gateway reads the latest private GitHub file, applies the command, and writes with the file SHA. Conflicting writes are reread and retried. Repeating the same request ID does not repeat the action.

Important product constraints:

- Daily focus is capped at three real, active tasks.
- Completing a task removes it from daily focus.
- An assistant may suggest priorities, but may not invent a deadline or claim completion.
- Live personal state belongs only in the private data repository and local device caches.

