from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Missing patch marker: {label}")
    if text.count(old) != 1:
        raise RuntimeError(f"Patch marker is not unique: {label} ({text.count(old)})")
    return text.replace(old, new, 1)


def insert_before(text, marker, addition, label):
    return replace_once(text, marker, addition + marker, label)


def insert_after(text, marker, addition, label):
    return replace_once(text, marker, marker + addition, label)


# ---------------------------------------------------------------------------
# Shared finance contract
# ---------------------------------------------------------------------------
finance = read("gateway/src/finance.ts")

finance = insert_before(
    finance,
    "export interface FinanceEntry {",
    '''export interface FinanceBudget {\n  id: string;\n  name: string;\n  month: string;\n  amountCents: number;\n  currencyCode: FinanceCurrency;\n  updatedAtMillis: number;\n  deletedAtMillis?: number;\n}\n\nexport interface FinanceCommitment {\n  id: string;\n  name: string;\n  month: string;\n  plannedAmountCents: number;\n  currencyCode: FinanceCurrency;\n  category: string;\n  dueDate?: string;\n  repeatMonthly: boolean;\n  linkedEntryId?: string;\n  updatedAtMillis: number;\n  deletedAtMillis?: number;\n}\n\nexport interface FinanceAllocation {\n  id: string;\n  entryId: string;\n  budgetId: string;\n  amountCents: number;\n  updatedAtMillis: number;\n  deletedAtMillis?: number;\n}\n\n''',
    "planning interfaces",
)

finance = replace_once(
    finance,
    "  categories: FinanceCategory[];\n  appliedRequestIds: string[];",
    "  categories: FinanceCategory[];\n  budgets?: FinanceBudget[];\n  commitments?: FinanceCommitment[];\n  allocations?: FinanceAllocation[];\n  appliedRequestIds: string[];",
    "ledger planning fields",
)
finance = replace_once(
    finance,
    "  entries: unknown[];\n  categories: unknown[];\n}",
    "  entries: unknown[];\n  categories: unknown[];\n  budgets?: unknown[];\n  commitments?: unknown[];\n  allocations?: unknown[];\n}",
    "snapshot planning fields",
)
finance = replace_once(
    finance,
    '    | "delete_category";',
    '    | "delete_category"\n    | "add_budget"\n    | "update_budget"\n    | "delete_budget"\n    | "add_commitment"\n    | "update_commitment"\n    | "delete_commitment"\n    | "link_commitment"\n    | "set_allocation"\n    | "delete_allocation";',
    "planning command union",
)

finance = insert_after(
    finance,
    '''function cleanId(value: unknown, fallbackPrefix: string): string {\n  const candidate = typeof value === "string" ? value.trim() : "";\n  if (!candidate) return generatedId(fallbackPrefix);\n  if (!ID_PATTERN.test(candidate)) throw new Error("Finance id contains unsupported characters.");\n  return candidate.slice(0, 96).toLowerCase();\n}\n''',
    '''\nfunction optionalId(value: unknown): string | undefined {\n  const candidate = typeof value === "string" ? value.trim() : "";\n  if (!candidate) return undefined;\n  if (!ID_PATTERN.test(candidate)) throw new Error("Finance id contains unsupported characters.");\n  return candidate.slice(0, 96).toLowerCase();\n}\n''',
    "optional id helper",
)

finance = insert_after(
    finance,
    '''export function normalizeFinanceCurrency(value: unknown): FinanceCurrency {\n  const normalized = String(value || "").trim().toUpperCase();\n  if (normalized === "TL") return "TRY";\n  if (normalized === "HUF" || normalized === "EUR" || normalized === "TRY") return normalized;\n  throw new Error("Currency must be HUF, EUR, or TRY/TL.");\n}\n''',
    '''\nexport function normalizeFinanceMonth(value: unknown): string {\n  const month = String(value || "").trim();\n  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must use YYYY-MM.");\n  return month;\n}\n\nfunction optionalIsoDate(value: unknown): string | undefined {\n  const text = typeof value === "string" ? value.trim() : "";\n  if (!text) return undefined;\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`))) {\n    throw new Error("Due date must use YYYY-MM-DD.");\n  }\n  return text;\n}\n''',
    "month helper",
)

planning_sanitizers = r'''
export function sanitizeFinanceBudget(value: unknown): FinanceBudget {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance budget must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Budget update date");
  return {
    id: cleanId(input.id, "budget"),
    name: cleanText(input.name, "Budget name", 120),
    month: normalizeFinanceMonth(input.month),
    amountCents: integer(input.amountCents, "Budget amount", 1),
    currencyCode: normalizeFinanceCurrency(input.currencyCode),
    updatedAtMillis,
    deletedAtMillis: optionalTimestamp(input.deletedAtMillis, "Budget deletion date", updatedAtMillis),
  };
}

export function sanitizeFinanceCommitment(value: unknown): FinanceCommitment {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance commitment must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Commitment update date");
  return {
    id: cleanId(input.id, "commitment"),
    name: cleanText(input.name, "Commitment name", 180),
    month: normalizeFinanceMonth(input.month),
    plannedAmountCents: integer(input.plannedAmountCents, "Planned amount", 1),
    currencyCode: normalizeFinanceCurrency(input.currencyCode),
    category: optionalText(input.category, 120) || "Bills",
    dueDate: optionalIsoDate(input.dueDate),
    repeatMonthly: Boolean(input.repeatMonthly),
    linkedEntryId: optionalId(input.linkedEntryId),
    updatedAtMillis,
    deletedAtMillis: optionalTimestamp(input.deletedAtMillis, "Commitment deletion date", updatedAtMillis),
  };
}

export function sanitizeFinanceAllocation(value: unknown): FinanceAllocation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance allocation must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Allocation update date");
  return {
    id: cleanId(input.id, "allocation"),
    entryId: cleanId(input.entryId, "money"),
    budgetId: cleanId(input.budgetId, "budget"),
    amountCents: integer(input.amountCents, "Allocation amount", 1),
    updatedAtMillis,
    deletedAtMillis: optionalTimestamp(input.deletedAtMillis, "Allocation deletion date", updatedAtMillis),
  };
}

'''
finance = insert_before(finance, "export function createEmptyFinanceLedger", planning_sanitizers, "planning sanitizers")

finance = replace_once(
    finance,
    "    entries: [],\n    categories: [],\n    appliedRequestIds: [],",
    "    entries: [],\n    categories: [],\n    budgets: [],\n    commitments: [],\n    allocations: [],\n    appliedRequestIds: [],",
    "empty ledger planning fields",
)

old_validation = '''  if (!Array.isArray(ledger.entries) || !Array.isArray(ledger.categories) || !Array.isArray(ledger.appliedRequestIds)) return false;\n  try {\n    ledger.entries.forEach((entry) => sanitizeFinanceEntry(entry, "system"));\n    ledger.categories.forEach((category) => sanitizeFinanceCategory(category));\n    return true;\n'''
new_validation = '''  if (!Array.isArray(ledger.entries) || !Array.isArray(ledger.categories) || !Array.isArray(ledger.appliedRequestIds)) return false;\n  if (ledger.budgets !== undefined && !Array.isArray(ledger.budgets)) return false;\n  if (ledger.commitments !== undefined && !Array.isArray(ledger.commitments)) return false;\n  if (ledger.allocations !== undefined && !Array.isArray(ledger.allocations)) return false;\n  try {\n    ledger.entries.forEach((entry) => sanitizeFinanceEntry(entry, "system"));\n    ledger.categories.forEach((category) => sanitizeFinanceCategory(category));\n    (ledger.budgets || []).forEach((budget) => sanitizeFinanceBudget(budget));\n    (ledger.commitments || []).forEach((commitment) => sanitizeFinanceCommitment(commitment));\n    (ledger.allocations || []).forEach((allocation) => sanitizeFinanceAllocation(allocation));\n    return true;\n'''
finance = replace_once(finance, old_validation, new_validation, "ledger planning validation")

finance = replace_once(
    finance,
    '''  return typeof snapshot.requestId === "string" && ID_PATTERN.test(snapshot.requestId) && Array.isArray(snapshot.entries) && Array.isArray(snapshot.categories);''',
    '''  return typeof snapshot.requestId === "string"\n    && ID_PATTERN.test(snapshot.requestId)\n    && Array.isArray(snapshot.entries)\n    && Array.isArray(snapshot.categories)\n    && (snapshot.budgets === undefined || Array.isArray(snapshot.budgets))\n    && (snapshot.commitments === undefined || Array.isArray(snapshot.commitments))\n    && (snapshot.allocations === undefined || Array.isArray(snapshot.allocations));''',
    "snapshot planning validation",
)

finance = replace_once(
    finance,
    '''      "add_category",\n      "delete_category",\n    ].includes(String(command.type))''',
    '''      "add_category",\n      "delete_category",\n      "add_budget",\n      "update_budget",\n      "delete_budget",\n      "add_commitment",\n      "update_commitment",\n      "delete_commitment",\n      "link_commitment",\n      "set_allocation",\n      "delete_allocation",\n    ].includes(String(command.type))''',
    "planning command validation",
)

finance = insert_after(
    finance,
    '''function sortedCategories(categories: FinanceCategory[]): FinanceCategory[] {\n  return [...categories].sort((a, b) => a.type.localeCompare(b.type) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));\n}\n''',
    '''\nfunction sortedBudgets(budgets: FinanceBudget[]): FinanceBudget[] {\n  return [...budgets].sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));\n}\n\nfunction sortedCommitments(commitments: FinanceCommitment[]): FinanceCommitment[] {\n  return [...commitments].sort((a, b) => b.month.localeCompare(a.month) || (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") || a.name.localeCompare(b.name));\n}\n\nfunction sortedAllocations(allocations: FinanceAllocation[]): FinanceAllocation[] {\n  return [...allocations].sort((a, b) => a.entryId.localeCompare(b.entryId) || a.budgetId.localeCompare(b.budgetId) || a.id.localeCompare(b.id));\n}\n''',
    "planning sort helpers",
)

pattern = re.compile(r'''export function mergeFinanceSnapshot\(current: FinanceLedger, snapshot: FinanceSnapshot\): \{ ledger: FinanceLedger; changed: boolean \} \{.*?\n\}\n\nfunction rememberRequest''', re.S)
replacement = r'''export function mergeFinanceSnapshot(current: FinanceLedger, snapshot: FinanceSnapshot): { ledger: FinanceLedger; changed: boolean } {
  const incomingEntries = snapshot.entries.map((entry) => sanitizeFinanceEntry(entry, "android"));
  const incomingCategories = snapshot.categories.map((category) => sanitizeFinanceCategory(category));
  const incomingBudgets = (snapshot.budgets || []).map((budget) => sanitizeFinanceBudget(budget));
  const incomingCommitments = (snapshot.commitments || []).map((commitment) => sanitizeFinanceCommitment(commitment));
  const incomingAllocations = (snapshot.allocations || []).map((allocation) => sanitizeFinanceAllocation(allocation));
  const entryMerge = mergeByUpdatedAt(current.entries, incomingEntries);
  const categoryMerge = mergeByUpdatedAt(current.categories, incomingCategories);
  const budgetMerge = mergeByUpdatedAt(current.budgets || [], incomingBudgets);
  const commitmentMerge = mergeByUpdatedAt(current.commitments || [], incomingCommitments);
  const allocationMerge = mergeByUpdatedAt(current.allocations || [], incomingAllocations);
  if (!entryMerge.changed && !categoryMerge.changed && !budgetMerge.changed && !commitmentMerge.changed && !allocationMerge.changed) {
    return { ledger: current, changed: false };
  }
  const now = new Date();
  return {
    ledger: {
      ...current,
      revision: current.revision + 1,
      entries: sortedEntries(entryMerge.values),
      categories: sortedCategories(categoryMerge.values),
      budgets: sortedBudgets(budgetMerge.values),
      commitments: sortedCommitments(commitmentMerge.values),
      allocations: sortedAllocations(allocationMerge.values),
      updatedAt: now.toISOString(),
    },
    changed: true,
  };
}

function rememberRequest'''
finance, count = pattern.subn(replacement, finance, count=1)
if count != 1:
    raise RuntimeError(f"Could not replace mergeFinanceSnapshot: {count}")

finance = insert_before(
    finance,
    "export function applyFinanceCommand(",
    '''function findBudget(ledger: FinanceLedger, id: unknown): FinanceBudget {\n  const budget = (ledger.budgets || []).find((item) => item.id === String(id || "").toLowerCase());\n  if (!budget) throw new Error("Finance budget not found.");\n  return budget;\n}\n\nfunction findCommitment(ledger: FinanceLedger, id: unknown): FinanceCommitment {\n  const commitment = (ledger.commitments || []).find((item) => item.id === String(id || "").toLowerCase());\n  if (!commitment) throw new Error("Finance commitment not found.");\n  return commitment;\n}\n\nfunction findAllocation(ledger: FinanceLedger, id: unknown): FinanceAllocation {\n  const allocation = (ledger.allocations || []).find((item) => item.id === String(id || "").toLowerCase());\n  if (!allocation) throw new Error("Finance allocation not found.");\n  return allocation;\n}\n\n''',
    "planning find helpers",
)

planning_cases = r'''    case "add_budget": {
      const budget = sanitizeFinanceBudget({
        ...command.payload,
        id: command.payload.id || generatedId("budget"),
        updatedAtMillis: nowMillis,
      });
      next.budgets ||= [];
      const existing = next.budgets.find((item) => !item.deletedAtMillis
        && item.month === budget.month
        && item.currencyCode === budget.currencyCode
        && item.name.toLocaleLowerCase() === budget.name.toLocaleLowerCase());
      if (existing) {
        entityId = existing.id;
        break;
      }
      if (next.budgets.some((item) => item.id === budget.id)) throw new Error("Finance budget id already exists.");
      next.budgets.push(budget);
      entityId = budget.id;
      break;
    }
    case "update_budget": {
      const budget = findBudget(next, command.payload.id);
      if (budget.deletedAtMillis) throw new Error("Deleted finance budget cannot be updated.");
      if ("name" in command.payload) budget.name = cleanText(command.payload.name, "Budget name", 120);
      if ("month" in command.payload) budget.month = normalizeFinanceMonth(command.payload.month);
      if ("amountCents" in command.payload) budget.amountCents = integer(command.payload.amountCents, "Budget amount", 1);
      if ("currencyCode" in command.payload) budget.currencyCode = normalizeFinanceCurrency(command.payload.currencyCode);
      budget.updatedAtMillis = nowMillis;
      entityId = budget.id;
      break;
    }
    case "delete_budget": {
      const budget = findBudget(next, command.payload.id);
      budget.deletedAtMillis = nowMillis;
      budget.updatedAtMillis = nowMillis;
      entityId = budget.id;
      break;
    }
    case "add_commitment": {
      const commitment = sanitizeFinanceCommitment({
        ...command.payload,
        id: command.payload.id || generatedId("commitment"),
        updatedAtMillis: nowMillis,
      });
      next.commitments ||= [];
      if (next.commitments.some((item) => item.id === commitment.id)) throw new Error("Finance commitment id already exists.");
      next.commitments.push(commitment);
      entityId = commitment.id;
      break;
    }
    case "update_commitment": {
      const commitment = findCommitment(next, command.payload.id);
      if (commitment.deletedAtMillis) throw new Error("Deleted finance commitment cannot be updated.");
      if ("name" in command.payload) commitment.name = cleanText(command.payload.name, "Commitment name", 180);
      if ("month" in command.payload) commitment.month = normalizeFinanceMonth(command.payload.month);
      if ("plannedAmountCents" in command.payload) commitment.plannedAmountCents = integer(command.payload.plannedAmountCents, "Planned amount", 1);
      if ("currencyCode" in command.payload) commitment.currencyCode = normalizeFinanceCurrency(command.payload.currencyCode);
      if ("category" in command.payload) commitment.category = cleanText(command.payload.category, "Category", 120);
      if ("dueDate" in command.payload) commitment.dueDate = optionalIsoDate(command.payload.dueDate);
      if ("repeatMonthly" in command.payload) commitment.repeatMonthly = Boolean(command.payload.repeatMonthly);
      commitment.updatedAtMillis = nowMillis;
      entityId = commitment.id;
      break;
    }
    case "delete_commitment": {
      const commitment = findCommitment(next, command.payload.id);
      commitment.deletedAtMillis = nowMillis;
      commitment.updatedAtMillis = nowMillis;
      entityId = commitment.id;
      break;
    }
    case "link_commitment": {
      const commitment = findCommitment(next, command.payload.id);
      if (commitment.deletedAtMillis) throw new Error("Deleted finance commitment cannot be linked.");
      const entryId = optionalId(command.payload.entryId);
      if (!entryId) {
        commitment.linkedEntryId = undefined;
      } else {
        const entry = findEntry(next, entryId);
        if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot satisfy a commitment.");
        if (entry.type !== "EXPENSE") throw new Error("Only an expense can satisfy a planned payment.");
        if (entry.currencyCode !== commitment.currencyCode) throw new Error("Payment currency must match the planned payment currency.");
        commitment.linkedEntryId = entry.id;
      }
      commitment.updatedAtMillis = nowMillis;
      entityId = commitment.id;
      break;
    }
    case "set_allocation": {
      const entry = findEntry(next, command.payload.entryId);
      const budget = findBudget(next, command.payload.budgetId);
      if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot be allocated.");
      if (budget.deletedAtMillis) throw new Error("Deleted finance budget cannot receive allocations.");
      if (entry.type !== "EXPENSE") throw new Error("Only expenses can be allocated to spending budgets.");
      if (entry.currencyCode !== budget.currencyCode) throw new Error("Expense currency must match the budget currency.");
      const amountCents = command.payload.amountCents === undefined
        ? entry.amountCents
        : integer(command.payload.amountCents, "Allocation amount", 1, entry.amountCents);
      next.allocations ||= [];
      const requestedId = optionalId(command.payload.id);
      let allocation = requestedId ? next.allocations.find((item) => item.id === requestedId) : undefined;
      if (!allocation) {
        allocation = next.allocations.find((item) => !item.deletedAtMillis && item.entryId === entry.id && item.budgetId === budget.id);
      }
      const otherAllocated = next.allocations
        .filter((item) => !item.deletedAtMillis && item.entryId === entry.id && item.id !== allocation?.id)
        .reduce((sum, item) => sum + item.amountCents, 0);
      if (otherAllocated + amountCents > entry.amountCents) throw new Error("Budget allocations cannot exceed the expense amount.");
      if (allocation) {
        allocation.entryId = entry.id;
        allocation.budgetId = budget.id;
        allocation.amountCents = amountCents;
        allocation.updatedAtMillis = nowMillis;
        allocation.deletedAtMillis = undefined;
      } else {
        allocation = sanitizeFinanceAllocation({
          id: requestedId || generatedId("allocation"),
          entryId: entry.id,
          budgetId: budget.id,
          amountCents,
          updatedAtMillis: nowMillis,
        });
        next.allocations.push(allocation);
      }
      entityId = allocation.id;
      break;
    }
    case "delete_allocation": {
      const allocation = findAllocation(next, command.payload.id);
      allocation.deletedAtMillis = nowMillis;
      allocation.updatedAtMillis = nowMillis;
      entityId = allocation.id;
      break;
    }
'''
finance = insert_before(
    finance,
    '''    default:\n      throw new Error("Unsupported finance command.");''',
    planning_cases,
    "planning command cases",
)

finance = replace_once(
    finance,
    '''  next.entries = sortedEntries(next.entries);\n  next.categories = sortedCategories(next.categories);\n  next.updatedAt = now.toISOString();''',
    '''  next.entries = sortedEntries(next.entries);\n  next.categories = sortedCategories(next.categories);\n  next.budgets = sortedBudgets(next.budgets || []);\n  next.commitments = sortedCommitments(next.commitments || []);\n  next.allocations = sortedAllocations(next.allocations || []);\n  next.updatedAt = now.toISOString();''',
    "planning sorts after command",
)

plan_summary = r'''

export interface FinancePlanSummary {
  month: string;
  budgets: Array<FinanceBudget & { spentCents: number; remainingCents: number; percentUsed: number }>;
  commitments: Array<FinanceCommitment & { paid: boolean; actualAmountCents?: number; actualEntryName?: string }>;
}

export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {
  const month = normalizeFinanceMonth(rawMonth);
  const liveEntries = new Map(ledger.entries.filter((entry) => !entry.deletedAtMillis).map((entry) => [entry.id, entry]));
  const allocations = (ledger.allocations || []).filter((allocation) => !allocation.deletedAtMillis);
  const budgets = (ledger.budgets || [])
    .filter((budget) => !budget.deletedAtMillis && budget.month === month)
    .map((budget) => {
      const spentCents = allocations
        .filter((allocation) => allocation.budgetId === budget.id && liveEntries.has(allocation.entryId))
        .reduce((sum, allocation) => sum + allocation.amountCents, 0);
      return {
        ...budget,
        spentCents,
        remainingCents: budget.amountCents - spentCents,
        percentUsed: Math.round((spentCents / budget.amountCents) * 1000) / 10,
      };
    });
  const commitments = (ledger.commitments || [])
    .filter((commitment) => !commitment.deletedAtMillis && commitment.month === month)
    .map((commitment) => {
      const entry = commitment.linkedEntryId ? liveEntries.get(commitment.linkedEntryId) : undefined;
      return {
        ...commitment,
        paid: Boolean(entry),
        ...(entry ? { actualAmountCents: entry.amountCents, actualEntryName: entry.name } : {}),
      };
    });
  return { month, budgets, commitments };
}
'''
if "export interface FinancePlanSummary" not in finance:
    finance += plan_summary

write("gateway/src/finance.ts", finance)

# ---------------------------------------------------------------------------
# Finance MCP tools
# ---------------------------------------------------------------------------
mcp = read("gateway/src/finance-mcp.ts")
mcp = replace_once(
    mcp,
    '''  financeEntriesByStatus,\n  financeSummary,\n  normalizeFinanceCurrency,\n  normalizeFinanceStatus,\n  normalizeFinanceType,''',
    '''  financeEntriesByStatus,\n  financePlanSummary,\n  financeSummary,\n  normalizeFinanceCurrency,\n  normalizeFinanceMonth,\n  normalizeFinanceStatus,\n  normalizeFinanceType,''',
    "mcp planning imports",
)
mcp = replace_once(
    mcp,
    '''  "finance_add_category",\n  "finance_delete_category",''',
    '''  "finance_add_category",\n  "finance_delete_category",\n  "finance_get_plan",\n  "finance_add_budget",\n  "finance_update_budget",\n  "finance_delete_budget",\n  "finance_add_commitment",\n  "finance_update_commitment",\n  "finance_delete_commitment",\n  "finance_allocate_entry",\n  "finance_unallocate_entry",\n  "finance_link_commitment",''',
    "mcp planning names",
)

mcp_tool_defs = r'''    tool("finance_get_plan", "Read monthly money plan", "Read Kornel's planned bills and spending budgets for one month, including spent, remaining, and paid status. Omit month for the current month in Europe/Istanbul.", {
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
'''
mcp = insert_before(mcp, '    tool("finance_add_entry",', mcp_tool_defs, "mcp planning tool definitions")

month_helpers = r'''
function currentFinanceMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return normalizeFinanceMonth(`${year}-${month}`);
}

function requestedMonth(args: Record<string, unknown>): string {
  return args.month ? normalizeFinanceMonth(args.month) : currentFinanceMonth();
}
'''
mcp = insert_before(mcp, "export async function callFinanceTool", month_helpers + "\n", "mcp month helpers")

read_handler = r'''  if (name === "finance_get_plan") {
    const ledger = (await readFinanceLedger(env)).ledger;
    const month = requestedMonth(args);
    const plan = financePlanSummary(ledger, month);
    const remaining = plan.budgets.map((budget) => `${budget.name}: ${formatAmount(budget.remainingCents, budget.currencyCode)} remaining`).join("; ");
    const unpaid = plan.commitments.filter((item) => !item.paid).length;
    const message = plan.budgets.length || plan.commitments.length
      ? `Plan for ${month}: ${remaining || "no spending envelopes"}; ${unpaid} unpaid planned payment${unpaid === 1 ? "" : "s"}.`
      : `No budgets or planned payments are set for ${month}.`;
    return resultText(message, { ...plan, revision: ledger.revision });
  }
'''
mcp = insert_before(mcp, '''  if (!auth.scopes.includes("manage:write")) return writeScopeChallenge(env);''', read_handler + "\n", "mcp plan read handler")

write_handlers = r'''  if (name === "finance_add_budget") {
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
'''
mcp = insert_before(mcp, '''  if (name === "finance_add_entry") {''', write_handlers + "\n", "mcp plan write handlers")
write("gateway/src/finance-mcp.ts", mcp)

# ---------------------------------------------------------------------------
# JSON schemas
# ---------------------------------------------------------------------------
write("contracts/finance-ledger.schema.json", r'''{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://manageme.local/contracts/finance-ledger.schema.json",
  "title": "ManageMe finance ledger",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "revision", "profileId", "entries", "categories", "appliedRequestIds", "updatedAt"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "revision": { "type": "integer", "minimum": 0 },
    "profileId": { "const": "kornel" },
    "entries": { "type": "array", "items": { "$ref": "#/$defs/entry" } },
    "categories": { "type": "array", "items": { "$ref": "#/$defs/category" } },
    "budgets": { "type": "array", "items": { "$ref": "#/$defs/budget" } },
    "commitments": { "type": "array", "items": { "$ref": "#/$defs/commitment" } },
    "allocations": { "type": "array", "items": { "$ref": "#/$defs/allocation" } },
    "appliedRequestIds": { "type": "array", "maxItems": 2000, "uniqueItems": true, "items": { "$ref": "#/$defs/id" } },
    "updatedAt": { "type": "string", "format": "date-time" }
  },
  "$defs": {
    "id": { "type": "string", "minLength": 3, "maxLength": 96, "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]{2,95}$" },
    "millis": { "type": "integer", "minimum": 0, "maximum": 8640000000000000 },
    "currency": { "enum": ["HUF", "EUR", "TRY"] },
    "entry": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "type", "category", "amountCents", "currencyCode", "name", "createdAtMillis", "updatedAtMillis", "actor"],
      "properties": {
        "id": { "$ref": "#/$defs/id" }, "type": { "enum": ["EXPENSE", "INCOME"] },
        "category": { "type": "string", "minLength": 1, "maxLength": 120 }, "amountCents": { "type": "integer", "minimum": 1 },
        "currencyCode": { "$ref": "#/$defs/currency" }, "name": { "type": "string", "minLength": 1, "maxLength": 240 },
        "createdAtMillis": { "$ref": "#/$defs/millis" }, "updatedAtMillis": { "$ref": "#/$defs/millis" },
        "archivedAtMillis": { "$ref": "#/$defs/millis" }, "deletedAtMillis": { "$ref": "#/$defs/millis" },
        "actor": { "enum": ["kornel", "assistant", "web", "android", "system"] }
      }
    },
    "category": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "type", "name", "sortOrder", "updatedAtMillis"],
      "properties": {
        "id": { "$ref": "#/$defs/id" }, "type": { "enum": ["EXPENSE", "INCOME"] },
        "name": { "type": "string", "minLength": 1, "maxLength": 120 }, "sortOrder": { "type": "integer", "minimum": 0, "maximum": 100000 },
        "updatedAtMillis": { "$ref": "#/$defs/millis" }, "deletedAtMillis": { "$ref": "#/$defs/millis" }
      }
    },
    "budget": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "name", "month", "amountCents", "currencyCode", "updatedAtMillis"],
      "properties": {
        "id": { "$ref": "#/$defs/id" }, "name": { "type": "string", "minLength": 1, "maxLength": 120 },
        "month": { "type": "string", "pattern": "^\\d{4}-(0[1-9]|1[0-2])$" }, "amountCents": { "type": "integer", "minimum": 1 },
        "currencyCode": { "$ref": "#/$defs/currency" }, "updatedAtMillis": { "$ref": "#/$defs/millis" }, "deletedAtMillis": { "$ref": "#/$defs/millis" }
      }
    },
    "commitment": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "name", "month", "plannedAmountCents", "currencyCode", "category", "repeatMonthly", "updatedAtMillis"],
      "properties": {
        "id": { "$ref": "#/$defs/id" }, "name": { "type": "string", "minLength": 1, "maxLength": 180 },
        "month": { "type": "string", "pattern": "^\\d{4}-(0[1-9]|1[0-2])$" }, "plannedAmountCents": { "type": "integer", "minimum": 1 },
        "currencyCode": { "$ref": "#/$defs/currency" }, "category": { "type": "string", "minLength": 1, "maxLength": 120 },
        "dueDate": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" }, "repeatMonthly": { "type": "boolean" },
        "linkedEntryId": { "$ref": "#/$defs/id" }, "updatedAtMillis": { "$ref": "#/$defs/millis" }, "deletedAtMillis": { "$ref": "#/$defs/millis" }
      }
    },
    "allocation": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "entryId", "budgetId", "amountCents", "updatedAtMillis"],
      "properties": {
        "id": { "$ref": "#/$defs/id" }, "entryId": { "$ref": "#/$defs/id" }, "budgetId": { "$ref": "#/$defs/id" },
        "amountCents": { "type": "integer", "minimum": 1 }, "updatedAtMillis": { "$ref": "#/$defs/millis" }, "deletedAtMillis": { "$ref": "#/$defs/millis" }
      }
    }
  }
}
''')
write("contracts/finance-command.schema.json", r'''{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://manageme.local/contracts/finance-command.schema.json",
  "title": "ManageMe finance command",
  "type": "object",
  "additionalProperties": false,
  "required": ["requestId", "profileId", "actor", "type", "payload"],
  "properties": {
    "requestId": { "type": "string", "minLength": 3, "maxLength": 96, "pattern": "^[a-zA-Z0-9][a-zA-Z0-9_-]{2,95}$" },
    "profileId": { "const": "kornel" },
    "actor": { "enum": ["kornel", "assistant", "web", "android"] },
    "type": { "enum": [
      "add_entry", "update_entry", "archive_entry", "restore_entry", "archive_before", "delete_entry",
      "add_category", "delete_category", "add_budget", "update_budget", "delete_budget",
      "add_commitment", "update_commitment", "delete_commitment", "link_commitment",
      "set_allocation", "delete_allocation"
    ] },
    "payload": { "type": "object" }
  }
}
''')

# ---------------------------------------------------------------------------
# Gateway planning test
# ---------------------------------------------------------------------------
write("gateway/test/finance-planning.test.ts", r'''import assert from "node:assert/strict";
import test from "node:test";
import { applyFinanceCommand, createEmptyFinanceLedger, financePlanSummary } from "../src/finance";
import type { FinanceCommand, FinanceLedger } from "../src/finance";

function apply(ledger: FinanceLedger, type: FinanceCommand["type"], payload: Record<string, unknown>, requestId: string) {
  return applyFinanceCommand(ledger, { requestId, profileId: "kornel", actor: "assistant", type, payload }, new Date("2026-08-12T00:00:00Z"));
}

test("monthly budgets, allocations, and planned payments stay independent from categories", () => {
  let ledger = createEmptyFinanceLedger(new Date("2026-08-12T00:00:00Z"));
  let result = apply(ledger, "add_budget", { name: "Pocket Money", month: "2026-08", amountCents: 500000, currencyCode: "TRY" }, "req_budget");
  ledger = result.ledger;
  const budgetId = result.entityId!;

  result = apply(ledger, "add_entry", { type: "EXPENSE", category: "Coffee", amountCents: 18000, currencyCode: "TRY", name: "Coffee" }, "req_entry");
  ledger = result.ledger;
  const entryId = result.entityId!;

  result = apply(ledger, "set_allocation", { entryId, budgetId }, "req_allocate");
  ledger = result.ledger;

  result = apply(ledger, "add_commitment", { name: "Telekom", month: "2026-08", plannedAmountCents: 120000, currencyCode: "TRY", category: "Bills", repeatMonthly: true }, "req_commitment");
  ledger = result.ledger;
  const commitmentId = result.entityId!;

  result = apply(ledger, "link_commitment", { id: commitmentId, entryId }, "req_link");
  ledger = result.ledger;

  const summary = financePlanSummary(ledger, "2026-08");
  assert.equal(summary.budgets[0].name, "Pocket Money");
  assert.equal(summary.budgets[0].spentCents, 18000);
  assert.equal(summary.budgets[0].remainingCents, 482000);
  assert.equal(summary.commitments[0].paid, true);
  assert.equal(summary.commitments[0].actualAmountCents, 18000);
  assert.equal(ledger.entries[0].category, "Coffee");
});
''')

# ---------------------------------------------------------------------------
# Android local planning store
# ---------------------------------------------------------------------------
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/FinancePlanStore.java", r'''package com.example.expensebuttontracker.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.example.expensebuttontracker.util.CurrencyUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Local-first storage for monthly spending envelopes, planned payments and allocations. */
public final class FinancePlanStore {
    private static final String PREFS = "finance_planning_v1";
    private static final String KEY_BUDGETS = "budgets";
    private static final String KEY_COMMITMENTS = "commitments";
    private static final String KEY_ALLOCATIONS = "allocations";
    private static final String WIDGET_PREFIX = "widget_budget_";

    public static final class Budget {
        public final String id;
        public final String name;
        public final String month;
        public final long amountCents;
        public final String currencyCode;
        public final long updatedAtMillis;

        Budget(JSONObject json) {
            id = json.optString("id", "");
            name = json.optString("name", "Budget");
            month = json.optString("month", currentMonth());
            amountCents = json.optLong("amountCents", 0L);
            currencyCode = CurrencyUtils.normalize(json.optString("currencyCode", CurrencyUtils.DEFAULT_CURRENCY));
            updatedAtMillis = json.optLong("updatedAtMillis", 0L);
        }
    }

    public static final class Commitment {
        public final String id;
        public final String name;
        public final String month;
        public final long plannedAmountCents;
        public final String currencyCode;
        public final String category;
        public final String dueDate;
        public final boolean repeatMonthly;
        public final String linkedEntryId;
        public final long updatedAtMillis;

        Commitment(JSONObject json) {
            id = json.optString("id", "");
            name = json.optString("name", "Planned payment");
            month = json.optString("month", currentMonth());
            plannedAmountCents = json.optLong("plannedAmountCents", 0L);
            currencyCode = CurrencyUtils.normalize(json.optString("currencyCode", CurrencyUtils.DEFAULT_CURRENCY));
            category = json.optString("category", "Bills");
            dueDate = json.optString("dueDate", "");
            repeatMonthly = json.optBoolean("repeatMonthly", false);
            linkedEntryId = json.optString("linkedEntryId", "");
            updatedAtMillis = json.optLong("updatedAtMillis", 0L);
        }

        public boolean isPaid() {
            return linkedEntryId != null && !linkedEntryId.isEmpty();
        }
    }

    private FinancePlanStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readArray(Context context, String key) {
        String raw = prefs(context).getString(key, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void writeArray(Context context, String key, JSONArray array) {
        prefs(context).edit().putString(key, array.toString()).apply();
    }

    public static String decorateSyncPayload(Context context, String payloadJson) throws JSONException {
        JSONObject root = new JSONObject(payloadJson);
        root.put(KEY_BUDGETS, readArray(context, KEY_BUDGETS));
        root.put(KEY_COMMITMENTS, readArray(context, KEY_COMMITMENTS));
        root.put(KEY_ALLOCATIONS, readArray(context, KEY_ALLOCATIONS));
        return root.toString();
    }

    public static void applyRemoteLedger(Context context, String ledgerJson) throws JSONException {
        JSONObject ledger = new JSONObject(ledgerJson);
        SharedPreferences.Editor editor = prefs(context).edit();
        if (ledger.has(KEY_BUDGETS)) editor.putString(KEY_BUDGETS, ledger.optJSONArray(KEY_BUDGETS).toString());
        if (ledger.has(KEY_COMMITMENTS)) editor.putString(KEY_COMMITMENTS, ledger.optJSONArray(KEY_COMMITMENTS).toString());
        if (ledger.has(KEY_ALLOCATIONS)) editor.putString(KEY_ALLOCATIONS, ledger.optJSONArray(KEY_ALLOCATIONS).toString());
        editor.apply();
    }

    public static String currentMonth() {
        Calendar calendar = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d", calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1);
    }

    public static String shiftMonth(String month, int delta) {
        String[] parts = month.split("-");
        Calendar calendar = Calendar.getInstance();
        calendar.clear();
        calendar.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, 1);
        calendar.add(Calendar.MONTH, delta);
        return String.format(Locale.US, "%04d-%02d", calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1);
    }

    public static List<Budget> listBudgets(Context context, String month) {
        ArrayList<Budget> result = new ArrayList<>();
        JSONArray array = readArray(context, KEY_BUDGETS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json == null || json.has("deletedAtMillis")) continue;
            Budget budget = new Budget(json);
            if (month.equals(budget.month)) result.add(budget);
        }
        result.sort(Comparator.comparing(budget -> budget.name.toLowerCase(Locale.ROOT)));
        return result;
    }

    public static List<Commitment> listCommitments(Context context, String month) {
        ArrayList<Commitment> result = new ArrayList<>();
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json == null || json.has("deletedAtMillis")) continue;
            Commitment commitment = new Commitment(json);
            if (month.equals(commitment.month)) result.add(commitment);
        }
        result.sort(Comparator.comparing(commitment -> commitment.dueDate.isEmpty() ? "9999-99-99" : commitment.dueDate));
        return result;
    }

    public static Budget getBudget(Context context, String id) {
        if (id == null || id.isEmpty()) return null;
        JSONArray array = readArray(context, KEY_BUDGETS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json != null && id.equals(json.optString("id")) && !json.has("deletedAtMillis")) return new Budget(json);
        }
        return null;
    }

    public static Commitment getCommitment(Context context, String id) {
        if (id == null || id.isEmpty()) return null;
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json != null && id.equals(json.optString("id")) && !json.has("deletedAtMillis")) return new Commitment(json);
        }
        return null;
    }

    public static Budget findDefaultBudget(Context context, String month) {
        List<Budget> budgets = listBudgets(context, month);
        for (Budget budget : budgets) {
            if ("pocket money".equalsIgnoreCase(budget.name)) return budget;
        }
        return budgets.isEmpty() ? null : budgets.get(0);
    }

    public static void saveBudget(Context context, String id, String name, String month, long amountCents, String currencyCode) throws JSONException {
        if (name == null || name.trim().isEmpty()) throw new IllegalArgumentException("Budget name is required.");
        if (amountCents <= 0L) throw new IllegalArgumentException("Budget amount must be greater than zero.");
        String normalized = CurrencyUtils.normalize(currencyCode);
        JSONArray array = readArray(context, KEY_BUDGETS);
        JSONObject item = findOrCreate(array, id, "budget");
        long now = System.currentTimeMillis();
        item.put("name", name.trim());
        item.put("month", month);
        item.put("amountCents", amountCents);
        item.put("currencyCode", normalized);
        item.put("updatedAtMillis", now);
        item.remove("deletedAtMillis");
        writeArray(context, KEY_BUDGETS, array);
    }

    public static void deleteBudget(Context context, String id) throws JSONException {
        softDelete(context, KEY_BUDGETS, id);
    }

    public static void saveCommitment(Context context, String id, String name, String month, long amountCents, String currencyCode, String category, String dueDate, boolean repeatMonthly) throws JSONException {
        if (name == null || name.trim().isEmpty()) throw new IllegalArgumentException("Payment name is required.");
        if (amountCents <= 0L) throw new IllegalArgumentException("Planned amount must be greater than zero.");
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        JSONObject item = findOrCreate(array, id, "commitment");
        long now = System.currentTimeMillis();
        item.put("name", name.trim());
        item.put("month", month);
        item.put("plannedAmountCents", amountCents);
        item.put("currencyCode", CurrencyUtils.normalize(currencyCode));
        item.put("category", category == null || category.trim().isEmpty() ? "Bills" : category.trim());
        if (dueDate == null || dueDate.trim().isEmpty()) item.remove("dueDate"); else item.put("dueDate", dueDate.trim());
        item.put("repeatMonthly", repeatMonthly);
        item.put("updatedAtMillis", now);
        item.remove("deletedAtMillis");
        writeArray(context, KEY_COMMITMENTS, array);
    }

    public static void deleteCommitment(Context context, String id) throws JSONException {
        softDelete(context, KEY_COMMITMENTS, id);
    }

    public static void allocateEntry(Context context, String entrySyncId, String budgetId, long amountCents, String entryCurrency) throws JSONException {
        if (entrySyncId == null || entrySyncId.isEmpty() || budgetId == null || budgetId.isEmpty()) return;
        Budget budget = getBudget(context, budgetId);
        if (budget == null) throw new IllegalArgumentException("Budget no longer exists.");
        if (!budget.currencyCode.equals(CurrencyUtils.normalize(entryCurrency))) throw new IllegalArgumentException("Expense and budget currencies must match.");
        JSONArray array = readArray(context, KEY_ALLOCATIONS);
        JSONObject item = null;
        for (int i = 0; i < array.length(); i++) {
            JSONObject candidate = array.optJSONObject(i);
            if (candidate != null && entrySyncId.equals(candidate.optString("entryId")) && budgetId.equals(candidate.optString("budgetId"))) {
                item = candidate;
                break;
            }
        }
        if (item == null) {
            item = new JSONObject();
            item.put("id", newId("allocation"));
            array.put(item);
        }
        item.put("entryId", entrySyncId);
        item.put("budgetId", budgetId);
        item.put("amountCents", amountCents);
        item.put("updatedAtMillis", System.currentTimeMillis());
        item.remove("deletedAtMillis");
        writeArray(context, KEY_ALLOCATIONS, array);
    }

    public static void linkCommitment(Context context, String commitmentId, String entrySyncId, String entryCurrency) throws JSONException {
        if (commitmentId == null || commitmentId.isEmpty()) return;
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.optJSONObject(i);
            if (item == null || !commitmentId.equals(item.optString("id"))) continue;
            String plannedCurrency = CurrencyUtils.normalize(item.optString("currencyCode", CurrencyUtils.DEFAULT_CURRENCY));
            if (!plannedCurrency.equals(CurrencyUtils.normalize(entryCurrency))) throw new IllegalArgumentException("Payment and planned bill currencies must match.");
            item.put("linkedEntryId", entrySyncId);
            item.put("updatedAtMillis", System.currentTimeMillis());
            writeArray(context, KEY_COMMITMENTS, array);
            return;
        }
        throw new IllegalArgumentException("Planned payment no longer exists.");
    }

    public static void removeEntryReferences(Context context, String entrySyncId) throws JSONException {
        if (entrySyncId == null || entrySyncId.isEmpty()) return;
        long now = System.currentTimeMillis();
        JSONArray allocations = readArray(context, KEY_ALLOCATIONS);
        for (int i = 0; i < allocations.length(); i++) {
            JSONObject item = allocations.optJSONObject(i);
            if (item != null && entrySyncId.equals(item.optString("entryId")) && !item.has("deletedAtMillis")) {
                item.put("deletedAtMillis", now);
                item.put("updatedAtMillis", now);
            }
        }
        writeArray(context, KEY_ALLOCATIONS, allocations);
        JSONArray commitments = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < commitments.length(); i++) {
            JSONObject item = commitments.optJSONObject(i);
            if (item != null && entrySyncId.equals(item.optString("linkedEntryId"))) {
                item.remove("linkedEntryId");
                item.put("updatedAtMillis", now);
            }
        }
        writeArray(context, KEY_COMMITMENTS, commitments);
    }

    public static long spentCents(Context context, String budgetId) {
        long total = 0L;
        JSONArray allocations = readArray(context, KEY_ALLOCATIONS);
        for (int i = 0; i < allocations.length(); i++) {
            JSONObject item = allocations.optJSONObject(i);
            if (item != null && !item.has("deletedAtMillis") && budgetId.equals(item.optString("budgetId"))) total += item.optLong("amountCents", 0L);
        }
        return total;
    }

    public static void setWidgetBudgetId(Context context, int appWidgetId, String budgetId) {
        prefs(context).edit().putString(WIDGET_PREFIX + appWidgetId, budgetId == null ? "" : budgetId).apply();
    }

    public static Budget resolveWidgetBudget(Context context, int appWidgetId) {
        String selected = prefs(context).getString(WIDGET_PREFIX + appWidgetId, "");
        Budget explicit = getBudget(context, selected);
        return explicit != null ? explicit : findDefaultBudget(context, currentMonth());
    }

    public static void clearWidget(Context context, int appWidgetId) {
        prefs(context).edit().remove(WIDGET_PREFIX + appWidgetId).apply();
    }

    private static JSONObject findOrCreate(JSONArray array, String id, String prefix) throws JSONException {
        if (id != null && !id.isEmpty()) {
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) return item;
            }
        }
        JSONObject created = new JSONObject();
        created.put("id", newId(prefix));
        array.put(created);
        return created;
    }

    private static void softDelete(Context context, String key, String id) throws JSONException {
        JSONArray array = readArray(context, key);
        long now = System.currentTimeMillis();
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) {
                item.put("deletedAtMillis", now);
                item.put("updatedAtMillis", now);
                break;
            }
        }
        writeArray(context, key, array);
    }

    private static String newId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").toLowerCase(Locale.ROOT);
    }
}
''')

# Sync plan arrays together with entries/categories.
sync = read("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/sync/FinanceSyncClient.java")
sync = replace_once(sync,
    "import com.example.expensebuttontracker.data.FinanceDuplicateCleaner;\nimport com.example.expensebuttontracker.data.FinanceArchiveStore;",
    "import com.example.expensebuttontracker.data.FinanceDuplicateCleaner;\nimport com.example.expensebuttontracker.data.FinanceArchiveStore;\nimport com.example.expensebuttontracker.data.FinancePlanStore;\nimport com.example.expensebuttontracker.widget.BudgetProgressWidget;",
    "android sync planning imports")
sync = replace_once(sync,
    "        String payload = FinanceArchiveStore.decorateSyncPayload(db.buildFinanceSyncPayload());",
    "        String payload = FinancePlanStore.decorateSyncPayload(context, FinanceArchiveStore.decorateSyncPayload(db.buildFinanceSyncPayload()));",
    "android sync payload plans")
sync = replace_once(sync,
    "        FinanceArchiveStore.applyRemoteLedger(context, ledger.toString());\n        int duplicatesRemoved",
    "        FinanceArchiveStore.applyRemoteLedger(context, ledger.toString());\n        FinancePlanStore.applyRemoteLedger(context, ledger.toString());\n        BudgetProgressWidget.updateAll(context);\n        int duplicatesRemoved",
    "android sync apply plans")
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/sync/FinanceSyncClient.java", sync)

# Expose the stable sync id for a freshly-created local entry.
db = read("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/ExpenseDbHelper.java")
db = insert_before(db, "    private long getNextEntryIndex", '''    public String getEntrySyncId(long localId) {\n        try (Cursor cursor = getReadableDatabase().query(TABLE_ENTRIES, new String[]{"sync_id"}, "id = ?", new String[]{String.valueOf(localId)}, null, null, null, "1")) {\n            return cursor.moveToFirst() ? cursor.getString(0) : "";\n        }\n    }\n\n''', "entry sync id accessor")
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/ExpenseDbHelper.java", db)

# ---------------------------------------------------------------------------
# Android monthly plan screen
# ---------------------------------------------------------------------------
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java", r'''package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.sync.FinanceSyncClient;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.widget.BudgetProgressWidget;

import org.json.JSONException;

import java.util.Calendar;
import java.util.List;

public class BudgetPlanActivity extends Activity {
    private LinearLayout root;
    private String selectedMonth;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        selectedMonth = FinancePlanStore.currentMonth();
        buildShell();
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
        FinanceSyncClient.syncAsync(this, (synced, message) -> render());
    }

    private void buildShell() {
        ScrollView scroll = new ScrollView(this);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(32));
        root.setBackgroundColor(color(R.color.app_background));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    private void render() {
        if (root == null) return;
        root.removeAllViews();
        root.addView(label("Monthly money plan", 28, true));
        TextView helper = label("Plan bills separately from spending envelopes. Actual expenses keep their normal category and can also consume a budget.", 14, false);
        helper.setTextColor(color(R.color.text_secondary));
        helper.setPadding(0, dp(6), 0, dp(14));
        root.addView(helper);

        LinearLayout monthRow = new LinearLayout(this);
        monthRow.setOrientation(LinearLayout.HORIZONTAL);
        monthRow.setGravity(Gravity.CENTER_VERTICAL);
        monthRow.addView(smallButton("‹", v -> { selectedMonth = FinancePlanStore.shiftMonth(selectedMonth, -1); render(); }), weighted(true));
        Button month = smallButton(selectedMonth, v -> { selectedMonth = FinancePlanStore.currentMonth(); render(); });
        monthRow.addView(month, weighted(false));
        monthRow.addView(smallButton("›", v -> { selectedMonth = FinancePlanStore.shiftMonth(selectedMonth, 1); render(); }), weighted(false));
        root.addView(monthRow);

        root.addView(sectionTitle("Spending budgets"));
        List<FinancePlanStore.Budget> budgets = FinancePlanStore.listBudgets(this, selectedMonth);
        if (budgets.isEmpty()) root.addView(empty("No spending envelopes yet. Add Pocket Money or another monthly budget."));
        for (FinancePlanStore.Budget budget : budgets) root.addView(budgetCard(budget));
        root.addView(primaryButton("+ Add spending budget", v -> showBudgetDialog(null)));

        root.addView(sectionTitle("Planned payments"));
        List<FinancePlanStore.Commitment> commitments = FinancePlanStore.listCommitments(this, selectedMonth);
        if (commitments.isEmpty()) root.addView(empty("No planned payments yet. Add rent, Telekom, subscriptions, or another expected bill."));
        for (FinancePlanStore.Commitment commitment : commitments) root.addView(commitmentCard(commitment));
        root.addView(primaryButton("+ Add planned payment", v -> showCommitmentDialog(null)));

        root.addView(sectionTitle("Widget"));
        root.addView(secondaryButton("Pin budget gauge", v -> requestPinBudgetWidget()));
        TextView widgetHelp = empty("The widget automatically shows Pocket Money when present; its setup screen can choose a different budget. It is also available on compatible lock-screen widget surfaces.");
        root.addView(widgetHelp);
    }

    private View budgetCard(FinancePlanStore.Budget budget) {
        LinearLayout card = card();
        card.addView(label(budget.name, 18, true));
        long spent = FinancePlanStore.spentCents(this, budget.id);
        long remaining = budget.amountCents - spent;
        TextView amount = label(MoneyUtils.formatCents(remaining, budget.currencyCode) + " remaining", 20, true);
        amount.setPadding(0, dp(6), 0, dp(4));
        card.addView(amount);
        TextView detail = empty(MoneyUtils.formatCents(spent, budget.currencyCode) + " of " + MoneyUtils.formatCents(budget.amountCents, budget.currencyCode) + " spent" + dailyAllowance(budget, remaining));
        card.addView(detail);
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000);
        progress.setProgress((int) Math.max(0, Math.min(1000, budget.amountCents == 0 ? 0 : spent * 1000L / budget.amountCents)));
        card.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(18)));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(8), 0, 0);
        row.addView(smallButton("Spend from this", v -> {
            Intent intent = new Intent(this, QuickAddActivity.class);
            intent.putExtra(QuickAddActivity.EXTRA_BUDGET_ID, budget.id);
            startActivity(intent);
        }), weighted(true));
        row.addView(smallButton("Edit", v -> showBudgetDialog(budget)), weighted(false));
        card.addView(row);
        return card;
    }

    private String dailyAllowance(FinancePlanStore.Budget budget, long remaining) {
        if (!selectedMonth.equals(FinancePlanStore.currentMonth()) || remaining <= 0L) return "";
        Calendar calendar = Calendar.getInstance();
        int daysLeft = calendar.getActualMaximum(Calendar.DAY_OF_MONTH) - calendar.get(Calendar.DAY_OF_MONTH) + 1;
        if (daysLeft <= 0) return "";
        return " · ~" + MoneyUtils.formatCents(remaining / daysLeft, budget.currencyCode) + "/day";
    }

    private View commitmentCard(FinancePlanStore.Commitment commitment) {
        LinearLayout card = card();
        card.addView(label((commitment.isPaid() ? "✓ " : "○ ") + commitment.name, 18, true));
        TextView amount = label(MoneyUtils.formatCents(commitment.plannedAmountCents, commitment.currencyCode), 18, true);
        amount.setPadding(0, dp(5), 0, 0);
        card.addView(amount);
        String details = commitment.category;
        if (!commitment.dueDate.isEmpty()) details += " · due " + commitment.dueDate;
        if (commitment.repeatMonthly) details += " · repeats monthly";
        details += commitment.isPaid() ? " · paid" : " · unpaid";
        card.addView(empty(details));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(8), 0, 0);
        if (!commitment.isPaid()) {
            row.addView(smallButton("Record payment", v -> recordPayment(commitment)), weighted(true));
        }
        row.addView(smallButton("Edit", v -> showCommitmentDialog(commitment)), weighted(!commitment.isPaid()));
        card.addView(row);
        return card;
    }

    private void recordPayment(FinancePlanStore.Commitment commitment) {
        Intent intent = new Intent(this, QuickAddActivity.class);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_CATEGORY, commitment.category);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_AMOUNT_CENTS, commitment.plannedAmountCents);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_CURRENCY, commitment.currencyCode);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_NAME, commitment.name);
        intent.putExtra(QuickAddActivity.EXTRA_COMMITMENT_ID, commitment.id);
        startActivity(intent);
    }

    private void showBudgetDialog(FinancePlanStore.Budget existing) {
        LinearLayout box = dialogBox();
        EditText name = input("Name, e.g. Pocket Money");
        EditText amount = moneyInput("Monthly amount");
        Spinner currency = currencySpinner();
        if (existing != null) {
            name.setText(existing.name);
            amount.setText(MoneyUtils.formatPlainDecimal(existing.amountCents));
            selectCurrency(currency, existing.currencyCode);
        }
        box.addView(name); box.addView(amount); box.addView(currency);
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle(existing == null ? "Add spending budget" : "Edit spending budget").setView(box).setNegativeButton("Cancel", null);
        if (existing != null) builder.setNeutralButton("Delete", (d, w) -> mutate(() -> FinancePlanStore.deleteBudget(this, existing.id)));
        builder.setPositiveButton("Save", (d, w) -> {
            try {
                long cents = MoneyUtils.parseAmountToCents(amount.getText().toString());
                FinancePlanStore.saveBudget(this, existing == null ? null : existing.id, name.getText().toString(), selectedMonth, cents, selectedCurrency(currency));
                afterPlanMutation();
            } catch (Exception error) { toast(error.getMessage()); }
        }).show();
    }

    private void showCommitmentDialog(FinancePlanStore.Commitment existing) {
        LinearLayout box = dialogBox();
        EditText name = input("Payment, e.g. Telekom");
        EditText amount = moneyInput("Expected amount");
        Spinner currency = currencySpinner();
        EditText category = input("Expense category (default Bills)");
        EditText due = input("Optional due date YYYY-MM-DD");
        CheckBox repeat = new CheckBox(this);
        repeat.setText("Repeat monthly");
        repeat.setTextColor(color(R.color.text_primary));
        if (existing != null) {
            name.setText(existing.name);
            amount.setText(MoneyUtils.formatPlainDecimal(existing.plannedAmountCents));
            selectCurrency(currency, existing.currencyCode);
            category.setText(existing.category);
            due.setText(existing.dueDate);
            repeat.setChecked(existing.repeatMonthly);
        } else category.setText("Bills");
        box.addView(name); box.addView(amount); box.addView(currency); box.addView(category); box.addView(due); box.addView(repeat);
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle(existing == null ? "Add planned payment" : "Edit planned payment").setView(box).setNegativeButton("Cancel", null);
        if (existing != null) builder.setNeutralButton("Delete", (d, w) -> mutate(() -> FinancePlanStore.deleteCommitment(this, existing.id)));
        builder.setPositiveButton("Save", (d, w) -> {
            try {
                long cents = MoneyUtils.parseAmountToCents(amount.getText().toString());
                FinancePlanStore.saveCommitment(this, existing == null ? null : existing.id, name.getText().toString(), selectedMonth, cents, selectedCurrency(currency), category.getText().toString(), due.getText().toString(), repeat.isChecked());
                afterPlanMutation();
            } catch (Exception error) { toast(error.getMessage()); }
        }).show();
    }

    private void afterPlanMutation() {
        render();
        BudgetProgressWidget.updateAll(this);
        FinanceSyncClient.syncAsync(this, (synced, message) -> render());
    }

    private interface JsonMutation { void run() throws JSONException; }
    private void mutate(JsonMutation mutation) {
        try { mutation.run(); afterPlanMutation(); } catch (Exception error) { toast(error.getMessage()); }
    }

    private void requestPinBudgetWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { toast("Add Budget gauge from your launcher widget picker."); return; }
        AppWidgetManager manager = getSystemService(AppWidgetManager.class);
        if (manager == null || !manager.isRequestPinAppWidgetSupported()) { toast("Add Budget gauge from your launcher widget picker."); return; }
        manager.requestPinAppWidget(new ComponentName(this, BudgetProgressWidget.class), null, null);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(16), dp(14), dp(16), dp(14)); card.setBackgroundResource(R.drawable.rounded_tile);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); params.setMargins(0, 0, 0, dp(10)); card.setLayoutParams(params); return card;
    }
    private TextView sectionTitle(String text) { TextView title = label(text, 20, true); title.setPadding(0, dp(20), 0, dp(8)); return title; }
    private TextView empty(String text) { TextView v = label(text, 14, false); v.setTextColor(color(R.color.text_secondary)); v.setPadding(0, dp(4), 0, dp(8)); return v; }
    private TextView label(String text, int sp, boolean bold) { TextView v = new TextView(this); v.setText(text); v.setTextSize(sp); v.setTextColor(color(R.color.text_primary)); if (bold) v.setTypeface(Typeface.DEFAULT_BOLD); return v; }
    private Button primaryButton(String text, View.OnClickListener listener) { Button b = new Button(this); b.setAllCaps(false); b.setText(text); b.setTextSize(16); b.setTextColor(color(android.R.color.white)); b.setTypeface(Typeface.DEFAULT_BOLD); b.setBackgroundResource(R.drawable.rounded_button); b.setOnClickListener(listener); return b; }
    private Button secondaryButton(String text, View.OnClickListener listener) { Button b = new Button(this); b.setAllCaps(false); b.setText(text); b.setTextSize(16); b.setBackgroundResource(R.drawable.rounded_button_secondary); b.setTextColor(color(R.color.text_primary)); b.setOnClickListener(listener); return b; }
    private Button smallButton(String text, View.OnClickListener listener) { Button b = secondaryButton(text, listener); b.setMinHeight(dp(48)); return b; }
    private LinearLayout.LayoutParams weighted(boolean left) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f); p.setMargins(left ? 0 : dp(4), 0, left ? dp(4) : 0, 0); return p; }
    private LinearLayout dialogBox() { LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); int pad = dp(18); box.setPadding(pad, dp(8), pad, 0); return box; }
    private EditText input(String hint) { EditText e = new EditText(this); e.setHint(hint); e.setSingleLine(true); e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES); return e; }
    private EditText moneyInput(String hint) { EditText e = new EditText(this); e.setHint(hint); e.setSingleLine(true); e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL); return e; }
    private Spinner currencySpinner() { Spinner spinner = new Spinner(this); ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, new String[]{"HUF", "EUR", "TRY"}); adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); spinner.setAdapter(adapter); selectCurrency(spinner, "TRY"); return spinner; }
    private void selectCurrency(Spinner spinner, String code) { for (int i = 0; i < spinner.getCount(); i++) if (CurrencyUtils.normalize(String.valueOf(spinner.getItemAtPosition(i))).equals(CurrencyUtils.normalize(code))) spinner.setSelection(i); }
    private String selectedCurrency(Spinner spinner) { return CurrencyUtils.normalize(String.valueOf(spinner.getSelectedItem())); }
    private int color(int id) { return getResources().getColor(id, getTheme()); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String message) { Toast.makeText(this, message == null ? "Could not update the plan." : message, Toast.LENGTH_LONG).show(); }
}
''')

# ---------------------------------------------------------------------------
# Quick-add budget allocation + commitment payment linking
# ---------------------------------------------------------------------------
quick = read("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java")
quick = replace_once(quick,
    "import android.widget.Button;\nimport android.widget.EditText;",
    "import android.widget.ArrayAdapter;\nimport android.widget.Button;\nimport android.widget.EditText;",
    "quick add array adapter import")
quick = replace_once(quick,
    "import android.widget.Space;\nimport android.widget.TextView;",
    "import android.widget.Space;\nimport android.widget.Spinner;\nimport android.widget.TextView;",
    "quick add spinner import")
quick = replace_once(quick,
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\nimport com.example.expensebuttontracker.data.FinancePlanStore;",
    "quick add plan store import")
quick = replace_once(quick,
    "import com.example.expensebuttontracker.util.SettingsStore;",
    "import com.example.expensebuttontracker.util.SettingsStore;\nimport com.example.expensebuttontracker.widget.BudgetProgressWidget;",
    "quick add widget import")
quick = replace_once(quick,
    '''    public static final String EXTRA_ENTRY_TYPE = "com.example.expensebuttontracker.EXTRA_ENTRY_TYPE";''',
    '''    public static final String EXTRA_ENTRY_TYPE = "com.example.expensebuttontracker.EXTRA_ENTRY_TYPE";\n    public static final String EXTRA_BUDGET_ID = "com.example.expensebuttontracker.EXTRA_BUDGET_ID";\n    public static final String EXTRA_COMMITMENT_ID = "com.example.expensebuttontracker.EXTRA_COMMITMENT_ID";\n    public static final String EXTRA_PRESET_CATEGORY = "com.example.expensebuttontracker.EXTRA_PRESET_CATEGORY";\n    public static final String EXTRA_PRESET_AMOUNT_CENTS = "com.example.expensebuttontracker.EXTRA_PRESET_AMOUNT_CENTS";\n    public static final String EXTRA_PRESET_CURRENCY = "com.example.expensebuttontracker.EXTRA_PRESET_CURRENCY";\n    public static final String EXTRA_PRESET_NAME = "com.example.expensebuttontracker.EXTRA_PRESET_NAME";''',
    "quick add planning extras")
quick = replace_once(quick,
    "    private String selectedCurrency;",
    "    private String selectedCurrency;\n    private String selectedBudgetId;\n    private String commitmentId;\n    private long presetAmountCents;\n    private String presetName = \"\";\n    private Spinner budgetSpinner;\n    private List<FinancePlanStore.Budget> budgetChoices;",
    "quick add planning fields")
quick = replace_once(quick,
    '''        selectedCurrency = SettingsStore.getEntryCurrency(this);\n\n        String requestedType = getIntent().getStringExtra(EXTRA_ENTRY_TYPE);''',
    '''        selectedCurrency = SettingsStore.getEntryCurrency(this);\n        Intent source = getIntent();\n        selectedBudgetId = source.getStringExtra(EXTRA_BUDGET_ID);\n        commitmentId = source.getStringExtra(EXTRA_COMMITMENT_ID);\n        presetAmountCents = source.getLongExtra(EXTRA_PRESET_AMOUNT_CENTS, 0L);\n        presetName = source.getStringExtra(EXTRA_PRESET_NAME);\n        if (presetName == null) presetName = "";\n        String presetCurrency = source.getStringExtra(EXTRA_PRESET_CURRENCY);\n        if (presetCurrency != null && CurrencyUtils.isSupported(CurrencyUtils.normalize(presetCurrency))) selectedCurrency = CurrencyUtils.normalize(presetCurrency);\n\n        String requestedType = source.getStringExtra(EXTRA_ENTRY_TYPE);''',
    "quick add read planning extras")
quick = replace_once(quick,
    '''        buildShell();\n        showCategorySelector();''',
    '''        buildShell();\n        String presetCategory = source.getStringExtra(EXTRA_PRESET_CATEGORY);\n        if (presetCategory != null && !presetCategory.trim().isEmpty()) {\n            selectedType = EntryType.EXPENSE;\n            selectedCategory = presetCategory.trim();\n            showAmountForm();\n        } else {\n            showCategorySelector();\n        }''',
    "quick add preset category")
quick = replace_once(quick,
    '''        amountInput.setPadding(dp(12), dp(14), dp(12), dp(14));\n        root.addView(amountInput, new LinearLayout.LayoutParams(''',
    '''        amountInput.setPadding(dp(12), dp(14), dp(12), dp(14));\n        if (presetAmountCents > 0L) amountInput.setText(MoneyUtils.formatPlainDecimal(presetAmountCents));\n        root.addView(amountInput, new LinearLayout.LayoutParams(''',
    "quick add preset amount")
quick = replace_once(quick,
    '''        nameInput.setPadding(dp(12), dp(14), dp(12), dp(14));\n        root.addView(nameInput, new LinearLayout.LayoutParams(''',
    '''        nameInput.setPadding(dp(12), dp(14), dp(12), dp(14));\n        if (!presetName.isEmpty()) nameInput.setText(presetName);\n        root.addView(nameInput, new LinearLayout.LayoutParams(''',
    "quick add preset name")
quick = replace_once(quick,
    '''        root.addView(nameInput, new LinearLayout.LayoutParams(\n                ViewGroup.LayoutParams.MATCH_PARENT,\n                ViewGroup.LayoutParams.WRAP_CONTENT));\n\n        root.addView(spacer(16));''',
    '''        root.addView(nameInput, new LinearLayout.LayoutParams(\n                ViewGroup.LayoutParams.MATCH_PARENT,\n                ViewGroup.LayoutParams.WRAP_CONTENT));\n\n        if (EntryType.EXPENSE.equals(selectedType)) {\n            root.addView(spacer(10));\n            root.addView(label("Budget (optional)", 16, true));\n            budgetSpinner = new Spinner(this);\n            root.addView(budgetSpinner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));\n            rebuildBudgetSpinner();\n        } else {\n            budgetSpinner = null;\n            budgetChoices = null;\n        }\n\n        root.addView(spacer(16));''',
    "quick add budget spinner")
quick = replace_once(quick,
    '''            selectedCurrency = currencyCode;\n            SettingsStore.setEntryCurrency(this, currencyCode);\n            updateCurrencyButtons(currencyRow);''',
    '''            selectedCurrency = currencyCode;\n            SettingsStore.setEntryCurrency(this, currencyCode);\n            updateCurrencyButtons(currencyRow);\n            rebuildBudgetSpinner();''',
    "quick add rebuild budgets on currency")
quick = insert_before(quick, "    private void updateCurrencyButtons", r'''    private void rebuildBudgetSpinner() {
        if (budgetSpinner == null) return;
        budgetChoices = new java.util.ArrayList<>();
        java.util.ArrayList<String> labels = new java.util.ArrayList<>();
        labels.add("No budget");
        int selectedIndex = 0;
        for (FinancePlanStore.Budget budget : FinancePlanStore.listBudgets(this, FinancePlanStore.currentMonth())) {
            if (!budget.currencyCode.equals(selectedCurrency)) continue;
            budgetChoices.add(budget);
            labels.add(budget.name + " · " + CurrencyUtils.displayCode(budget.currencyCode));
            if (budget.id.equals(selectedBudgetId)) selectedIndex = labels.size() - 1;
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        budgetSpinner.setAdapter(adapter);
        budgetSpinner.setSelection(selectedIndex);
    }

''', "quick add budget spinner method")
quick = replace_once(quick,
    '''            long id = db.addEntry(selectedType, selectedCategory, cents, selectedCurrency, nameInput.getText().toString());\n            SettingsStore.setEntryCurrency(this, selectedCurrency);\n            Toast.makeText(this, "Saved " + MoneyUtils.formatCents(cents, selectedCurrency) + " as " + selectedCategory, Toast.LENGTH_SHORT).show();''',
    '''            long id = db.addEntry(selectedType, selectedCategory, cents, selectedCurrency, nameInput.getText().toString());\n            String syncId = db.getEntrySyncId(id);\n            String budgetName = "";\n            if (budgetSpinner != null && budgetChoices != null && budgetSpinner.getSelectedItemPosition() > 0) {\n                FinancePlanStore.Budget budget = budgetChoices.get(budgetSpinner.getSelectedItemPosition() - 1);\n                FinancePlanStore.allocateEntry(this, syncId, budget.id, cents, selectedCurrency);\n                selectedBudgetId = budget.id;\n                budgetName = budget.name;\n            }\n            if (commitmentId != null && !commitmentId.isEmpty()) FinancePlanStore.linkCommitment(this, commitmentId, syncId, selectedCurrency);\n            SettingsStore.setEntryCurrency(this, selectedCurrency);\n            BudgetProgressWidget.updateAll(this);\n            String budgetSuffix = budgetName.isEmpty() ? "" : " · " + budgetName;\n            Toast.makeText(this, "Saved " + MoneyUtils.formatCents(cents, selectedCurrency) + " as " + selectedCategory + budgetSuffix, Toast.LENGTH_SHORT).show();''',
    "quick add save allocation")
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java", quick)

# ---------------------------------------------------------------------------
# Budget home/lock-screen widget
# ---------------------------------------------------------------------------
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetProgressWidget.java", r'''package com.example.expensebuttontracker.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.ui.BudgetPlanActivity;
import com.example.expensebuttontracker.util.MoneyUtils;

public class BudgetProgressWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) update(context, manager, id);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) FinancePlanStore.clearWidget(context, id);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudgetProgressWidget.class));
        for (int id : ids) update(context, manager, id);
    }

    public static void update(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_budget_progress);
        FinancePlanStore.Budget budget = FinancePlanStore.resolveWidgetBudget(context, appWidgetId);
        if (budget == null) {
            views.setTextViewText(R.id.widget_budget_title, "Pocket Money");
            views.setTextViewText(R.id.widget_budget_amount, "Set up a budget");
            views.setTextViewText(R.id.widget_budget_detail, "Tap to open monthly plan");
            views.setProgressBar(R.id.widget_budget_progress, 1000, 0, false);
        } else {
            long spent = FinancePlanStore.spentCents(context, budget.id);
            long remaining = budget.amountCents - spent;
            int progress = (int) Math.max(0, Math.min(1000, budget.amountCents <= 0 ? 0 : spent * 1000L / budget.amountCents));
            views.setTextViewText(R.id.widget_budget_title, budget.name);
            views.setTextViewText(R.id.widget_budget_amount, MoneyUtils.formatCents(remaining, budget.currencyCode) + " left");
            views.setTextViewText(R.id.widget_budget_detail, MoneyUtils.formatCents(spent, budget.currencyCode) + " / " + MoneyUtils.formatCents(budget.amountCents, budget.currencyCode));
            views.setProgressBar(R.id.widget_budget_progress, 1000, progress, false);
        }
        Intent open = new Intent(context, BudgetPlanActivity.class);
        PendingIntent pending = PendingIntent.getActivity(context, 9000 + appWidgetId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_budget_root, pending);
        manager.updateAppWidget(appWidgetId, views);
    }
}
''')

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetWidgetConfigureActivity.java", r'''package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.widget.BudgetProgressWidget;

public class BudgetWidgetConfigureActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        appWidgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(getResources().getColor(R.color.app_background, getTheme()));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView title = text("Budget gauge", 26, true); root.addView(title);
        TextView help = text("Choose which current-month budget this widget should show. Automatic prefers Pocket Money.", 14, false); help.setPadding(0, dp(6), 0, dp(14)); root.addView(help);
        root.addView(button("Automatic · Pocket Money", ""));
        for (FinancePlanStore.Budget budget : FinancePlanStore.listBudgets(this, FinancePlanStore.currentMonth())) root.addView(button(budget.name, budget.id));
        setContentView(scroll);
    }

    private Button button(String label, String budgetId) {
        Button button = new Button(this); button.setAllCaps(false); button.setText(label); button.setTextSize(17); button.setMinHeight(dp(58)); button.setBackgroundResource(R.drawable.rounded_tile);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); params.setMargins(0, 0, 0, dp(10)); button.setLayoutParams(params);
        button.setOnClickListener(v -> finishWith(budgetId)); return button;
    }

    private void finishWith(String budgetId) {
        FinancePlanStore.setWidgetBudgetId(this, appWidgetId, budgetId);
        BudgetProgressWidget.update(this, AppWidgetManager.getInstance(this), appWidgetId);
        Intent result = new Intent(); result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId); setResult(RESULT_OK, result); finish();
    }
    private TextView text(String value, int sp, boolean bold) { TextView t = new TextView(this); t.setText(value); t.setTextSize(sp); t.setTextColor(getResources().getColor(R.color.text_primary, getTheme())); if (bold) t.setTypeface(Typeface.DEFAULT_BOLD); return t; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
''')

write("ExpenseButtonTracker/app/src/main/res/layout/widget_budget_progress.xml", r'''<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_budget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="14dp"
    android:background="@drawable/rounded_widget_background">
    <TextView android:id="@+id/widget_budget_title" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="Pocket Money" android:textStyle="bold" android:textSize="13sp" android:textColor="@color/text_primary" android:maxLines="1" />
    <TextView android:id="@+id/widget_budget_amount" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="0 left" android:textStyle="bold" android:textSize="21sp" android:textColor="@color/text_primary" android:paddingTop="2dp" android:maxLines="1" />
    <ProgressBar android:id="@+id/widget_budget_progress" style="?android:attr/progressBarStyleHorizontal" android:layout_width="match_parent" android:layout_height="10dp" android:layout_marginTop="7dp" android:max="1000" android:progress="0" />
    <TextView android:id="@+id/widget_budget_detail" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="0 / 0" android:textSize="11sp" android:textColor="@color/text_secondary" android:paddingTop="4dp" android:maxLines="1" />
</LinearLayout>
''')
write("ExpenseButtonTracker/app/src/main/res/xml/widget_budget_progress.xml", r'''<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="220dp"
    android:minHeight="90dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_progress"
    android:previewLayout="@layout/widget_budget_progress"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen|keyguard"
    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />
''')

# Manifest entries.
manifest = read("ExpenseButtonTracker/app/src/main/AndroidManifest.xml")
manifest = insert_before(manifest,
    '''        <activity\n            android:name=".ui.CategoriesActivity"''',
    '''        <activity\n            android:name=".ui.BudgetPlanActivity"\n            android:exported="false" />\n\n        <activity\n            android:name=".ui.BudgetWidgetConfigureActivity"\n            android:exported="false" />\n\n''',
    "budget activities manifest")
manifest = insert_before(manifest,
    '''        <receiver\n            android:name=".widget.ExpenseQuickAddWidget"''',
    '''        <receiver\n            android:name=".widget.BudgetProgressWidget"\n            android:exported="true"\n            android:label="Budget gauge">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data\n                android:name="android.appwidget.provider"\n                android:resource="@xml/widget_budget_progress" />\n        </receiver>\n\n''',
    "budget widget manifest")
write("ExpenseButtonTracker/app/src/main/AndroidManifest.xml", manifest)

# Main money screen: expose plan and widget.
main = read("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java")
main = replace_once(main,
    "import com.example.expensebuttontracker.widget.ExpenseQuickAddWidget;",
    "import com.example.expensebuttontracker.widget.ExpenseQuickAddWidget;\nimport com.example.expensebuttontracker.widget.BudgetProgressWidget;",
    "main budget widget import")
old_actions = '''        addGridTile(actionsGrid, actionTile("Quick add", "Expense or income", R.drawable.rounded_income_tile, v -> openQuickAdd()), 0, false);\n        addGridTile(actionsGrid, actionTile("Statistics", "Current data", R.drawable.rounded_tile, v -> startActivity(new Intent(this, StatisticsActivity.class))), 1, false);\n        addGridTile(actionsGrid, actionTile("Categories", "Edit tiles", R.drawable.rounded_tile, v -> startActivity(new Intent(this, CategoriesActivity.class))), 2, false);\n        addGridTile(actionsGrid, actionTile("Widget", "Pin to home", R.drawable.rounded_tile, v -> requestPinWidget()), 3, false);\n        addGridTile(actionsGrid, actionTile("Quick tile", "Android shortcut", R.drawable.rounded_tile, v -> requestQuickSettingsTile()), 4, false);\n        addGridTile(actionsGrid, actionTile("Export CSV", "Save current entries", R.drawable.rounded_tile, v -> exportCsv()), 5, false);\n        addGridTile(actionsGrid, actionTile("Archive", "Old entries and bulk archive", R.drawable.rounded_tile, v -> startActivity(new Intent(this, ArchiveActivity.class))), 6, true);'''
new_actions = '''        addGridTile(actionsGrid, actionTile("Quick add", "Expense or income", R.drawable.rounded_income_tile, v -> openQuickAdd()), 0, false);\n        addGridTile(actionsGrid, actionTile("Statistics", "Current data", R.drawable.rounded_tile, v -> startActivity(new Intent(this, StatisticsActivity.class))), 1, false);\n        addGridTile(actionsGrid, actionTile("Categories", "Edit tiles", R.drawable.rounded_tile, v -> startActivity(new Intent(this, CategoriesActivity.class))), 2, false);\n        addGridTile(actionsGrid, actionTile("Budget plan", "Monthly envelopes & bills", R.drawable.rounded_tile, v -> startActivity(new Intent(this, BudgetPlanActivity.class))), 3, false);\n        addGridTile(actionsGrid, actionTile("Budget widget", "Pocket Money gauge", R.drawable.rounded_tile, v -> requestPinBudgetWidget()), 4, false);\n        addGridTile(actionsGrid, actionTile("Quick-add widget", "Pin to home", R.drawable.rounded_tile, v -> requestPinWidget()), 5, false);\n        addGridTile(actionsGrid, actionTile("Quick tile", "Android shortcut", R.drawable.rounded_tile, v -> requestQuickSettingsTile()), 6, false);\n        addGridTile(actionsGrid, actionTile("Export CSV", "Save current entries", R.drawable.rounded_tile, v -> exportCsv()), 7, false);\n        addGridTile(actionsGrid, actionTile("Archive", "Old entries and bulk archive", R.drawable.rounded_tile, v -> startActivity(new Intent(this, ArchiveActivity.class))), 8, true);'''
main = replace_once(main, old_actions, new_actions, "main budget actions")
main = insert_before(main, "    private void requestQuickSettingsTile()", r'''    private void requestPinBudgetWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            toast("Long-press your home screen, choose Widgets, then add Budget gauge.");
            return;
        }
        AppWidgetManager manager = getSystemService(AppWidgetManager.class);
        if (manager == null || !manager.isRequestPinAppWidgetSupported()) {
            toast("Your launcher does not support automatic widget pinning. Add Budget gauge from the widget picker.");
            return;
        }
        manager.requestPinAppWidget(new ComponentName(this, BudgetProgressWidget.class), null, null);
    }

''', "main pin budget widget")
main = replace_once(main,
    '''                    db.deleteEntry(entry.id);\n                    refreshDashboard();''',
    '''                    try { FinancePlanStore.removeEntryReferences(this, db.getEntrySyncId(entry.id)); } catch (Exception ignored) {}\n                    db.deleteEntry(entry.id);\n                    BudgetProgressWidget.updateAll(this);\n                    refreshDashboard();''',
    "main delete planning references")
main = replace_once(main,
    "import com.example.expensebuttontracker.data.FinanceArchiveStore;",
    "import com.example.expensebuttontracker.data.FinanceArchiveStore;\nimport com.example.expensebuttontracker.data.FinancePlanStore;",
    "main plan store import")
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java", main)

# Version bump for auto-update.
gradle = read("ExpenseButtonTracker/app/build.gradle")
gradle = replace_once(gradle, "        versionCode 11\n        versionName '2.4.3'", "        versionCode 12\n        versionName '2.5.0'", "android version bump")
write("ExpenseButtonTracker/app/build.gradle", gradle)

# Document the feature surface.
readme = read("README.md")
readme = replace_once(readme,
    "The Android APK also contains the native Money tracker. Its existing quick-add, currencies, categories, widget, lock-screen surfaces, summaries, statistics, exchange rates, and CSV export remain local-first.",
    "The Android APK also contains the native Money tracker. Its quick-add, currencies, categories, widgets, lock-screen surfaces, monthly spending budgets, planned payments, summaries, statistics, exchange rates, and CSV export remain local-first.",
    "readme planning surface")
write("README.md", readme)

print("Finance planning implementation applied.")
