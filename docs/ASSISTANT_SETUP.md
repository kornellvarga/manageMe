# Assistant access

The gateway exposes the same private state as an authenticated MCP server at:

```text
https://manageme-gateway.kornel-718.workers.dev/mcp
```

It supports read tools for focus, item lists, and review, plus scoped write tools for capture, completion, rescheduling, focus selection, and project creation.

## ChatGPT web and mobile

Add the Worker MCP URL as a custom connector/app. The OAuth flow opens GitHub and accepts only Kornel's configured GitHub identity. Because ChatGPT mobile uses the same account and connector configuration, it can use the same ManageMe tools.

## Codex

After the gateway is live:

```powershell
codex mcp add manageme --url https://manageme-gateway.kornel-718.workers.dev/mcp
```

Restart Codex after adding it, then complete the GitHub authorization when prompted.

## Suggested account instruction

Use this as a short account-level instruction or at the start of a management conversation:

> ManageMe belongs to Kornel, even though this OpenAI account is shared. Only use ManageMe when Kornel identifies himself or explicitly asks for Kornel's tasks. Help him capture forgotten obligations, keep Today to at most three concrete actions, explain prioritization plainly, and never mark work complete or invent a deadline without his confirmation.

The server also returns these constraints in MCP initialization instructions, so clients receive them even when chat memory is unavailable.

## Write safety

- Read first when a request is ambiguous.
- Make only the change Kornel requested.
- Use one unique request ID per intended mutation.
- Do not silently add dates, urgency, or completion.
- Report what changed in plain language.
