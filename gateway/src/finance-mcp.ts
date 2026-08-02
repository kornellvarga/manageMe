import { activeFinanceEntries, financeSummary, normalizeFinanceCurrency, normalizeFinanceType } from "./finance";
import { applyFinanceCommandToGitHub, readFinanceLedger } from "./finance-store";
import type { FinanceCommand, FinanceEntry } from "./finance";
import type { AuthContext, Env } from "./types";

export interface FinanceToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  securitySchemes: Array<{ type: "oauth2"; scopes: string[] }>;
}

const FINANCE_TOOL_NAMES = new Set([
  "finance_list_entries",
  "finance_summary",
  "finance_list_categories",
  "finance_add_entry",
  "finance_update_entry",
  "finance_delete_entry",
  "finance_add_category",
  "finance_delete_category",
]);

function tool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  readOnly: boolean,
  idempotent = false,
  destructive = false,
): FinanceToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema: { type: "object", additionalProperties: false, properties, required },
    annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: readOnly ? ["manage:read"] : ["manage:read", "manage:write"] }],
  };
}

export function financeToolsFor(): FinanceToolDefinition[] {
  return [
    tool("finance_list_entries", "List money entries", "Read Kornel's synchronized expense and income entries. Use filters when he asks about a period, category, currency, or entry type.", {
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      category: { type: "string", description: "Case-insensitive category filter." },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      from: { type: "string", description: "Inclusive ISO date or date-time." },
      to: { type: "string", description: "Exclusive ISO date or date-time. A date means the start of the following day." },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    }, [], true, true),
    tool("finance_summary", "Summarize finances", "Summarize synchronized income, expenses, balances, and categories while keeping HUF, EUR, and TRY separate. No invented exchange rate is used.", {
      from: { type: "string", description: "Inclusive ISO date or date-time." },
      to: { type: "string", description: "Exclusive ISO date or date-time. A date means the start of the following day." },
    }, [], true, true),
    tool("finance_list_categories", "List money categories", "List the active expense and income categories synchronized with the Android money tracker.", {
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
    }, [], true, true),
    tool("finance_add_entry", "Add a money entry", "Add one expense or income entry to the synchronized ledger. Preserve the original currency and use the exact amount Kornel gives.", {
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      category: { type: "string", minLength: 1, maxLength: 120 },
      amount: { type: "number", exclusiveMinimum: 0, description: "Amount in normal currency units, for example 4500 HUF or 12.50 EUR." },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      name: { type: "string", maxLength: 240 },
      occurred_at: { type: "string", format: "date-time", description: "Optional original transaction time. Omit for now." },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["type", "category", "amount", "currency"], false),
    tool("finance_update_entry", "Update a money entry", "Correct an existing synchronized expense or income entry. Change only fields Kornel explicitly supplies.", {
      entry_id: { type: "string" },
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      category: { type: "string", minLength: 1, maxLength: 120 },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      name: { type: "string", maxLength: 240 },
      occurred_at: { type: "string", format: "date-time" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["entry_id"], false, true),
    tool("finance_delete_entry", "Delete a money entry", "Delete one specific synchronized money entry only after Kornel clearly asks to remove it.", {
      entry_id: { type: "string" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["entry_id"], false, true, true),
    tool("finance_add_category", "Add a money category", "Add an expense or income category that will synchronize back to the Android tracker.", {
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      name: { type: "string", minLength: 1, maxLength: 120 },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["type", "name"], false, true),
    tool("finance_delete_category", "Delete a money category", "Remove one synchronized category without deleting old entries that used it.", {
      category_id: { type: "string" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["category_id"], false, true, true),
  ];
}

export function isFinanceTool(name: string): boolean {
  return FINANCE_TOOL_NAMES.has(name);
}

function resultText(message: string, structuredContent: Record<string, unknown>, isError = false): Record<string, unknown> {
  return { content: [{ type: "text", text: message }], structuredContent, ...(isError ? { isError: true } : {}) };
}

function writeScopeChallenge(env: Env): Record<string, unknown> {
  const metadata = `${env.PUBLIC_ORIGIN.replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
  const challenge = `Bearer resource_metadata="${metadata}", scope="manage:read manage:write", error="insufficient_scope", error_description="Write access is required to update ManageMe finances."`;
  return {
    ...resultText("Reconnect ManageMe with write access to change finance data.", { error: "insufficient_scope" }, true),
    _meta: { "mcp/www_authenticate": [challenge] },
  };
}

function requestId(args: Record<string, unknown>): string {
  const supplied = typeof args.request_id === "string" && /^[a-z0-9][a-z0-9_-]{2,95}$/i.test(args.request_id) ? args.request_id.toLowerCase() : undefined;
  return supplied || `finance_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 96);
}

function command(type: FinanceCommand["type"], args: Record<string, unknown>, payload: Record<string, unknown>): FinanceCommand {
  return { requestId: requestId(args), profileId: "kornel", actor: "assistant", type, payload };
}

function amountCents(value: unknown): number {
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(cents)) throw new Error("Amount must be a positive number.");
  return cents;
}

function dateMillis(value: unknown, endBoundary = false): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = Date.parse(dateOnly ? `${text}T00:00:00+02:00` : text);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid date: ${text}`);
  return dateOnly && endBoundary ? parsed + 86_400_000 : parsed;
}

function safeLimit(value: unknown): number {
  const parsed = Number(value || 100);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(parsed, 500)) : 100;
}

function filterEntries(entries: FinanceEntry[], args: Record<string, unknown>): FinanceEntry[] {
  const type = args.type ? normalizeFinanceType(args.type) : undefined;
  const currency = args.currency ? normalizeFinanceCurrency(args.currency) : undefined;
  const category = typeof args.category === "string" ? args.category.trim().toLocaleLowerCase() : undefined;
  const from = dateMillis(args.from);
  const to = dateMillis(args.to, true);
  return entries.filter((entry) => (!type || entry.type === type)
    && (!currency || entry.currencyCode === currency)
    && (!category || entry.category.toLocaleLowerCase() === category)
    && (from === undefined || entry.createdAtMillis >= from)
    && (to === undefined || entry.createdAtMillis < to));
}

function formatAmount(cents: number, currency: string): string {
  const amount = cents / 100;
  return `${new Intl.NumberFormat("en", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount)} ${currency === "TRY" ? "TL" : currency}`;
}

export async function callFinanceTool(name: string, args: Record<string, unknown>, env: Env, auth: AuthContext): Promise<Record<string, unknown>> {
  if (name === "finance_list_entries") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const entries = filterEntries(activeFinanceEntries(ledger), args).slice(0, safeLimit(args.limit));
    return resultText(`Found ${entries.length} money entr${entries.length === 1 ? "y" : "ies"}.`, { entries, revision: ledger.revision });
  }
  if (name === "finance_summary") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const from = dateMillis(args.from);
    const to = dateMillis(args.to, true);
    const summary = financeSummary(ledger, from, to);
    const totals = summary.byCurrency.map((item) => `${formatAmount(item.expenseCents, item.currencyCode)} spent / ${formatAmount(item.incomeCents, item.currencyCode)} income`).join("; ");
    return resultText(summary.entryCount ? `Finance summary for ${summary.entryCount} entries: ${totals}.` : "No synchronized money entries matched that period.", { ...summary, fromMillis: from, toMillis: to, revision: ledger.revision });
  }
  if (name === "finance_list_categories") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const type = args.type ? normalizeFinanceType(args.type) : undefined;
    const categories = ledger.categories.filter((category) => !category.deletedAtMillis && (!type || category.type === type));
    return resultText(`Found ${categories.length} active categor${categories.length === 1 ? "y" : "ies"}.`, { categories, revision: ledger.revision });
  }

  if (!auth.scopes.includes("manage:write")) return writeScopeChallenge(env);

  if (name === "finance_add_entry") {
    const result = await applyFinanceCommandToGitHub(env, command("add_entry", args, {
      type: args.type,
      category: args.category,
      amountCents: amountCents(args.amount),
      currencyCode: args.currency,
      name: args.name,
      createdAtMillis: dateMillis(args.occurred_at) ?? Date.now(),
    }));
    const entry = result.ledger.entries.find((item) => item.id === result.entityId);
    return resultText(`Added ${entry ? formatAmount(entry.amountCents, entry.currencyCode) : "money entry"} for ${entry?.category || String(args.category)}.`, { entry, revision: result.ledger.revision });
  }
  if (name === "finance_update_entry") {
    const payload: Record<string, unknown> = { id: args.entry_id };
    if ("type" in args) payload.type = args.type;
    if ("category" in args) payload.category = args.category;
    if ("amount" in args) payload.amountCents = amountCents(args.amount);
    if ("currency" in args) payload.currencyCode = args.currency;
    if ("name" in args) payload.name = args.name;
    if ("occurred_at" in args) payload.createdAtMillis = dateMillis(args.occurred_at);
    const result = await applyFinanceCommandToGitHub(env, command("update_entry", args, payload));
    const entry = result.ledger.entries.find((item) => item.id === result.entityId);
    return resultText(`Updated money entry ${entry?.name || String(args.entry_id)}.`, { entry, revision: result.ledger.revision });
  }
  if (name === "finance_delete_entry") {
    const result = await applyFinanceCommandToGitHub(env, command("delete_entry", args, { id: args.entry_id }));
    const entry = result.ledger.entries.find((item) => item.id === result.entityId);
    return resultText(`Deleted money entry ${entry?.name || String(args.entry_id)}.`, { entry, revision: result.ledger.revision });
  }
  if (name === "finance_add_category") {
    const result = await applyFinanceCommandToGitHub(env, command("add_category", args, { type: args.type, name: args.name }));
    const category = result.ledger.categories.find((item) => item.id === result.entityId);
    return resultText(`Added ${category?.type.toLowerCase() || String(args.type).toLowerCase()} category: ${category?.name || String(args.name)}.`, { category, revision: result.ledger.revision });
  }
  if (name === "finance_delete_category") {
    const result = await applyFinanceCommandToGitHub(env, command("delete_category", args, { id: args.category_id }));
    const category = result.ledger.categories.find((item) => item.id === result.entityId);
    return resultText(`Deleted category ${category?.name || String(args.category_id)}. Old entries remain in history.`, { category, revision: result.ledger.revision });
  }
  throw new Error(`Unknown finance tool: ${name}`);
}
