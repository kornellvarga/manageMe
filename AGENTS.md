# ManageMe agent guide

ManageMe is Kornel's private personal-management system. The product has three clients that must share one contract: the GitHub Pages web app, the Android app, and the remote assistant/MCP tools.

## Product rules

- Treat `profileId: "kornel"` as the owner of this installation.
- Optimize for quick capture and low-friction focus, not maximum configuration.
- The primary flow is: capture something, choose up to three focus items, do or reschedule the next action.
- Areas are ongoing responsibilities. Projects are finishable outcomes. Tasks are concrete next actions. Do not collapse these concepts.
- Never publish Kornel's live personal state in the GitHub Pages artifact or in a public repository.
- Never put GitHub tokens, OAuth secrets, API keys, or the private data-repository name into browser bundles.
- Write operations must use the command contract, include an actor and request ID, and be safe to retry.
- Show sync state and failures visibly. Never imply a local-only change has reached GitHub.
- Assistant suggestions may prioritize or break down work, but must not silently invent deadlines or mark work complete.

## Important paths

- `contracts/`: canonical JSON contracts shared by every client.
- `web/`: static responsive app deployed to GitHub Pages.
- `gateway/`: authenticated API and MCP server that owns GitHub writes.
- `ExpenseButtonTracker/`: existing native Android app and quick-capture surfaces.

## Verification

- Web: `npm run build` in `web`.
- Gateway: `npm test` and `npm run check` in `gateway`.
- Android: `gradlew.bat assembleDebug` in `ExpenseButtonTracker`.

