# ManageMe contract v1

`manage-me-state.schema.json` is the canonical persisted state contract.
`manage-me-command.schema.json` is the boundary used for every mutation.

The browser, Android app, and assistant tools may cache state locally, but the authenticated gateway is responsible for applying commands and writing the resulting state to the private GitHub data repository.

All commands are idempotent by `requestId`. A client should include the revision it last read. The gateway refetches and reapplies safe commands if the GitHub blob SHA changed; it rejects ambiguous edits instead of overwriting newer state.

