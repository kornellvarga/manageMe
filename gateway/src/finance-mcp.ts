import {
  financeEntriesByStatus,
  financePlanSummary,
  financeSummary,
  normalizeFinanceCurrency,
  normalizeFinanceMonth,
  normalizeFinanceStatus,
  normalizeFinanceType,
} from "./finance";
import { applyFinanceCommandToGitHub, readFinanceLedger } from "./finance-store";
import type { FinanceCommand, FinanceEntry, FinanceEntryStatus } from "./finance";
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
  "finance_archive_entry",
  "finance_restore_entry",
  "finance_archive_before",
  "finance_delete_entry",
  "finance_add_category",
  "finance_delete_category",
  "finance_get_plan",
  "finance_add_budget",
  "finance_update_budget",
  "finance_delete_budget",
  "finance_add_commitment",
  "finance_update_commitment",
  "finance_delete_commitment",
  "finance_allocate_entry",
  "finance_unallocate_entry",
  "finance_link_commitment",
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

const statusProperty = {
  type: "string",
  enum: ["active", "archived", "all"],
  default: "active",
  description: "Active excludes archived entries. All includes active and archived entries, but never deleted entries.",
};

export function financeToolsFor(): FinanceToolDefinition[] {
  return [
    tool("finance_list_entries", "List money entries", "Read Kornel's synchronized expense and income entries. Current queries exclude archived entries unless status is archived or all.", {
      status: statusProperty,
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      category: { type: "string", description: "Case-insensitive category filter." },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      from: { type: "string", description: "Inclusive ISO date or date-time." },
      to: { type: "string", description: "Exclusive ISO date or date-time. A date means the start of the following day." },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
    }, [], true, true),
    tool("finance_summary", "Summarize finances", "Summarize synchronized income, expenses, balances, and categories while keeping HUF, EUR, and TRY separate. Archived entries are excluded by default.", {
      status: statusProperty,
      from: { type: "string", description: "Inclusive ISO date or date-time." },
      to: { type: "string", description: "Exclusive ISO date or date-time. A date means the start of the following day." },
    }, [], true, true),
    tool("finance_list_categories", "List money categories", "List the active expense and income categories synchronized with the Android money tracker.", {
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
    }, [], true, true),
    tool("finance_get_plan", "Read monthly money plan", "Read Kornel's planned bills and spending budgets for one month, including spent/remaining budget status, planned-vs-actual payment variance, overspend, unused capacity, and unpaid items. Omit month for the current month in Europe/Istanbul.", {
      month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$", description: "Month in YYYY-MM." },
    }, [], true, true),
    tool("finance_add_budget", "Add monthly spending budget", "Create a month-scoped spending envelope such as Pocket Money, Food, or Travel. This is separate from transaction categories.", {
      name: { type: "string", minLength: 1, maxLength: 120 },
      month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      request_id: { type: "string" },
    }, ["name", "month", "amount", "currency"], false, true),
    tool("finance_update_budget", "Update monthly spending budget", "Change a spending envelope's name, month, limit, or currency without changing transaction categories.", {
      budget_id: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 120 },
      month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      request_id: { type: "string" },
    }, ["budget_id"], false, true),
    tool("finance_delete_budget", "Delete monthly spending budget", "Remove a spending envelope from the plan. Existing money entries remain untouched.", {
      budget_id: { type: "string" }, request_id: { type: "string" },
    }, ["budget_id"], false, true, true),
    tool("finance_add_commitment", "Add planned payment", "Create a planned bill or other expected payment for a month. It stays unpaid until linked to an actual expense.", {
      name: { type: "string", minLength: 1, maxLength: 180 },
      month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      category: { type: "string", minLength: 1, maxLength: 120, default: "Bills" },
      due_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      repeat_monthly: { type: "boolean", default: false },
      request_id: { type: "string" },
    }, ["name", "month", "amount", "currency"], false, true),
    tool("finance_update_commitment", "Update planned payment", "Change an expected payment without creating an expense or marking it paid.", {
      commitment_id: { type: "string" },
      name: { type: "string", minLength: 1, maxLength: 180 },
      month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      category: { type: "string", minLength: 1, maxLength: 120 },
      due_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      repeat_monthly: { type: "boolean" },
      request_id: { type: "string" },
    }, ["commitment_id"], false, true),
    tool("finance_delete_commitment", "Delete planned payment", "Remove a planned payment without deleting any linked money entry.", {
      commitment_id: { type: "string" }, request_id: { type: "string" },
    }, ["commitment_id"], false, true, true),
    tool("finance_allocate_entry", "Allocate expense to budget", "Assign all or part of an existing expense to a monthly spending budget. Transaction category remains unchanged.", {
      entry_id: { type: "string" }, budget_id: { type: "string" },
      amount: { type: "number", exclusiveMinimum: 0, description: "Optional partial amount; omit to allocate the full expense." },
      request_id: { type: "string" },
    }, ["entry_id", "budget_id"], false, true),
    tool("finance_unallocate_entry", "Remove budget allocation", "Remove one allocation between an expense and a spending budget.", {
      allocation_id: { type: "string" }, request_id: { type: "string" },
    }, ["allocation_id"], false, true, true),
    tool("finance_link_commitment", "Link payment to planned bill", "Mark a planned payment satisfied by linking it to an actual expense, or clear the link by omitting entry_id.", {
      commitment_id: { type: "string" }, entry_id: { type: "string" }, request_id: { type: "string" },
    }, ["commitment_id"], false, true),
    tool("finance_add_entry", "Add a money entry", "Add one expense or income entry to the synchronized ledger. Preserve the original currency and use the exact amount Kornel gives.", {
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      category: { type: "string", minLength: 1, maxLength: 120 },
      amount: { type: "number", exclusiveMinimum: 0, description: "Amount in normal currency units, for example 4500 HUF or 12.50 EUR." },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      name: { type: "string", maxLength: 240 },
      occurred_at: { type: "string", format: "date-time", description: "Optional original transaction time. Omit for now." },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["type", "category", "amount", "currency"], false),
    tool("finance_update_entry", "Update a money entry", "Correct an existing synchronized expense or income entry. Archived entries may be corrected without restoring them.", {
      entry_id: { type: "string" },
      type: { type: "string", enum: ["EXPENSE", "INCOME"] },
      category: { type: "string", minLength: 1, maxLength: 120 },
      amount: { type: "number", exclusiveMinimum: 0 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      name: { type: "string", maxLength: 240 },
      occurred_at: { type: "string", format: "date-time" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["entry_id"], false, true),
    tool("finance_archive_entry", "Archive a money entry", "Archive one money entry. It remains synchronized and restorable, but stops affecting current balances and statistics.", {
      entry_id: { type: "string" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["entry_id"], false, true),
    tool("finance_restore_entry", "Restore an archived money entry", "Restore one archived money entry so it affects current balances and statistics again.", {
      entry_id: { type: "string" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["entry_id"], false, true),
    tool("finance_archive_before", "Archive old money entries", "Archive every active money entry strictly before the supplied date or date-time. Use only when Kornel explicitly gives the cutoff.", {
      before: { type: "string", description: "Exclusive ISO cutoff. For example, 2026-08-01 archives entries before the start of August 1 in Budapest time." },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["before"], false, true),
    tool("finance_delete_entry", "Delete a money entry", "Permanently hide one specific synchronized money entry only after Kornel clearly asks to delete rather than archive it.", {
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

function requiredDateMillis(value: unknown, label: string): number {
  const parsed = dateMillis(value);
  if (parsed === undefined) throw new Error(`${label} is required.`);
  return parsed;
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

function entryStatus(args: Record<string, unknown>): FinanceEntryStatus {
  return normalizeFinanceStatus(args.status);
}


function currentFinanceMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return normalizeFinanceMonth(`${year}-${month}`);
}

function requestedMonth(args: Record<string, unknown>): string {
  return args.month ? normalizeFinanceMonth(args.month) : currentFinanceMonth();
}

export async function callFinanceTool(name: string, args: Record<string, unknown>, env: Env, auth: AuthContext): Promise<Record<string, unknown>> {
  if (name === "finance_list_entries") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const status = entryStatus(args);
    const entries = filterEntries(financeEntriesByStatus(ledger, status), args).slice(0, safeLimit(args.limit));
    return resultText(`Found ${entries.length} ${status === "all" ? "active or archived" : status} money entr${entries.length === 1 ? "y" : "ies"}.`, { status, entries, revision: ledger.revision });
  }
  if (name === "finance_summary") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const from = dateMillis(args.from);
    const to = dateMillis(args.to, true);
    const status = entryStatus(args);
    const summary = financeSummary(ledger, from, to, status);
    const totals = summary.byCurrency.map((item) => `${formatAmount(item.expenseCents, item.currencyCode)} spent / ${formatAmount(item.incomeCents, item.currencyCode)} income`).join("; ");
    return resultText(summary.entryCount ? `Finance summary for ${summary.entryCount} ${status} entries: ${totals}.` : `No ${status} money entries matched that period.`, { ...summary, status, fromMillis: from, toMillis: to, revision: ledger.revision });
  }
  if (name === "finance_list_categories") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const type = args.type ? normalizeFinanceType(args.type) : undefined;
    const categories = ledger.categories.filter((category) => !category.deletedAtMillis && (!type || category.type === type));
    return resultText(`Found ${categories.length} active categor${categories.length === 1 ? "y" : "ies"}.`, { categories, revision: ledger.revision });
  }

  if (name === "finance_get_plan") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const month = requestedMonth(args);
    const plan = financePlanSummary(ledger, month);
    const remaining = plan.budgets.map((budget) => budget.status === "overspent"
      ? `${budget.name}: ${formatAmount(Math.abs(budget.remainingCents), budget.currencyCode)} over budget`
      : `${budget.name}: ${formatAmount(budget.remainingCents, budget.currencyCode)} remaining`).join("; ");
    const unpaid = plan.insights.unpaid.length;
    const over = plan.insights.overspent.length;
    const message = plan.budgets.length || plan.commitments.length
      ? `Plan for ${month}: ${remaining || "no spending envelopes"}; ${over} item${over === 1 ? "" : "s"} over plan; ${unpaid} unpaid planned payment${unpaid === 1 ? "" : "s"}.`
      : `No budgets or planned payments are set for ${month}.`;
    return resultText(message, { ...plan, revision: ledger.revision });
  }

  if (!auth.scopes.includes("manage:write")) return writeScopeChallenge(env);

  if (name === "finance_add_budget") {
    const result = await applyFinanceCommandToGitHub(env, command("add_budget", args, {
      name: args.name, month: args.month, amountCents: amountCents(args.amount), currencyCode: args.currency,
    }));
    const budget = (result.ledger.budgets || []).find((item) => item.id === result.entityId);
    return resultText(`Added ${budget?.name || String(args.name)} budget for ${budget?.month || String(args.month)}.`, { budget, revision: result.ledger.revision });
  }
  if (name === "finance_update_budget") {
    const payload: Record<string, unknown> = { id: args.budget_id };
    if ("name" in args) payload.name = args.name;
    if ("month" in args) payload.month = args.month;
    if ("amount" in args) payload.amountCents = amountCents(args.amount);
    if ("currency" in args) payload.currencyCode = args.currency;
    const result = await applyFinanceCommandToGitHub(env, command("update_budget", args, payload));
    const budget = (result.ledger.budgets || []).find((item) => item.id === result.entityId);
    return resultText(`Updated budget ${budget?.name || String(args.budget_id)}.`, { budget, revision: result.ledger.revision });
  }
  if (name === "finance_delete_budget") {
    const result = await applyFinanceCommandToGitHub(env, command("delete_budget", args, { id: args.budget_id }));
    return resultText(`Deleted budget ${String(args.budget_id)}. Money entries were not deleted.`, { budgetId: args.budget_id, revision: result.ledger.revision });
  }
  if (name === "finance_add_commitment") {
    const result = await applyFinanceCommandToGitHub(env, command("add_commitment", args, {
      name: args.name,
      month: args.month,
      plannedAmountCents: amountCents(args.amount),
      currencyCode: args.currency,
      category: args.category || "Bills",
      dueDate: args.due_date,
      repeatMonthly: Boolean(args.repeat_monthly),
    }));
    const commitment = (result.ledger.commitments || []).find((item) => item.id === result.entityId);
    return resultText(`Added planned payment ${commitment?.name || String(args.name)}. It is not marked paid until linked to an expense.`, { commitment, revision: result.ledger.revision });
  }
  if (name === "finance_update_commitment") {
    const payload: Record<string, unknown> = { id: args.commitment_id };
    if ("name" in args) payload.name = args.name;
    if ("month" in args) payload.month = args.month;
    if ("amount" in args) payload.plannedAmountCents = amountCents(args.amount);
    if ("currency" in args) payload.currencyCode = args.currency;
    if ("category" in args) payload.category = args.category;
    if ("due_date" in args) payload.dueDate = args.due_date;
    if ("repeat_monthly" in args) payload.repeatMonthly = Boolean(args.repeat_monthly);
    const result = await applyFinanceCommandToGitHub(env, command("update_commitment", args, payload));
    const commitment = (result.ledger.commitments || []).find((item) => item.id === result.entityId);
    return resultText(`Updated planned payment ${commitment?.name || String(args.commitment_id)}.`, { commitment, revision: result.ledger.revision });
  }
  if (name === "finance_delete_commitment") {
    const result = await applyFinanceCommandToGitHub(env, command("delete_commitment", args, { id: args.commitment_id }));
    return resultText(`Deleted planned payment ${String(args.commitment_id)}. Linked expenses were kept.`, { commitmentId: args.commitment_id, revision: result.ledger.revision });
  }
  if (name === "finance_allocate_entry") {
    const payload: Record<string, unknown> = { entryId: args.entry_id, budgetId: args.budget_id };
    if ("amount" in args) payload.amountCents = amountCents(args.amount);
    const result = await applyFinanceCommandToGitHub(env, command("set_allocation", args, payload));
    const allocation = (result.ledger.allocations || []).find((item) => item.id === result.entityId);
    return resultText(`Allocated expense ${String(args.entry_id)} to budget ${String(args.budget_id)}.`, { allocation, revision: result.ledger.revision });
  }
  if (name === "finance_unallocate_entry") {
    const result = await applyFinanceCommandToGitHub(env, command("delete_allocation", args, { id: args.allocation_id }));
    return resultText(`Removed budget allocation ${String(args.allocation_id)}.`, { allocationId: args.allocation_id, revision: result.ledger.revision });
  }
  if (name === "finance_link_commitment") {
    const result = await applyFinanceCommandToGitHub(env, command("link_commitment", args, { id: args.commitment_id, entryId: args.entry_id }));
    const commitment = (result.ledger.commitments || []).find((item) => item.id === result.entityId);
    return resultText(commitment?.linkedEntryId
      ? `Linked ${commitment.name} to its actual payment.`
      : `Cleared the payment link for ${commitment?.name || String(args.commitment_id)}.`, { commitment, revision: result.ledger.revision });
  }

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
  if (name === "finance_archive_entry") {
    const result = await applyFinanceCommandToGitHub(env, command("archive_entry", args, { id: args.entry_id }));
    const entry = result.ledger.entries.find((item) => item.id === result.entityId);
    return resultText(`Archived money entry ${entry?.name || String(args.entry_id)}. It no longer affects current totals.`, { entry, revision: result.ledger.revision });
  }
  if (name === "finance_restore_entry") {
    const result = await applyFinanceCommandToGitHub(env, command("restore_entry", args, { id: args.entry_id }));
    const entry = result.ledger.entries.find((item) => item.id === result.entityId);
    return resultText(`Restored money entry ${entry?.name || String(args.entry_id)} to current totals.`, { entry, revision: result.ledger.revision });
  }
  if (name === "finance_archive_before") {
    const beforeMillis = requiredDateMillis(args.before, "Archive cutoff");
    const result = await applyFinanceCommandToGitHub(env, command("archive_before", args, { beforeMillis }));
    const count = result.affectedCount || 0;
    return resultText(`Archived ${count} active money entr${count === 1 ? "y" : "ies"} before ${String(args.before)}.`, { affectedCount: count, beforeMillis, revision: result.ledger.revision });
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
